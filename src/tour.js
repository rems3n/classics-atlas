// Product tour: a short sequence of tooltips that point at the main controls.
// Starts from ?tour=1, the first-visit prompt, or the About dialog. State is kept in localStorage only.
(()=>{
'use strict';
const KEY='atlas-tour-v1';
const get=()=>{try{return localStorage.getItem(KEY);}catch{return 'unavailable';}};
const set=v=>{try{localStorage.setItem(KEY,v);}catch{}};
const shown=el=>el&&!el.closest('[hidden]')&&el.getBoundingClientRect().width>0&&el.getBoundingClientRect().height>0;
// A target entry is a selector, or an array of selectors highlighted together. The first shown entry wins.
function pick(list){
 for(const entry of list||[]){
  const els=(Array.isArray(entry)?entry:[entry]).map(s=>document.querySelector(s));
  if(!els.every(shown))continue;
  const rs=els.map(e=>e.getBoundingClientRect()),left=Math.min(...rs.map(r=>r.left)),top=Math.min(...rs.map(r=>r.top)),right=Math.max(...rs.map(r=>r.right)),bottom=Math.max(...rs.map(r=>r.bottom));
  return {el:els[0],rect:{left,top,right,bottom,width:right-left,height:bottom-top}};
 }
 return null;
}
const count=(window.ATLAS_DATA?.books||[]).length.toLocaleString('en-US');

const steps=[
 {title:'Welcome to Classics Atlas',body:`This tour points out the main controls and takes about a minute. Use the arrow keys or the buttons below.`},
 {target:['.map-tools'],title:'The map',body:`Countries are shaded by how many of the ${count} books come from them. Click a country to list its books. Use these buttons to switch to the globe, zoom, or reset the view.`},
 {target:['#searchForm'],title:'Search',body:'Type a title or an author, or a phrase such as “Japanese novels” or “Greek poetry before 400 BC”. Press Enter to apply it.'},
 {target:['.time-panel','#mobileFilters'],title:'Time and borders',body:'Pick an era or edit the date range to show books from that period. The Borders menu swaps in historical maps from 1500 BC to AD 1600.'},
 {target:[['#typeChoices','#categoryChoices'],'#mobileFilters'],title:'Filters',body:'Narrow the list by category, fiction or nonfiction, tradition, language and source collection. Reset clears every filter.'},
 {target:['#results','#openResults'],title:'Books',body:'Books that match the map and filters are listed in the Books panel. Open a book to see its summary, dates, map location and reading controls.'},
 {target:['.topbar [data-hub="paths"]','.mobile-views [data-hub="paths"]'],title:'Reading paths',body:'Reading lists based on university courses and expert picks. Start one and tick off each assignment as you read.'},
 {target:['#shelfBtn'],title:'Your shelf',body:'Mark a book as want to read, reading or read and it is added here. My Atlas shows your reading on the map and timeline.'},
 {target:['#accountBtn'],title:'Guest or account',body:'Everything works without an account and is saved in this browser. Sign in to sync across devices and share collections.'},
 {title:'That is the tour',body:'Try clicking a country, or open Paths to start a reading list. To replay the tour, open Data notes at the bottom of the Books panel, or use the home page.',last:true}
];

let i=0,ui=null,prompt=null,returnFocus=null;
function el(tag,cls,html){const e=document.createElement(tag);if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e;}
function build(){
 const block=el('div','tour-block');block.setAttribute('aria-hidden','true');
 const spot=el('div','tour-spot');spot.setAttribute('aria-hidden','true');
 const tip=el('div','tour-tip');tip.setAttribute('role','dialog');tip.setAttribute('aria-modal','true');tip.setAttribute('aria-labelledby','tourCount tourTitle');tip.setAttribute('aria-describedby','tourBody');
 tip.innerHTML=`<div class="tour-arrow" aria-hidden="true"></div><p class="tour-count" id="tourCount"></p><h2 id="tourTitle" tabindex="-1"></h2><p id="tourBody"></p><p class="tour-live" aria-live="polite"></p><div class="tour-dots" aria-hidden="true">${steps.map(()=>'<span></span>').join('')}</div><div class="tour-actions"><button type="button" class="tour-skip">Skip tour</button><span></span><button type="button" class="tour-back">Back</button><button type="button" class="tour-next primary">Next</button></div>`;
 document.body.append(block,spot,tip);
 tip.querySelector('.tour-next').onclick=()=>go(i+1);
 tip.querySelector('.tour-back').onclick=()=>go(i-1);
 tip.querySelector('.tour-skip').onclick=()=>end('skipped');
 block.onclick=()=>tip.querySelector('.tour-next').focus();
 return {block,spot,tip};
}
function place(){
 if(!ui)return;const {spot,tip}=ui,s=steps[i],hit=pick(s.target),target=hit&&hit.el,m=12,arrow=tip.querySelector('.tour-arrow');
 tip.classList.remove('above','below','docked');arrow.style.left='';
 if(!target){spot.classList.add('empty');Object.assign(spot.style,{left:'50%',top:'50%',width:'0px',height:'0px'});tip.style.left=Math.max(m,(innerWidth-tip.offsetWidth)/2)+'px';tip.style.top=Math.max(m,(innerHeight-tip.offsetHeight)/2)+'px';return;}
 const r=hit.rect,pad=6;
 spot.classList.remove('empty');Object.assign(spot.style,{left:r.left-pad+'px',top:r.top-pad+'px',width:r.width+pad*2+'px',height:r.height+pad*2+'px'});
 const w=tip.offsetWidth,h=tip.offsetHeight;
 if(innerWidth<600){ // Phones: dock to the screen edge away from the target.
  tip.classList.add('docked');tip.style.left=m+'px';tip.style.top=(r.top+r.height/2>innerHeight/2?m:innerHeight-h-m)+'px';return;
 }
 const below=r.bottom+pad+14+h<=innerHeight-m,above=r.top-pad-14-h>=m;
 let top,left=Math.min(Math.max(m,r.left+r.width/2-w/2),innerWidth-w-m);
 if(below){top=r.bottom+pad+14;tip.classList.add('below');}
 else if(above){top=r.top-pad-14-h;tip.classList.add('above');}
 else{top=Math.min(Math.max(m,r.top),innerHeight-h-m);left=r.right+pad+14+w<=innerWidth-m?r.right+pad+14:Math.max(m,r.left-pad-14-w);}
 tip.style.left=left+'px';tip.style.top=top+'px';
 if(below||above)arrow.style.left=Math.min(Math.max(18,r.left+r.width/2-left),w-18)+'px';
}
function go(n){
 if(n<0)return;if(n>=steps.length)return end('done');
 i=n;const s=steps[i],{tip}=ui;
 tip.querySelector('#tourCount').textContent=`Step ${i+1} of ${steps.length}`;
 tip.querySelector('#tourTitle').textContent=s.title;tip.querySelector('#tourBody').textContent=s.body;
 tip.querySelector('.tour-live').textContent=`Step ${i+1} of ${steps.length}. ${s.title}. ${s.body}`;
 tip.querySelectorAll('.tour-dots span').forEach((d,k)=>d.classList.toggle('on',k===i));
 tip.querySelector('.tour-back').hidden=i===0;tip.querySelector('.tour-skip').hidden=!!s.last;
 tip.querySelector('.tour-next').textContent=s.last?'Finish':i===0?'Start':'Next';
 const hit=pick(s.target);if(hit&&hit.el.scrollIntoView)hit.el.scrollIntoView({block:'nearest'});
 place();tip.querySelector('#tourTitle').focus({preventScroll:true});
}
function keys(e){
 if(!ui)return;
 if(e.key==='Escape'){e.preventDefault();end('skipped');}
 else if(e.key==='ArrowRight'&&!e.target.matches?.('input,textarea,select')){e.preventDefault();go(i+1);}
 else if(e.key==='ArrowLeft'&&!e.target.matches?.('input,textarea,select')){e.preventDefault();go(i-1);}
 else if(e.key==='Tab'){ // Keep focus inside the tour card.
  const f=[...ui.tip.querySelectorAll('button')].filter(b=>!b.hidden);if(!f.length)return;
  const first=f[0],last=f[f.length-1];
  if(e.shiftKey&&(document.activeElement===first||document.activeElement.id==='tourTitle'||!ui.tip.contains(document.activeElement))){e.preventDefault();last.focus();}
  else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 }
}
function start(){
 closePrompt();if(ui)return go(0);
 document.querySelectorAll('dialog[open]').forEach(d=>d.close());
 returnFocus=document.activeElement;ui=build();document.body.classList.add('touring');
 addEventListener('keydown',keys,true);addEventListener('resize',place);addEventListener('scroll',place,true);
 go(0);
}
function end(result){
 if(!ui)return;set(result);
 removeEventListener('keydown',keys,true);removeEventListener('resize',place);removeEventListener('scroll',place,true);
 ui.block.remove();ui.spot.remove();ui.tip.remove();ui=null;document.body.classList.remove('touring');
 const back=returnFocus&&document.contains(returnFocus)&&returnFocus!==document.body?returnFocus:document.querySelector('.brand');back?.focus?.({preventScroll:true});
}
function closePrompt(){if(prompt){prompt.remove();prompt=null;}}
function offer(){
 prompt=el('div','tour-prompt glass');prompt.setAttribute('role','region');prompt.setAttribute('aria-label','Product tour');
 prompt.innerHTML='<p><strong>New here?</strong> A 1-minute tour shows the map, search, reading paths and your shelf.</p><div><button type="button" class="primary" data-tour-start>Take the tour</button><button type="button" data-tour-dismiss>Not now</button></div>';
 prompt.querySelector('[data-tour-start]').onclick=start;
 prompt.querySelector('[data-tour-dismiss]').onclick=()=>{set('dismissed');closePrompt();};
 const skip=document.querySelector('.skip');skip?skip.after(prompt):document.body.prepend(prompt);
 prompt.addEventListener('keydown',e=>{if(e.key==='Escape')closePrompt();});
}
// Replay from the About dialog.
document.addEventListener('click',e=>{if(e.target.closest('[data-tour-open]'))start();});
const q=new URLSearchParams(location.search);
if(q.get('tour')==='1'){
 try{const u=new URL(location.href);u.searchParams.delete('tour');history.replaceState(null,'',u);}catch{}
 setTimeout(start,300);
}else if(!get()&&!['book','path','collection'].some(k=>q.has(k)))setTimeout(()=>{if(!ui&&!document.querySelector('dialog[open]'))offer();},800);
window.AtlasTour={start,end:()=>end('skipped'),steps:steps.length};
})();
