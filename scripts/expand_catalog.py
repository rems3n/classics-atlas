"""Curated additions and title equivalences, applied after the original import.

Stable imported IDs preserve existing shelves and shared links. New collections
describe discovery sources, not exclusive publishing rights or complete series.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def expand(records):
    original_ids = {b['id'] for b in records}
    for b in records:
        b['collections'] = ['Penguin Classics index']
        b.setdefault('aliases', [])
        if b['id'] == '1ed729c458f3':
            b['aliases'] += ['Romance of the Three Kingdoms', 'Sanguo Yanyi', '三國演義', '三国演义']
            b['canonicalWork'] = 'Romance of the Three Kingdoms'
        elif b['id'] == '8d06d5c3ac44':
            b['aliases'] += ['Journey to the West', 'Monkey', 'Xiyou Ji', '西遊記', '西游记']
            b['canonicalWork'] = 'Journey to the West'
        elif b['title'].startswith('The Story of the Stone, vol.'):
            old = b['title']
            b['title'] = old.replace('The Story of the Stone', 'Dream of the Red Chamber')
            b['aliases'] += [old, 'The Story of the Stone', 'A Dream of Red Mansions', 'Honglou Meng', '紅樓夢', '红楼梦']
            b['canonicalWork'] = 'Dream of the Red Chamber'
            b['provenance'].append({'fields':'Alternate title', 'source':'https://en.wikipedia.org/wiki/Dream_of_the_Red_Chamber', 'method':'Same novel as The Story of the Stone. Existing five volume records and IDs retained to preserve saved reading progress.'})
        if b.get('canonicalWork'):
            b['collections'].append('China’s Four Great Classics')
            b.update(categories=['Novels'], type='Fiction', language='Chinese', tradition='Chinese')
            b['provenance'].append({'fields':'Classification and original language', 'source':b['source'], 'method':'Chinese vernacular novel; classification reviewed for the Four Great Classics collection.'})
    additions = json.loads((ROOT/'data/expanded-catalog.json').read_text())
    geo = json.loads((ROOT/'data/natural-earth.geojson').read_text())
    names = {f['properties']['ADM0_A3']:f['properties'].get('NAME_EN',f['properties']['NAME']) for f in geo['features']}
    for b in additions:
        assert b['id'] not in original_ids, b['title']
        assert b['countries'] and all(c in names for c in b['countries']), b['title']
        b['location'] = '; '.join(names[c] for c in b['countries'])
        if b['title'] == 'Water Margin': b['canonicalWork'] = 'Water Margin'
    records += additions
    assert len({b['id'] for b in records}) == len(records), 'Duplicate stable ID'
    assert original_ids <= {b['id'] for b in records}, 'Existing reading IDs lost'
    return records
