// jsdom checks for the product tour: start conditions, navigation, keyboard, persistence and replay.
const {JSDOM,VirtualConsole}=require(process.env.ATLAS_JSDOM_PATH||'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../dist/classics-atlas.html'),'utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function load(url='https://atlas.example.test/atlas',saved={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url,runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.structuredClone=structuredClone;w.innerWidth=1280;w.innerHeight=800;
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  // jsdom has no layout; give every element a box so tour targets count as visible.
  w.Element.prototype.getBoundingClientRect=function(){return {left:100,top:100,right:300,bottom:140,width:200,height:40,x:100,y:100,toJSON(){}};};
  for(const [k,v]of Object.entries(saved))w.localStorage.setItem(k,v);
 }});
 return {dom,w:dom.window,d:dom.window.document,errors};
}
const key=(w,k)=>(w.document.activeElement||w.document.body).dispatchEvent(new w.KeyboardEvent('keydown',{key:k,bubbles:true}));
(async()=>{
 // First visit: prompt appears; "Not now" hides it and is remembered.
 let t=load();await sleep(1000);
 assert(t.d.querySelector('.tour-prompt'),'first-visit prompt shown');
 t.d.querySelector('[data-tour-dismiss]').click();
 assert(!t.d.querySelector('.tour-prompt'));assert.equal(t.w.localStorage.getItem('atlas-tour-v1'),'dismissed');
 t.dom.window.close();

 // Seen before, or arriving on a shared book link: no prompt.
 t=load(undefined,{'atlas-tour-v1':'done'});await sleep(1000);assert(!t.d.querySelector('.tour-prompt'),'no prompt after completion');t.dom.window.close();
 t=load('https://atlas.example.test/atlas?book=09921623539b');await sleep(1000);assert(!t.d.querySelector('.tour-prompt'),'no prompt on deep links');t.dom.window.close();

 // ?tour=1 starts the tour and removes the parameter.
 t=load('https://atlas.example.test/atlas?tour=1',{'atlas-tour-v1':'done'});await sleep(500);
 const {w,d}=t,tip=()=>d.querySelector('.tour-tip');
 assert(tip(),'tour started from ?tour=1');assert(!new URL(w.location.href).searchParams.has('tour'),'tour parameter removed');
 assert.equal(tip().getAttribute('role'),'dialog');assert.equal(d.activeElement.id,'tourTitle','focus moves into the tour');
 assert.equal(d.querySelector('#tourCount').textContent,'Step 1 of 10');assert(d.querySelector('.tour-back').hidden,'no Back on first step');
 const titles=[d.querySelector('#tourTitle').textContent];
 for(let n=1;n<10;n++){d.querySelector('.tour-next').click();titles.push(d.querySelector('#tourTitle').textContent);}
 assert.deepEqual(titles,['Welcome to Classics Atlas','The map','Search','Time and borders','Filters','Books','Reading paths','Your shelf','Guest or account','That is the tour']);
 assert.equal(d.querySelector('.tour-next').textContent,'Finish');assert(d.querySelector('.tour-skip').hidden,'no Skip on last step');
 key(w,'ArrowLeft');assert.equal(d.querySelector('#tourTitle').textContent,'Guest or account','ArrowLeft goes back');
 key(w,'ArrowRight');d.querySelector('.tour-next').click();
 assert(!tip()&&!d.querySelector('.tour-spot')&&!d.querySelector('.tour-block'),'Finish removes the tour');assert.equal(w.localStorage.getItem('atlas-tour-v1'),'done');

 // Replay from About; Escape skips; every step with a target finds one in the real markup.
 d.querySelector('#aboutBtn').click();d.querySelector('[data-tour-open]').click();
 assert(tip(),'replay from About');assert(!d.querySelector('#aboutDialog').open,'About closes when the tour starts');
 for(let n=1;n<9;n++){key(w,'ArrowRight');assert(!d.querySelector('.tour-spot').classList.contains('empty'),'step '+(n+1)+' has a target');}
 key(w,'Escape');assert(!tip(),'Escape ends the tour');assert.equal(w.localStorage.getItem('atlas-tour-v1'),'skipped');
 assert.deepEqual(t.errors,[]);setTimeout(()=>t.dom.window.close(),100);
 console.log('Tour checks passed: first-visit prompt, dismissal, deep-link suppression, ?tour=1, 10 steps, Back/Next/Finish, arrow keys, Escape, replay from About, focus, persistence.');
})().catch(e=>{console.error(e);process.exitCode=1;});
