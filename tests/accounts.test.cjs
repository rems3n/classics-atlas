const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {createServer}=require('../server.cjs');
test('accounts isolate private reading, survive restart and enforce collection visibility',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-account-test-')),dbPath=path.join(dir,'readers.sqlite');let server=createServer({dbPath,secure:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));let base='http://127.0.0.1:'+server.address().port;
 const req=async(route,method='GET',data,cookie='',extra={})=>{const r=await fetch(base+'/api/'+route,{method,headers:{'Content-Type':'application/json','X-Atlas-Request':'1',Cookie:cookie,...extra},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 try{
 const a=await req('register','POST',{username:'reader_a',password:'test-password-12345'}),b=await req('register','POST',{username:'reader_b',password:'other-password-6789'});
 assert.equal(a.status,200);assert.equal(b.status,200);assert.equal(a.body.recovery.length,64);const ac=a.cookie,bc=b.cookie;
 assert.equal((await req('state')).status,401);
 assert.equal((await req('state','PUT',{revision:0,state:{shelf:{'09921623539b':{status:'read',rating:5}},reader:{notes:{'09921623539b':'private'}}}},ac)).status,200);
 assert.deepEqual((await req('state','GET',null,bc)).body.state,{});
 assert.equal((await req('state','PUT',{revision:0,state:{}},ac)).status,409,'stale revision cannot overwrite another device');
 assert.equal((await req('state','PUT',{revision:1,state:{}},ac,{Origin:'https://evil.example'})).status,403,'CSRF origin denied');
 const payload={title:'My journey',description:'Private intro',visibility:'private',items:[{bookId:'09921623539b',note:'Collection note'}]};const c=await req('collections','POST',payload,ac),id=c.body.collection.id;
 assert.equal(c.status,200);assert.equal((await req('collections/'+id)).status,404);assert.equal((await req('collections/'+id,'GET',null,bc)).status,404);assert.equal((await req('collections/'+id,'PUT',payload,bc)).status,404);assert.equal((await req('collections/'+id,'DELETE',{},bc)).status,404);
 assert.equal((await req('collections/'+id,'PUT',{...payload,visibility:'unlisted'},ac)).status,200);const shared=await req('collections/'+id);assert.equal(shared.status,200);assert(!JSON.stringify(shared.body).includes('private"'),'private book note not shared');assert.equal((await req('public-collections')).body.collections.length,0);
 await req('collections/'+id,'PUT',{...payload,visibility:'public'},ac);assert.equal((await req('public-collections')).body.collections.length,1);
 const html=await (await fetch(base+'/?collection='+id)).text();assert(html.includes('property="og:title" content="My journey'));
 await new Promise(r=>server.close(r));server=createServer({dbPath,secure:false});await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 assert.equal((await req('state','GET',null,ac)).body.state.shelf['09921623539b'].rating,5,'state survives process restart');
 const recover=await req('recover','POST',{username:'reader_a',password:'replacement-password-123',recovery:a.body.recovery});assert.equal(recover.status,200);assert.equal((await req('state','GET',null,ac)).status,401,'recovery invalidates old sessions');
 assert.equal((await req('account','DELETE',{password:'replacement-password-123'},recover.cookie)).status,200);assert.equal((await req('collections/'+id)).status,404,'account deletion removes collections');
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
