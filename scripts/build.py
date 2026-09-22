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

def home(books,geo,places,paths):
    """Static home page: counts, reading-path table and a dot map of book origins (equirectangular)."""
    import math
    esc=lambda v:html.escape(str(v),quote=True)
    W,H=720,360;px=lambda lon,lat:(round((lon+180)*W/360,1),round((90-lat)*H/180,1))
    land=[]
    for f in geo['features']:
        g=f['geometry'];polys=g['coordinates'] if g['type']=='MultiPolygon' else [g['coordinates']]
        for poly in polys:
            ring=poly[0]
            if len(ring)<8:continue
            pts=[];last=None
            for lon,lat in ring:
                p=(round((lon+180)*W/360),round((90-lat)*H/180))
                if p!=last:pts.append(p);last=p
            if len(pts)>=4:land.append('M'+'L'.join(f'{x} {y}' for x,y in pts)+'Z')
    anchor={f['id']:f['properties']['label'] for f in geo['features']}|{p['id']:p['label'] for p in places}
    counts={}
    for b in books:
        for c in set(b['countries']):counts[c]=counts.get(c,0)+1
    names={f['id']:f['properties']['name'] for f in geo['features']}|{p['id']:p['name'] for p in places}
    dots=''.join(f'<circle cx="{x}" cy="{y}" r="{round(1.6+math.sqrt(n)*0.9,1)}"><title>{esc(names.get(c,c))}: {n}</title></circle>' for c,n in sorted(counts.items(),key=lambda kv:(-kv[1],kv[0])) for x,y in [px(*anchor[c])])
    svg=(f'<svg viewBox="0 {H*0.08:.0f} {W} {H*0.72:.0f}" role="img" aria-label="World map with a dot for each of {len(counts)} countries and regions, sized by number of books">'
         f'<path d="{"".join(land)}" fill="currentColor" opacity=".13"/><g fill="var(--dot)" fill-opacity=".55" stroke="var(--dot)" stroke-width=".6">{dots}</g></svg>')
    def year(y):return f'{-y} BC' if y<0 else f'AD {y}' if y<1000 else str(y)
    rows=''.join(f'<tr><td><a href="/atlas?path={esc(p["id"])}">{esc(p["title"])}</a> <span class="badge">{esc(p["badge"])}</span></td><td class="hide-sm">{esc(p["curator"])}</td><td class="n">{len(p["items"])}</td></tr>' for p in paths)
    fill={'BOOK_COUNT':f'{len(books):,}','COUNTRY_COUNT':str(len(counts)),'PATH_COUNT':str(len(paths)),
          'SPAN':f'{year(min(b["start"] for b in books))} to {year(max(b["end"] for b in books))}','DOT_MAP':svg,'PATH_ROWS':rows}
    page=(ROOT/'src/home.html').read_text()
    for k,v in fill.items():page=page.replace('{{'+k+'}}',v)
    assert '{{' not in page,'Unfilled home page placeholder'
    (ROOT/'home.html').write_text(page)
    print('Home page:',len(page),'characters')
def build():
    compile_dates()
    books=catalog();geo=world()
    coverage_path=ROOT/'data/coverage.json'
    coverage=json.loads(coverage_path.read_text());coverage.update(total=len(books),dated=sum(b['start'] is not None for b in books),mapped=sum(bool(b['countries']) for b in books),classified=sum(bool(b['categories']) for b in books),languages=sum(bool(b.get('language')) for b in books),pathAdditions=13,estimatedDates=sum(b.get('dateConfidence')=='estimated' for b in books));coverage_path.write_text(json.dumps(coverage,indent=2))
    assert all(b['start'] is not None and b['end'] is not None for b in books), 'Undated catalog entry: add a documented date decision before publishing'
    template=(ROOT/'src/index.html').read_text()
    for name,path in [('STYLE','src/style.css'),('D3','vendor/d3.min.js'),('CORE','src/core.js'),('APP','src/app.js'),('READER','src/reader.js'),('TOUR','src/tour.js')]:
        content=(ROOT/path).read_text()
        if name=='STYLE':content+='\n'+(ROOT/'src/layout.css').read_text()+'\n'+(ROOT/'src/reader.css').read_text()+'\n'+(ROOT/'src/tour.css').read_text()
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
    home(books,geo,places,json.loads((ROOT/'data/reading-paths.json').read_text()))
if __name__=='__main__':build()
