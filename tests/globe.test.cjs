// Integration regression: actual SVG geometry, native wheel routing, multi-pointer lifecycle.
const {JSDOM,VirtualConsole}=require(process.env.ATLAS_JSDOM_PATH||'jsdom');
const fs=require('node:fs'),assert=require('node:assert/strict');
const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
const dom=new JSDOM(fs.readFileSync(require('node:path').join(__dirname,'../index.html'),'utf8'),{url:'https://atlas.example.test/',runScripts:'dangerously',pretendToBeVisual:true,virtualConsole:vc,beforeParse(w){
 w.structuredClone=structuredClone;w.innerWidth=1440;w.innerHeight=900;
 Object.defineProperty(w.HTMLElement.prototype,'clientWidth',{get:()=>1440});Object.defineProperty(w.HTMLElement.prototype,'clientHeight',{get:()=>900});
 Object.defineProperty(w.SVGElement.prototype,'viewBox',{get:()=>({baseVal:{x:0,y:0,width:1440,height:900}})});
 const captured=new Set();w.SVGElement.prototype.setPointerCapture=id=>captured.add(id);w.SVGElement.prototype.hasPointerCapture=id=>captured.has(id);w.SVGElement.prototype.releasePointerCapture=id=>captured.delete(id);
}});
const w=dom.window,d=w.document,map=d.querySelector('#map'),view=()=>w.ClassicsAtlas.getMapView(),click=id=>d.querySelector(id).click();
function pointer(type,id,x,y,target=map){const e=new w.MouseEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0});Object.defineProperty(e,'pointerId',{value:id});Object.defineProperty(e,'pointerType',{value:'touch'});target.dispatchEvent(e);return e;}
function wheel(deltaY,ctrlKey=true,deltaMode=0){const e=new w.WheelEvent('wheel',{deltaY,ctrlKey,deltaMode,bubbles:true,cancelable:true,view:w});map.dispatchEvent(e);return e;}
click('#globeBtn');const originalPath=d.querySelector('[data-country="FRA"]').getAttribute('d');
assert(wheel(-20).defaultPrevented,'trackpad pinch must zoom globe rather than page');assert(view().scale>1);assert.notEqual(d.querySelector('[data-country="FRA"]').getAttribute('d'),originalPath,'projection actually repainted');
wheel(20);assert(Math.abs(view().scale-1)<1e-9,'reverse pinch restores scale');wheel(-5,false,1);assert(view().scale>1,'line-mode wheel works');wheel(100000);assert.equal(view().scale,.6);wheel(-100000);wheel(-100000);assert.equal(view().scale,3);click('#homeMap');
const rotation=[...view().rotation];pointer('pointerdown',1,300,300);pointer('pointerdown',2,400,300);pointer('pointermove',2,500,300);assert.equal(view().scale,2);assert.deepEqual([...view().rotation],rotation,'pinching does not rotate');pointer('pointermove',2,350,300);assert.equal(view().scale,.6);pointer('pointermove',2,1500,300);assert.equal(view().scale,3);
pointer('pointerup',2,1500,300);pointer('pointermove',1,300,300);assert.deepEqual([...view().rotation],rotation,'lifting one finger does not jump');pointer('pointermove',1,320,300);assert.equal(view().rotation[0],rotation[0]+5,'remaining finger rotates');pointer('pointerup',1,320,300);
const before=w.ClassicsAtlas.getState().country;const accidental=new w.MouseEvent('click',{bubbles:true,cancelable:true,detail:1});d.querySelector('[data-country="FRA"]').dispatchEvent(accidental);assert(accidental.defaultPrevented);assert.equal(w.ClassicsAtlas.getState().country,before);
// A subsequent tap must still select a country.
const france=d.querySelector('[data-country="FRA"]');pointer('pointerdown',3,300,300,france);pointer('pointerup',3,300,300,france);france.dispatchEvent(new w.MouseEvent('click',{bubbles:true,detail:1}));assert.equal(w.ClassicsAtlas.getState().country,'FRA');
click('#homeMap');pointer('pointerdown',1,300,300);pointer('pointerdown',2,300,300);pointer('pointermove',2,400,300);assert(Number.isFinite(view().scale),'coincident fingers do not corrupt projection');pointer('pointermove',2,500,300);assert.equal(view().scale,2);pointer('pointercancel',1,300,300);pointer('pointercancel',2,500,300);const canceled=JSON.stringify(view());pointer('pointermove',2,900,300);assert.equal(JSON.stringify(view()),canceled,'cancelled gesture stops changing globe');
pointer('pointerdown',1,300,300);pointer('pointerdown',2,400,300);click('#flatBtn');const savedScale=view().scale;wheel(-20);assert.equal(view().scale,savedScale,'flat-map wheel does not alter globe zoom');click('#globeBtn');pointer('pointermove',2,600,300);assert.equal(view().scale,savedScale,'view switch discards stale contacts');
pointer('pointerdown',1,300,300);w.dispatchEvent(new w.Event('blur'));const beforeBlur=JSON.stringify(view());pointer('pointermove',1,500,500);assert.equal(JSON.stringify(view()),beforeBlur);
assert.deepEqual(errors,[]);setTimeout(()=>dom.window.close(),100);console.log('Globe gesture checks passed: trackpad pinch, wheel units, scale bounds, SVG repaint, two-touch pinch, rotation, finger lift, tap preservation, click suppression, cancellation, coincident fingers, projection switching, and blur.');
