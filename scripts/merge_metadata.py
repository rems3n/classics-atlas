"""Merge source-derived facts without treating nationality or setting as residence."""
import json, re
from urllib.parse import unquote
from enrich import ROOT, plain, normal

def load(name,default):
    p=ROOT/'data'/name
    return json.loads(p.read_text()) if p.exists() else default

def classify(s):
    s=s.lower()
    for pattern,category,kind in [
        (r'\b(short stor|stories|tales|fables)', 'Short stories','Fiction'),
        (r'\b(poetry|poems?|verse|sonnets?|epic poem)', 'Poetry',None),
        (r'\b(play|plays|drama|tragedy|comedy)\b', 'Drama','Fiction'),
        (r'\bnovel(la)?s?\b|bildungsroman', 'Novels','Fiction'),
        (r'\b(memoir|autobiograph|biograph|diar|letters|journal)', 'Life writing','Nonfiction'),
        (r'\bphilosoph', 'Philosophy','Nonfiction'),
        (r'\b(scripture|religio|theolog|buddhis|christian|hindu|mytholog)', 'Religion & myth',None),
        (r'\b(natural history|science|scientific|biology|botany|geology|naturalist)', 'Science & nature','Nonfiction'),
        (r'\b(history|historian|historical account|chronicle)', 'History','Nonfiction'),
        (r'\b(essay|criticism|treatise|political|economics)', 'Essays & criticism','Nonfiction')]:
        if re.search(pattern,s): return [category],kind
    return [],None

def dates(fields,description):
    raw=next((fields[k] for k in ['published','pub_date','publication_date','release_date','date_written','written','premiere_date'] if fields.get(k)), '')
    # Remove citations and comments before reading dates; never use translation dates.
    raw=re.sub(r'<ref\b[^>]*>.*?</ref>|<ref\b[^>]*/>|<!--.*?-->', '',raw,flags=re.S)
    m=re.match(r'^(\d{3,4}(?:[–-]\d{2,4})?)\b',description)
    description_date=m.group(1) if m else ''
    if not raw:raw=description_date
    century=re.search(r'(\d{1,2})(?:st|nd|rd|th)\s+century\s*(BC|BCE|AD|CE)?',plain(raw),re.I)
    if century:
        n=int(century[1]);bc=(century[2] or '').upper() in ['BC','BCE']
        return (-n*100,-(n-1)*100-1) if bc else ((n-1)*100+1,n*100)
    if re.search(r'\b(BC|BCE)\b',raw,re.I):
        clean=plain(raw)
        interval=re.search(r'(\d{1,4})\s*(?:–|-)\s*(\d{1,4})\s*(?:BC|BCE)\b',clean,re.I)
        single=re.search(r'(\d{1,4})\s*(?:BC|BCE)\b',clean,re.I)
        if interval:return tuple(sorted([-int(interval[1]),-int(interval[2])]))
        if single:return (-int(single[1]),-int(single[1]))
        return None
    if re.search(r'century',raw,re.I):return None
    years=[int(y) for y in re.findall(r'(?<!\d)([1-2]\d{3}|[1-9]\d{2})(?!\d)',raw)]
    years=[y for y in years if y<=2026]
    if not years: return None
    # Restrict to the first original-publication interval, not later revisions.
    a=years[0];b=a
    if description_date and int(re.split('[–-]',description_date)[0])<a:
        raw=description_date;a=int(re.split('[–-]',description_date)[0]);b=a
    m=re.search(str(a)+r'\s*[–-]\s*(\d{2,4})',raw)
    if m:
        v=m.group(1);b=int(v) if len(v)>2 else a//100*100+int(v)
        if b<a:b+=100
    return (a,b) if b>=a and b-a<=100 else (a,a)

