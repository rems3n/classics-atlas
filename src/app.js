/* Classics Atlas: dependency-free application UI over bundled D3. */
(()=>{'use strict';
const C=AtlasCore,books=ATLAS_DATA.books,world=ATLAS_DATA.world,historical=ATLAS_DATA.historical,byId=new Map(books.map(b=>[b.id,b]));
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const icons={book:'M3 4h6a4 4 0 0 1 3 2 4 4 0 0 1 3-2h6v15h-6a4 4 0 0 0-3 2 4 4 0 0 0-3-2H3zM12 6v15',shelf:'M4 3v18M9 3v18M14 3v18M18 3l4 17',search:'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',arrow:'M5 12h14M13 6l6 6-6 6',share:'M12 16V3M7 8l5-5 5 5M5 13v7h14v-7',moon:'M20 14A9 9 0 0 1 10 3a9 9 0 1 0 10 11',sun:'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1',info:'M12 11v6M12 7v1M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',chevron:'M6 9l6 6 6-6',close:'M6 6l12 12M6 18L18 6',plus:'M12 5v14M5 12h14',minus:'M5 12h14',locate:'M12 2v4M12 18v4M2 12h4M18 12h4M19 12a7 7 0 1 1-14 0 7 7 0 0 1 14 0',reset:'M3 4v6h6M3 10a9 9 0 1 1 2 9',expand:'M8 3H3v5M16 3h5v5M3 16v5h5M21 16v5h-5',filter:'M3 6h18M6 12h12M9 18h6'};
const icon=k=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[k]||icons.book}"/></svg>`;
function applyIcons(){document.querySelectorAll('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon));document.querySelectorAll('[data-icon-label]').forEach(e=>{if(!e.querySelector('svg'))e.insertAdjacentHTML('afterbegin',icon(e.dataset.iconLabel));});}
applyIcons();
function storageGet(k,f){try{return JSON.parse(localStorage.getItem(k))??f;}catch{return f;}}
let storageWarning=false;
function storageSet(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch{if(!storageWarning){storageWarning=true;toast('Browser storage is unavailable. Export a backup to keep your shelf.');}}}
function cleanShelf(raw){const out={};if(!raw||typeof raw!=='object')return out;for(const [id,v]of Object.entries(raw))if(byId.has(id)&&v&&typeof v==='object'){const status=['want','reading','read'].includes(v.status)?v.status:'';const rating=Number.isInteger(v.rating)&&v.rating>=0&&v.rating<=5?v.rating:0;if(status||rating)out[id]={status:status||'want',rating};}return out;}
let shelf=cleanShelf(storageGet('classics-atlas-shelf-v1',{}));
let state=C.decode(location.hash)||C.defaults(),previous=null,limit=30,filtered=[],mapBooks=[],countryCounts={},mapTransform=d3.zoomIdentity,projection,path,width,height,rotation=[-10,-20,0],globeScale=1,detailId=null;
let resultsOpen=innerWidth>700,filtersOpen=true,collectionExpanded=false;
const theme=storageGet('classics-atlas-theme','light');document.documentElement.dataset.theme=theme==='dark'?'dark':'light';
document.body.classList.toggle('reduced-glass',storageGet('classics-atlas-reduced-glass',false));$('reduceGlass').checked=document.body.classList.contains('reduced-glass');
const mapPlaces=[...world.features,...(ATLAS_DATA.places||[]).map(p=>({id:p.id,properties:{name:p.name,label:p.label}}))];
const names=new Map(mapPlaces.map(f=>[f.id,f.properties.name]));
const languages=[...new Set(books.map(b=>b.language).filter(Boolean))].sort();
const traditions=[...new Set(books.map(b=>b.tradition).filter(Boolean))].sort();
for(const [id,values]of [['traditionSelect',traditions],['languageSelect',languages],['collectionSelect',[...new Set(books.flatMap(b=>b.collections||[]))].sort()]])$(id).insertAdjacentHTML('beforeend',values.map(v=>`<option>${esc(v)}</option>`).join(''));
$('countrySelect').insertAdjacentHTML('beforeend',[...names].sort((a,b)=>a[1].localeCompare(b[1])).map(([id,n])=>`<option value="${id}">${esc(n)}</option>`).join(''));
$('categoryChoices').innerHTML=C.categories.map((c,i)=>`<label class="category-row"><input type="checkbox" value="${esc(c)}"><span>${esc(c)}</span><span class="dot" style="background:${C.colors[i]}"></span><span class="cat-count">${books.filter(b=>b.categories.includes(c)).length}</span></label>`).join('');
$('mapPeriod').insertAdjacentHTML('beforeend',historical.presets.map(p=>`<option value="${p.id}">${esc(C.year(p.year))} · ${esc(p.label)}</option>`).join(''));
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500);}
function resetAtlas(){$('searchInput').value='';$('searchReply').hidden=true;previous=null;change(C.defaults());showResults();}
function change(patch,{keepScroll=false}={}){if(Object.hasOwn(patch,'mapPeriod')&&!Object.hasOwn(patch,'from')&&!Object.hasOwn(patch,'to'))patch={...patch,...C.mapSelection(patch.mapPeriod)};
 else if((Object.hasOwn(patch,'from')||Object.hasOwn(patch,'to'))&&!Object.hasOwn(patch,'mapPeriod'))patch={...patch,mapPeriod:C.mapForRange(patch.to??state.to)};
 state=C.sanitize({...state,...patch});limit=30;render();if(!keepScroll)$('bookList').scrollTop=0;}
function updateHash(){try{history.replaceState(null,'',C.encode(state));}catch{}}
window.addEventListener('hashchange',()=>{const s=C.decode(location.hash);if(s){state=s;render();}});
function render(){document.dispatchEvent(new CustomEvent('atlas:render')); 
 filtered=books.filter(b=>C.matches(b,state,shelf));mapBooks=books.filter(b=>C.matches(b,state,shelf,true));countryCounts=C.counts(mapBooks,state);
 document.body.classList.remove('books-view','shelf-view','timeline-view');if(state.view!=='map')document.body.classList.add(state.view+'-view');
 syncPanels();
 document.querySelectorAll('[data-view]').forEach(e=>e.classList.toggle('active',e.dataset.view===state.view));
 document.querySelectorAll('[data-type]').forEach(e=>e.classList.toggle('active',e.dataset.type===state.type));
 document.querySelectorAll('#categoryChoices input').forEach(e=>e.checked=state.categories.includes(e.value));
 for(const [id,key]of [['mapPeriod','mapPeriod'],['geographySelect','geography'],['collectionSelect','collection'],['traditionSelect','tradition'],['languageSelect','language'],['countrySelect','country'],['colorSelect','color'],['sortSelect','sort']])$(id).value=state[key];
 for(const [id,key]of [['bookPinsToggle','bookPins'],['overlayToggle','overlay'],['unknownToggle','includeUnknown'],['emptyToggle','hideEmpty']])$(id).checked=state[key];
 $('colorSelect').disabled=state.mapPeriod!=='modern';$('emptyToggle').disabled=state.mapPeriod!=='modern';$('overlayToggle').disabled=state.mapPeriod!=='modern';
 $('flatBtn').classList.toggle('active',state.projection==='map');$('globeBtn').classList.toggle('active',state.projection==='globe');
 $('themeBtn').innerHTML=icon(document.documentElement.dataset.theme==='dark'?'sun':'moon');
 $('shelfTabs').hidden=state.view!=='shelf';document.querySelectorAll('[data-shelf]').forEach(e=>e.classList.toggle('active',e.dataset.shelf===state.shelf));
 $('shelfCount').textContent=Object.keys(shelf).length;
 $('resultsKicker').textContent=state.view==='shelf'?'YOUR READING JOURNEY':'THE COLLECTION';
 $('resultsTitle').textContent=state.view==='shelf'?'My shelf':state.country?names.get(state.country)||state.country:state.tradition!=='All'?state.tradition:'Around the world';
 const placed=filtered.filter(b=>b.countries.length).length;
 $('resultCount').textContent=filtered.length.toLocaleString()+' matching '+(filtered.length===1?'work':'works')+' · '+placed+' with location data';
 $('coverageLabel').textContent=books.filter(b=>b.start!=null).length+' dates / ranges · '+books.filter(b=>b.cover).length+' covers';
 $('dataStatus').textContent=books.length.toLocaleString()+' catalog works · '+books.filter(b=>b.countries.length).length+' geographically annotated';
 $('clearPlace').hidden=!state.country;
 renderChips();renderBooks();renderTimeline();resize();renderLegend();updateHash();
}
function renderChips(){const chips=[];if(state.scopeLabel)chips.push(['scope',state.scopeLabel]);if(state.readFilter!=='all')chips.push(['readFilter',state.readFilter==='read'?'Already read':'Not yet read']);
 if(state.collection!=='All')chips.push(['collection',state.collection]);if(state.tradition!=='All')chips.push(['tradition',state.tradition]);if(state.language!=='All')chips.push(['language',state.language]);if(state.country)chips.push(['country',names.get(state.country)]);if(state.type!=='All')chips.push(['type',state.type]);for(const cat of state.categories)chips.push(['category',cat]);if(state.q)chips.push(['q',state.q]);if(state.from!==-2500||state.to!==2050)chips.push(['date',state.before?'Before '+C.year(state.to):C.year(state.from)+' – '+C.year(state.to)]);
 $('chips').innerHTML=chips.map(([key,val])=>`<button class="chip" data-chip="${key}" data-value="${esc(val)}" aria-label="Remove ${esc(val)} filter">${esc(val)} <span class="x">×</span></button>`).join('');}
const failedCovers=new Set();
document.addEventListener('error',e=>{if(e.target.matches?.('img.edition-cover')){failedCovers.add(e.target.dataset.coverId);const parent=e.target.parentElement;parent.classList.remove('has-cover');parent.setAttribute('aria-label','Cover unavailable; title-art placeholder');e.target.remove();}},true);
function cover(b){const actual=(b.cover?.startsWith('https://covers.openlibrary.org/b/id/')||b.coverProvider==='Publisher'&&b.cover?.startsWith('https://'))&&!failedCovers.has(b.id);return `<div class="cover ${actual?'has-cover':''}" style="--cover-color:${C.colors[Math.max(0,C.categories.indexOf(b.categories[0]))]}" role="img" aria-label="${actual?esc(b.coverLabel+' for '+b.title):'Title-art placeholder for '+esc(b.title)+'; not an actual edition cover'}"><small>CLASSICS ATLAS</small><span>${esc(b.title.length>44?b.title.slice(0,41)+'…':b.title)}</span><small>${b.cover?'COVER UNAVAILABLE':'TITLE ART'}</small>${actual?`<img class="edition-cover" data-cover-id="${b.id}" src="${esc(b.cover)}" alt="${esc(b.title)} — ${esc(b.coverLabel)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`:''}</div>`;}
function stars(b){return `<div class="stars" role="group" aria-label="Your rating of ${esc(b.title)}">${[1,2,3,4,5].map(n=>`<button data-rate="${b.id}" data-rating="${n}" class="${(shelf[b.id]?.rating||0)>=n?'filled':''}" aria-label="Rate ${n} ${n===1?'star':'stars'}" aria-pressed="${(shelf[b.id]?.rating||0)===n}">${(shelf[b.id]?.rating||0)>=n?'★':'☆'}</button>`).join('')}</div>`;}
function shelfSelect(b){return `<select data-status="${b.id}" aria-label="Reading status for ${esc(b.title)}">${[['',shelf[b.id]?'Remove from shelf':'Add to shelf'],['want','Want to read'],['reading','Reading'],['read','Read']].map(([v,n])=>`<option value="${v}" ${(shelf[b.id]?.status||'')===v?'selected':''}>${n}</option>`).join('')}</select>`;}
function card(b){return `<article class="book-card" data-book="${b.id}"><div class="book-main">${cover(b)}<div class="book-copy"><button class="book-title" data-detail="${b.id}">${esc(b.title)}</button><div class="author">${esc(b.author)}</div><div class="book-meta">${b.textDate?`<span class="date-basis">${b.dateKind==='original composition'?'Composition':'Story origins'} · </span>`:''}${esc(C.date(b))}</div>${b.categories.map(c=>`<span class="tag">${esc(c)}</span>`).join('')}${b.start==null?'<span class="tag">Metadata pending</span>':''}<p class="book-summary">${esc(b.overview||'Included in the Penguin Classics source list. Date, location, category, and edition details still need enrichment.')}</p></div></div><div class="book-actions">${shelfSelect(b)}<button data-detail="${b.id}">Book details ↗</button></div><div class="rating-row"><span>Your rating</span>${stars(b)}</div></article>`;}
function sorted(){return [...filtered].sort((a,b)=>{if(state.sort==='title')return a.title.localeCompare(b.title);if(state.sort==='rating')return (shelf[b.id]?.rating||0)-(shelf[a.id]?.rating||0)||a.title.localeCompare(b.title);if(a.start==null||b.start==null)return (a.start==null)-(b.start==null)||a.title.localeCompare(b.title);if(state.sort==='newest')return b.start-a.start;return a.start-b.start||a.title.localeCompare(b.title);});}
function renderBooks(){const list=sorted();$('bookList').innerHTML=list.length?list.slice(0,limit).map(card).join('')+(list.length>limit?`<button class="load-more" id="loadMore">Show 30 more · ${list.length-limit} remaining</button>`:''):`<div class="empty"><span data-icon="book"></span><h3>${state.view==='shelf'?'A story waiting to begin.':'No works in this view.'}</h3><p>${state.view==='shelf'?'Add books to your shelf or widen your filters. Your ratings and progress stay on this device.':'Try a wider date range or fewer filters. This region may not have location metadata yet; an empty map does not mean no literature exists here.'}</p><button data-action="reset">${state.view==='shelf'?'Explore books':'Reset filters'}</button></div>`;}
const eras=C.eras;
const timelineBrush=$('timelineBrush');let timelineGesture=null,timelineKeyboardYear=null;
const yearPercent=y=>(y+2500)/4550*100;
$('timelineTicks').innerHTML=Array.from({length:92},(_,i)=>{const y=i*50-2500,major=y%500===0;return `<span class="time-tick ${major?'major':''} ${y===-2500?'first':y===2000?'last':''}" style="left:${yearPercent(y)}%">${major?`<small>${y===0?'BC / AD':y<0?Math.abs(y)+' BC':y}</small>`:''}</span>`;}).join('');
function paintTimelineRange(range){
 $('dateRange').textContent=C.year(range.from)+' — '+C.year(range.to);
 $('timelineSelection').style.left=yearPercent(range.from)+'%';
 $('timelineSelection').style.width=(range.to-range.from)/4550*100+'%';
 for(const [id,key]of [['fromRange','from'],['fromNumber','from'],['toRange','to'],['toNumber','to']])$(id).value=range[key];
 $('histogram').querySelectorAll('.hist-bar').forEach((bar,i)=>bar.classList.toggle('outside',i*50-2500<range.from||i*50-2500>range.to));
}
function timelineYearAt(clientX){const rect=timelineBrush.getBoundingClientRect();return C.snapYear(-2500+(clientX-rect.left)/Math.max(1,rect.width)*4550);}
function showTimelineYear(y){$('timelineHover').hidden=false;$('timelineHover').textContent=C.year(y);$('timelineHover').style.left=Math.max(8,Math.min(92,yearPercent(y)))+'%';}
function finishTimelineGesture(cancel=false){
 const g=timelineGesture;if(!g)return;timelineGesture=null;timelineBrush.classList.remove('selecting');
 if(timelineBrush.hasPointerCapture?.(g.id))timelineBrush.releasePointerCapture(g.id);
 $('timelineHover').hidden=true;
 if(cancel)paintTimelineRange(state);
 else change({...C.timelineSelection(g.anchor,g.end,g.drag),before:false,after:false,includeUnknown:false},{keepScroll:true});
}
timelineBrush.addEventListener('pointerdown',e=>{
 if(e.button!==0||e.isPrimary===false||timelineGesture)return;e.preventDefault();
 timelineBrush.focus({preventScroll:true});const year=timelineYearAt(e.clientX);
 timelineGesture={id:e.pointerId,x:e.clientX,anchor:year,end:year,drag:false};timelineKeyboardYear=year;
 timelineBrush.setPointerCapture?.(e.pointerId);timelineBrush.classList.add('selecting');
 showTimelineYear(year);paintTimelineRange(C.timelineSelection(year,year));
});
timelineBrush.addEventListener('pointermove',e=>{
 const y=timelineYearAt(e.clientX),g=timelineGesture;if(g&&g.id!==e.pointerId)return;
 showTimelineYear(y);
 if(g){g.end=y;g.drag=g.drag||(Math.abs(e.clientX-g.x)>=4&&y!==g.anchor);paintTimelineRange(C.timelineSelection(g.anchor,y,g.drag));}
});
timelineBrush.addEventListener('pointerup',e=>{if(timelineGesture?.id!==e.pointerId)return;timelineGesture.end=timelineYearAt(e.clientX);timelineGesture.drag=timelineGesture.drag||(Math.abs(e.clientX-timelineGesture.x)>=4&&timelineGesture.end!==timelineGesture.anchor);finishTimelineGesture();});
timelineBrush.addEventListener('pointercancel',e=>{if(timelineGesture?.id===e.pointerId)finishTimelineGesture(true);});
timelineBrush.addEventListener('lostpointercapture',e=>{if(timelineGesture?.id===e.pointerId)finishTimelineGesture(true);});
timelineBrush.addEventListener('pointerleave',()=>{if(!timelineGesture)$('timelineHover').hidden=true;});
timelineBrush.addEventListener('focus',()=>{timelineKeyboardYear=C.snapYear((state.from+state.to)/2);});
timelineBrush.addEventListener('blur',()=>{finishTimelineGesture(true);$('timelineHover').hidden=true;});
timelineBrush.addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();finishTimelineGesture(true);$('timelineHover').hidden=true;return;}
 if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();timelineKeyboardYear=C.snapYear(e.key==='Home'?-2500:e.key==='End'?2050:(timelineKeyboardYear??0)+(e.key==='ArrowLeft'?-50:50));showTimelineYear(timelineKeyboardYear);}
 if(e.key==='Enter'||e.key===' '){e.preventDefault();if(timelineGesture)return;const y=timelineKeyboardYear??C.snapYear((state.from+state.to)/2);change({...C.timelineSelection(y,y),before:false,after:false,includeUnknown:false},{keepScroll:true});showTimelineYear(y);}
});
function renderTimeline(){
 $('dateRange').textContent=C.year(state.from)+' — '+C.year(state.to);
 $('periodSummary').textContent=C.year(state.from)+' — '+C.year(state.to);
 const temporalMap=activeHistoricalMap();$('timeContext').textContent=temporalMap?'Borders: '+C.year(temporalMap.year)+'. Selecting a map shows books up to that year. Custom ranges keep your exact dates.':'Modern borders. Select a historical map to browse books up to its date.';
 $('chronology').hidden=state.view!=='timeline';
 for(const [id,key]of [['fromRange','from'],['fromNumber','from'],['toRange','to'],['toNumber','to']])$(id).value=state[key];
 const exactEra=Object.keys(eras).find(key=>eras[key][0]===state.from&&eras[key][1]===state.to);const linkedEra=exactEra||(state.from===-2500&&temporalMap?(state.to<500?'ancient':state.to<1400?'medieval':'renaissance'):'');document.querySelectorAll('[data-era]').forEach(e=>{e.classList.toggle('active',e.dataset.era===linkedEra);e.setAttribute('aria-pressed',String(e.dataset.era===linkedEra));});
 const binBooks=books.filter(b=>C.matches(b,{...state,from:-2500,to:2050,before:false,after:false},shelf));const bins=Array.from({length:91},()=>0);
 for(const b of binBooks)if(b.start!=null){const i=Math.floor((b.start+2500)/50);if(i>=0&&i<bins.length)bins[i]++;}
 const max=Math.max(1,...bins);$('histogram').innerHTML=bins.map((v,i)=>`<div class="hist-bar ${i*50-2500<state.from||i*50-2500>state.to?'outside':''}" style="height:${v?Math.max(8,Math.sqrt(v/max)*100):2}%" title="${C.year(i*50-2500)}: ${v} works"></div>`).join('');
 paintTimelineRange(state);
 $('timelineList').hidden=state.view!=='timeline';if(state.view==='timeline'){const groups={};for(const b of filtered)if(b.start!=null)(groups[Math.floor(b.start/50)*50]??=[]).push(b);$('timelineList').innerHTML=Object.keys(groups).sort((a,b)=>a-b).map(y=>`<div class="timeline-group"><strong>${esc(C.year(+y))}</strong><div>${groups[y].map(b=>`<button data-detail="${b.id}">${esc(b.title)} <span>— ${esc(b.author)} · ${esc(C.date(b))}</span></button>`).join('')}</div></div>`).join('')||'<div class="empty"><h3>No dated works in this view</h3><p>Try widening your filters.</p></div>';}}
