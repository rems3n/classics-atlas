"""Conservative second cover pass: normalize catalog annotations and search all publishers.
Cache public Open Library metadata, rate limit requests, keep exact title/author matches.
No bulk image crawling. Existing cover choices and catalog IDs are preserved.
"""
import json,re,concurrent.futures
from urllib.parse import urlencode
from enrich import ROOT,fetch,normal

def title(s):
 s=re.sub(r'\s*\([^)]*\)','',s)
 s=re.sub(r',?\s+translated$','',s,flags=re.I)
 return s.strip().rstrip(':')

def author_match(expected,actual):
 aliases={'Homer':['Όμηρος'],'Plato':['Πλάτων'],'Aristotle':['Αριστοτέλης'],'Lao Tzu':['Laozi'],'Confucius':['孔子','Kongzi'],'Marcus Tullius Cicero':['Cicero'],'Titus Livy':['Livy'],'Thucydides3':['Thucydides'],'Mo Zi':['Mozi'],'Qu Yuan and Other Poets':['Qu Yuan']}
 expected=re.sub(r'\s*\(.*','',expected)
 if normal(actual) in {normal(x) for x in [expected]+aliases.get(expected,[])}:return True
 a=expected.split();b=actual.split()
 return len(a)>1 and len(b)>1 and normal(a[-1])==normal(b[-1]) and normal(a[0])==normal(b[0])

def run():
 books=json.loads((ROOT/'data/catalog.json').read_text());output=json.loads((ROOT/'data/online-covers.json').read_text());missing=[b for b in books if not b.get('cover')];report=[]
 batches=[missing[i:i+5] for i in range(0,len(missing),5)]
 def lookup(items):
  clauses=[]
  for b in items:
   t=title(b['title']).replace('"','');a=re.sub(r'\s*\(.*','',b['author']).replace('"','')
   clause='title:"'+t+'"'
   if a!='Various / unverified':clause+=' AND author:"'+a+'"'
   clauses.append('('+clause+')')
  return fetch('https://openlibrary.org/search.json?'+urlencode({'q':' OR '.join(clauses),'limit':100,'fields':'key,title,author_name,cover_i,editions,editions.key,editions.title,editions.publisher,editions.cover_i,editions.isbn,editions.publish_date'}))
 with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
  for i,result in enumerate(pool.map(lookup,batches)):
   for b in batches[i]:
    candidates=[];target=normal(title(b['title']));anonymous=b['author']=='Various / unverified'
    for d in result.get('docs',[]):
     if normal(title(d.get('title','')))!=target:continue
     if not anonymous and not any(author_match(b['author'],a) for a in d.get('author_name',[])):continue
     for ed in d.get('editions',{}).get('docs',[]):
      preferred=any('penguin' in p.lower() for p in ed.get('publisher',[]))
      if (preferred or not re.search(r'\(|^(selected|collected|complete)\b| and other ',b['title'],re.I)) and ed.get('cover_i') and normal(title(ed.get('title','')))==target and (not anonymous or preferred and len(target)>12):candidates.append((preferred,d,ed))
     if not anonymous and d.get('cover_i') and title(b['title'])==b['title'] and not re.search(r'^(selected|collected|complete)\b| and other ',b['title'],re.I):candidates.append((False,d,None))
    if not candidates:continue
    preferred,d,ed=max(candidates,key=lambda x:x[0]);c=ed or d
    entry={'cover':'https://covers.openlibrary.org/b/id/'+str(c['cover_i'])+'-M.jpg?default=false','coverSource':'https://openlibrary.org'+c['key'],'coverLabel':'Penguin-family edition' if preferred else 'Other edition · Open Library','edition':ed,'workSource':'https://openlibrary.org'+d['key'],'match':'Normalized title (catalog parenthetical contents removed) and author match; anonymous titles require matching Penguin-family edition. Automated match; review recommended.','retrieved':'2026-09-20'}
    output[b['id']]=entry;report.append({'id':b['id'],'title':b['title'],'author':b['author'],'matchedTitle':c.get('title'), 'matchedAuthors':d.get('author_name'),**entry})
   (ROOT/'data/online-covers.json').write_text(json.dumps(output,ensure_ascii=False,indent=2));(ROOT/'data/cover-review-2026-09-20.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('Cover research',i+1,'/',len(batches),'new matches',len(report),'error',result.get('failure',''),flush=True)
if __name__=='__main__':run()
