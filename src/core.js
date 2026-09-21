(function(root){
  'use strict';
  const categories=['Novels','Short stories','Poetry','Drama','Philosophy','History','Life writing','Religion & myth','Science & nature','Essays & criticism'];
  const colors=['#5486b8','#8476b8','#218b88','#ad709b','#647eb7','#6f9b82','#ad7a75','#8d7bb4','#528f9a','#738d68'];
  const defaults=()=>({workIds:[],scopeLabel:'',readFilter:'all',from:-2500,to:2050,categories:[],type:'All',tradition:'All',language:'All',collection:'All',country:'',q:'',includeUnknown:true,color:'count',view:'map',shelf:'all',projection:'map',mapPeriod:'modern',geography:'origin',bookPins:true,overlay:true,hideEmpty:false,sort:'relevance',before:false,after:false});
  const year=y=>y==null?'Unknown':y<0?Math.abs(y)+' BC':y===0?'BC / AD':y+' AD';
  const date=b=>b.start==null?'Date unknown':(b.dateConfidence==='estimated'?'c. ':b.dateConfidence==='probable'?'Likely ':'')+(b.start===b.end?year(b.start):(b.start<0&&b.end<0?Math.abs(b.start)+'–'+Math.abs(b.end)+' BC':year(b.start)+' – '+year(b.end)));
  const normal=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[’']/g,'').toLowerCase();
  const snapYear=y=>Math.max(-2500,Math.min(2050,Math.round(y/50)*50));
  function timelineSelection(anchor,endpoint,drag=false){
    const a=snapYear(anchor),b=snapYear(endpoint);
    if(drag)return {from:Math.min(a,b),to:Math.max(a,b)};
    // Keep the full 200-year window at either edge of the available timeline.
    const from=Math.max(-2500,Math.min(1850,a-100));
    return {from,to:from+200};
  }
  const mapYears={egypt:-1500,persia:-500,greece:-400,alexander:-323,republic:-100,rome:100,'late-antiquity':400,byzantium:600,tang:800,medieval:1300,americas:1492,ottoman:1600};
  const eras={all:[-2500,2050],ancient:[-2500,500],medieval:[500,1500],renaissance:[1400,1700],modern:[1700,2050]};
  function mapSelection(id){return id==='modern'?{mapPeriod:id,from:-2500,to:2050,before:false,after:false,includeUnknown:true}:{mapPeriod:id,from:-2500,to:mapYears[id],before:false,after:false,includeUnknown:false};}
  function mapForRange(to){if(to>1700||to<-1500)return 'modern';return Object.entries(mapYears).filter(([,y])=>y<=to).at(-1)?.[0]||'modern';}
  function eraSelection(id){const [from,to]=eras[id]||eras.all;return {from,to,mapPeriod:mapForRange(to),before:false,after:false,includeUnknown:id==='all'};}
  function sanitize(raw={}){
    const s=defaults();
    for(const key of Object.keys(s))if(raw[key]!==undefined)s[key]=raw[key];
    for(const k of ['from','to'])s[k]=Number.isFinite(+s[k])?Math.max(-2500,Math.min(2050,+s[k])):defaults()[k];
    if(s.from>s.to)[s.from,s.to]=[s.to,s.from];
    s.workIds=Array.isArray(s.workIds)?[...new Set(s.workIds.filter(x=>typeof x==='string'&&/^[a-zA-Z0-9-]{1,50}$/.test(x)))].slice(0,2000):[];s.scopeLabel=String(s.scopeLabel||'').slice(0,140);s.readFilter=['all','unread','read','favorites'].includes(s.readFilter)?s.readFilter:'all';
    s.categories=Array.isArray(s.categories)?s.categories.filter(x=>categories.includes(x)):[];
    for(const k of ['bookPins','includeUnknown','overlay','hideEmpty','before','after'])s[k]=s[k]===true;
    for(const k of ['q','country','tradition','language','collection'])s[k]=String(s[k]).slice(0,200);
    for(const [k,vals] of Object.entries({mapPeriod:['modern','egypt','persia','greece','alexander','republic','rome','late-antiquity','byzantium','tang','medieval','americas','ottoman'],geography:['origin','associations'],type:['All','Fiction','Nonfiction'],color:['count','category','era','language'],view:['map','timeline','books','shelf'],shelf:['all','want','reading','read'],projection:['map','globe'],sort:['relevance','oldest','newest','title','rating']}))if(!vals.includes(s[k]))s[k]=defaults()[k];
    return s;
  }
  function matches(b,s,shelves={},ignoreCountry=false){
    if(s.workIds?.length&&!s.workIds.includes(b.id))return false;
    if(s.readFilter==='unread'&&shelves[b.id]?.status==='read')return false;
    if(s.readFilter==='read'&&shelves[b.id]?.status!=='read')return false;
    if(s.view==='shelf'&&(!shelves[b.id]?.status||(s.shelf!=='all'&&shelves[b.id].status!==s.shelf)))return false;
    if(b.start==null){if(!s.includeUnknown)return false;}
    else if((s.after?b.end<=s.from:b.end<s.from)||(s.before?b.start>=s.to:b.start>s.to))return false;
    if(s.categories.length&&!s.categories.some(c=>b.categories.includes(c)))return false;
    if(s.type!=='All'&&b.type!==s.type)return false;
    if(s.tradition!=='All'&&b.tradition!==s.tradition)return false;
    if(s.language!=='All'&&b.language!==s.language)return false;
    if(s.collection&&s.collection!=='All'&&!(b.collections||[]).includes(s.collection))return false;
    if(!ignoreCountry&&s.country&&!countries(b,s).includes(s.country))return false;
    if(s.q){const hay=normal([b.title,b.author,b.overview,...b.categories,b.tradition,b.language,...(b.aliases||[]),...(b.collections||[]),...(b.dateLayers||[]).map(x=>x.title)].join(' '));if(!normal(s.q).split(/\s+/).every(t=>hay.includes(t)))return false;}
    return true;
  }
  function countries(b,s={}){return s.geography==='associations'?(b.associationCountries||b.countries):b.countries;}
  function counts(books,s={}){const out={};for(const b of books)for(const c of new Set(countries(b,s)))(out[c]??=[]).push(b);return out;}
  function encode(s){return '#atlas='+encodeURIComponent(JSON.stringify(sanitize(s)));}
  function decode(hash){try{return sanitize(JSON.parse(decodeURIComponent(hash.replace(/^#?atlas=/,''))));}catch{return null;}}
  function parse(prompt,current){
    const s=sanitize(current),q=normal(prompt).trim();let understood=[];
    if(/^(reset|clear|show (me )?all( books)?|all books)$/.test(q))return {state:defaults(),message:'All filters cleared.',ok:true};
    const aliases={Novels:/\b(novels?|fiction)\b/,'Short stories':/\b(short stor(y|ies))\b/,Poetry:/\b(poetry|poems?|epics?)\b/,Drama:/\b(drama|plays?|traged(y|ies))\b/,Philosophy:/\b(philosophy|philosophical|stoic|stoicism)\b/,History:/\b(history|histories|historical nonfiction)\b/,'Life writing':/\b(memoirs?|biograph(y|ies)|autobiograph(y|ies)|life writing)\b/,'Religion & myth':/\b(religion|religious|myth|mythology|sacred)\b/,'Science & nature':/\b(science|nature|scientific)\b/,'Essays & criticism':/\b(essays?|criticism)\b/};
    const found=Object.entries(aliases).filter(([k,re])=>re.test(q)&&!(k==='Novels'&&/\b(nonfiction|non-fiction|non fiction)\b/.test(q))).map(([k])=>k);
    if(found.length){s.categories=found;understood.push(found.join(', '));}
    if(/\b(nonfiction|non-fiction|non fiction)\b/.test(q)){s.type='Nonfiction';if(!found.length)s.categories=[];understood.push('Nonfiction');}
    else if(/\bfiction\b/.test(q)){s.type='Fiction';if(!/novel/.test(q))s.categories=[];understood.push('Fiction');}
    const traditions=[['Ancient Greek',/\b(greek|greece|hellenic)\b/],['Ancient Roman',/\b(roman|rome|latin)\b/],['Ancient Chinese',/\b(chinese|china)\b/],['Japanese',/\b(japan|japanese)\b/],['Russian',/\b(russia|russian)\b/],['French',/\b(france|french)\b/],['English',/\b(english|british|england)\b/],['American',/\b(american|america)\b/],['Italian',/\b(italian|italy)\b/],['Spanish',/\b(spanish|spain)\b/],['German',/\b(german|germany)\b/],['Indian',/\b(indian|india)\b/],['Irish',/\b(irish|ireland)\b/],['Mesopotamian',/\b(mesopotamia|mesopotamian)\b/]];
    const tr=traditions.find(([t,re])=>re.test(q));if(tr){if(tr[0]==='Ancient Chinese'){s.tradition='All';s.country='CHN';understood.push('China');}else{s.tradition=tr[0];s.country='';understood.push(tr[0]+' tradition');}}
    const boundary=q.match(/\b(before|after)\s+(?:the\s+)?(\d+)(st|nd|rd|th)?\s*(century)?\s*(bc|bce|ad|ce)?\b/);
    if(boundary){let [,op,n,,cent,era]=boundary;let y=+n;const bc=era==='bc'||era==='bce';if(cent)y=op==='before'?(bc?y*100:(y-1)*100+1):(bc?(y-1)*100+1:y*100);if(bc)y=-y;if(op==='before'){s.to=y;s.before=true;if(s.from>=y)s.from=-2500;}else{s.from=y;s.after=true;if(s.to<=y)s.to=2050;}s.includeUnknown=false;understood.push(op+' '+year(y));}
    else {const era=q.match(/\b(ancient|medieval|renaissance|modern)\b/);if(era&&(!tr||tr[0]==='Ancient Chinese')){const ranges=eras;[s.from,s.to]=ranges[era[1]];s.before=false;s.after=false;s.includeUnknown=false;understood.push(era[1]);}}
    if(/\b(unread|not read)\b/.test(q))return {state:current,message:'Use My shelf to browse reading status. This local search does not yet support unread exclusions.',ok:false};
    if(/\b(shorter|short books|pages|goodreads|best rated|similar to|recommend)\b/.test(q))return {state:current,message:'I cannot reliably apply that request yet. Page counts, Goodreads scores, and similarity recommendations are not connected in this v1. Your filters are unchanged.',ok:false};
    if(!understood.length){const clean=prompt.replace(/^(find|search for|show me|show|i want to read)\s+/i,'').trim();s.q=clean;s.country='';s.tradition='All';s.categories=[];s.type='All';s.from=-2500;s.to=2050;s.includeUnknown=true;s.before=false;s.after=false;return {state:s,message:'Searching titles, authors, and available descriptions for “'+clean+'”. This is local keyword search, not an AI recommendation.',ok:true};}
    s.q='';s.view='map';return {state:sanitize(s),message:'Applied: '+understood.join(' · ')+'. Dates use composition/publication ranges; uncertain ranges are included if they overlap.',ok:true};
  }
  const api={mapYears,eras,mapSelection,mapForRange,eraSelection,categories,colors,defaults,sanitize,year,date,normal,snapYear,timelineSelection,matches,countries,counts,encode,decode,parse};
  if(typeof module!=='undefined')module.exports=api;else root.AtlasCore=api;
})(typeof window!=='undefined'?window:globalThis);