def merge(records):
    wiki=load('wiki-metadata.json',{}); authors=load('author-links.json',{}); covers=load('online-covers.json',{})
    residences=load('author-residences.json',{})
    edition_details=load('edition-details.json',{})
    work_facts=load('work-facts.json',{})
    date_overrides=load('date-overrides.json',{})
    # A known author association is useful for the rest of that author's catalog,
    # but is labeled separately from a work-specific composition claim.
    for b in records:
        if b['countries'] and b['author']!='Various / unverified' and b['author'] not in residences:
            residences[b['author']]={'countries':b['countries'],'location':b['location'],'language':b['language'],'tradition':b['tradition'],'source':b['source'],'method':'Author association inherited from a separately annotated catalog work; not a verified composition location for this volume'}
    for b in records:
        b['provenance']=[]
        if b['start'] is not None:
            b['provenance'].append({'fields':'Original date, classification, language and composition association','source':b['source'],'method':'Editorial starter annotation; approximate, not independently audited'})
        page=wiki.get(unquote(b['source'].split('/wiki/')[-1]).replace('_',' '),{})
        f=page.get('fields',{});desc=page.get('description','')
        # Only book/work infoboxes, never the author biography or subject article.
        is_work=bool(f.get('author') or f.get('writer') or f.get('published') or f.get('pub_date') or re.match(r'^\d{3,4}.*\b(novel|novella|play|poem|book|collection|narrative|essay)\b',desc,re.I)) and not f.get('birth_date')
        if is_work:
            added=[]
            if b['start'] is None:
                date=dates(f,desc)
                if date:
                    b['start'],b['end']=date; added.append('Original publication date')
                    if any(x in b['title'].lower() for x in [' and other','selected','collected','complete','three ','four ','five ','six ']):
                        b['dateNote']='Date of linked principal work; this selected/collected volume may span additional dates.'
            if not b['categories']:
                b['categories'],b['type']=classify(plain(f.get('genre',''))+' '+desc)
                if b['categories']:added.append('Classification (rule-mapped from source genre)')
            if not b['language'] and (f.get('language') or f.get('original_language')):
                lang=plain(f.get('language') or f['original_language'])
                if len(lang)<65 and not any(x in lang for x in ['{','|','http']): b['language']=lang;added.append('Original language')
            if not b['overview'] and desc and len(desc)<250 and desc not in ['none','No description']:
                b['overview']=desc[0].upper()+desc[1:].rstrip('.')+'.';added.append('Brief source description')
            if added:b['provenance'].append({'fields':', '.join(added),'source':page['source'],'method':'Wikipedia lead infobox / short description; automatically extracted, requires editorial review'})
        if not b['categories']:
            b['categories'],b['type']=classify(b['title'])
            if b['categories']:b['provenance'].append({'fields':'Classification','source':b['source'],'method':'Inferred from explicit format words in catalog title; review recommended'})
        facts=work_facts.get(page.get('wikidata'),{})
        if facts and not is_work and not re.search(r'\b(book|novel|novella|poem|play|essay|treatise|dialogue|literary work|written work|collection|manuscript|religious text)\b',' '.join(facts.get('types',[])),re.I):facts={}
        added=[]
        if facts:
            if b['start'] is None:
                options=[]
                for date in facts.get('dates',[]):
                    m=re.match(r'([+-])(\d+)-',date.get('time',''))
                    precision=date.get('precision',0)
                    if not m or precision<7:continue
                    year=int(m[2])*(-1 if m[1]=='-' else 1)
                    if not -2500<=year<=2026 or year==0:continue
                    span=100 if precision==7 else 10 if precision==8 else 1
                    lo=(year//span)*span if span>1 else year
                    options.append((lo,lo+span-1))
                if options:
                    b['start'],b['end']=min(options)
                    if b['start']==0:b['start']=1
                    if b['end']==0:b['end']=-1
                    b['dateNote']='Earliest recorded composition/inception or publication date from Wikidata; source precision retained as a browsing interval. Review editions and collections separately.'
                    added.append('Original date interval')
            if not b['categories']:
                b['categories'],b['type']=classify(' '.join(facts.get('genres',[])+facts.get('types',[])))
                if b['categories']:added.append('Classification')
            if not b['language'] and facts.get('languages'):
                b['language']=', '.join(filter(None,facts['languages'])) or None
                if b['language']:added.append('Language')
            if added:b['provenance'].append({'fields':', '.join(added),'source':facts['source'],'method':'Structured Wikidata work facts; automatically imported, not independently audited'})
        home=residences.get(b['author'])
        if not b['countries'] and home:
            b['countries']=home['countries'];b['location']=home['location']
            b['locationNote']='Author residence/work association, not verified as the writing location of this particular volume; not an exhaustive list of residences.'
            b['provenance'].append({'fields':'Geographic association','source':home['source'],'method':home['method']})
        if not b['tradition'] and home and home.get('tradition'):b['tradition']=home['tradition']
        if not b['language'] and home and home.get('language'):
            b['language']=home['language']
            b['provenance'].append({'fields':'Original language','source':home['source'],'method':'Author principal writing language; individual volume not independently verified'})
        if not b['tradition']:
            author_page=wiki.get(authors.get(b['author']),{})
            biography=author_page.get('description','')
            m=re.search(r'\b(Ancient Greek|Ancient Roman|Japanese|Russian|French|English|British|American|Italian|Spanish|German|Indian|Irish|Greek|Roman|Chinese)\b',biography,re.I)
            if m:
                group=m[1].title()
                group={'British':'English','Ancient Greek':'Ancient Greek','Ancient Roman':'Ancient Roman','Roman':'Ancient Roman','Chinese':'Ancient Chinese' if b['start'] is not None and b['start']<500 else 'Chinese','Greek':'Ancient Greek' if b['start'] is not None and b['start']<500 else 'Greek'}.get(group,group)
                b['tradition']=group
                b['provenance'].append({'fields':'Literary tradition','source':author_page['source'],'method':'Broad browsing group inferred from author biography; not a geographic-residence claim or exhaustive cultural identity'})
        c=covers.get(b['id'])
        if c:
            b.update(c)
            b['provenance'].append({'fields':'Cover / selected edition','source':c['coverSource'],'method':c['match']})
            ed=c.get('edition')
            if ed:
                detail=edition_details.get(ed['key'].split('/')[-1],{})
                pages=detail.get('number_of_pages')
                if isinstance(pages,int) and 0<pages<20000:
                    b['pages']=pages
                    b['provenance'].append({'fields':'Selected edition page count','source':c['coverSource'],'method':'Open Library edition record, not a work-wide page count'})
        if not b['overview']:
            category=b['categories'][0].lower() if b['categories'] else 'work'
            b['overview']=f"A Penguin Classics catalog entry by {b['author']}; classified as {category}." if b['author']!='Various / unverified' else 'A collection or unattributed work in the Penguin Classics source list; authorship and descriptive details need review.'
            b['overviewNote']='Catalog description, not a plot synopsis.'
        if b['id'] in date_overrides:
            d=date_overrides[b['id']]
            assert isinstance(d['start'],int) and isinstance(d['end'],int) and d['start']<=d['end'] and d['start']!=0 and d['end']!=0
            b.update(start=d['start'],end=d['end'],dateKind=d['kind'],dateConfidence=d['confidence'],dateNote=d['note'])
            for field in ['textDate','dateLayers']:
                if field in d:b[field]=d[field]
            b['provenance']=[p for p in b['provenance'] if p['fields'] not in ['Original date interval','Original publication date']]
            for source in d['sources']:
                b['provenance'].append({'fields':'Timeline date / range','source':source,'method':d['note']})
    from complete_mapping import complete_mapping
    records=complete_mapping(records)
    from expand_catalog import expand
    records=expand(records)
    # The expanded collections are appended after the original-index merge.
    for b in records:
        c=covers.get(b['id'])
        if not b.get('cover') and c:
            b.update(c)
            b['provenance'].append({'fields':'Cover / selected edition','source':c['coverSource'],'method':c['match']})
    from geography_qa import apply_geography_qa
    records=apply_geography_qa(records)
    counts={k:sum(b.get(f) is not None if f=='start' else bool(b.get(f)) for b in records) for k,f in [('dated','start'),('mapped','countries'),('classified','categories'),('covers','cover'),('languages','language'),('pageCounts','pages')]}
    counts['estimatedDates']=sum(b.get('dateConfidence')=='estimated' for b in records)
    counts.update(total=len(records),retrieved='2026-09-20',penguinEditions=sum(bool(b.get('edition')) and 'Penguin' in b.get('coverLabel','') for b in records),curatedAdditions=sum(b['id'].startswith('world-') for b in records))
    (ROOT/'data/coverage.json').write_text(json.dumps(counts,indent=2))
    missing=lambda b,f:b.get(f) is None if f=='start' else not b.get(f)
    unresolved=[{'id':b['id'],'title':b['title'],'author':b['author'],'missing':[f for f in ['start','countries','categories','cover'] if missing(b,f)]} for b in records if any(missing(b,f) for f in ['start','countries','categories','cover'])]
    (ROOT/'data/unresolved.json').write_text(json.dumps(unresolved,ensure_ascii=False,indent=2))
    print('Coverage:',counts)
    return records