function activeHistoricalMap(){return historical.presets.find(p=>p.id===state.mapPeriod);}
function historicalColor(f){let n=0;for(const c of f.properties.sovereign)n=(n*31+c.charCodeAt(0))>>>0;return C.colors[n%C.colors.length];}
function renderHistoricalGeometry(){
 const p=activeHistoricalMap();
 historicLand.selectAll('path').data(p?.features||[],f=>f.id).join('path').attr('class','historical-region').attr('data-region',f=>f.properties.name).attr('fill',historicalColor).attr('d',path).on('click',(e,f)=>{if(e.defaultPrevented)return;e.stopPropagation();$('tooltip').hidden=true;showHistory(f);}).on('mousemove',(e,f)=>{$('tooltip').innerHTML=`<strong>${esc(f.properties.name)}</strong><span>${esc(C.year(p.year))} · reconstructed region<br>Click for map notes</span>`;$('tooltip').hidden=false;$('tooltip').style.left=Math.max(8,Math.min(e.clientX+12,innerWidth-245))+'px';$('tooltip').style.top=Math.max(8,e.clientY-65)+'px';}).on('mouseleave',()=>$('tooltip').hidden=true);
}
function positionHistoricalLabels(){
 const centers=activeHistoricalMap()?.centers||[],scale=state.projection==='map'?mapTransform.k:1;
 historicPoints.selectAll('g').data(centers.filter(f=>visiblePoint(f.geometry.coordinates)),f=>f.id).join(enter=>{const g=enter.append('g').attr('role','button').attr('tabindex',0);g.append('path').attr('d','M0 -5L5 0L0 5L-5 0Z');g.append('text').attr('x',8).attr('y',3);return g;}).attr('transform',f=>`translate(${projection(f.geometry.coordinates)}) scale(${1/scale})`).attr('aria-label',f=>f.properties.name+'; historical center, borders not drawn').on('click',(e,f)=>{e.stopPropagation();showHistory(f);}).on('keydown',(e,f)=>{if(e.key==='Enter'){e.preventDefault();showHistory(f);}}).each(function(f){d3.select(this).select('text').text(f.properties.name);});

 const p=activeHistoricalMap(),k=state.projection==='map'?mapTransform.k:1;
 const occupied=centers.filter(f=>visiblePoint(f.geometry.coordinates)).map(f=>{const xy=projection(f.geometry.coordinates);return {x:xy[0]*k+f.properties.name.length*2.5,y:xy[1]*k,half:f.properties.name.length*2.5+8};}),seen=new Set(),data=[];
 if(p)for(const f of [...p.features].sort((a,b)=>(b._area??=d3.geoArea(b))-(a._area??=d3.geoArea(a)))){
  if(data.length>=65||seen.has(f.properties.sovereign)||(f._area??=d3.geoArea(f))*k*k*(state.projection==='globe'?globeScale*globeScale:1)<.0008)continue;
  const coords=f._center??=d3.geoCentroid(f);if(!visiblePoint(coords))continue;
  const point=projection(coords),half=Math.min(105,f.properties.sovereign.length*2.6),x=point[0]*k,y=point[1]*k;
  if(occupied.some(r=>Math.abs(x-r.x)<half+r.half+5&&Math.abs(y-r.y)<16))continue;
  occupied.push({x,y,half});seen.add(f.properties.sovereign);data.push({f,point});
 }
 historicLabels.selectAll('text').data(data,d=>d.f.id).join('text').attr('class','historical-label').attr('transform',d=>`translate(${d.point}) scale(${1/k})`).text(d=>d.f.properties.sovereign);
}
function showHistory(feature){
 const p=activeHistoricalMap();if(!p)return;
 const source=historical.source,props=feature?.properties;
 $('historyContent').innerHTML=`<span class="eyebrow">HISTORICAL MAP CONTEXT</span><h2>${esc(props?.name||p.label)}</h2><p><strong>${esc(C.year(p.year))}</strong> · ${esc(p.label)}</p><label class="field">Inspect a historical region<select id="historicalRegion"><option value="">Map overview</option>${[...p.features,...(p.centers||[])].sort((a,b)=>a.properties.name.localeCompare(b.properties.name)).map(f=>`<option value="${esc(f.id)}" ${f.id===feature?.id?'selected':''}>${esc(f.properties.name)}</option>`).join('')}</select></label>${props?`<dl class="detail-data"><div><dt>Source political grouping</dt><dd>${esc(props.sovereign)}</dd></div><div><dt>Source cultural grouping</dt><dd>${esc(props.culture)}</dd></div><div><dt>Boundary precision</dt><dd>${({0:'Location marker only; territorial borders are not drawn',1:'Approximate reconstruction',2:'Moderate precision in source',3:'Source marks a legally defined boundary'})[props.precision]||'Not specified'}; precision varies within a snapshot.</dd></div></dl>`:''}${p.review?`<p class="detail-note">${esc(p.review)}</p>`:''}<p>These generalized reconstructions include both states and cultural regions. Frontiers could be fluid, overlapping or disputed. Hatching indicates gaps in historical coverage, not an absence of people. Diamond markers show documented centers; their territorial boundaries are not reconstructed. Regional labels do not establish a single unified government.</p><p><strong>Book counts use modern regions.</strong> They follow the selected author-origin or broader-association mode, not historical citizenship or empire membership. Click a numbered marker or use the country selector to browse books.</p><p>Book period: ${esc(C.year(state.from))}–${esc(C.year(state.to))}. Selecting a map includes works up to that snapshot year. Uncertain composition ranges match on overlap.</p>${props?.note?`<p class="detail-note">${esc(props.note)} ${props.source?`<a href="${esc(props.source)}" target="_blank" rel="noopener">Historical reference ↗</a>`:''}</p>`:''}<button id="booksNearMapDate" class="primary">Show books through this date</button><p class="map-source">Maps by Alexandre Ourednik and contributors · GPL-3.0<br><a href="${esc(source.repository)}/blob/${esc(source.revision)}/geojson/${esc(p.file)}" target="_blank" rel="noopener">View this snapshot’s source ↗</a> · <a href="https://github.com/rems3n/classics-atlas/archive/refs/heads/main.zip">Source & license archive</a><br>These community-maintained maps contain uncertainty and may contain errors; they are a browsing aid.</p>`;
 $('historicalRegion').onchange=e=>showHistory([...p.features,...(p.centers||[])].find(f=>f.id===e.target.value));
 $('booksNearMapDate').onclick=()=>{$('historyDialog').close();change(C.mapSelection(p.id));showResults();};
 if(!$('historyDialog').open)$('historyDialog').showModal();
}

