const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),path=require('node:path');
(async()=>{
 const child=spawn(process.execPath,['server.cjs'],{cwd:path.resolve(__dirname,'..'),env:{...process.env,PORT:'3187'},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Server exited '+code)));});
  const base='http://127.0.0.1:3187';
  let r=await fetch(base+'/');assert.equal(r.status,200);assert.equal(r.headers.get('x-content-type-options'),'nosniff');const etag=r.headers.get('etag');assert((await r.text()).includes('window.ATLAS_DATA='));
  r=await fetch(base+'/',{headers:{'If-None-Match':etag}});assert.equal(r.status,304);
  r=await fetch(base+'/health');assert.equal(await r.text(),'ok');
  for(const url of ['/server.cjs','/data/catalog.json','/../package.json'])assert.equal((await fetch(base+url)).status,404);
  assert.equal((await fetch(base+'/',{method:'POST'})).status,405);
  assert.equal((await fetch(base+'/',{method:'HEAD'})).status,200);
  console.log('Static host checks passed: HTML, health, cache, HEAD, blocked source paths and methods.');
 }finally{child.kill('SIGTERM');}
})().catch(e=>{console.error(e);process.exitCode=1;});
