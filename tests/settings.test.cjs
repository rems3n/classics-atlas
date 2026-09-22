// jsdom checks for the Settings dialog: theme, map color schemes, persistence and map repaint.
const {JSDOM,VirtualConsole}=require(process.env.ATLAS_JSDOM_PATH||'jsdom');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const html=fs.readFileSync(path.join(__dirname,'../dist/classics-atlas.html'),'utf8');
function load(saved={}){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM(html,{url:'https://atlas.example.test/atlas',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
  w.structuredClone=structuredClone;w.innerWidth=1280;w.innerHeight=800;
  Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get(){return w.innerWidth;}});Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get(){return w.innerHeight;}});
  Object.defineProperty(w.SVGElement.prototype,'viewBox',{get(){return {baseVal:{x:0,y:0,width:w.innerWidth,height:w.innerHeight}};}});
  w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
  for(const [k,v]of Object.entries({'atlas-tour-v1':'done',...saved}))w.localStorage.setItem(k,v);
 }});
 return {dom,w:dom.window,d:dom.window.document,errors};
}
const pick=(d,name,value)=>{const r=d.querySelector(`input[name=${name}][value=${value}]`);r.checked=true;r.dispatchEvent(new d.defaultView.Event('change',{bubbles:true}));};
const fills=d=>[...d.querySelectorAll('path.country')].map(p=>p.getAttribute('fill')||p.style.fill).filter(f=>f&&!f.includes('var(')).sort().join('|');
let t=load(),{w,d}=t;
assert.equal(w.AtlasSettings.get(),'terracotta','default scheme');
d.querySelector('#settingsBtn').click();const dlg=d.querySelector('#settingsDialog');assert(dlg.open,'gear opens Settings');
assert.deepEqual([...dlg.querySelectorAll('input[name=mapColors]')].map(i=>i.value),['terracotta','ocean','forest','plum','graphite','viridis']);
assert(dlg.querySelector('input[value=terracotta]').checked);assert(dlg.querySelector('#reduceGlass'),'Reduce transparency lives in Settings');
const before=fills(d),markerBefore=d.documentElement.style.getPropertyValue('--data');
pick(d,'mapColors','ocean');
assert.equal(w.AtlasSettings.get(),'ocean');assert.equal(w.localStorage.getItem('classics-atlas-map-colors'),'"ocean"');
assert.notEqual(fills(d),before,'country shading repaints');assert.equal(d.documentElement.style.getPropertyValue('--data'),'#2166a8');assert.notEqual(markerBefore,'#2166a8');
assert(d.documentElement.style.getPropertyValue('--ramp').startsWith('linear-gradient'),'legend ramp set');
pick(d,'theme','dark');assert.equal(d.documentElement.dataset.theme,'dark');assert.equal(d.documentElement.style.getPropertyValue('--data'),'#7ab3ef','dark marker color');
assert(d.querySelector('input[name=theme][value=dark]').checked);
pick(d,'mapColors','viridis');assert.equal(w.AtlasSettings.get(),'viridis');
d.querySelector('[data-close=settingsDialog]').click();assert(!dlg.open);
const saved={};for(let i=0;i<w.localStorage.length;i++){const k=w.localStorage.key(i);saved[k]=w.localStorage.getItem(k);}
assert.deepEqual(t.errors,[]);{const prev=t.dom;setTimeout(()=>prev.window.close(),100);}
t=load(saved);assert.equal(t.w.AtlasSettings.get(),'viridis','scheme persists');assert.equal(t.d.documentElement.dataset.theme,'dark','theme persists');
t=load({'classics-atlas-map-colors':'"not-a-scheme"'});assert.equal(t.w.AtlasSettings.get(),'terracotta','unknown values fall back');
assert.deepEqual(t.errors,[]);setTimeout(()=>t.dom.window.close(),100);
console.log('Settings checks passed: gear opens Settings, 6 map schemes, repaint, marker and legend colors, theme, persistence, invalid value fallback.');
