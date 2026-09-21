"""Separate origin from residence/travel; preserve stable catalog and shelf IDs."""
import json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def apply_geography_qa(books):
    decisions=json.loads((ROOT/'data/origin-decisions.json').read_text())
    work_decisions=json.loads((ROOT/'data/mapping-decisions.json').read_text())['works']
    report=[]
    for b in books:
        old=list(b['countries']); old_location=b.get('location'); old_note=b.get('locationNote')
        original_author=b['author']
        if b['title']=='Octavia' and b['author']=='Seneca':
            b['author']='Pseudo-Seneca (unknown author)'
            decision={'countries':['ITA'],'associations':['ITA'],'associationNote':'Anonymous Roman literary context; Seneca’s biography does not apply to this work.','basis':'original Roman literary context; author unknown','note':'Octavia is no longer attributed to Seneca. The anonymous Roman drama is mapped to its original Roman context, not to Seneca’s birthplace.','sources':['https://en.wikipedia.org/wiki/Octavia_(play)']}
        elif b['author']=='Petronius and Seneca' and 'Apocolocyntosis' in b['title']:
            b['author']='Seneca';b['overview']='A Roman satire mocks the deification of the emperor Claudius.';decision=decisions['Seneca']
        elif b['author']=='Petronius and Seneca' and 'Satyricon' in b['title']:
            b['author']='Petronius';decision={'countries':['ITA'],'associations':['ITA'],'associationNote':'Roman literary and career context; birthplace uncertain.','basis':'documented Roman career fallback','note':'Petronius’s birthplace and identification are uncertain. Rome is the literary and career context; Massalia is not treated as a verified birthplace.','sources':['https://en.wikipedia.org/wiki/Petronius']}
        elif b['id'] in work_decisions:
            decision=work_decisions[b['id']]
        else: decision=decisions.get(b['author']) or decisions.get(re.sub(r'\d+$','',b['author']))
        b['associationCountries']=old
        b['associationNote']=old_note or ('Imported residence/work or literary-region association'+(': '+old_location if old_location else '')+'. These are not verified birthplaces.')
        if decision:
            b['countries']=list(dict.fromkeys(decision['countries']))
            b['locationBasis']=decision['basis'];b['locationNote']=decision['note']
            b['originReview']='source-backed decision'
            b['location']=decision['note'].split('. ')[0]
            b['associationCountries']=decision.get('associations',list(dict.fromkeys(b['countries']+old)))
            if 'associationNote' in decision:b['associationNote']=decision['associationNote']
            for source in decision['sources']:
                b.setdefault('provenance',[]).append({'fields':'Author origin / literary-region mapping','source':source,'method':decision['note']})
        else:
            b['originReview']='retained geographic fallback'
            b['locationBasis']=b.get('locationBasis') or 'literary / career region fallback'
            b['locationNote']=(old_note or ('Retained documented geographic association'+(': '+old_location if old_location else '')+'.'))+' Author birthplace has not been independently resolved in this review.'
        # Keep source attribution in editions/provenance, not search aliases that would
        # incorrectly return Petronius as a Seneca-authored work.
        if b['author']!=original_author:
            b['aliases']=[a for a in b.get('aliases',[]) if a!=original_author]
        if set(old)!=set(b['countries']) or b['author']!=original_author:
            report.append({'id':b['id'],'title':b['title'],'author':b['author'],'before':old,'after':b['countries'],'reason':b['locationNote']})
    audit={'screenedWorks':len(books),'changedWorks':len(report),'sourceBackedWorks':sum(b['originReview']=='source-backed decision' for b in books),'retainedFallbackWorks':sum(b['originReview']=='retained geographic fallback' for b in books),'changes':report,'fallbacks':[{'id':b['id'],'title':b['title'],'author':b['author'],'countries':b['countries'],'basis':b['locationNote']} for b in books if b['originReview']=='retained geographic fallback']}
    (ROOT/'data/geography-audit.json').write_text(json.dumps(audit,ensure_ascii=False,indent=2))
    print('Geographic QA:',{k:v for k,v in audit.items() if isinstance(v,int)})
    return books