const svg=d3.select('#map');
const gapPattern=svg.append('defs').append('pattern').attr('id','coverageGap').attr('patternUnits','userSpaceOnUse').attr('width',7).attr('height',7);
gapPattern.append('rect').attr('width',7).attr('height',7).attr('fill','var(--land)');gapPattern.append('path').attr('d','M0 7L7 0').attr('stroke','var(--muted)').attr('stroke-opacity',.19).attr('stroke-width',.7);
let mapGroup=svg.append('g'),grid=mapGroup.append('path').attr('class','graticule'),land=mapGroup.append('g'),historicLand=mapGroup.append('g').attr('class','historical-land'),historicLabels=mapGroup.append('g').attr('class','historical-labels'),historicPoints=mapGroup.append('g').attr('class','historical-points'),culture=mapGroup.append('g'),labels=mapGroup.append('g'),marks=mapGroup.append('g');
const countryPaths=land.selectAll('path').data(world.features).join('path').attr('class','country').attr('data-country',d=>d.id).on('click',(e,f)=>{if(e.defaultPrevented||state.mapPeriod!=='modern')return;change({country:f.id,view:'map'});showResults();}).on('mousemove',(e,f)=>{const count=countryCounts[f.id]?.length||0;$('tooltip').innerHTML=`<strong>${esc(f.properties.name)}</strong><span>${count} matching works with location data</span>`;$('tooltip').hidden=false;$('tooltip').style.left=Math.min(e.clientX+14,window.innerWidth-230)+'px';$('tooltip').style.top=Math.max(10,e.clientY-55)+'px';}).on('mouseleave',()=>$('tooltip').hidden=true);
const zoom=d3.zoom().scaleExtent([.8,12]).filter(e=>state.projection==='map'&&(!e.ctrlKey||e.type==='wheel')&&!e.button).on('zoom',e=>{mapTransform=e.transform;mapGroup.attr('transform',mapTransform);positionMarkers();});svg.call(zoom).on('dblclick.zoom',null);
// Trackpads send pinch as ctrl+wheel; touchscreens use two pointer contacts.
const globePointers=new Map();let globeGesture=null,suppressGlobeClickUntil=0;
function captureGlobePointer(id){try{svg.node().setPointerCapture?.(id);}catch{}}
function rebaseGlobeGesture(){
 const points=[...globePointers.values()];
 globeGesture=points.length?{anchor:points[0],rotation:[...rotation],scale:globeScale,distance:points.length>1?Math.hypot(points[1].x-points[0].x,points[1].y-points[0].y):0}:null;
}
function clearGlobeGesture(){
 const ids=[...globePointers.keys()];globePointers.clear();globeGesture=null;suppressGlobeClickUntil=0;
 for(const id of ids)if(svg.node().hasPointerCapture?.(id))svg.node().releasePointerCapture(id);
}
function endGlobePointer(e){
 if(!globePointers.delete(e.pointerId))return;
 if(!globePointers.size&&suppressGlobeClickUntil===Infinity)suppressGlobeClickUntil=performance.now()+350;
 rebaseGlobeGesture();
 if(svg.node().hasPointerCapture?.(e.pointerId))svg.node().releasePointerCapture(e.pointerId);
}
svg.on('pointerdown.globe',e=>{
 if(state.projection!=='globe'||e.button!==0)return;
 if(!globePointers.size)suppressGlobeClickUntil=0;
 globePointers.set(e.pointerId,{x:e.clientX,y:e.clientY});rebaseGlobeGesture();
 if(globePointers.size>1){e.preventDefault();suppressGlobeClickUntil=Infinity;for(const id of globePointers.keys())captureGlobePointer(id);}
}).on('pointermove.globe',e=>{
 if(state.projection!=='globe'||!globePointers.has(e.pointerId)||!globeGesture)return;
 const point={x:e.clientX,y:e.clientY};globePointers.set(e.pointerId,point);
 if(globePointers.size>1){
  e.preventDefault();const [a,b]=globePointers.values(),distance=Math.hypot(b.x-a.x,b.y-a.y);
  if(globeGesture.distance<1){rebaseGlobeGesture();return;}
  setGlobeScale(globeGesture.scale*distance/globeGesture.distance);
 }else{
  const dx=point.x-globeGesture.anchor.x,dy=point.y-globeGesture.anchor.y;
  if(Math.hypot(dx,dy)<4)return;
  captureGlobePointer(e.pointerId);suppressGlobeClickUntil=Infinity;e.preventDefault();
  rotation=[globeGesture.rotation[0]+dx*.25,Math.max(-85,Math.min(85,globeGesture.rotation[1]-dy*.25)),0];projection.rotate(rotation);paintGeometry();
 }
}).on('pointerup.globe pointercancel.globe lostpointercapture.globe',e=>{
 endGlobePointer(e);if(!globePointers.size&&suppressGlobeClickUntil===Infinity)suppressGlobeClickUntil=performance.now()+350;
}).on('pointerleave.globe',e=>{if(!svg.node().hasPointerCapture?.(e.pointerId))endGlobePointer(e);})
.on('click.globe',e=>{if(e.detail&&performance.now()<suppressGlobeClickUntil){e.preventDefault();e.stopImmediatePropagation();}},{capture:true})
.on('wheel.globe',e=>{
 if(state.projection!=='globe')return;
 e.preventDefault();const delta=-e.deltaY*(e.deltaMode===1?.05:e.deltaMode===2?1:.002)*(e.ctrlKey?10:1);
 setGlobeScale(globeScale*Math.pow(2,Math.max(-2,Math.min(2,delta))));
 if(globePointers.size)rebaseGlobeGesture();
},{passive:false});
window.addEventListener('blur',clearGlobeGesture);
function setGlobeScale(value){
 const next=Math.max(.6,Math.min(3,value));if(!Number.isFinite(next)||next===globeScale)return;
 globeScale=next;if(projection&&state.projection==='globe'){projection.scale(Math.min(width*.44,height*.44)*globeScale);paintGeometry();}
}

