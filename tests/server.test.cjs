const {test,before,after}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),zlib=require('node:zlib');
const {createServer}=require('../server.cjs');
let server,base,dir;
before(async()=>{dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-server-test-'));server=createServer({dbPath:path.join(dir,'s.sqlite'),secure:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;});
after(async()=>{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});});
const api=(route,method,data,extra={})=>fetch(base+'/api/'+route,{method,headers:{'Content-Type':'application/json','X-Atlas-Request':'1',...extra},body:data===undefined?undefined:typeof data==='string'?data:JSON.stringify(data)});

test('health reports ok only when the database answers',async()=>{
 const r=await fetch(base+'/health');assert.equal(r.status,200);assert.deepEqual(await r.json(),{ok:true});
});

test('home page is served at / and links carrying app state redirect to the atlas',async()=>{
 let r=await fetch(base+'/');assert.equal(r.status,200);const html=await r.text();
 assert(html.includes('href="/atlas"'));assert(html.includes('href="/atlas?tour=1"'));assert(!html.includes('window.ATLAS_DATA'));assert(!html.includes('{{'));
 assert(html.includes('1,492'),'live book count');assert.equal((html.match(/href="\/atlas\?path=/g)||[]).length,10,'all reading paths listed');
 for(const q of ['?book=abc','?path=yale-quixote','?collection=x','?tour=1']){r=await fetch(base+'/'+q,{redirect:'manual'});assert.equal(r.status,302,q);assert.equal(r.headers.get('location'),'/atlas'+q);}
 r=await fetch(base+'/',{headers:{'If-None-Match':(await fetch(base+'/')).headers.get('etag')}});assert.equal(r.status,304);
});

test('atlas is served with security headers, a strong ETag and 304 revalidation',async()=>{
 for(const legacy of ['/index.html','/classics-atlas.html'])assert((await (await fetch(base+legacy)).text()).includes('window.ATLAS_DATA='),legacy);
 let r=await fetch(base+'/atlas');assert.equal(r.status,200);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.equal(r.headers.get('x-frame-options'),'DENY');
 const etag=r.headers.get('etag');assert.match(etag,/^"[A-Za-z0-9_-]+"$/);assert((await r.text()).includes('window.ATLAS_DATA='));
 r=await fetch(base+'/atlas',{headers:{'If-None-Match':etag}});assert.equal(r.status,304);assert.equal(await r.text(),'');
 r=await fetch(base+'/atlas',{method:'HEAD'});assert.equal(r.status,200);assert.equal(r.headers.get('etag'),etag);
});

test('compressed variants decode to the same page and are reused',async()=>{
 const http=require('node:http');
 const raw=enc=>new Promise((res,rej)=>http.get(base+'/atlas',{headers:{'Accept-Encoding':enc}},r=>{const c=[];r.on('data',d=>c.push(d));r.on('end',()=>res({h:r.headers,b:Buffer.concat(c)}));}).on('error',rej));
 const plain=await raw('identity'),gz=await raw('gzip'),br=await raw('gzip, deflate, br');
 assert.equal(plain.h['content-encoding'],undefined);assert.equal(gz.h['content-encoding'],'gzip');assert.equal(br.h['content-encoding'],'br');
 assert(zlib.gunzipSync(gz.b).equals(plain.b));assert(zlib.brotliDecompressSync(br.b).equals(plain.b));
 assert(br.b.length<gz.b.length,'brotli is smaller than gzip');assert.equal(Number(br.h['content-length']),br.b.length);
 const t=Date.now();await raw('gzip');assert(Date.now()-t<150,'cached variant is not recompressed per request');
});

test('shareable book and path links get their own title and ETag',async()=>{
 const catalog=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/catalog.json'))),book=catalog[0];
 const home=await fetch(base+'/atlas'),r=await fetch(base+'/atlas?book='+book.id),html=await r.text();
 assert(html.includes('<title>'+book.title.replace(/&/g,'&amp;').replace(/</g,'&lt;')));assert.notEqual(r.headers.get('etag'),home.headers.get('etag'));
 const unknown=await fetch(base+'/atlas?book=not-a-book');assert.equal(unknown.headers.get('etag'),home.headers.get('etag'),'unknown ids fall back to the default page');
});

test('source, data and traversal paths are not served; writes to pages are rejected',async()=>{
 for(const url of ['/server.cjs','/data/catalog.json','/../package.json','/.git/config'])assert.equal((await fetch(base+url)).status,404,url);
 assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
});

test('mutations require the app header, JSON and a same-origin or absent Origin',async()=>{
 assert.equal((await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,403,'missing X-Atlas-Request');
 assert.equal((await fetch(base+'/api/login',{method:'POST',headers:{'X-Atlas-Request':'1','Content-Type':'text/plain'},body:'{}'})).status,403,'form-style content type');
 assert.equal((await api('login','POST',{},{Origin:'null'})).status,403,'opaque origin is denied, not a server error');
 assert.equal((await api('login','POST',{},{Origin:'not a url'})).status,403);
 assert.equal((await api('login','POST','{bad json')).status,400);
});

test('malformed collection items are rejected with 400',async()=>{
 const reg=await api('register','POST',{username:'items_check',password:'long-enough-password'}),cookie=reg.headers.get('set-cookie').split(';')[0];
 for(const items of [[null],['09921623539b'],[{bookId:'09921623539b'}],[{bookId:'missing',note:''}]]){
  const r=await api('collections','POST',{title:'T',description:'',visibility:'private',items},{Cookie:cookie});assert.equal(r.status,400,JSON.stringify(items));
 }
});
