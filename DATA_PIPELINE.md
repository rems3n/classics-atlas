# Catalog enrichment

The full supplied Wikipedia index is retained. Metadata gaps remain explicit rather than being filled with guessed original dates, nationality-as-residence, edition-wide page counts, or fabricated ratings.

## Reproducible build

`python3 scripts/build.py` combines the catalog snapshot, editorial seed rows, saved Wikipedia facts, saved Wikidata work/residence facts, and saved cover matches. It requires no network and writes catalog.json, coverage.json, unresolved.json, and the portable HTML. Existing work IDs are preserved, including IDs already used by personal shelves.

## Refresh public sources

```sh
python3 scripts/enrich.py fetch-wiki
python3 scripts/enrich.py reparse
python3 scripts/enrich.py fetch-places
python3 scripts/enrich.py fetch-works
python3 scripts/enrich.py fetch-covers
python3 scripts/enrich.py rematch-covers
python3 scripts/enrich.py fetch-editions
python3 scripts/build.py
```

Requests are cached and throttled. HTTP 429 responses honor a numeric Retry-After header or wait at least 30 seconds. Failed batches are retained for later review. Cover-attempts records completed search attempts; clear selected IDs only after reviewing why a fresh lookup is needed. The optional edition-details step can be skipped: it was unable to retrieve usable page records in this environment and no page counts were imported.

Images are **not bulk downloaded**. The browser loads visible covers directly from the Covers API as Open Library requests: https://openlibrary.org/dev/docs/api/covers . A single Middlemarch image was downloaded solely for a rendering smoke test.

## Known limitations

- Wikipedia's list is not a publisher-backed inventory of every current Penguin edition.
- Title-level records group some editions/translations, not every alternate title and overlapping collection.
- Date intervals use available composition/publication evidence. Linked principal-work dates can stand in for collected-volume dates and are flagged; a complete component-work timeline is not modeled.
- Author residence/work statements can cover different life stages. Country counts are associations, not assertions that every book was written in every listed country.
- Natural Earth's coarse polygons omit some small/coastal places; unresolved coordinates are not snapped to a guessed neighboring country.
- Genre and tradition rules are browsing aids, not independent scholarly classification.
- Cover matching is automated; long anonymous-title matches and author-initial/name-variant matches are marked. Selected-edition publisher metadata can describe Penguin Random House imprints other than Penguin Classics.
- Covers are externally hosted and may fail. Their availability and copyright are not guaranteed by the catalog metadata.
- Missing fields, scores, and page counts remain unknown. See unresolved.json for the remaining work.
