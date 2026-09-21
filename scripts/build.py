"""Reproducible offline build; no package installation or network required."""
import csv, hashlib, html, json, re
from merge_metadata import merge
from compile_date_decisions import compile_dates
from historical_maps import historical_maps
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
def text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', '', s))).strip()
def norm(s):
    return re.sub(r'[^a-z0-9]', '', s.lower().replace('’', "'"))
def catalog():
    raw = (ROOT/'data/penguin-list.html').read_text()
    section = raw.split('id="By_title"',1)[1].split('id="External_links"',1)[0]
    records=[]; seen=set()
    for li in re.findall(r'<li\b[^>]*>(.*?)</li>', section, re.S):
        clean=text(li)
        if not clean or clean.startswith('edit'): continue
        parts=re.split(r'\s+by\s+', clean, maxsplit=1)
        title=parts[0].strip('" ')
        author=parts[1] if len(parts)>1 else 'Various / unverified'
        author=re.split(r',?\s+translated by\s+',author,maxsplit=1)[0]
        edition_title=title
        if title.startswith('The Epic of Gilgamesh,'):title='The Epic of Gilgamesh'
        if title.startswith('The Divine Comedy, Volume'):title='The Divine Comedy'
        key=norm(title+' '+author)
        if key in seen:
            next(r for r in records if norm(r['title']+' '+r['author'])==key)['editions'].append(clean)
            continue
        seen.add(key)
        first=re.search(r'href="(https://en.wikipedia.org/wiki/[^"#]+)"', li)
        url=html.unescape(first.group(1)) if first else 'https://en.wikipedia.org/wiki/List_of_Penguin_Classics'
        records.append(dict(id=hashlib.sha1(key.encode()).hexdigest()[:12],title=title,author=author,source=url,editions=[clean],start=None,end=None,countries=[],categories=[],type=None,language=None,tradition=None,location=None,overview=None,cover=None,pages=None,goodreads=None,verified=False))
    unmatched=[]
    for seed in csv.DictReader((ROOT/'data/enrichment.tsv').open(), delimiter='|'):
        aliases={'The Symposium':'Symposium','The Persian Expedition':'A Persian Expedition','The Meditations':'Meditations','On the Origin of Species':'The Origin of Species','The Communist Manifesto':'The Manifesto of the Communist Party'}
        seed['title']=aliases.get(seed['title'],seed['title'])
        matches=[r for r in records if norm(r['title'])==norm(seed['title'])]
        if seed['title']=='The Histories':matches=[r for r in matches if r['author']=='Herodotus']
        if not matches:
            matches=[r for r in records if norm(r['title']).startswith(norm(seed['title']))]
        if len(matches)!=1:
            unmatched.append([seed['title'],len(matches)]);continue
        r=matches[0]
        r.update(start=int(seed['start']),end=int(seed['end']),countries=seed['country'].split(','),categories=[seed['category']],type=seed['type'],language=seed['language'],tradition=seed['tradition'],location=seed['location'],overview=seed['overview'])
    print('Catalog:',len(records),'Enriched:',sum(r['start'] is not None for r in records),'Unmatched seeds:',unmatched)
    records=merge(records)
    records.sort(key=lambda r:(r['start'] is None,r['start'] or 0,r['title']))
    (ROOT/'data/catalog.json').write_text(json.dumps(records,ensure_ascii=False,indent=2))
    return records
def world():
    raw=json.loads((ROOT/'data/natural-earth.geojson').read_text())
    for f in raw['features']:
        p=f['properties'];f['id']=p.get('ADM0_A3');f['properties']={'name':p.get('NAME_EN',p['NAME']),'label':[p.get('LABEL_X',0),p.get('LABEL_Y',0)]}
        def rounded(v):
            return [rounded(x) for x in v] if isinstance(v,list) else round(v,3) if isinstance(v,float) else v
        f['geometry']['coordinates']=rounded(f['geometry']['coordinates'])
    return raw
def build():
    compile_dates()
    books=catalog();books+=json.loads((ROOT/'data/path-books.json').read_text()) if (ROOT/'data/path-books.json').exists() else [];geo=world();(ROOT/'data/catalog.json').write_text(json.dumps(books,ensure_ascii=False,indent=2))
    coverage_path=ROOT/'data/coverage.json'
    coverage=json.loads(coverage_path.read_text());coverage.update(total=len(books),dated=sum(b['start'] is not None for b in books),mapped=sum(bool(b['countries']) for b in books),classified=sum(bool(b['categories']) for b in books),languages=sum(bool(b.get('language')) for b in books),pathAdditions=13,estimatedDates=sum(b.get('dateConfidence')=='estimated' for b in books));coverage_path.write_text(json.dumps(coverage,indent=2))
    assert all(b['start'] is not None and b['end'] is not None for b in books), 'Undated catalog entry: add a documented date decision before publishing'
    template=(ROOT/'src/index.html').read_text()
    for name,path in [('STYLE','src/style.css'),('D3','vendor/d3.min.js'),('CORE','src/core.js'),('APP','src/app.js'),('READER','src/reader.js')]:
        content=(ROOT/path).read_text()
        if name=='STYLE':content+='\n'+(ROOT/'src/layout.css').read_text()+'\n'+(ROOT/'src/reader.css').read_text()
        template=template.replace('/*__'+name+'__*/',content)
    places=json.loads((ROOT/'data/map-places.json').read_text())
    map_ids={f['id'] for f in geo['features']}|{p['id'] for p in places}
    assert all(b['countries'] and set(b['countries'])<=map_ids for b in books), 'Every book must have a renderable map location'
    payload=json.dumps({'paths':json.loads((ROOT/'data/reading-paths.json').read_text()),'guidance':json.loads((ROOT/'data/reading-guidance.json').read_text()),'books':books,'world':geo,'places':places,'historical':historical_maps()},ensure_ascii=False,separators=(',',':')).replace('</','<\\/')
    template=template.replace('/*__DATA__*/','window.ATLAS_DATA='+payload+';')
    license_text=(ROOT/'vendor/LICENSE-D3.txt').read_text()
    historical_license=(ROOT/'data/historical/LICENSE').read_text()
    template=template.replace('</head>','<!-- Historical Basemaps data: Alexandre Ourednik and contributors; GPL-3.0. Modified by retaining display attributes and normalizing display coordinates to six decimal places. Source: https://github.com/aourednik/historical-basemaps ; full corresponding source: https://github.com/rems3n/classics-atlas/archive/refs/heads/main.zip\n'+historical_license+'\n-->\n</head>')
    template=template.replace('</head>','<!-- Bundled D3 license:\n'+license_text+'\n-->\n</head>')
    dest=ROOT/'dist';dest.mkdir(exist_ok=True)
    (dest/'classics-atlas.html').write_text(template)
    (ROOT/'index.html').write_text(template)
    print('Built',dest/'classics-atlas.html', len(template),'characters')
if __name__=='__main__':build()