function resize(){const w=$('mapCanvas').clientWidth,h=$('mapCanvas').clientHeight;if(!w||!h)return;width=w;height=h;svg.attr('viewBox',`0 0 ${width} ${height}`);renderMap();}
function colorFor(list){if(!list?.length)return 'var(--land)';if(state.color==='count'){const max=Math.max(1,...Object.values(countryCounts).map(a=>a.length));return d3.interpolateRgb(document.documentElement.dataset.theme==='dark'?'#345460':'#bdd9d2',document.documentElement.dataset.theme==='dark'?'#55aeaa':'#488f8a')(.18+.82*Math.sqrt(list.length/max));}if(state.color==='category'){const c=d3.rollups(list,b=>b.length,b=>b.categories[0]||'Unknown').sort((a,b)=>b[1]-a[1])[0][0];return C.colors[C.categories.indexOf(c)]||'#76999c';}if(state.color==='era'){const y=Math.min(...list.map(b=>b.start??3000));return y<500?'#468f95':y<1500?'#8f89b9':y<1800?'#9f789d':'#688ab2';}const l=d3.rollups(list,b=>b.length,b=>b.language).sort((a,b)=>b[1]-a[1])[0][0];return C.colors[languages.indexOf(l)%10];}
function renderMap(){if(state.projection!=='globe')clearGlobeGesture();if(!width)return;
 if(state.projection==='globe'){projection=d3.geoOrthographic().rotate(rotation).scale(Math.min(width*.44,height*.44)*globeScale).translate([width*.5,height*.48]);mapGroup.attr('transform',null);}else{projection=d3.geoEqualEarth().fitExtent([[20,18],[Math.max(40,width-20),Math.max(50,height-60)]],{type:'Sphere'});mapGroup.attr('transform',mapTransform);}
 path=d3.geoPath(projection);countryPaths.attr('fill',f=>state.mapPeriod==='modern'?colorFor(countryCounts[f.id]):'url(#coverageGap)').classed('selected',f=>state.mapPeriod==='modern'&&f.id===state.country).style('stroke',state.mapPeriod==='modern'?null:'none').style('pointer-events',state.mapPeriod==='modern'?null:'none');
 countryPaths.attr('visibility',f=>state.mapPeriod==='modern'&&state.hideEmpty&&!(countryCounts[f.id]?.length)?'hidden':'visible');
 paintGeometry();}
