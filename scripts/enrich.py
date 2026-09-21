"""Cached, conservative public-source enrichment. Never infer residence from nationality.

Run fetch-wiki, fetch-covers, then build.py. Requests are cached and resumable.
Cover images are linked, not crawled/downloaded (Open Library's usage guidance).
"""
import concurrent.futures, hashlib, html, json, re, sys, time, unicodedata, threading
from pathlib import Path
from urllib.parse import urlencode, unquote
from urllib.request import Request, urlopen
from urllib.error import HTTPError

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT/'data/source-cache'
CACHE.mkdir(exist_ok=True)
UA = 'ClassicsAtlas/1.0 (personal literary bibliography; cached metadata research)'
REQUEST_LOCK=threading.Lock()
LAST_REQUEST=0

def fetch(url):
    global LAST_REQUEST
    p = CACHE/(hashlib.sha256(url.encode()).hexdigest()+'.json')
    if p.exists(): return json.loads(p.read_text())
    for attempt in range(3):
        try:
            with REQUEST_LOCK:
                time.sleep(max(0,1.1-(time.monotonic()-LAST_REQUEST)))
                LAST_REQUEST=time.monotonic()
            with urlopen(Request(url, headers={'User-Agent': UA}), timeout=65) as response:
                result=json.load(response)
            if 'error' in result: raise ValueError(str(result['error']))
            p.write_text(json.dumps(result,ensure_ascii=False))
            return result
        except Exception as error:
            if attempt==2: return {'failure':str(error),'url':url}
            delay=2+attempt*3
            if isinstance(error,HTTPError) and error.code==429:
                delay=max(30,int(error.headers.get('Retry-After','30')))
            time.sleep(delay)

def plain(s):
    s=re.sub(r'<ref\b[^>]*>.*?</ref>|<ref\b[^>]*/>', '', s, flags=re.S)
    s=re.sub(r'<!--.*?-->', '', s, flags=re.S)
    s=re.sub(r'\[\[([^\]|]+)\|([^\]]+)\]\]', r'\2', s)
    s=re.sub(r'\[\[([^\]]+)\]\]', r'\1', s)
    s=re.sub(r'\{\{(?:lang|langx)\|[^|]+\|([^}]+)\}\}',r'\1',s)
    s=re.sub(r'\{\{[^{}]*\}\}', ' ', s)
    s=re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', html.unescape(s).replace("''",'')).strip()

def fields(wikitext):
    # A field starts at the beginning of a line; nested templates remain intact.
    pairs=re.findall(r'^[ \t]*\|[ \t]*([a-zA-Z_ ]+)[ \t]*=[ \t]*(.*?)(?=\n[ \t]*\|[ \t]*[a-zA-Z_ ]+[ \t]*=|\n\}\}|\Z)',wikitext,re.M|re.S)
    return {k.strip().lower().replace(' ','_'):v.strip() for k,v in pairs}

def wiki_titles():
    books=json.loads((ROOT/'data/catalog.json').read_text())
    titles={unquote(b['source'].split('/wiki/')[-1]).replace('_',' ') for b in books}
    raw=(ROOT/'data/penguin-list.html').read_text().split('id="By_title"',1)[1].split('id="External_links"',1)[0]
    authors={}
    for li in re.findall(r'<li\b[^>]*>(.*?)</li>',raw,re.S):
        parts=re.split(r'\s+by\s+',li,maxsplit=1)
        if len(parts)<2: continue
        for url,label in re.findall(r'<a\b[^>]*href="(https://en.wikipedia.org/wiki/[^"#]+)"[^>]*>(.*?)</a>',parts[1]):
            name=plain(label)
            title=unquote(html.unescape(url).split('/wiki/')[-1]).replace('_',' ')
            authors[name]=title; titles.add(title)
    (ROOT/'data/author-links.json').write_text(json.dumps(authors,ensure_ascii=False,indent=2))
    titles.discard('List of Penguin Classics')
    return sorted(titles)

