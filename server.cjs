'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),zlib=require('node:zlib'),crypto=require('node:crypto'),{promisify}=require('node:util');
const {DatabaseSync,backup}=require('node:sqlite');
const hash=s=>crypto.createHash('sha256').update(s).digest('hex'),random=()=>crypto.randomBytes(32).toString('hex'),scrypt=promisify(crypto.scrypt);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function createServer({dbPath=process.env.ATLAS_DB||path.join(__dirname,'runtime/atlas.sqlite'),secure=process.env.NODE_ENV==='production'}={}){
 if(secure&&!process.env.ATLAS_DB)throw Error('ATLAS_DB must point to persistent storage in production');
 fs.mkdirSync(path.dirname(dbPath),{recursive:true,mode:0o700});
 const db=new DatabaseSync(dbPath);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,password TEXT NOT NULL,salt TEXT NOT NULL,recovery TEXT NOT NULL,created INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS reader_state(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,revision INTEGER NOT NULL DEFAULT 0,payload TEXT NOT NULL DEFAULT '{}');
 CREATE TABLE IF NOT EXISTS collections(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL,visibility TEXT NOT NULL,payload TEXT NOT NULL,updated INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
 fs.chmodSync(dbPath,0o600);
 const file=fs.readFileSync(path.join(__dirname,'index.html'),'utf8'),gzip=zlib.gzipSync(file),books=JSON.parse(fs.readFileSync(path.join(__dirname,'data/catalog.json'))),bookMap=new Map(books.map(b=>[b.id,b]));
 const paths=JSON.parse(fs.readFileSync(path.join(__dirname,'data/reading-paths.json')));
 const json=(res,status,body)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(body));};
 const error=(code,message)=>Object.assign(Error(message),{code});
 const getUser=req=>{const tok=req.headers.cookie?.match(/(?:^|;\s*)atlas_session=([a-f0-9]{64})(?:;|$)/)?.[1];return tok?db.prepare('SELECT users.id,username FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?').get(hash(tok),Date.now()):null;};
 const cookie=(res,token,age=2592000)=>res.setHeader('Set-Cookie',`atlas_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`);
 async function body(req){let raw='';for await(const c of req){raw+=c;if(Buffer.byteLength(raw)>1500000)throw error(413,'Request too large');}try{return JSON.parse(raw||'{}');}catch{throw error(400,'Invalid JSON');}}
 function rate(req,name,max=20){const ip=secure?(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress,key=hash(`${ip}:${name}`),now=Date.now();db.prepare('DELETE FROM rate_limits WHERE expires<?').run(now);const row=db.prepare('SELECT * FROM rate_limits WHERE key=?').get(key);if(row?.count>=max)throw error(429,'Too many attempts. Try again in 15 minutes.');db.prepare('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(key,now+900000);}
 const credential=async(pass,salt)=>(await scrypt(pass,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024})).toString('hex');
 const validPassword=p=>typeof p==='string'&&p.length>=12&&p.length<=256;
 const safeEqual=(a,b)=>a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
 function validateState(v){if(!v||typeof v!=='object'||Array.isArray(v))throw error(400,'Invalid reading data');return JSON.stringify(v);}
 const collectionRow=row=>row&&({id:row.id,title:row.title,description:row.description,visibility:row.visibility,items:JSON.parse(row.payload),updated:row.updated});
 const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
  const url=new URL(req.url,'http://localhost');
  try{
   if(url.pathname==='/health')return json(res,200,{ok:true});
   if(url.pathname.startsWith('/api/')){
    if(!['GET','HEAD'].includes(req.method)){
     if(req.headers['x-atlas-request']!=='1'||!req.headers['content-type']?.startsWith('application/json'))throw error(403,'Invalid request');
     const origin=req.headers.origin;if(origin&&new URL(origin).host!==req.headers.host)throw error(403,'Cross-origin request denied');
    }
    const user=getUser(req);
    if(url.pathname==='/api/session'&&req.method==='GET')return json(res,200,{user:user||null});
    if(['/api/register','/api/login','/api/recover'].includes(url.pathname)&&req.method==='POST'){
     rate(req,'auth');const b=await body(req);const username=String(b.username||'').toLowerCase().trim();if(!/^[a-z0-9_-]{3,32}$/.test(username)||!validPassword(b.password))throw error(400,'Use a 3–32 character username and a password of at least 12 characters.');
     let row=db.prepare('SELECT * FROM users WHERE username=?').get(username),recovery;
     if(url.pathname==='/api/register'){
      if(row)throw error(409,'That username is unavailable');const salt=random(),password=await credential(b.password,salt);recovery=random();row={id:crypto.randomUUID(),username};
      try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?)').run(row.id,username,password,salt,hash(recovery),Date.now());}catch{throw error(409,'That username is unavailable');}
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
     const items=b.items.map(x=>{if(!bookMap.has(x.bookId)||typeof x.note!=='string'||x.note.length>1000)throw error(400,'Invalid book or note');return {bookId:x.bookId,note:x.note};});
     const id=cm?cm[1]:crypto.randomUUID();if(cm&&!db.prepare('SELECT id FROM collections WHERE id=? AND user_id=?').get(id,user.id))throw error(404,'Collection not found');
     db.prepare('INSERT INTO collections VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,description=excluded.description,visibility=excluded.visibility,payload=excluded.payload,updated=excluded.updated').run(id,user.id,b.title.trim(),b.description,b.visibility,JSON.stringify(items),Date.now());return json(res,200,{collection:collectionRow(db.prepare('SELECT * FROM collections WHERE id=?').get(id))});
    }
    if(cm&&req.method==='DELETE'){const r=db.prepare('DELETE FROM collections WHERE id=? AND user_id=?').run(cm[1],user.id);if(!r.changes)throw error(404,'Collection not found');return json(res,200,{ok:true});}
    if(url.pathname==='/api/account'&&req.method==='DELETE'){const b=await body(req),row=db.prepare('SELECT * FROM users WHERE id=?').get(user.id);if(typeof b.password!=='string'||b.password.length>256||!safeEqual(await credential(b.password,row.salt),row.password))throw error(401,'Password does not match');db.prepare('DELETE FROM users WHERE id=?').run(user.id);cookie(res,'',0);return json(res,200,{ok:true});}
    throw error(404,'Not found');
   }
   if(!['GET','HEAD'].includes(req.method))throw error(405,'Method not allowed');
   if(url.pathname==='/classics-atlas-source.zip'){res.writeHead(302,{Location:'https://github.com/rems3n/classics-atlas/archive/refs/heads/main.zip'});return res.end();}
   if(!['/','/index.html','/classics-atlas.html'].includes(url.pathname))throw error(404,'Not found');
   let title='Classics Atlas — A world of stories',desc='Discover books through places, periods and curated reading paths.';
   if(url.searchParams.has('book')){const b=bookMap.get(url.searchParams.get('book'));if(b){title=b.title+' · Classics Atlas';desc=b.overview||b.author;}}
   if(url.searchParams.has('path')){const p=paths.find(p=>p.id===url.searchParams.get('path'));if(p){title=p.title+' · Classics Atlas';desc=p.description;}}
   if(url.searchParams.has('collection')){const c=db.prepare("SELECT * FROM collections WHERE id=? AND visibility!='private'").get(url.searchParams.get('collection'));if(c){title=c.title+' · Classics Atlas';desc=c.description;}}
   res.setHeader('Cache-Control','no-cache');
   let html=file.replace(/<title>[^<]*<\/title>/,`<title>${esc(title)}</title>`).replace('</head>',`<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:type" content="website"></head>`);
   const compressed=/\bgzip\b/.test(req.headers['accept-encoding']||'');if(compressed){res.setHeader('Content-Encoding','gzip');html=zlib.gzipSync(html);}res.setHeader('Vary','Accept-Encoding');res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});res.end(req.method==='HEAD'?undefined:html);
  }catch(e){json(res,Number.isInteger(e.code)?e.code:500,{error:Number.isInteger(e.code)?e.message:'Something went wrong. Please try again.'});if(!e.code)console.error(e.message);}
 });
 server.on('close',()=>db.close());server.atlasDB=db;return server;
}
if(require.main===module){const server=createServer();server.listen(Number(process.env.PORT)||3000,'0.0.0.0',()=>console.log('Classics Atlas ready'));
 const backupDir=path.join(path.dirname(process.env.ATLAS_DB||path.join(__dirname,'runtime/atlas.sqlite')),'backups');fs.mkdirSync(backupDir,{recursive:true,mode:0o700});
 async function snapshot(){try{await backup(server.atlasDB,path.join(backupDir,new Date().toISOString().slice(0,10)+'.sqlite'));const files=fs.readdirSync(backupDir).filter(x=>/^\d{4}-\d{2}-\d{2}\.sqlite$/.test(x)).sort();for(const f of files.slice(0,-7))fs.unlinkSync(path.join(backupDir,f));}catch(e){console.error('Backup failed:',e.message);}}
 setInterval(snapshot,3600000).unref();snapshot();process.on('SIGTERM',()=>server.close(()=>process.exit(0)));
}
module.exports={createServer};
