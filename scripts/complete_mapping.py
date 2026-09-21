"""Explicit origin fallback mapping, separate from the residence-only importer.

Never silently assign an arbitrary country. Unresolved rows stop the build.
Saved biography fields supply origin evidence; work/author overrides handle
modern borders, translators, ambiguous ancient lives and anthologies.
"""
import json,re,html,unicodedata
from pathlib import Path
from urllib.parse import unquote
ROOT=Path(__file__).resolve().parents[1]
def read(name,default=None):
 p=ROOT/'data'/name
 return json.loads(p.read_text()) if p.exists() else default
def norm(s):return re.sub(r'[^a-z0-9]','',unicodedata.normalize('NFKD',re.sub(r'\d+$','',s)).encode('ascii','ignore').decode().lower())
def clean(s):
 s=re.sub(r'<ref\b[^>]*>.*?</ref>|<ref[^>]*/>|<!--.*?-->','',s,flags=re.S)
 s=re.sub(r'\[\[([^]|]+)\|([^]]+)\]\]',r'\2',s);s=s.replace('[[','').replace(']]','')
 s=re.sub(r'\{\{(?:nowrap|small|ubl|plainlist|hlist)\|([^{}]*)\}\}',lambda m:m[1].replace('|',', '),s)
 s=re.sub(r'\{\{[^{}]*\}\}','',s)
 return re.sub(r'\s+',' ',html.unescape(re.sub(r'<[^>]+>',' ',s))).strip()
COUNTRIES={
 'GBR':r'England|English|Scotland|Scottish|Welsh|Wales|British|United Kingdom|Northern Ireland',
 'IRL':r'Irish|Ireland', 'USA':r'American|United States|U\.S\.?|USA|US',
 'FRA':r'France|French','DEU':r'Germany|German','ITA':r'Italy|Italian|Venetian',
 'ESP':r'Spain|Spanish','PRT':r'Portugal|Portuguese','RUS':r'Russia|Russian',
 'UKR':r'Ukraine|Ukrainian','POL':r'Poland|Polish','AUT':r'Austria|Austrian',
 'CZE':r'Czechia|Czech|Czech Republic','HUN':r'Hungary|Hungarian',
 'NLD':r'Netherlands|Dutch','BEL':r'Belgium|Belgian','CHE':r'Switzerland|Swiss',
 'NOR':r'Norway|Norwegian','SWE':r'Sweden|Swedish','DNK':r'Denmark|Danish',
 'FIN':r'Finland|Finnish','ISL':r'Iceland|Icelandic','GRC':r'Greece|Greek|Athenian',
 'TUR':r'Turkey|Turkish','EGY':r'Egypt|Egyptian','DZA':r'Algeria|Algerian',
 'TUN':r'Tunisia|Tunisian','SYR':r'Syria|Syrian','ISR':r'Israel|Israeli',
 'IRN':r'Iran|Iranian|Persian','IRQ':r'Iraq|Iraqi','SAU':r'Saudi Arabia',
 'IND':r'India|Indian|Sanskrit','PAK':r'Pakistan|Pakistani',
 'CHN':r'China|Chinese|Tibetan|Tibet','JPN':r'Japan|Japanese',
 'AUS':r'Australia|Australian','NZL':r'New Zealand','CAN':r'Canada|Canadian',
 'MEX':r'Mexico|Mexican','BRA':r'Brazil|Brazilian','PER':r'Peru|Peruvian',
 'CHL':r'Chile|Chilean','ARG':r'Argentina|Argentine','URY':r'Uruguay|Uruguayan',
 'NIC':r'Nicaragua|Nicaraguan','JAM':r'Jamaica|Jamaican','PRI':r'Puerto Rico|Puerto Rican',
 'TTO':r'Trinidad and Tobago','GUY':r'Guyana|Guyanese|British Guiana',
 'ZAF':r'South Africa|South African','LSO':r'Lesotho','TGO':r'Togo|Togolese',
 'PHL':r'Philippines|Filipino','ETH':r'Ethiopia|Ethiopian',
}
def matches(s):return [code for code,pat in COUNTRIES.items() if re.search(r'\b(?:'+pat+r')\b',s,re.I)]
def automatic(author,wiki,links):
 key=links.get(author)
 if not key:
  key=next((v for k,v in links.items() if norm(k)==norm(author)),None)
 p=wiki.get(key,{})
 if not p:return None
 birth=clean(p.get('fields',{}).get('birth_place','')).split('{{refn')[0].split('{{efn')[0]
 desc=p.get('description','')
 # Historical empire labels are not modern countries. Prefer the explicit
 # present-day clause, otherwise retain unambiguous local country names.
 modern=re.split(r'\b(?:now in|now|present-day|modern-day)\b',birth,flags=re.I)
 place=modern[-1] if len(modern)>1 else birth
 place=re.sub(r'British India|British Raj','India',place,flags=re.I)
 place=re.sub(r'British Guiana','Guyana',place,flags=re.I)
 place=re.sub(r'New South Wales|Port of Spain|Indian Reservation|British America|British North America','',place,flags=re.I)
 place=re.sub(r'\bBritish\b','',place,flags=re.I)
 place=re.sub(r'Russian Empire|Austrian Empire|Spanish Empire|German Empire|Empire of Japan|United Kingdoms of Sweden and Norway|United Kingdom of Great Britain and Ireland','',place,flags=re.I)
 origin=matches(place)
 identity=matches(desc.replace('in English','').replace('West Indian',''))
 # Northern Irish origin should not be mapped to the Republic by substring.
 if 'Northern Ireland' in place or 'Northern Ireland' in desc:
  origin=[c for c in origin if c!='IRL'];identity=[c for c in identity if c!='IRL']
 if re.search(r'Ancient Indian|Indian (?:writer|poet|playwright)',desc):pass
 if 'American Indian' in desc or 'Dakota' in desc:identity=[c for c in identity if c!='IND']
 codes=list(dict.fromkeys(origin+identity))
 if not codes:return None
 basis='author origin' if origin else 'author cultural/national association'
 evidence=('Birthplace: '+birth+'. ' if birth else '')+'Biography description: '+desc+'.'
 return dict(countries=codes,basis=basis,note=evidence+' Modern-country browsing association; not a claim about where this work was written.',sources=[p['source']])
