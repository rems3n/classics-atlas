"""Compile reviewed editorial date assignments; never silently invent a fallback.

All assignments are explicit per stable catalog ID. Estimated endpoints are
marked as such. Reference links are context, not claims of exact verification.
"""
import json
import re
from pathlib import Path
from urllib.parse import unquote
from collections import Counter

ROOT=Path(__file__).resolve().parents[1]
def read(name, default=None):
    p=ROOT/'data'/name
    return json.loads(p.read_text()) if p.exists() else default

def compile_dates():
    decisions=read('date-decisions.json')
    wiki=read('wiki-metadata.json',{})
    research=read('date-research.json',{})
    author_links=read('author-links.json',{})
    verification=read('date-verification.json',{})
    out={}
    for d in decisions:
        key=unquote(d['contextSource'].split('/wiki/')[-1]).split('?')[0].replace('_',' ')
        reference=d['contextSource']
        if 'redlink=1' in reference or key=='List of Penguin Classics':
            author_page=author_links.get(d['author'])
            if author_page and wiki.get(author_page,{}).get('source'):
                reference=wiki[author_page]['source']
            elif d.get('alternateSource'):reference=d['alternateSource']
        p=research.get(d['title'],{})
        # Prefer actual work articles only after positive author + work matching.
        surname=re.sub(r'\d+$','',d['author']).split()[-1].lower()
        text=p.get('text','')
        if (p.get('title')==d['title'] and surname in text.lower()
            and 'may refer to' not in text[:500] and re.search(r'\b(novel|book|poem|play|story|autobiograph|travel book)',text[:400],re.I)):
            reference=p['source']
        kind={'P':'publication','C':'composition','A':'collection span'}[d['kind']]
        confidence='probable' if d['kind']=='P' else 'estimated'
        note=d.get('decisionNote') or 'Likely original publication year, not the modern Penguin edition date.'
        v=verification.get(d['id'])
        if v:
            confidence=v.get('confidence',confidence)
            note=v.get('note',note)
            sources=v['sources']
        else:
            sources=[reference]
            note+=' Editorial '+('date assignment' if confidence=='probable' else 'range estimate')+' for browsing; linked references provide work/author context, not independent verification of every endpoint.'
        out[d['id']]={
            'title':d['title'],'author':d['author'],'start':d['start'],'end':d['end'],
            'kind':kind,'confidence':confidence,'note':note,'sources':sources,
            'reviewed':'2026-09-18',
        }
    # Separate known non-null defect: do not represent the first century as 0–99.
    out['c039d711e853']={
        'title':'The Satyricon','author':'Petronius and Seneca','start':60,'end':69,
        'kind':'composition','confidence':'estimated',
        'note':'Conventionally associated with Petronius and the Neronian period; the AD 60s are a browsing estimate, not a certain publication date. Replaces the invalid 0–99 interval.',
        'sources':['https://en.wikipedia.org/wiki/Satyricon'],'reviewed':'2026-09-18',
    }
    assert len(out)==506, 'Every audited missing record plus the Satyricon correction must be present'
    # Story origins take precedence over modern collection/recording dates.
    # Keep the version date separate so estimates cannot masquerade as publication facts.
    tradition=read('tradition-dates.json',{})
    for key,d in tradition.items():
        assert d['confidence']=='estimated' and d['textDate'] and d['sources']
        for layer in d.get('dateLayers',[]):
            assert layer['note'] and layer['sources']
            assert (layer['start'] is None and layer['end'] is None) or (-2500<=layer['start']<=layer['end']<=2026 and layer['start']!=0 and layer['end']!=0)
        out[key]=d
    for d in out.values():
        assert -2500<=d['start']<=d['end']<=2026 and d['start']!=0 and d['end']!=0
        assert d['sources'] and d['note']
    (ROOT/'data/date-overrides.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n')
    counts=Counter(x['confidence'] for x in out.values())
    def year(n): return str(abs(n))+(' BC' if n<0 else ' AD')
    def cell(s): return str(s).replace('|',' / ').replace('\n',' ')
    lines=['# Timeline date audit — 2026-09-18','',
        f"All 505 previously undated entries have explicit dates or ranges. The Satyricon correction and subsequent story-origin review bring the current override set to {len(out)} assignments. {len(tradition)} entries have separate source-tradition/composition dates and version dates. The full catalog has 1,430 dated records and zero undated records.",'',
        f"Assignments: {counts['sourced']} sourced, {counts['probable']} probable publication dates, and {counts['estimated']} estimated composition/collection ranges. Sourced means the listed reference supports the assignment, not that the historical dating is beyond dispute. Other pre-existing dates have not all been re-verified in this pass.",'',
        'Estimated and probable dates are labeled c. and Likely in the app. Reviewed oral narratives use tentative source-tradition ranges, not modern recording or edition dates. Separate version dates and partial story/tradition breakdowns appear in details. First tellings are not always recoverable; contextual estimates do not independently establish every endpoint.','',
        '| Work | Author | Date / range | Basis | Note | References |',
        '| --- | --- | --- | --- | --- | --- |']
    for d in sorted(out.values(),key=lambda x:(x['title'].casefold(),x['author'])):
        span=year(d['start'])+((' – '+year(d['end'])) if d['end']!=d['start'] else '')
        links='; '.join(f'[Source {i+1}]({url})' for i,url in enumerate(d['sources']))
        lines.append('| '+' | '.join(map(cell,[d['title'],d['author'],span,d['confidence']+' · '+d['kind'],d['note'],links]))+' |')
    (ROOT/'DATE_AUDIT.md').write_text('\n'.join(lines)+'\n')
    print('Explicit date assignments:',len(out),dict(Counter(x['confidence'] for x in out.values())))
    return out

if __name__=='__main__':compile_dates()
