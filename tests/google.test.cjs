// Google sign-in against a local mock of Google's token endpoint.
const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createServer}=require('../server.cjs');
let app,base,mock,dir,claims={},issued=[];
const idToken=c=>['e30',Buffer.from(JSON.stringify(c)).toString('base64url'),'sig'].join('.');
before(async()=>{
 mock=http.createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const p=new URLSearchParams(raw),code=p.get('code'),grant=issued.find(g=>g.code===code);
  const ok=grant&&p.get('client_secret')==='secret'&&p.get('grant_type')==='authorization_code'&&crypto.createHash('sha256').update(p.get('code_verifier')||'').digest('base64url')===grant.challenge&&p.get('redirect_uri')===grant.redirect;
  res.writeHead(ok?200:400,{'Content-Type':'application/json'});res.end(JSON.stringify(ok?{id_token:idToken({iss:'https://accounts.google.com',aud:'client-id',exp:Math.floor(Date.now()/1000)+300,nonce:grant.nonce,sub:'google-sub-1',...claims})}:{error:'invalid_grant'}));});
 await new Promise(r=>mock.listen(0,'127.0.0.1',r));
 dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-google-'));
 app=createServer({dbPath:path.join(dir,'g.sqlite'),secure:false,google:{clientId:'client-id',clientSecret:'secret',authUrl:'https://accounts.example/auth',tokenUrl:`http://127.0.0.1:${mock.address().port}/token`}});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+app.address().port;
});
after(async()=>{await new Promise(r=>app.close(r));await new Promise(r=>mock.close(r));fs.rmSync(dir,{recursive:true,force:true});});
const cookieOf=(r,name)=>(r.headers.getSetCookie?.()||[]).map(c=>c.split(';')[0]).find(c=>c.startsWith(name+'='));
async function begin(extra='',cookie=''){
 const r=await fetch(base+'/auth/google'+extra,{redirect:'manual',headers:{Cookie:cookie}});assert.equal(r.status,302);
 const loc=new URL(r.headers.get('location')),q=loc.searchParams;
 const grant={code:crypto.randomBytes(8).toString('hex'),challenge:q.get('code_challenge'),nonce:q.get('nonce'),redirect:q.get('redirect_uri')};issued.push(grant);
 return {loc,q,state:q.get('state'),oauth:cookieOf(r,'atlas_oauth'),grant};
}
const callback=(f,params,cookie)=>fetch(base+'/auth/google/callback?'+new URLSearchParams(params),{redirect:'manual',headers:{Cookie:cookie??f.oauth}});
const session=async c=>(await (await fetch(base+'/api/session',{headers:{Cookie:c}})).json());
const api=(route,method,data,cookie)=>fetch(base+'/api/'+route,{method,headers:{'Content-Type':'application/json','X-Atlas-Request':'1',Cookie:cookie||''},body:JSON.stringify(data)});

test('start redirects to Google with PKCE, nonce, minimal scope and a browser-bound state cookie',async()=>{
 const f=await begin();
 assert.equal(f.loc.origin+f.loc.pathname,'https://accounts.example/auth');
 assert.equal(f.q.get('client_id'),'client-id');assert.equal(f.q.get('scope'),'openid');assert.equal(f.q.get('code_challenge_method'),'S256');
 assert.equal(f.q.get('redirect_uri'),base+'/auth/google/callback');assert.match(f.state,/^[a-f0-9]{64}$/);assert.equal(f.oauth,'atlas_oauth='+f.state);
 assert.equal((await session('')).google,true,'session reports Google sign-in is available');
});

test('callback creates an account with a random username, then signs the same Google user back in',async()=>{
 let f=await begin(),r=await callback(f,{code:f.grant.code,state:f.state});
 assert.equal(r.status,200);assert((await r.text()).includes('/atlas?auth=google-new'));
 const c1=cookieOf(r,'atlas_session'),s1=await session(c1);
 assert.match(s1.user.username,/^reader-[a-f0-9]{6}$/);assert.equal(s1.user.google,true);assert.equal(s1.user.password,false);
 f=await begin();r=await callback(f,{code:f.grant.code,state:f.state});assert((await r.text()).includes('/atlas?auth=google"'));
 assert.equal((await session(cookieOf(r,'atlas_session'))).user.id,s1.user.id,'same Google subject, same account');
 const state=await (await fetch(base+'/api/state',{headers:{Cookie:c1}})).json();assert.equal(state.revision,0,'reading state row exists');
});

