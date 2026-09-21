const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../src/core.js'),books=require('../data/catalog.json');
test('traditional tales filter by source origins rather than modern recording or adaptation',()=>{
 const manas=books.find(b=>b.id==='128c93724417'),africa=books.find(b=>b.id==='5739e0183ff5'),rama=books.find(b=>b.id==='5f3f78b22fef');
 assert(C.matches(manas,{...C.defaults(),from:1400,to:1500}));
 assert(!C.matches(manas,{...C.defaults(),from:1900,to:2000}));
 assert(C.matches(africa,{...C.defaults(),from:-2000,to:-1500}));
 assert(!C.matches(africa,{...C.defaults(),from:1900,to:2000}));
 assert(C.matches(rama,{...C.defaults(),from:-750,to:-500}));
 assert(!C.matches(rama,{...C.defaults(),from:1970,to:2000}));
 assert(C.matches(africa,{...C.defaults(),q:'Egyptian stories'}));
});
test('timeline brush selects forward/reverse spans and centered 200-year windows',()=>{
 assert.deepEqual(C.timelineSelection(50,500,true),{from:50,to:500});
 assert.deepEqual(C.timelineSelection(500,50,true),{from:50,to:500});
 assert.deepEqual(C.timelineSelection(1600,1600),{from:1500,to:1700});
 assert.deepEqual(C.timelineSelection(-400,-400),{from:-500,to:-300});
 assert.deepEqual(C.timelineSelection(-2500,-2500),{from:-2500,to:-2300});
 assert.deepEqual(C.timelineSelection(2050,2050),{from:1850,to:2050});
 assert.deepEqual(C.timelineSelection(-3000,3000,true),{from:-2500,to:2050});
 assert.deepEqual(C.timelineSelection(63,489,true),{from:50,to:500});
});
test('date display distinguishes estimates and likely dates without rounding originals',()=>{
 assert.equal(C.date({start:1911,end:1911,dateConfidence:'sourced'}),'1911 AD');
 assert.equal(C.date({start:-362,end:-350,dateConfidence:'estimated'}),'c. 362–350 BC');
 assert.match(C.date({start:1890,end:1890,dateConfidence:'probable'}),/^Likely /);
 assert.equal(books.filter(b=>b.start==null||b.end==null).length,0);
});
test('full catalog import and stable unique IDs',()=>{assert(books.length>1000);assert.equal(new Set(books.map(b=>b.id)).size,books.length);assert(books.every(b=>b.title&&b.author&&b.source));});
test('at most ten categories and all annotations are recognized',()=>{assert.equal(C.categories.length,10);assert(books.every(b=>b.categories.every(c=>C.categories.includes(c))));});
test('original example returns Iliad and Odyssey before fourth century BC',()=>{const r=C.parse('I want to read ancient Greek poetry published before the 4th century BC',C.defaults());assert(r.ok);assert.equal(r.state.to,-400);assert.equal(r.state.tradition,'Ancient Greek');const out=books.filter(b=>C.matches(b,r.state));assert(out.some(b=>b.title==='The Iliad'));assert(out.some(b=>b.title==='The Odyssey'));assert(out.every(b=>b.start<-400));});
test('BC century boundaries correctly differ before and after',()=>{assert.equal(C.parse('before the 4th century BC',C.defaults()).state.to,-400);assert.equal(C.parse('after the 4th century BC',C.defaults()).state.from,-301);assert.equal(C.parse('before the 19th century',C.defaults()).state.to,1801);assert.equal(C.parse('after the 19th century',C.defaults()).state.from,1900);});
test('date interval overlap includes uncertain ancient works',()=>{const b={start:-750,end:-650,countries:[],categories:[]};assert(C.matches(b,{...C.defaults(),from:-700,to:-600}));assert(!C.matches(b,{...C.defaults(),from:-600,to:-500}));});
test('strict before excludes exact boundary',()=>{const b={start:-400,end:-400,countries:[],categories:[]};assert(!C.matches(b,{...C.defaults(),to:-400,before:true}));assert(C.matches(b,{...C.defaults(),to:-400,before:false}));});
test('unknown dates remain optional, missing categories cannot silently match',()=>{const b={start:null,end:null,countries:[],categories:[]};assert(C.matches(b,C.defaults()));assert(!C.matches(b,{...C.defaults(),includeUnknown:false}));assert(!C.matches(b,{...C.defaults(),categories:['Poetry']}));});
test('country filters and cross-border counts use unique works per country',()=>{const b={id:'a',start:-700,end:-700,countries:['GRC','TUR','GRC'],categories:['Poetry']};assert(C.matches(b,{...C.defaults(),country:'TUR'}));assert(!C.matches(b,{...C.defaults(),country:'FRA'}));assert.equal(C.counts([b]).GRC.length,1);assert.equal(C.counts([b]).TUR.length,1);});
test('share state round-trip omits private and unexpected properties',()=>{const s={...C.defaults(),categories:['Poetry'],to:-400,q:'α & < >',secret:'private'};const decoded=C.decode(C.encode(s));assert.equal(decoded.q,s.q);assert.deepEqual(decoded.categories,['Poetry']);assert(!('secret' in decoded));assert.equal(C.decode('#bad'),null);});
test('malformed share values are normalized',()=>{const s=C.sanitize({categories:'oops',color:'bad',from:999999,to:-500,view:'<script>',includeUnknown:'false'});assert.deepEqual(s.categories,[]);assert.equal(s.color,'count');assert.equal(s.view,'map');assert(s.from<=s.to);assert.equal(s.includeUnknown,false);});
test('nonfiction query does not accidentally select fiction',()=>{const r=C.parse('French nonfiction',C.defaults());assert.equal(r.state.type,'Nonfiction');assert.equal(r.state.tradition,'French');assert.deepEqual(r.state.categories,[]);});
test('unsupported page/rating request leaves state unchanged',()=>{const s={...C.defaults(),tradition:'Japanese'};const r=C.parse('only shorter books under 200 pages',s);assert(!r.ok);assert.deepEqual(r.state,s);});
test('shelf filtering requires membership and selected status',()=>{const b=books[0],s={...C.defaults(),view:'shelf',shelf:'read'};assert(!C.matches(b,s,{}));assert(C.matches(b,s,{[b.id]:{status:'read'}}));assert(!C.matches(b,s,{[b.id]:{status:'want'}}));});
test('keyword fallback can find unannotated catalog records',()=>{const r=C.parse('The Great Gatsby',C.defaults());assert.equal(r.state.q,'The Great Gatsby');assert(r.state.includeUnknown);});
test('known translation groups count once',()=>{assert.equal(books.filter(b=>b.title==='The Epic of Gilgamesh').length,1);assert.equal(books.filter(b=>b.title==='The Divine Comedy').length,1);assert(books.find(b=>b.title==='The Divine Comedy').editions.length>=3);});

