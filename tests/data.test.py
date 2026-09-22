"""Source parser regressions and bibliographic data invariants."""
import json, sys, unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from enrich import fields, normal
from merge_metadata import dates

class MetadataTests(unittest.TestCase):
    def test_empty_infobox_fields_do_not_swallow_next_field(self):
        f=fields('{{Infobox book\n| author =\n| genre = Novel\n| language = French\n| published = 1857\n}}')
        self.assertEqual(f['author'],'')
        self.assertEqual(f['genre'],'Novel')
        self.assertEqual(f['language'],'French')
    def test_original_date_not_later_edition(self):
        self.assertEqual(dates({'published':'1800 (English translation)'},'1568 book'),(1568,1568))
        self.assertEqual(dates({'published':'1871–1872'},''),(1871,1872))
        self.assertEqual(dates({'published':'400 BC'},''),(-400,-400))
        self.assertEqual(dates({'premiere_date':'{{circa|1595–96}}'},''),(1595,1596))
    def test_non_latin_author_names_do_not_collapse_to_empty(self):
        self.assertTrue(normal('Όμηρος'))
        self.assertNotEqual(normal('Όμηρος'),normal('Πλάτων'))
        self.assertEqual(normal('Charlotte Brontë'),normal('Charlotte Bronte'))
    def test_cover_and_edition_integrity(self):
        books=json.loads((ROOT/'data/catalog.json').read_text())
        for b in books:
            self.assertEqual(len(b['countries']),len(set(b['countries'])))
            if b.get('cover'):
                if b.get('coverProvider')=='Publisher':
                    self.assertTrue(b['cover'].startswith(('https://cup-us.imgix.net/','https://cdn.prod.website-files.com/','https://ingram-nyu.imgix.net/','https://cdn.penguin.co.uk/')))
                    self.assertEqual(b['coverSource'],b['source'])
                else:
                    self.assertTrue(b['cover'].startswith('https://covers.openlibrary.org/b/id/'))
                    self.assertTrue(b['coverSource'].startswith('https://openlibrary.org/'))
                self.assertTrue(b['provenance'])
            if b.get('pages'):
                self.assertTrue(b.get('edition'))
                self.assertTrue(0<b['pages']<20000)
            if b['start'] is not None:self.assertLessEqual(b['start'],b['end'])
    def test_coverage_matches_catalog(self):
        books=json.loads((ROOT/'data/catalog.json').read_text())
        c=json.loads((ROOT/'data/coverage.json').read_text())
        self.assertEqual(c['total'],len(books))
        self.assertEqual(c['covers'],sum(bool(b['cover']) for b in books))
        self.assertEqual(c['dated'],sum(b['start'] is not None for b in books))
    def test_every_work_has_a_renderable_location(self):
        books=json.loads((ROOT/'data/catalog.json').read_text())
        geometry=json.loads((ROOT/'data/natural-earth.geojson').read_text())
        places=json.loads((ROOT/'data/map-places.json').read_text())
        ids={f['properties']['ADM0_A3'] for f in geometry['features']}|{p['id'] for p in places}
        self.assertEqual(len(books),1492)
        for b in books:
            self.assertTrue(b['countries'],b['title'])
            self.assertTrue(set(b['countries'])<=ids,b['title'])
        overrides=json.loads((ROOT/'data/mapping-overrides.json').read_text())
        for d in overrides.values():
            self.assertTrue(d['basis'])
            self.assertTrue(d['note'])
            self.assertTrue(d['sources'])
        by_id={b['id']:b for b in books}
        for key,codes in [('1264b8238e90',['EGY']),('b91967ed48c3',['SAU']),('5bc2b8a65668',['JPN']),('550f0836c359',['PRI'])]:
            self.assertEqual(by_id[key]['countries'],codes)
        for author,code in [('Mary Prince','BMU'),('Black Hawk','USA'),('Zitkala-Ša','USA'),('Joseph Conrad','UKR')]:
            matches=[b for b in books if b['author']==author and b['id'] in overrides]
            self.assertTrue(matches,author)
            self.assertTrue(all(code in b['countries'] for b in matches),author)
        self.assertEqual(json.loads((ROOT/'data/coverage.json').read_text())['mapped'],1492)
    def test_expansion_preserves_ids_and_provenance(self):
        books=json.loads((ROOT/'data/catalog.json').read_text())
        baseline=set(json.loads((ROOT/'data/baseline-ids.json').read_text()))
        self.assertEqual(len(baseline),1430)
        self.assertTrue(baseline <= {b['id'] for b in books})
        additions=[b for b in books if b['id'] not in baseline]
        # 49 curated world-classics additions plus 13 reading-path additions (data/path-books.json).
        self.assertEqual(len(additions),62)
        self.assertEqual(len({b['id'] for b in books}),len(books))
        for b in additions:
            self.assertTrue(b['provenance'],b['title'])
            self.assertTrue(b['dateNote'],b['title'])
            self.assertTrue(b['locationNote'],b['title'])
            self.assertTrue(b['collections'],b['title'])
            self.assertTrue(b['categories'],b['title'])
        four={b.get('canonicalWork') for b in books if 'China’s Four Great Classics' in b['collections']}
        self.assertEqual(four,{'Romance of the Three Kingdoms','Water Margin','Journey to the West','Dream of the Red Chamber'})

    def test_early_and_uncertain_dates(self):
        self.assertEqual(dates({'release_date':'Completed work published [[AD]] 426'},''),(426,426))
        self.assertEqual(dates({'published':'350–300 BCE'},''),(-350,-300))
        self.assertEqual(dates({'published':'4th century BC'},''),(-400,-301))
        self.assertEqual(dates({'published':'1st century AD'},''),(1,100))
    def test_complete_date_coverage_and_no_year_zero(self):
        books=json.loads((ROOT/'data/catalog.json').read_text())
        self.assertEqual(len(books),1492)
        for b in books:
            self.assertIsInstance(b['start'],int,b['title'])
            self.assertIsInstance(b['end'],int,b['title'])
            self.assertNotEqual(b['start'],0,b['title'])
            self.assertNotEqual(b['end'],0,b['title'])
            self.assertLessEqual(b['start'],b['end'],b['title'])
            self.assertGreaterEqual(b['start'],-2500,b['title'])
            self.assertLessEqual(b['end'],2026,b['title'])
    def test_explicit_date_decisions_have_provenance(self):
        overrides=json.loads((ROOT/'data/date-overrides.json').read_text())
        books={b['id']:b for b in json.loads((ROOT/'data/catalog.json').read_text())}
        reviewed=json.loads((ROOT/'data/date-decisions.json').read_text())
        traditions=json.loads((ROOT/'data/tradition-dates.json').read_text())
        self.assertEqual(set(overrides),{x['id'] for x in reviewed}|{'c039d711e853'}|set(traditions))
        for key,d in overrides.items():
            b=books[key]
            self.assertEqual((b['start'],b['end']),(d['start'],d['end']))
            self.assertIn(d['confidence'],['sourced','estimated','probable'])
            self.assertTrue(d['note'])
            self.assertTrue(d['sources'])
            self.assertTrue(any(p['fields']=='Timeline date / range' for p in b['provenance']))
        self.assertEqual(books['550f0836c359']['start'],1911)
        self.assertEqual((books['ad76f6ff8b40']['start'],books['ad76f6ff8b40']['end']),(-362,-350))
        self.assertEqual(books['c039d711e853']['start'],60)

    def test_story_origins_are_separate_from_later_versions(self):
        books={b['id']:b for b in json.loads((ROOT/'data/catalog.json').read_text())}
        decisions=json.loads((ROOT/'data/tradition-dates.json').read_text())
        self.assertEqual(len(decisions),14)
        for key,d in decisions.items():
            b=books[key]
            self.assertEqual((b['start'],b['end']),(d['start'],d['end']))
            self.assertEqual(b['textDate'],d['textDate'])
            self.assertEqual(b['dateConfidence'],'estimated')
            self.assertTrue(b['dateNote'])
            self.assertTrue(d['sources'])
        self.assertEqual((books['128c93724417']['start'],books['128c93724417']['end']),(1400,1800))
        self.assertEqual(books['128c93724417']['textDate']['start'],1922)
        african=books['5739e0183ff5']
        self.assertLess(african['start'],-1000)
        self.assertEqual(len(african['dateLayers']),5)
        self.assertTrue(any(x['start'] is None for x in african['dateLayers']))
        self.assertEqual(books['066833687d73']['start'],1835,'Andersen original literary tales must not be backdated wholesale')

    def test_origin_and_association_codes_remain_renderable(self):
        books=json.loads((ROOT/'data/catalog.json').read_text())
        geo=json.loads((ROOT/'data/natural-earth.geojson').read_text())
        valid={f['properties']['ADM0_A3'] for f in geo['features']}|{p['id'] for p in json.loads((ROOT/'data/map-places.json').read_text())}
        for b in books:
            self.assertTrue(set(b['associationCountries'])<=valid,b['title'])
            self.assertTrue(set(b['countries'])<=set(b['associationCountries']),b['title'])
            self.assertTrue(b['locationBasis'])
        audit=json.loads((ROOT/'data/geography-audit.json').read_text())
        self.assertEqual(audit['screenedWorks'],len(books))
        self.assertEqual(audit['sourceBackedWorks']+audit['retainedFallbackWorks'],len(books))
        # Reading-path additions go through the same geography review as the rest of the catalog.
        path_ids={b['id'] for b in json.loads((ROOT/'data/path-books.json').read_text())}
        self.assertEqual(len(path_ids),13)
        by_id={b['id']:b for b in books}
        for i in path_ids:
            b=by_id[i]
            self.assertEqual(b['originReview'],'source-backed decision',b['title'])
            self.assertTrue(set(b['countries'])<=set(b['associationCountries']),b['title'])
            self.assertTrue(any(p['fields']=='Author origin / literary-region mapping' for p in b['provenance']),b['title'])
        forna=next(by_id[i] for i in path_ids if by_id[i]['title']=='The Memory of Love')
        self.assertEqual(forna['countries'],['GBR']);self.assertIn('SLE',forna['associationCountries'])
    def test_historical_snapshots_have_real_dated_sources(self):
        from historical_maps import historical_maps
        h=historical_maps()
        self.assertEqual(len(h['presets']),12)
        self.assertEqual(len(h['source']['revision']),40)
        self.assertTrue((ROOT/'data/historical/LICENSE').exists())
        for p in h['presets']:
            self.assertGreater(len(p['features']),50)
            self.assertTrue((ROOT/'data/historical'/p['file']).exists())
            for f in p['features']:
                self.assertIn(f['geometry']['type'],['Polygon','MultiPolygon'])
                self.assertTrue(f['properties']['name'])
        self.assertEqual(next(p['year'] for p in h['presets'] if p['id']=='rome'),100)

if __name__=='__main__':unittest.main()