test('state must match the cookie, is single-use, and ID token claims are checked',async()=>{
 let f=await begin();
 assert.equal((await callback(f,{code:f.grant.code,state:f.state},'')).headers.get('location'),'/atlas?auth=failed','no state cookie (login CSRF)');
 assert.equal((await callback(f,{code:f.grant.code,state:f.state})).headers.get('location'),'/atlas?auth=failed','state cannot be reused');
 f=await begin();assert.equal((await callback(f,{code:'wrong-code',state:f.state})).headers.get('location'),'/atlas?auth=failed','token exchange rejected');
 for(const bad of [{aud:'other-client'},{iss:'https://evil.example'},{exp:1},{nonce:'replayed'},{sub:''}]){
  claims=bad;f=await begin();assert.equal((await callback(f,{code:f.grant.code,state:f.state})).headers.get('location'),'/atlas?auth=failed',JSON.stringify(bad));
 }
 claims={};f=await begin();assert.equal((await callback(f,{error:'access_denied',state:f.state})).headers.get('location'),'/atlas?auth=cancelled');
 const a=await begin(),b=await begin();
 assert.equal((await callback(a,{code:a.grant.code,state:a.state},b.oauth)).headers.get('location'),'/atlas?auth=failed','cookie from a different flow');
 f=await begin();app.atlasDB.prepare('UPDATE oauth_states SET expires=1').run();
 assert.equal((await callback(f,{code:f.grant.code,state:f.state})).headers.get('location'),'/atlas?auth=failed','expired state');
});

test('a password account can connect Google; a Google account cannot be connected twice',async()=>{
 const reg=await api('register','POST',{username:'linker',password:'linker-password-123'});const c=cookieOf(reg,'atlas_session');
 claims={sub:'google-sub-2'};let f=await begin('?mode=link',c);
 assert.equal((await callback(f,{code:f.grant.code,state:f.state})).headers.get('location'),'/atlas?auth=linked');
 const s=await session(c);assert.equal(s.user.google,true);assert.equal(s.user.password,true);
 f=await begin();const r=await callback(f,{code:f.grant.code,state:f.state});assert.equal((await session(cookieOf(r,'atlas_session'))).user.username,'linker','Google now signs in to the linked account');
 const other=cookieOf(await api('register','POST',{username:'second',password:'second-password-123'}),'atlas_session');
 f=await begin('?mode=link',other);assert.equal((await callback(f,{code:f.grant.code,state:f.state})).headers.get('location'),'/atlas?auth=linked-elsewhere');
 assert.equal((await fetch(base+'/auth/google?mode=link',{redirect:'manual'})).headers.get('location'),'/atlas?auth=failed','link requires a session');
 claims={sub:'google-sub-9'};f=await begin('?mode=link',c);
 assert.equal((await callback(f,{code:f.grant.code,state:f.state})).headers.get('location'),'/atlas?auth=already-linked','an existing Google link is never replaced');
 claims={};
});

test('Google-only accounts cannot use password login or recovery, and delete by typing the username',async()=>{
 claims={sub:'google-sub-3'};const f=await begin(),r=await callback(f,{code:f.grant.code,state:f.state}),c=cookieOf(r,'atlas_session'),{user}=await session(c);claims={};
 assert.equal((await api('login','POST',{username:user.username,password:'any-password-12345'})).status,401);
 assert.equal((await api('recover','POST',{username:user.username,password:'any-password-12345',recovery:''})).status,401);
 assert.equal((await api('account','DELETE',{confirm:'wrong'},c)).status,401);
 assert.equal((await api('account','DELETE',{confirm:user.username},c)).status,200);assert.equal((await session(c)).user,null);
});

test('production without ATLAS_PUBLIC_URL keeps Google sign-in off',async()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-nourl-')),prev=process.env.ATLAS_DB;process.env.ATLAS_DB=path.join(d,'n.sqlite');const s=createServer({dbPath:path.join(d,'n.sqlite'),secure:true,google:{clientId:'id',clientSecret:'secret',publicUrl:''}});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));
 try{assert.equal((await (await fetch('http://127.0.0.1:'+s.address().port+'/api/session')).json()).google,false);}
 finally{if(prev===undefined)delete process.env.ATLAS_DB;else process.env.ATLAS_DB=prev;await new Promise(r=>s.close(r));fs.rmSync(d,{recursive:true,force:true});}
});

test('without credentials Google sign-in is reported unavailable',async()=>{
 const d=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-nogoogle-')),s=createServer({dbPath:path.join(d,'n.sqlite'),secure:false,google:{clientId:'',clientSecret:''}});
 await new Promise(r=>s.listen(0,'127.0.0.1',r));const b='http://127.0.0.1:'+s.address().port;
 try{assert.equal((await (await fetch(b+'/api/session')).json()).google,false);assert.equal((await fetch(b+'/auth/google',{redirect:'manual'})).headers.get('location'),'/atlas?auth=unavailable');}
 finally{await new Promise(r=>s.close(r));fs.rmSync(d,{recursive:true,force:true});}
});