test('Chinese novels include all four classics across periods',()=>{
 const state=C.parse('Chinese novels',C.defaults()).state;
 const out=books.filter(b=>C.matches(b,state));
 for(const name of ['Romance of the Three Kingdoms','Journey to the West','Water Margin','Dream of the Red Chamber'])assert(out.some(b=>b.canonicalWork===name),name);
 const ancient=C.parse('ancient Chinese philosophy',C.defaults()).state;
 assert.equal(ancient.country,'CHN');assert.equal(ancient.to,500);
});
test('alternate titles and apostrophes resolve without creating duplicates',()=>{
 for(const q of ['Outlaws of the Marsh','Dream of the Red Chamber','The Story of the Stone',"Giovanni's Room",'100 Years of Solitude'])assert(books.some(b=>C.matches(b,{...C.defaults(),q})),q);
});
test('new collection filters round-trip and update geographic counts',()=>{
 const state={...C.defaults(),collection:'China’s Four Great Classics'};
 assert.equal(C.decode(C.encode(state)).collection,state.collection);
 const filtered=books.filter(b=>C.matches(b,state));
 assert.equal(new Set(filtered.map(b=>b.canonicalWork)).size,4);
 assert.equal(C.counts(filtered).CHN.length,8);
});
test('origin filters exclude Seneca exile but association mode retains it explicitly',()=>{
 const seneca=books.filter(b=>b.author==='Seneca');assert.equal(seneca.length,3);
 for(const b of seneca){assert.deepEqual(b.countries,['ESP']);assert(!C.matches(b,{...C.defaults(),country:'FRA'}));assert(C.matches(b,{...C.defaults(),country:'FRA',geography:'associations'}));}
 assert.equal(C.counts(seneca,C.defaults()).FRA,undefined);
 assert.equal(C.counts(seneca,{geography:'associations'}).FRA.length,3);
 assert.equal(books.find(b=>b.title==='Octavia').author,'Pseudo-Seneca (unknown author)');
});
test('historical context state is validated and shared independently of book dates',()=>{
 const s=C.sanitize({mapPeriod:'rome',geography:'associations',bookPins:false,from:1500,to:1700});
 assert.deepEqual(C.decode(C.encode(s)),s);assert.equal(s.from,1500);assert.equal(s.to,1700);
 assert.equal(C.sanitize({mapPeriod:'invented',geography:'bad'}).mapPeriod,'modern');
 assert.equal(C.sanitize({geography:'bad'}).geography,'origin');
});
test('origin review resolves residence-only and historical-empire mistakes',()=>{
 for(const [a,c]of [['Joris-Karl Huysmans','FRA'],['Fernando de Rojas','ESP'],['Albert Cohen','GRC'],['James Joyce','IRL'],['Ovid','ITA'],['Marcus Aurelius','ITA'],['Heraclitus','TUR'],['Benjamin Franklin','USA'],['Richard E. Kim','PRK'],['Zitkala-Ša','USA']]){
  const found=books.filter(b=>b.author===a);assert(found.length,a);for(const b of found)assert(b.countries.includes(c),a+' / '+b.title);
 }
});
test('embedded historical geometry preserves spherical winding after packaging',()=>{
 const fs=require('node:fs'),d3=require('../vendor/d3.min.js');
 const html=fs.readFileSync(require('node:path').join(__dirname,'../dist/classics-atlas.html'),'utf8');
 const payload=html.split('<script>window.ATLAS_DATA=')[1].split(';</script>')[0];
 const snapshots=JSON.parse(payload).historical.presets;
 for(const p of snapshots)for(const f of p.features){
  assert(d3.geoArea(f)<2*Math.PI,p.id+' / '+f.properties.name+' must not fill the globe');
  for(const rotate of [[-10,-20,0],[100,0,0],[-130,0,0]]){
   const path=d3.geoPath(d3.geoOrthographic().rotate(rotate).scale(250));
   assert(path.area(f)<Math.PI*250*250*.85,p.id+' / '+f.properties.name+' must not cover nearly an entire hemisphere');
  }
 }
});

test('maps filter through exact snapshot years and era ranges choose available borders',()=>{
 for(const [id,year]of Object.entries(C.mapYears)){const s={...C.defaults(),...C.mapSelection(id)};assert.equal(s.to,year);assert.equal(s.from,-2500);assert(books.filter(b=>C.matches(b,s)).every(b=>b.start<=year));}
 assert.equal(C.mapSelection('alexander').to,-323);assert.equal(C.eraSelection('ancient').mapPeriod,'late-antiquity');assert.equal(C.eraSelection('medieval').mapPeriod,'americas');assert.equal(C.eraSelection('modern').mapPeriod,'modern');
 assert.deepEqual(C.mapSelection('modern'),{mapPeriod:'modern',from:-2500,to:2050,before:false,after:false,includeUnknown:true});
});