function paintGeometry(){countryPaths.attr('d',path);grid.attr('d',path(d3.geoGraticule10()));
 renderHistoricalGeometry();
 const greek=state.mapPeriod==='modern'&&state.overlay&&state.tradition==='Ancient Greek';culture.selectAll('*').remove();if(greek){const shape=d3.geoCircle().center([25.5,38]).radius(5)();culture.append('path').attr('class','culture-shape').attr('d',path(shape));const p=projection([25.5,32]);culture.append('text').attr('class','culture-label').attr('x',p[0]).attr('y',p[1]).text('Aegean cultural lens · schematic');}
 positionMarkers();}
function visiblePoint(coords){return state.projection!=='globe'||d3.geoDistance(coords,[-rotation[0],-rotation[1]])<Math.PI/2;}
function positionMarkers(){if(!projection)return;const k=state.projection==='map'?mapTransform.k:1;
 positionHistoricalLabels();
 const features=state.bookPins?mapPlaces.filter(f=>countryCounts[f.id]?.length&&visiblePoint(f.properties.label)).sort((a,b)=>countryCounts[b.id].length-countryCounts[a.id].length):[];
 const clusters=[];
 for(const f of features){const point=projection(f.properties.label);const nearby=clusters.find(c=>Math.hypot((c.point[0]-point[0])*k,(c.point[1]-point[1])*k)<34);if(nearby)nearby.features.push(f);else clusters.push({id:f.id,point,features:[f]});}
 for(const c of clusters)c.count=new Set(c.features.flatMap(f=>countryCounts[f.id].map(b=>b.id))).size;
 function activate(e,c){e.stopPropagation();$('tooltip').hidden=true;if(c.features.length===1){change({country:c.features[0].id,view:'map'});showResults();}else if(state.projection==='globe'){const coords=c.features[0].properties.label;rotation=[-coords[0],-coords[1],0];globeScale=Math.min(3,globeScale*1.7);renderMap();}else svg.transition().duration(250).call(zoom.scaleBy,1.8,mapTransform.apply(c.point));}
 marks.selectAll('g').data(clusters,c=>c.id).join(enter=>{const g=enter.append('g').attr('role','button').attr('tabindex',0);g.append('circle');g.append('text');return g;}).attr('class',c=>'marker'+(c.features.length>1?' cluster-marker':'')).attr('transform',c=>`translate(${c.point}) scale(${1/k})`).attr('aria-label',c=>(c.features.length>1?c.features.length+' nearby places; zoom to separate':c.features[0].properties.name)+': '+c.count+' unique works').on('click',activate).on('keydown',(e,c)=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();activate(e,c);}}).on('mousemove',(e,c)=>{$('tooltip').innerHTML=`<strong>${c.features.map(f=>esc(f.properties.name)).join(' · ')}</strong><span>${c.count} unique matching works${c.features.length>1?' · Click to zoom':''}</span>`;$('tooltip').hidden=false;$('tooltip').style.left=Math.max(8,Math.min(e.clientX+12,innerWidth-245))+'px';$('tooltip').style.top=Math.max(8,e.clientY-65)+'px';}).on('mouseleave',()=>$('tooltip').hidden=true).each(function(c){d3.select(this).select('circle').attr('r',c.features.length>1?15:12);d3.select(this).select('text').text(c.count);});
 // Keep dense labels out of the way at overview scale; details remain on hover.
 const labelScale=state.projection==='globe'?globeScale:k;
 const candidates=state.mapPeriod==='modern'?mapPlaces.filter(f=>visiblePoint(f.properties.label)&&(!state.hideEmpty||countryCounts[f.id]?.length)&&(f.id===state.country||(labelScale>1.8&&countryCounts[f.id]?.length)||['CAN','BRA','AUS','CHN','IND','RUS','ZAF','EGY'].includes(f.id))):[];
 candidates.sort((a,b)=>(b.id===state.country)-(a.id===state.country));
 const occupied=[],labelFeatures=candidates.filter(f=>{const p=projection(f.properties.label),x=p[0]*k,y=p[1]*k+28,half=Math.min(100,f.properties.name.length*3.2);if(occupied.some(r=>Math.abs(x-r.x)<half+r.half+8&&Math.abs(y-r.y)<18))return false;occupied.push({x,y,half});return true;});
 labels.selectAll('text').data(labelFeatures,f=>f.id).join('text').attr('class','country-label').attr('transform',f=>`translate(${projection(f.properties.label)}) scale(${1/k})`).attr('text-anchor','middle').attr('dy',f=>countryCounts[f.id]?.length?28:0).text(f=>f.properties.name.toUpperCase());}