def fetch_wiki():
    output=json.loads((ROOT/'data/wiki-metadata.json').read_text()) if (ROOT/'data/wiki-metadata.json').exists() else {}
    titles=[t for t in wiki_titles() if t not in output]; batches=[titles[i:i+10] for i in range(0,len(titles),10)]
    failures=[]
    def batch(t):
        return fetch('https://en.wikipedia.org/w/api.php?'+urlencode(dict(action='query',prop='revisions|pageprops',rvprop='content',rvslots='main',rvsection=0,redirects=1,format='json',titles='|'.join(t))))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for i,r in enumerate(pool.map(batch,batches)):
            if r.get('failure'): failures.append(r);continue
            query=r.get('query',{}); parsed={}
            for p in query.get('pages',{}).values():
                w=p.get('revisions',[{}])[0].get('slots',{}).get('main',{}).get('*','')
                props=p.get('pageprops',{})
                parsed[p['title']]={'title':p['title'],'fields':fields(w),'description':props.get('wikibase-shortdesc',''),'wikidata':props.get('wikibase_item'),'missing':'missing' in p,'source':'https://en.wikipedia.org/wiki/'+p['title'].replace(' ','_')}
            redirects={x['from']:x['to'] for x in query.get('redirects',[])+query.get('normalized',[])}
            for title in batches[i]:
                target=title
                for _ in range(8): target=redirects.get(target,target)
                if target in parsed: output[title]=parsed[target]
            print('Wikipedia batch',i+1,'/',len(batches),'pages',len(output),flush=True)
            (ROOT/'data/wiki-metadata.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
    (ROOT/'data/fetch-failures.json').write_text(json.dumps(failures,indent=2))

def normal(s):
    s=''.join(c for c in unicodedata.normalize('NFKD',s) if not unicodedata.combining(c)).lower()
    s=re.sub(r'^(the|a|an)\s+','',s)
    return ''.join(c for c in s if c.isalnum())

def fetch_covers():
    books=json.loads((ROOT/'data/catalog.json').read_text())
    output=json.loads((ROOT/'data/online-covers.json').read_text()) if (ROOT/'data/online-covers.json').exists() else {}
    done_path=ROOT/'data/cover-attempts.json'
    done=set(json.loads(done_path.read_text())) if done_path.exists() else set()
    books=[b for b in books if b['id'] not in output and b['id'] not in done]
    # Search in small title batches; exact title and author checks happen in merge.
    batches=[books[i:i+8] for i in range(0,len(books),8)]
    failures=[]
    def batch(items):
        clauses=[]
        for b in items:
            clause='title:"'+b['title'].replace('"','')+'"'
            if b['author']!='Various / unverified':clause+=' AND author:"'+b['author'].replace('"','')+'"'
            clauses.append('('+clause+')')
        q='('+' OR '.join(clauses)+') AND publisher:penguin'
        return fetch('https://openlibrary.org/search.json?'+urlencode(dict(q=q,limit=30,fields='key,title,author_name,cover_i,editions,editions.key,editions.title,editions.publisher,editions.cover_i,editions.isbn,editions.publish_date')))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for i,result in enumerate(pool.map(batch,batches)):
            if result.get('failure'): failures.append(result)
            for b in batches[i]:
                candidates=[]
                for d in result.get('docs',[]):
                    if normal(d.get('title',''))!=normal(b['title']): continue
                    expected=normal(b['author']); names=d.get('author_name',[])
                    aliases={'Homer':['homer','Όμηρος','omeros','omer'],'Plato':['plato','Πλάτων','platon'],'Aristotle':['aristotle','Αριστοτέλης','aristoteles'],'Leo Tolstoy':['leo tolstoy','lev nikolaevich tolstoi','lev tolstoi'],'Fyodor Dostoyevsky':['fyodor dostoyevsky','fyodor dostoevsky','fyodor mikhailovich dostoevsky']}
                    accepted={normal(x) for x in aliases.get(b['author'],[b['author']])}
                    if b['author']=='Various / unverified' or not any(normal(n) in accepted or (len(expected)>5 and normal(n).endswith(expected)) for n in names): continue
                    ed=d.get('editions',{}).get('docs',[])
                    for e in ed:
                        if e.get('cover_i') and normal(e.get('title',''))==normal(b['title']):
                            candidates.append((any('penguin' in p.lower() for p in e.get('publisher',[])),d,e))
                    if d.get('cover_i'): candidates.append((False,d,None))
                if candidates:
                    preferred,d,e=max(candidates,key=lambda c:c[0])
                    c=e or d
                    output[b['id']]={'cover':'https://covers.openlibrary.org/b/id/'+str(c['cover_i'])+'-M.jpg?default=false','coverSource':'https://openlibrary.org'+c['key'],'coverLabel':'Penguin edition' if preferred else 'Other edition · Open Library','edition':e,'workSource':'https://openlibrary.org'+d['key'],'match':'Exact normalized title and author; automated match','retrieved':'2026-09-18'}
            print('Cover batch',i+1,'/',len(batches),'matched',len(output),'failures',len(failures),flush=True)
            (ROOT/'data/online-covers.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
            if not result.get('failure'):done.update(b['id'] for b in batches[i])
            done_path.write_text(json.dumps(sorted(done)))
    (ROOT/'data/cover-fetch-failures.json').write_text(json.dumps(failures,indent=2))

def entities(ids):
    ids=sorted(set(ids));out={}
    def batch(group):return fetch('https://www.wikidata.org/w/api.php?'+urlencode(dict(action='wbgetentities',ids='|'.join(group),props='claims|labels',languages='en',format='json')))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        for result in pool.map(batch,[ids[i:i+45] for i in range(0,len(ids),45)]):out.update(result.get('entities',{}))
    return out

def values(entity,prop):
    return [x['mainsnak']['datavalue']['value'] for x in entity.get('claims',{}).get(prop,[]) if x.get('rank')!='deprecated' and 'datavalue' in x.get('mainsnak',{})]

def fetch_places():
    wiki=json.loads((ROOT/'data/wiki-metadata.json').read_text()); links=json.loads((ROOT/'data/author-links.json').read_text())
    author_ids={name:wiki[title]['wikidata'] for name,title in links.items() if wiki.get(title,{}).get('wikidata')}
    author_data=entities(author_ids.values())
    place_ids={v['id'] for e in author_data.values() for prop in ['P551','P937'] for v in values(e,prop) if isinstance(v,dict) and 'id' in v}
    print('Authors:',len(author_data),'explicit residence/work places:',len(place_ids),flush=True)
    places=entities(place_ids)
    # Use physical coordinates, not historical citizenship, against modern polygons.
    world=json.loads((ROOT/'data/natural-earth.geojson').read_text())
    def inside(point,ring):
        x,y=point; hit=False
        for a,b in zip(ring,ring[1:]+ring[:1]):
            if (a[1]>y)!=(b[1]>y) and x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]:hit=not hit
        return hit
    def country(point):
        for f in world['features']:
            g=f['geometry'];polys=[g['coordinates']] if g['type']=='Polygon' else g['coordinates']
            if any(inside(point,p[0]) and not any(inside(point,h) for h in p[1:]) for p in polys):return f['properties']['ADM0_A3']
        return None
    output={}
    for author,qid in author_ids.items():
        e=author_data.get(qid,{})
        # P31 must explicitly identify a human, avoiding title links in source lists.
        if not any(v.get('id')=='Q5' for v in values(e,'P31') if isinstance(v,dict)):continue
        locations=[];countries=[];place_sources=[]
        for prop in ['P551','P937']:
            for v in values(e,prop):
                place=places.get(v.get('id'),{});coords=values(place,'P625')
                if not coords:continue
                c=coords[0];code=country((c['longitude'],c['latitude']))
                if not code:continue
                label=place.get('labels',{}).get('en',{}).get('value',v['id'])
                if code not in countries:countries.append(code)
                if label not in locations:locations.append(label);place_sources.append('https://www.wikidata.org/wiki/'+v['id'])
        if countries:
            output[author]={'countries':countries,'location':'; '.join(locations),'source':'https://www.wikidata.org/wiki/'+qid,'placeSources':place_sources,'method':'Wikidata residence (P551) / work location (P937), coordinates intersected with modern Natural Earth borders; not publication-specific'}
    (ROOT/'data/author-residences.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
    print('Authors with explicit sourced map associations:',len(output),flush=True)

def reparse():
    p=ROOT/'data/wiki-metadata.json';output=json.loads(p.read_text());by_title={}
    for path in CACHE.glob('*.json'):
        data=json.loads(path.read_text())
        for page in data.get('query',{}).get('pages',{}).values():
            w=page.get('revisions',[{}])[0].get('slots',{}).get('main',{}).get('*','')
            if w:by_title[page['title']]=fields(w)
    for data in output.values():
        if data['title'] in by_title:data['fields']=by_title[data['title']]
    p.write_text(json.dumps(output,ensure_ascii=False,indent=2))
    print('Reparsed cached wiki infoboxes:',len(by_title))

def fetch_editions():
    covers=json.loads((ROOT/'data/online-covers.json').read_text())
    path=ROOT/'data/edition-details.json';output=json.loads(path.read_text()) if path.exists() else {}
    ids=sorted({c['edition']['key'].split('/')[-1] for c in covers.values() if c.get('edition')}-set(output))
    batches=[ids[i:i+15] for i in range(0,len(ids),15)]
    def batch(ids):return fetch('https://openlibrary.org/api/books?'+urlencode(dict(bibkeys=','.join('OLID:'+x for x in ids),jscmd='data',format='json')))
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for i,result in enumerate(pool.map(batch,batches)):
            for key,d in result.items():
                if key.startswith('OLID:'):output[key[5:]]={k:d.get(k) for k in ['title','number_of_pages','publish_date','publishers','identifiers','url','by_statement','authors']}
            path.write_text(json.dumps(output,ensure_ascii=False,indent=2))
            print('Edition metadata',i+1,'/',len(batches),'records',len(output),flush=True)

def fetch_works():
    wiki=json.loads((ROOT/'data/wiki-metadata.json').read_text());books=json.loads((ROOT/'data/catalog.json').read_text())
    pages={unquote(b['source'].split('/wiki/')[-1]).replace('_',' ') for b in books}
    ids={wiki[t]['wikidata'] for t in pages if wiki.get(t,{}).get('wikidata')}
    data=entities(ids)
    works={qid:e for qid,e in data.items() if not any(v.get('id')=='Q5' for v in values(e,'P31') if isinstance(v,dict))}
    # Only records with publication/composition properties can contribute dates.
    labels=entities({v['id'] for e in works.values() for p in ['P31','P136','P407'] for v in values(e,p) if isinstance(v,dict) and 'id' in v})
    def names(e,p):return [labels.get(v.get('id'),{}).get('labels',{}).get('en',{}).get('value','') for v in values(e,p) if isinstance(v,dict)]
    out={qid:{'dates':values(e,'P571')+values(e,'P577'),'genres':names(e,'P136'),'types':names(e,'P31'),'languages':names(e,'P407'),'source':'https://www.wikidata.org/wiki/'+qid} for qid,e in works.items()}
    (ROOT/'data/work-facts.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
    print('Wikidata work fact records:',len(out),flush=True)

def rematch_covers():
    """Review already-fetched search records; no additional network requests."""
    books=json.loads((ROOT/'data/catalog.json').read_text())
    output=json.loads((ROOT/'data/online-covers.json').read_text());index={}
    def titlekey(title):
        title=re.sub(r'\s+translated$','',title,flags=re.I)
        return normal(title)
    for path in CACHE.glob('*.json'):
        data=json.loads(path.read_text())
        for d in data.get('docs',[]):
            if d.get('key','').startswith('/works/') and d.get('author_name'):
                index.setdefault(titlekey(d.get('title','')),[]).append(d)
    def author_match(expected,actual):
        aliases={'Homer':['Όμηρος'],'Plato':['Πλάτων'],'Aristotle':['Αριστοτέλης'],'Leo Tolstoy':['Lev Nikolaevič Tolstoj','Lev Nikolaevich Tolstoi'],'Fyodor Dostoyevsky':['Fyodor Dostoevsky','Fyodor Mikhailovich Dostoevsky']}
        if normal(actual) in {normal(n) for n in [expected]+aliases.get(expected,[])}:return True
        a=re.findall(r'\w+',plain(expected).lower());b=re.findall(r'\w+',plain(actual).lower())
        return len(a)>1 and len(b)>1 and normal(a[-1])==normal(b[-1]) and normal(a[0])[0:1]==normal(b[0])[0:1]
    for b in books:
        if b['id'] in output:continue
        candidates=[];anonymous=b['author']=='Various / unverified'
        for d in index.get(titlekey(b['title']),[]):
            if anonymous:
                if len(titlekey(b['title']))<15 or re.search(r'^(selected|collected|complete|three|four|five)\b',b['title'],re.I):continue
            elif not any(author_match(b['author'],a) for a in d['author_name']):continue
            for ed in d.get('editions',{}).get('docs',[]):
                penguin=any('penguin' in p.lower() for p in ed.get('publisher',[]))
                if ed.get('cover_i') and titlekey(ed.get('title',''))==titlekey(b['title']) and (not anonymous or penguin):candidates.append((penguin,d,ed))
            if not anonymous and d.get('cover_i'):candidates.append((False,d,None))
        if not candidates:continue
        preferred,d,ed=max(candidates,key=lambda c:c[0]);c=ed or d
        output[b['id']]={'cover':'https://covers.openlibrary.org/b/id/'+str(c['cover_i'])+'-M.jpg?default=false','coverSource':'https://openlibrary.org'+c['key'],'coverLabel':'Penguin-family edition' if preferred else 'Other edition · Open Library','edition':ed,'workSource':'https://openlibrary.org'+d['key'],'match':'Exact title; author unspecified in source catalog — review required' if anonymous else 'Exact normalized title and compatible author name/initials or documented name variant; automated match','retrieved':'2026-09-18'}
    for c in output.values():
        if c.get('coverLabel')=='Penguin edition':c['coverLabel']='Penguin-family edition'
    (ROOT/'data/online-covers.json').write_text(json.dumps(output,ensure_ascii=False,indent=2))
    print('Cached cover matches after name review:',len(output),flush=True)

if __name__=='__main__':
    {'fetch-wiki':fetch_wiki,'fetch-covers':fetch_covers,'fetch-places':fetch_places,'fetch-editions':fetch_editions,'fetch-works':fetch_works,'reparse':reparse,'rematch-covers':rematch_covers}[sys.argv[1]]()
