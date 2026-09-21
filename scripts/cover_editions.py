"""Search missing covers by title within Penguin editions, retaining an audit trail.
Uses cached, throttled public metadata; artwork remains linked to Open Library.
Candidates require a matching edition title and matching author (except unattributed catalog entries).
"""
import json,re,concurrent.futures
from urllib.parse import urlencode
from enrich import ROOT,fetch,normal
from more_covers import author_match,title

def base(s):
 return normal(title(s).split(':')[0])
def run():
 books=json.loads((ROOT/'data/catalog.json').read_text());missing=[b for b in books if not b.get('cover')];report=[]
 batches=[missing[i:i+4] for i in range(0,len(missing),4)]
 def lookup(items):
  q='('+' OR '.join('title:"'+title(b['title']).split(':')[0].replace('"','')+'"' for b in items)+') AND publisher:penguin'
  return fetch('https://openlibrary.org/search.json?'+urlencode({'q':q,'limit':100,'fields':'key,title,author_name,cover_i,editions,editions.key,editions.title,editions.publisher,editions.cover_i,editions.isbn,editions.publish_date'}))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for i,result in enumerate(pool.map(lookup,batches)):
   for b in batches[i]:
    for d in result.get('docs',[]):
     anonymous=b['author']=='Various / unverified'
     if not anonymous and not any(author_match(b['author'],a) for a in d.get('author_name',[])):continue
     for ed in d.get('editions',{}).get('docs',[]):
      if not ed.get('cover_i') or base(ed.get('title',''))!=base(b['title']):continue
      if not any('penguin' in p.lower() for p in ed.get('publisher',[])):continue
      entry={'cover':'https://covers.openlibrary.org/b/id/'+str(ed['cover_i'])+'-M.jpg?default=false','coverSource':'https://openlibrary.org'+ed['key'],'coverLabel':'Penguin-family edition','edition':ed,'workSource':'https://openlibrary.org'+d['key'],'match':'Matching main title and author in a Penguin-published edition; catalog subtitle/contents normalized. Unattributed catalog entries matched on title and publisher. Metadata reviewed; artwork may vary by printing.','retrieved':'2026-09-21'}
      report.append({'id':b['id'],'title':b['title'],'author':b['author'],'matchedTitle':ed['title'],'matchedAuthors':d.get('author_name',[]),**entry});break
     if report and report[-1]['id']==b['id']:break
   (ROOT/'data/cover-review-2026-09-21.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('Penguin edition research',i+1,'/',len(batches),'candidates',len(report),'error',result.get('failure',''),flush=True)
if __name__=='__main__':run()