function renderLegend(){if(state.mapPeriod!=='modern'){const p=historical.presets.find(p=>p.id===state.mapPeriod);$('legend').innerHTML=`<button id="historyNotes" class="history-notes" aria-label="Historical map notes"><strong>${esc(C.year(p.year))} · historic borders ⓘ</strong><span>Hatching: coverage gap · ◆ historical center</span><span>${state.bookPins?'Counts: modern book regions':'Book markers hidden'}</span></button>`;$('historyNotes').onclick=()=>showHistory();return;}let html='<div class="legend-title">'+({count:'MATCHING WORKS',category:'LEADING CATEGORY',era:'EARLIEST WORK',language:'LEADING LANGUAGE'}[state.color])+'</div><div class="legend-row">';if(state.color==='count')html+='<span>1</span><span class="legend-gradient"></span><span>'+Math.max(1,...Object.values(countryCounts).map(a=>a.length))+'</span>';else if(state.color==='category')html+=C.categories.filter(c=>mapBooks.some(b=>b.categories.includes(c))).map(c=>`<button data-legend-cat="${esc(c)}"><i class="swatch" style="background:${C.colors[C.categories.indexOf(c)]}"></i>${esc(c)}</button>`).join('');else if(state.color==='era')html+=[['Ancient','#468f95'],['Medieval','#8f89b9'],['Early modern','#9f789d'],['Modern','#688ab2']].map(([s,c])=>`<span class="swatch" style="background:${c}"></span><span>${s}</span>`).join('');else html+=languages.filter(l=>mapBooks.some(b=>b.language===l)).map(l=>`<span class="swatch" style="background:${C.colors[languages.indexOf(l)%10]}"></span><span>${esc(l)}</span>`).join('');$('legend').innerHTML=html+'</div>';}
function syncPanels(){
 const contentView=state.view==='books'||state.view==='shelf';
 const visible=resultsOpen||contentView;
 document.body.classList.toggle('results-closed',!visible);
 document.body.classList.toggle('collection-expanded',visible&&collectionExpanded&&!contentView&&state.view==='map');
 $('expandCollection').hidden=contentView||state.view==='timeline';
 $('expandCollection').textContent=collectionExpanded?'Collapse collection':'Expand collection';
 $('expandCollection').setAttribute('aria-expanded',String(collectionExpanded));
 document.body.classList.toggle('filters-open',filtersOpen);
 $('results').hidden=!visible;$('openResults').hidden=visible;$('filters').hidden=!filtersOpen;
 $('mobileFilters').setAttribute('aria-expanded',String(filtersOpen));
 $('filters').classList.toggle('mobile-open',filtersOpen&&innerWidth<=700);
}
function showResults(){resultsOpen=true;syncPanels();resize();}
function setFilters(open){filtersOpen=open;syncPanels();resize();}
function dateHistory(b){
 if(!b.textDate)return '';
 const layers=b.dateLayers||[];
 return `<section class="date-history"><h3>Story origins and later versions</h3><p><strong>${esc(b.textDate.label)}</strong><br>${esc(C.date(b.textDate))} <span class="muted">· reference only; the timeline uses the main date above</span></p>${layers.length?`<h4>Stories and source traditions</h4><p class="muted">A partial breakdown of the volume’s different layers. These are estimates or early attestations, not proven first tellings. The map counts the whole volume once.</p><ul class="origin-layers">${layers.map(x=>`<li><strong>${esc(x.title)}</strong><div>${x.start==null?'Origin not securely dated':esc(C.date({...x,dateConfidence:'estimated'}))}</div><p>${esc(x.note)}</p><div class="button-row">${x.start!=null?`<button data-origin-from="${x.start}" data-origin-to="${x.end}">Explore this period</button>`:''}${x.sources.map(url=>`<a href="${esc(url)}" target="_blank" rel="noopener">Source ↗</a>`).join('')}</div></li>`).join('')}</ul>`:''}</section>`;
}
function showDetail(id){const b=byId.get(id);if(!b)return;const same=detailId===id&&$('detailDialog').open,scroll=$('detailDialog').scrollTop,opened=same?[...$('detailContent').querySelectorAll('details[open]')].map(x=>x.dataset.notes):[];detailId=id;const ed=b.edition;
 const places=b.countries.map(c=>esc(names.get(c)||c)).join(' · ');
 const fact=(label,value)=>`<div><dt>${esc(label)}</dt><dd>${value}</dd></div>`;
 $('detailContent').innerHTML=`<header class="detail-head">${cover(b)}<div><span class="eyebrow">BOOK NOTES</span><h2 id="bookNotesTitle">${esc(b.title)}</h2><p class="detail-author">${esc(b.author)}</p><div class="detail-tags">${b.categories.map(c=>`<span class="tag">${esc(c)}</span>`).join('')}</div></div></header>
 <section class="notes-section notes-overview" aria-labelledby="overviewHeading"><h3 id="overviewHeading">At a glance</h3><p>${esc(b.overview||'A description is not yet available for this work.')}</p><dl class="notes-facts">${fact(b.dateKind||'Original publication / composition',esc(C.date(b)))}${fact('Origin / source region',places)}${b.language?fact('Original language',esc(b.language)):''}${b.tradition?fact('Literary tradition',esc(b.tradition)):''}</dl></section>
 <section class="reading-controls" aria-label="Your reading"><label>Your shelf${shelfSelect(b)}</label><div><span>Your rating</span>${stars(b)}</div></section>
 <section class="notes-section"><h3>When it began</h3><p>${esc(b.dateNote||'The timeline uses the original publication or composition date shown above.')}</p>${dateHistory(b)}</section>
 <section class="notes-section"><h3>Its place on the map</h3><p>${esc(b.locationNote||b.location||'Geographic context is not yet available.')}</p><p class="notes-caption">Mapping basis: ${esc(b.locationBasis||'Geographic fallback')}</p><details class="notes-disclosure" data-notes="associations"><summary>Broader life & work associations</summary><p>${(b.associationCountries||b.countries).map(c=>esc(names.get(c)||c)).join(' · ')}</p><p>${esc(b.associationNote||'Includes later residences and literary associations; not all are birthplaces.')}</p></details></section>
 <section class="notes-section"><h3>About this edition</h3>${b.cover?`<p><a href="${esc(b.coverSource)}" target="_blank" rel="noopener">${esc(b.coverLabel)} · ${esc(b.coverProvider||'Open Library')} ↗</a></p>`:'<p>A verified cover is not available yet. The image is a title-art placeholder.</p>'}<dl class="notes-facts">${ed?.publisher?.length?fact('Publisher',esc(ed.publisher.join(', '))):''}${ed?.publish_date?.length?fact('Edition published',esc(ed.publish_date.join(', '))):''}${fact('Length',b.pages?esc(b.pages)+' pages':'Not yet verified for this edition')}${ed?.isbn?.length?fact('ISBN',esc(ed.isbn[0])):''}</dl>${b.cover?`<p class="notes-caption">${b.coverProvider==='Publisher'?'Cover linked from the publisher’s product page.':'Title and author matched in Open Library. Alternate editions are labeled; publisher family does not guarantee the Classics imprint.'} Artwork may differ between printings.</p>`:''}<details class="notes-disclosure" data-notes="catalog"><summary>Collections & catalog entries</summary><dl class="notes-facts">${fact('Collections',(b.collections||[]).map(esc).join(' · '))}${b.aliases?.length?fact('Also known as',b.aliases.map(esc).join(' · ')):''}</dl><ul>${(b.editions||[]).map(x=>`<li>${esc(x)}</li>`).join('')}</ul></details></section>
 <details class="notes-disclosure source-notes" data-notes="sources"><summary>Sources & uncertainty</summary><p>Automated imports and editorial annotations may need review. Geographic fallbacks and approximate dates are described above. ${esc(b.overviewNote||'')}</p><ul class="provenance-list">${(b.provenance||[]).map(p=>`<li><h4>${esc(p.fields)}</h4><p>${esc(p.method)}</p><a href="${esc(p.source)}" target="_blank" rel="noopener">View source ↗</a></li>`).join('')}</ul></details>
 <footer class="notes-links"><a href="${esc(b.source)}" target="_blank" rel="noopener">Work reference ↗</a><a href="https://www.goodreads.com/search?q=${encodeURIComponent(b.title+' '+b.author)}" target="_blank" rel="noopener">Find on Goodreads ↗</a><a href="https://www.penguin.co.uk/search-results?q=${encodeURIComponent(b.title)}" target="_blank" rel="noopener">Find a Penguin edition ↗</a></footer><p class="notes-caption">Goodreads ratings are not connected. Your own rating is saved on this device.</p>`;
 document.dispatchEvent(new CustomEvent('atlas:detail',{detail:{book:b}}));
 $('detailDialog').setAttribute('aria-labelledby','bookNotesTitle');
 for(const el of $('detailContent').querySelectorAll('details'))el.open=opened.includes(el.dataset.notes);
 if(!$('detailDialog').open)$('detailDialog').showModal();$('detailDialog').scrollTop=same?scroll:0;
}
function saveShelf(){document.dispatchEvent(new CustomEvent('atlas:shelf'));storageSet('classics-atlas-shelf-v1',shelf);const scroll=$('bookList').scrollTop;render();$('bookList').scrollTop=scroll;if($('detailDialog').open)showDetail(detailId);}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;
 if(b.dataset.originFrom!==undefined){$('detailDialog').close();change({from:+b.dataset.originFrom,to:+b.dataset.originTo,before:false,after:false,includeUnknown:false});return;}
 if(b.dataset.detail){showDetail(b.dataset.detail);return;}
 if(b.dataset.rate){const id=b.dataset.rate,n=+b.dataset.rating;shelf[id]??={status:'want',rating:0};shelf[id].rating=shelf[id].rating===n?0:n;saveShelf();return;}
 if(b.dataset.close){$(b.dataset.close).close();return;}
 if(b.dataset.view){change({view:b.dataset.view});showResults();return;}
 if(b.dataset.type){change({type:b.dataset.type});return;}
 if(b.dataset.era){change(C.eraSelection(b.dataset.era));return;}
 if(b.dataset.shelf){change({shelf:b.dataset.shelf});return;}
 if(b.dataset.legendCat){change({categories:[b.dataset.legendCat]});return;}
 if(b.dataset.chip){const key=b.dataset.chip;change(key==='scope'?{workIds:[],scopeLabel:''}:key==='readFilter'?{readFilter:'all'}:key==='category'?{categories:state.categories.filter(c=>c!==b.dataset.value)}:key==='date'?{from:-2500,to:2050,before:false,after:false}:key==='collection'||key==='tradition'||key==='language'||key==='type'?{[key]:'All'}:{[key]:''});return;}
 if(b.dataset.action==='reset'){resetAtlas();return;}
 if(b.id==='loadMore'){const top=$('bookList').scrollTop;limit+=30;renderBooks();$('bookList').scrollTop=top;}
});
document.addEventListener('change',e=>{if(e.target.dataset.status){const id=e.target.dataset.status,v=e.target.value;if(v)shelf[id]={...shelf[id],status:v,rating:shelf[id]?.rating||0};else delete shelf[id];saveShelf();}});
$('categoryChoices').addEventListener('change',()=>change({categories:[...document.querySelectorAll('#categoryChoices input:checked')].map(e=>e.value)}));
for(const [id,key]of [['mapPeriod','mapPeriod'],['geographySelect','geography'],['collectionSelect','collection'],['traditionSelect','tradition'],['languageSelect','language'],['countrySelect','country'],['colorSelect','color'],['sortSelect','sort']])$(id).addEventListener('change',e=>change({[key]:e.target.value}));
for(const [id,key]of [['bookPinsToggle','bookPins'],['overlayToggle','overlay'],['unknownToggle','includeUnknown'],['emptyToggle','hideEmpty']])$(id).addEventListener('change',e=>change({[key]:e.target.checked}));
for(const [id,key]of [['fromRange','from'],['fromNumber','from'],['toRange','to'],['toNumber','to']])$(id).addEventListener(id.includes('Range')?'input':'change',e=>{let v=Math.round(+e.target.value/50)*50;v=Math.max(-2500,Math.min(2050,v));if(key==='from')v=Math.min(v,state.to);else v=Math.max(v,state.from);change({[key]:v,before:false,after:false,includeUnknown:false},{keepScroll:true});});
$('resetBtn').onclick=resetAtlas;$('clearCategories').onclick=()=>change({categories:[]});$('clearPlace').onclick=()=>change({country:''});
$('collapseFilters').onclick=()=>setFilters(false);$('mobileFilters').onclick=()=>setFilters(!filtersOpen);
$('expandCollection').onclick=()=>{collectionExpanded=!collectionExpanded;syncPanels();resize();};
$('closeResults').onclick=()=>{resultsOpen=false;if(state.view==='books'||state.view==='shelf')change({view:'map'});else{syncPanels();resize();}};$('openResults').onclick=showResults;
$('shelfBtn').onclick=()=>{change({...C.defaults(),view:'shelf'});showResults();};$('themeBtn').onclick=()=>{const t=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=t;storageSet('classics-atlas-theme',t);render();};
$('flatBtn').onclick=()=>change({projection:'map'});$('globeBtn').onclick=()=>change({projection:'globe'});
function zoomBy(k){if(state.projection==='globe'){setGlobeScale(globeScale*k);}else svg.transition().duration(220).call(zoom.scaleBy,k);}
$('zoomIn').onclick=()=>zoomBy(1.4);$('zoomOut').onclick=()=>zoomBy(1/1.4);$('homeMap').onclick=()=>{clearGlobeGesture();rotation=[-10,-20,0];globeScale=1;svg.call(zoom.transform,d3.zoomIdentity);renderMap();};
$('timeExpand').onclick=()=>$('timeDialog').close();$('editTime').onclick=()=>$('timeDialog').showModal();document.querySelector('[data-edit-time]').onclick=()=>$('timeDialog').showModal();
$('focusAfrica').onclick=()=>{if(state.projection==='globe'){rotation=[-20,-3,0];globeScale=2;renderMap();}else{const xy=projection([20,3]),k=2.7;svg.call(zoom.transform,d3.zoomIdentity.translate(width/2-xy[0]*k,height/2-xy[1]*k).scale(k));}};
$('searchForm').onsubmit=e=>{e.preventDefault();const prompt=$('searchInput').value.trim();if(!prompt)return;const result=C.parse(prompt,state);if(result.ok){previous=structuredClone(state);state={...result.state,mapPeriod:C.mapForRange(result.state.to)};limit=30;render();showResults();}$('replyText').textContent=result.message;$('searchReply').hidden=false;$('undoSearch').disabled=!previous;};
$('undoSearch').onclick=()=>{if(previous){state=previous;previous=null;render();$('replyText').textContent='Previous filters restored.';$('undoSearch').disabled=true;}};$('dismissReply').onclick=()=>$('searchReply').hidden=true;
function about(){$('aboutStats').innerHTML=`<div><strong>${books.length.toLocaleString()}</strong><span>catalog works</span></div><div><strong>${books.filter(b=>b.start!=null).length}</strong><span>dated works</span></div><div><strong>${books.filter(b=>b.countries.length).length}</strong><span>mapped works</span></div><div><strong>${books.filter(b=>b.cover).length}</strong><span>cover matches</span></div>`;$('aboutDialog').showModal();}
for(const id of ['aboutBtn','coverageBtn','dataStatus'])$(id).onclick=about;
$('reduceGlass').onchange=e=>{document.body.classList.toggle('reduced-glass',e.target.checked);storageSet('classics-atlas-reduced-glass',e.target.checked);};
$('shareBtn').onclick=()=>{$('shareHelp').textContent=location.protocol==='file:'?'This portable file is not hosted. Copy this view code; another person with Classics Atlas can paste it here and choose Load this view. Once hosted, this becomes a shareable web link.':'Share this link to open the same filters and timeline. The recipient needs access to this website.';$('shareText').value=location.protocol==='file:'?C.encode(state):location.href.split('#')[0]+C.encode(state);$('shareDialog').showModal();};
$('copyShare').onclick=async()=>{try{await navigator.clipboard.writeText($('shareText').value);toast('Copied. Your reading data is not included.');}catch{$('shareText').select();toast('Select and copy the view code with your keyboard.');}};
$('loadShare').onclick=()=>{const raw=$('shareText').value,hash=raw.includes('#atlas=')?raw.slice(raw.indexOf('#atlas=')):raw;const parsed=C.decode(hash);if(parsed){state=parsed;render();showResults();$('shareDialog').close();toast('Shared view loaded.');}else toast('That is not a valid Classics Atlas view.');};
$('exportShelf').onclick=()=>{const blob=new Blob([JSON.stringify({app:'classics-atlas',version:1,exportedAt:new Date().toISOString(),shelf},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='classics-atlas-shelf.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast('Shelf backup exported.');};
$('importShelf').onclick=()=>$('importFile').click();$('importFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>2e6)throw Error();const raw=JSON.parse(await f.text());if(raw.app!=='classics-atlas'||raw.version!==1||!raw.shelf)throw Error();const incoming=cleanShelf(raw.shelf);shelf={...shelf,...incoming};saveShelf();toast('Imported '+Object.keys(incoming).length+' shelf entries.');}catch{toast('Invalid backup. Your existing shelf is unchanged.');}e.target.value='';};
document.querySelector('.brand').onclick=e=>{e.preventDefault();change(C.defaults());showResults();};
window.addEventListener('resize',()=>{syncPanels();resize();});window.addEventListener('keydown',e=>{if(e.key==='Escape'){$('searchReply').hidden=true;}});
if(typeof ResizeObserver!=='undefined')new ResizeObserver(resize).observe($('mapCanvas'));
resize();render();
// Read-only diagnostics for automated tests and future integrations.
window.ClassicsAtlas={change,showDetail,cover,toast,names,books,render,showResults,replaceShelf:(v)=>{shelf=cleanShelf(v);saveShelf();},getMapView:()=>({scale:globeScale,rotation:[...rotation]}),getState:()=>structuredClone(state),getResults:()=>filtered.map(b=>b.id),getShelf:()=>structuredClone(shelf),catalogSize:books.length};
})();
