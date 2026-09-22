'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{promisify}=require('node:util');
const {DatabaseSync,backup}=require('node:sqlite');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),random=()=>crypto.randomBytes(32).toString('hex'),scrypt=promisify(crypto.scrypt);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function createServer({dbPath=process.env.ATLAS_DB||path.join(__dirname,'runtime/atlas.sqlite'),secure=process.env.NODE_ENV==='production',google={}}={}){
 // Google sign-in is enabled only when a client ID and secret are configured.
 google={clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,publicUrl:process.env.ATLAS_PUBLIC_URL,
  authUrl:'https://accounts.google.com/o/oauth2/v2/auth',tokenUrl:'https://oauth2.googleapis.com/token',...google};
 const googleEnabled=Boolean(google.clientId&&google.clientSecret);
 if(secure&&!process.env.ATLAS_DB)throw Error('ATLAS_DB must point to persistent storage in production');
 fs.mkdirSync(path.dirname(dbPath),{recursive:true,mode:0o700});
 const db=new DatabaseSync(dbPath);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password TEXT NOT NULL,salt TEXT NOT NULL,recovery TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS reader_state(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,revision INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL DEFAULT '{}');
 CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL,visibility TEXT NOT NULL,payload TEXT NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS oauth_states(state TEXT PRIMARY KEY,verifier TEXT NOT NULL,nonce TEXT NOT NULL,link_user TEXT,expires INTEGER NOT NULL);`);
 // Google accounts are keyed by Google's stable subject ID. No email or name is stored.
 if(!db.prepare('PRAGMA table_info(users)').all().some(c=>c.name==='google_sub'))db.exec('ALTER TABLE users ADD COLUMN google_sub TEXT');
 db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub ON users(google_sub) WHERE google_sub IS NOT NULL');
 fs.chmodSync(dbPath,0o600);
 const file=fs.readFileSync(path.join(__dirname,'index.html'),'utf8'),books=JSON.parse(fs.readFileSync(path.join(__dirname,'data/catalog.json'))),bookMap=new Map(books.map(b=>[b.id,b]));
 const paths=JSON.parse(fs.readFileSync(path.join(__dirname,'data/reading-paths.json')));
 // Each distinct title/description renders one page variant. Compression of the 11 MB bundle is expensive,
 // so variants are compressed once off the event loop, cached (bounded), and revalidated with a strong ETag.
 const gzipAsync=promisify(zlib.gzip),brotliAsync=promisify(zlib.brotliCompress),variants=new Map(),MAX_VARIANTS=64;
 const homeFile=path.join(__dirname,'home.html'),home=fs.existsSync(homeFile)?fs.readFileSync(homeFile):null;
 const compressed=html=>{const v={raw:html,etag:'"'+crypto.createHash('sha1').update(html).digest('base64url')+'"',gzip:gzipAsync(html,{level:9}),br:brotliAsync(html,{params:{[zlib.constants.BROTLI_PARAM_QUALITY]:9,[zlib.constants.BROTLI_PARAM_SIZE_HINT]:html.length}})};v.gzip.catch(()=>{});v.br.catch(()=>{});return v;};
 const homePage=home&&compressed(home);
 function renderPage(title,desc){
  const key=title+'\n'+desc;let v=variants.get(key);
  if(v){variants.delete(key);variants.set(key,v);return v;}
  const html=Buffer.from(file.replace(/<title>[^<]*<\/title>/,`<title>${esc(title)}</title>`).replace('</head>',`<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website"></head>`));
  v=compressed(html);
  variants.set(key,v);if(variants.size>MAX_VARIANTS)variants.delete(variants.keys().next().value);return v;
 }
 const DEFAULT_TITLE='Classics Atlas — A world of stories',DEFAULT_DESC='Discover books through places, periods and curated reading paths.';
 const ready=Promise.all([renderPage(DEFAULT_TITLE,DEFAULT_DESC).gzip,renderPage(DEFAULT_TITLE,DEFAULT_DESC).br]);
 async function send(req,res,page){
  const accept=req.headers['accept-encoding']||'',encoding=/\bbr\b/.test(accept)?'br':/\bgzip\b/.test(accept)?'gzip':null;
  const headers={'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-cache','ETag':page.etag,'Vary':'Accept-Encoding'};
  if((req.headers['if-none-match']||'').split(/\s*,\s*/).includes(page.etag)){res.writeHead(304,headers);return res.end();}
  const bodyBytes=encoding?await page[encoding]:page.raw;if(encoding)headers['Content-Encoding']=encoding;headers['Content-Length']=bodyBytes.length;
  res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:bodyBytes);
 }
 const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 const error=(code,message)=>Object.assign(Error(message),{code});
 const getUser=req=>{const tok=req.headers.cookie?.match(/(?:^|;\s*)atlas_session=([a-f0-9]{64})(?:;|$)/)?.[1];return tok?db.prepare('SELECT users.id,username,google_sub IS NOT NULL AS google,password!=\'\' AS hasPassword FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(hash(tok),Date.now()):null;};
 const cookie=(res,token,age=2592000)=>res.setHeader('Set-Cookie',`atlas_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`);
 async function body(req){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>1500000)throw error(413,'Request too large');chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw error(400,'Invalid JSON');}}
 function rate(req,name,max=20){const ip=secure?(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress,key=hash(`${ip}:${name}`),now=Date.now();db.prepare('DELETE FROM rate_limits WHERE expires<?').run(now);const row=db.prepare('SELECT * FROM rate_limits WHERE key=?').get(key);if(row?.count>=max)throw error(429,'Too many attempts. Try again in 15 minutes.');db.prepare('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+900000);}
 const credential=async(pass,salt)=>(await scrypt(pass,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024})).toString('hex');
 const validPassword=p=>typeof p==='string'&&p.length>=12&&p.length<=256;
 const safeEqual=(a,b)=>a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
 function validateState(v){if(!v||typeof v!=='object'||Array.isArray(v))throw error(400,'Invalid reading data');return JSON.stringify(v);}
 const collectionRow=row=>row&&({id:row.id,title:row.title,description:row.description,visibility:row.visibility,items:JSON.parse(row.payload),updated:row.updated});
 const b64url=buf=>Buffer.from(buf).toString('base64url');
 const redirect=(res,location)=>{res.writeHead(302,{Location:location,'Cache-Control':'no-store'});res.end();};
 const oauthCookie=(res,value,age)=>res.setHeader('Set-Cookie',`atlas_oauth=${value}; Path=/auth/google; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`);
 function redirectUri(req){const base=google.publicUrl||`${secure?'https':'http'}://${req.headers.host}`;return base.replace(/\/$/,'')+'/auth/google/callback';}
 async function googleAuth(req,res,url){
  if(req.method!=='GET')throw error(405,'Method not allowed');
  if(!googleEnabled)return redirect(res,'/atlas?auth=unavailable');
  if(url.pathname==='/auth/google'){
   rate(req,'google',30);
   const link=url.searchParams.get('mode')==='link'?getUser(req):null;
   if(url.searchParams.get('mode')==='link'&&!link)return redirect(res,'/atlas?auth=failed');
   const state=random(),verifier=b64url(crypto.randomBytes(32)),nonce=random();
   db.prepare('DELETE FROM oauth_states WHERE expires<?').run(Date.now());
   db.prepare('INSERT INTO oauth_states VALUES(?,?,?,?,?)').run(hash(state),verifier,nonce,link?.id||null,Date.now()+600000);
   oauthCookie(res,state,600);
   const q=new URLSearchParams({client_id:google.clientId,redirect_uri:redirectUri(req),response_type:'code',scope:'openid',state,nonce,
    code_challenge:b64url(crypto.createHash('sha256').update(verifier).digest()),code_challenge_method:'S256',prompt:'select_account'});
   return redirect(res,google.authUrl+'?'+q);
  }
  // Callback: the state must match both the one-time database row and this browser's cookie.
  const state=url.searchParams.get('state')||'',cookieState=req.headers.cookie?.match(/(?:^|;\s*)atlas_oauth=([a-f0-9]{64})(?:;|$)/)?.[1];
  oauthCookie(res,'',0);
  const row=/^[a-f0-9]{64}$/.test(state)&&db.prepare('SELECT * FROM oauth_states WHERE state=?').get(hash(state));
  if(row)db.prepare('DELETE FROM oauth_states WHERE state=?').run(hash(state));
  if(url.searchParams.get('error'))return redirect(res,'/atlas?auth=cancelled');
  if(!row||row.expires<Date.now()||!cookieState||!safeEqual(cookieState,state)||!url.searchParams.get('code'))return redirect(res,'/atlas?auth=failed');
  let claims;
  try{
   const r=await fetch(google.tokenUrl,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},signal:AbortSignal.timeout(10000),
    body:new URLSearchParams({code:url.searchParams.get('code'),client_id:google.clientId,client_secret:google.clientSecret,redirect_uri:redirectUri(req),grant_type:'authorization_code',code_verifier:row.verifier})});
   const t=await r.json();if(!r.ok||typeof t.id_token!=='string')throw Error('Token exchange failed: '+r.status);
   // The ID token comes straight from Google's token endpoint over TLS, so its claims are checked
   // without verifying the signature (OpenID Connect Core 3.1.3.7).
   claims=JSON.parse(Buffer.from(t.id_token.split('.')[1]||'','base64url').toString('utf8'));
   if(!['https://accounts.google.com','accounts.google.com'].includes(claims.iss)||claims.aud!==google.clientId||!(claims.exp*1000>Date.now())||claims.nonce!==row.nonce||typeof claims.sub!=='string'||!claims.sub)throw Error('Invalid ID token claims');
  }catch(e){console.error('Google sign-in failed:',e.message);return redirect(res,'/atlas?auth=failed');}
  let account=db.prepare('SELECT id,username FROM users WHERE google_sub=?').get(claims.sub);
  if(row.link_user){
   if(account&&account.id!==row.link_user)return redirect(res,'/atlas?auth=linked-elsewhere');
   db.prepare('UPDATE users SET google_sub=? WHERE id=?').run(claims.sub,row.link_user);
   return redirect(res,'/atlas?auth=linked');
  }
  let created=false;
  if(!account){
   // Usernames for Google accounts are random so public collections do not reveal an email address.
   for(let n=0;n<5&&!account;n++){const username='reader-'+crypto.randomBytes(3).toString('hex'),id=crypto.randomUUID();
    try{db.prepare('INSERT INTO users(id,username,password,salt,recovery,created,google_sub) VALUES(?,?,?,?,?,?,?)').run(id,username,'','','',Date.now(),claims.sub);db.prepare('INSERT INTO reader_state(user_id) VALUES(?)').run(id);account={id,username};created=true;}catch(e){if(db.prepare('SELECT 1 FROM users WHERE google_sub=?').get(claims.sub))account=db.prepare('SELECT id,username FROM users WHERE google_sub=?').get(claims.sub);}}
   if(!account)return redirect(res,'/atlas?auth=failed');
  }
  const token=random();db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),account.id,Date.now()+2592000000);
  res.setHeader('Set-Cookie',[res.getHeader('Set-Cookie'),`atlas_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=2592000${secure?'; Secure':''}`]);
  // A same-site page load follows, so the SameSite=Strict session cookie is sent on the next request.
  const next='/atlas?auth='+(created?'google-new':'google');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});
  return res.end(`<!doctype html><meta charset="utf-8"><title>Signing in</title><meta http-equiv="refresh" content="0;url=${next}"><p>Signed in. <a href="${next}">Continue to Classics Atlas</a>.</p>`);
 }
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');if(secure)res.setHeader('Strict-Transport-Security','max-age=15552000');
  const url=new URL(req.url,'http://localhost');
  try{
   if(url.pathname==='/health'){try{db.prepare('SELECT 1').get();}catch{return json(res,503,{ok:false,error:'Database unavailable'});}return json(res,200,{ok:true});}
   if(url.pathname.startsWith('/api/')){
    if(!['GET','HEAD'].includes(req.method)){
     if(req.headers['x-atlas-request']!=='1'||!req.headers['content-type']?.startsWith('application/json'))throw error(403,'Invalid request');
     const origin=req.headers.origin;if(origin){let host;try{host=new URL(origin).host;}catch{}if(host!==req.headers.host)throw error(403,'Cross-origin request denied');}
    }
    const user=getUser(req);
    if(url.pathname==='/api/session'&&req.method==='GET')return json(res,200,{user:user?{id:user.id,username:user.username,google:!!user.google,password:!!user.hasPassword}:null,google:googleEnabled});
    if(['/api/register','/api/login','/api/recover'].includes(url.pathname)&&req.method==='POST'){
     rate(req,'auth');const b=await body(req);const username=String(b.username||'').toLowerCase().trim();if(!/^[a-z0-9_-]{3,32}$/.test(username)||!validPassword(b.password))throw error(400,'Use a 3–32 character username and a password of at least 12 characters.');
     let row=db.prepare('SELECT * FROM users WHERE username=?').get(username),recovery;
     if(url.pathname==='/api/register'){
      if(row)throw error(409,'That username is unavailable');const salt=random(),password=await credential(b.password,salt);recovery=random();row={id:crypto.randomUUID(),username};
      try{db.prepare('INSERT INTO users(id,username,password,salt,recovery,created) VALUES(?,?,?,?,?,?)').run(row.id,username,password,salt,hash(recovery),Date.now());}catch{throw error(409,'That username is unavailable');}
      db.prepare('INSERT INTO reader_state(user_id) VALUES(?)').run(row.id);
     }else if(url.pathname==='/api/recover'){
      if(!row||!safeEqual(hash(String(b.recovery||'')),row.recovery))throw error(401,'Recovery details do not match');const salt=random(),password=await credential(b.password,salt);recovery=random();db.prepare('UPDATE users SET password=?,salt=?,recovery=? WHERE id=?').run(password,salt,hash(recovery),row.id);db.prepare('DELETE FROM sessions WHERE user_id=?').run(row.id);
     }else{
      const actual=await credential(b.password,row?.salt||'invalid-account-timing-salt');if(!row||!safeEqual(actual,row.password))throw error(401,'Username or password does not match');
     }
     const token=random();db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),row.id,Date.now()+2592000000);cookie(res,token);return json(res,200,{user:{id:row.id,username},...(recovery?{recovery}:{} )});
    }
    if(url.pathname==='/api/logout'&&req.method==='POST'){const tok=req.headers.cookie?.match(/atlas_session=([a-f0-9]{64})/)?.[1];if(tok)db.prepare('DELETE FROM sessions WHERE token=?').run(hash(tok));cookie(res,'',0);return json(res,200,{ok:true});}
    if(url.pathname==='/api/public-collections'&&req.method==='GET')return json(res,200,{collections:db.prepare("SELECT collections.*,users.username FROM collections JOIN users ON users.id=collections.user_id WHERE visibility='public' ORDER BY updated DESC LIMIT 60").all().map(x=>({...collectionRow(x),curator:x.username}))});
    const cm=url.pathname.match(/^\/api\/collections\/([a-f0-9-]{36})$/);
    if(cm&&req.method==='GET'){const row=db.prepare('SELECT * FROM collections WHERE id=?').get(cm[1]);if(!row||(row.visibility==='private'&&row.user_id!==user?.id))throw error(404,'Collection not found');return json(res,200,{collection:collectionRow(row)});}
    if(!user)throw error(401,'Sign in to sync your reading');
    if(url.pathname==='/api/state'&&req.method==='GET'){const row=db.prepare('SELECT * FROM reader_state WHERE user_id=?').get(user.id);return json(res,200,{revision:row.revision,state:JSON.parse(row.payload)});}
    if(url.pathname==='/api/state'&&req.method==='PUT'){const b=await body(req),payload=validateState(b.state);if(!Number.isInteger(b.revision))throw error(400,'Revision required');const r=db.prepare('UPDATE reader_state SET payload=?,revision=revision+1 WHERE user_id=? AND revision=?').run(payload,user.id,b.revision);if(!r.changes)throw error(409,'Your reading changed on another device. Download this device’s backup before loading the newer cloud copy.');return json(res,200,{revision:b.revision+1});}
    if(url.pathname==='/api/collections'&&req.method==='GET')return json(res,200,{collections:db.prepare('SELECT * FROM collections WHERE user_id=? ORDER BY updated DESC').all(user.id).map(collectionRow)});
    if((url.pathname==='/api/collections'&&req.method==='POST')||(cm&&req.method==='PUT')){
     rate(req,'collections',100);const b=await body(req);if(typeof b.title!=='string'||!b.title.trim()||b.title.length>140||typeof b.description!=='string'||b.description.length>3000||!['private','unlisted','public'].includes(b.visibility)||!Array.isArray(b.items)||b.items.length>200)throw error(400,'Invalid collection');
     const items=b.items.map(x=>{if(!x||typeof x!=='object'||!bookMap.has(x.bookId)||typeof x.note!=='string'||x.note.length>1000)throw error(400,'Invalid book or note');return {bookId:x.bookId,note:x.note};});
     const id=cm?cm[1]:crypto.randomUUID();if(cm&&!db.prepare('SELECT id FROM collections WHERE id=? AND user_id=?').get(id,user.id))throw error(404,'Collection not found');
     db.prepare('INSERT INTO collections VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,visibility=excluded.visibility,payload=excluded.payload,updated=excluded.updated').run(id,user.id,b.title.trim(),b.description,b.visibility,JSON.stringify(items),Date.now());return json(res,200,{collection:collectionRow(db.prepare('SELECT * FROM collections WHERE id=?').get(id))});
    }
    if(cm&&req.method==='DELETE'){const r=db.prepare('DELETE FROM collections WHERE id=? AND user_id=?').run(cm[1],user.id);if(!r.changes)throw error(404,'Collection not found');return json(res,200,{ok:true});}
    if(url.pathname==='/api/account'&&req.method==='DELETE'){const b=await body(req),row=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
     // Accounts without a password (Google sign-in only) confirm by typing the username.
     if(row.password===''){if(b.confirm!==row.username)throw error(401,'Type your username to confirm');}
     else if(typeof b.password!=='string'||b.password.length>256||!safeEqual(await credential(b.password,row.salt),row.password))throw error(401,'Password does not match');db.prepare('DELETE FROM users WHERE id=?').run(user.id);cookie(res,'',0);return json(res,200,{ok:true});}
    throw error(404,'Not found');
   }
   if(url.pathname==='/auth/google'||url.pathname==='/auth/google/callback')return await googleAuth(req,res,url);
   if(!['GET','HEAD'].includes(req.method))throw error(405,'Method not allowed');
   if(url.pathname==='/classics-atlas-source.zip'){res.writeHead(302,{Location:'https://github.com/rems3n/classics-atlas/archive/refs/heads/main.zip'});return res.end();}
   // `/` is the home page. Links that carry app state (book, path, collection, tour) go straight to the atlas.
   if(url.pathname==='/'&&home){
    if(['book','path','collection','tour'].some(k=>url.searchParams.has(k))){res.writeHead(302,{Location:'/atlas'+url.search});return res.end();}
    return send(req,res,homePage);
   }
   if(!['/','/atlas','/index.html','/classics-atlas.html'].includes(url.pathname))throw error(404,'Not found');
   let title=DEFAULT_TITLE,desc=DEFAULT_DESC;
   if(url.searchParams.has('book')){const b=bookMap.get(url.searchParams.get('book'));if(b){title=b.title+' · Classics Atlas';desc=b.overview||b.author;}}
   if(url.searchParams.has('path')){const p=paths.find(p=>p.id===url.searchParams.get('path'));if(p){title=p.title+' · Classics Atlas';desc=p.description;}}
   if(url.searchParams.has('collection')){const c=db.prepare("SELECT * FROM collections WHERE id=? AND visibility!='private'").get(url.searchParams.get('collection'));if(c){title=c.title+' · Classics Atlas';desc=c.description;}}
   return send(req,res,renderPage(title,desc));
  }catch(e){if(!Number.isInteger(e.code))console.error(req.method,url.pathname,e.stack||e);if(res.headersSent)return res.destroy();json(res,Number.isInteger(e.code)?e.code:500,{error:Number.isInteger(e.code)?e.message:'Something went wrong. Please try again.'});}
 });
 server.on('close',()=>db.close());server.atlasDB=db;server.atlasReady=ready;return server;
}
if(require.main===module){
 const port=Number(process.env.PORT)||3000,dbPath=process.env.ATLAS_DB||path.join(__dirname,'runtime/atlas.sqlite'),server=createServer();
 // The port is logged so a mismatch with the public domain's target port is visible in deploy logs.
 server.listen(port,'0.0.0.0',()=>console.log(`Classics Atlas ready on port ${port} (database ${dbPath})`));
 const backupDir=path.join(path.dirname(dbPath),'backups');fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
 // One snapshot per UTC day, refreshed hourly, latest seven kept. Written to a temporary file and renamed so an
 // interrupted backup never replaces a good snapshot.
 async function snapshot(){const target=path.join(backupDir,new Date().toISOString().slice(0,10)+'.sqlite'),tmp=target+'.tmp';try{await backup(server.atlasDB,tmp);fs.chmodSync(tmp,0o600);fs.renameSync(tmp,target);const files=fs.readdirSync(backupDir).filter(x=>/^\d{4}-\d{2}-\d{2}\.sqlite$/.test(x)).sort();for(const f of files.slice(0,-7))fs.unlinkSync(path.join(backupDir,f));console.log('Backup written:',path.basename(target));}catch(e){fs.rmSync(tmp,{force:true});console.error('Backup failed:',e.message);}}
 setInterval(snapshot,3600000).unref();snapshot();
 const stop=signal=>{console.log(`${signal} received, closing`);server.close(()=>process.exit(0));server.closeIdleConnections();setTimeout(()=>{server.closeAllConnections();process.exit(0);},8000).unref();};
 process.once('SIGTERM',()=>stop('SIGTERM'));process.once('SIGINT',()=>stop('SIGINT'));
}
module.exports={createServer};
