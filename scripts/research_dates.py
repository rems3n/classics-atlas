"""Fetch public Wikipedia lead text for date review; never writes catalog dates."""
import concurrent.futures
import json
import time
import threading
import sys
from urllib.error import HTTPError
from pathlib import Path
from urllib.parse import urlencode, unquote
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'data/date-research.json'
LOCK = threading.Lock()
NEXT_REQUEST = 0
FULL = '--full-publication' in sys.argv

def fetch(titles):
    global NEXT_REQUEST
    query = dict(action='query', format='json', redirects=1, prop='extracts|pageprops',
                 explaintext=1, exintro=1, exlimit=20, titles='|'.join(titles))
    if FULL:
        query=dict(action='query',format='json',redirects=1,prop='revisions|pageprops',
                   rvprop='content',rvslots='main',titles='|'.join(titles))
    url = 'https://en.wikipedia.org/w/api.php?' + urlencode(query)
    for attempt in range(2):
        try:
            with LOCK:
                time.sleep(max(0,NEXT_REQUEST-time.monotonic()))
                NEXT_REQUEST=time.monotonic()+2
            with urlopen(Request(url, headers={'User-Agent':'ClassicsAtlas/1.1 (bibliographic date review)'}), timeout=45) as r:
                result = json.load(r)
            q = result.get('query', {})
            pages = {p['title']:p for p in q.get('pages', {}).values()}
            redirects = {p['from']:p['to'] for p in q.get('normalized', [])+q.get('redirects', [])}
            output = {}
            for title in titles:
                key = title
                for _ in range(8):
                    key = redirects.get(key, key)
                p = pages.get(key, {})
                body=p.get('extract','')
                if FULL:
                    from enrich import plain
                    body=plain(p.get('revisions',[{}])[0].get('slots',{}).get('main',{}).get('*',''))
                output[title] = dict(title=key, text=body, missing='missing' in p,
                                     source='https://en.wikipedia.org/wiki/'+key.replace(' ','_'),
                                     wikidata=p.get('pageprops',{}).get('wikibase_item'))
            return output
        except Exception as e:
            if isinstance(e,HTTPError) and e.code==429:
                delay=max(30,int(e.headers.get('Retry-After','30')))
                with LOCK:NEXT_REQUEST=max(NEXT_REQUEST,time.monotonic()+delay)
            if attempt: return {t:{'error':str(e)} for t in titles}
            time.sleep(2)

if __name__ == '__main__':
    books = json.loads((ROOT/'data/catalog.json').read_text())
    output = json.loads(DEST.read_text()) if DEST.exists() else {}
    titles = set()
    for b in books:
        if b['start'] is not None: continue
        titles.add(b['title'])
        titles.add(unquote(b['source'].split('/wiki/')[-1]).split('?')[0].replace('_',' '))
    titles.discard('List of Penguin Classics')
    if FULL:
        decisions=json.loads((ROOT/'data/date-decisions.json').read_text())
        titles={unquote(d['contextSource'].split('/wiki/')[-1]).split('?')[0].replace('_',' ') for d in decisions if d['kind']=='P'}
        titles.update(d['title'] for d in decisions if d['kind']=='P')
        titles.update(['A Short History of the World (Wells book)','Les Liaisons dangereuses','Civil Disobedience (Thoreau)','Apocalypse (D. H. Lawrence)','Brodie\'s Report','Brand (play)','The Third Man (novella)','The Adventures of Pinocchio','Stamboul Train','Journey to the West','The Curse of Capistrano','Parerga and Paralipomena','The Amateur Cracksman','La Révolte des anges'])
        output={k[5:]:v for k,v in output.items() if k.startswith('FULL:')}
    titles = sorted(t for t in titles if t not in output or output[t].get('error') or (not output[t].get('text') and not output[t].get('missing')))
    batches = [titles[i:i+15] for i in range(0,len(titles),15)]
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for i, result in enumerate(pool.map(fetch, batches)):
            output.update(result)
            saved=output
            if FULL:
                saved=json.loads(DEST.read_text())
                saved.update({'FULL:'+k:v for k,v in output.items()})
            DEST.write_text(json.dumps(saved,ensure_ascii=False,indent=2))
            print(f'Lead research batch {i+1}/{len(batches)}; {len(output)} pages saved',flush=True)