def complete_mapping(records,strict=True):
 wiki=read('wiki-metadata.json',{});links=read('author-links.json',{})
 decisions=read('mapping-decisions.json',{'authors':{},'works':{}})
 extra=read('map-places.json',[])
 geo=read('natural-earth.geojson');names={f['properties']['ADM0_A3']:f['properties'].get('NAME_EN',f['properties']['NAME']) for f in geo['features']}
 names.update({x['id']:x['name'] for x in extra})
 out={};missing=[]
 for b in records:
  d=decisions['works'].get(b['id'])
  if not d and b['countries']:continue
  if not d:d=decisions['authors'].get(b['author']) or automatic(b['author'],wiki,links)
  if not d:missing.append(b);continue
  assert d['countries'] and d['note'] and d['sources'],b['title']
  assert set(d['countries'])<=names.keys(),(b['title'],d['countries'])
  b.update(countries=list(dict.fromkeys(d['countries'])),location='; '.join(names[c] for c in d['countries']),locationNote=d['note'],locationBasis=d['basis'])
  for url in d['sources']:b.setdefault('provenance',[]).append({'fields':'Geographic origin / fallback','source':url,'method':d['basis']+': '+d['note']})
  out[b['id']]={'title':b['title'],'author':b['author'],**d}
 if missing:
  print('Unmapped:',len(missing))
  for b in missing:print(b['id']+' | '+b['author']+' | '+b['title'])
 if strict:assert not missing,'Every work requires an explicit origin or fallback before publishing'
 (ROOT/'data/mapping-overrides.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
 lines=['# Geographic mapping audit','','Every catalog work has at least one modern-country or territory association. Previously documented residence/work associations are retained. Remaining works use author origin or birthplace first, then documented career, original literary tradition, or representative anthology source regions. Translators are not substituted for original authors. Approximate and disputed choices are explained below.','','These are discovery associations, not assertions that each book was written in every listed place. Anthology regions may be representative rather than exhaustive. Modern borders do not imply historical nationality. Countries overlap: use unique book IDs for global counts.','','| Work | Catalog author | Regions | Basis and explanation | Sources |','| --- | --- | --- | --- | --- |']
 esc=lambda s:str(s).replace('|','/').replace('\n',' ')
 for key,d in sorted(out.items(),key=lambda x:x[1]['title'].lower()):
  lines.append('| '+' | '.join([esc(d['title']),esc(d['author']),', '.join(names[c] for c in d['countries']),esc(d['basis']+': '+d['note']),' · '.join('[Source '+str(i+1)+']('+url+')' for i,url in enumerate(d['sources']))])+' |')
 (ROOT/'MAPPING_AUDIT.md').write_text('\n'.join(lines)+'\n')
 return records
if __name__=='__main__':complete_mapping(read('catalog.json'),strict=False)
