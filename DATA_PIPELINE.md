# Catalog enrichment

The full supplied Wikipedia index is retained. Dates now have explicit sourced or editorial assignments, with probable dates and estimated ranges visibly distinguished. Every work also has a geographic association: documented residence/work locations, author origin/birthplace, or a labeled original-work/anthology regional fallback. Origin is not presented as residence. Other metadata gaps remain explicit, including edition page counts and ratings.

## Reproducible build

`python3 scripts/build.py` combines the catalog snapshot, editorial seed rows, saved Wikipedia facts, saved Wikidata work/residence facts, and saved cover matches. It requires no network and writes catalog.json, coverage.json, unresolved.json, and the portable HTML. Existing work IDs are preserved, including IDs already used by personal shelves.

The build first runs `compile_date_decisions.py`: `date-decisions.json` contains explicit assignments for the 505 previously undated IDs; `date-verification.json` records source-supported exceptions to the default estimated/probable labels. The compiler produces `date-overrides.json` and `DATE_AUDIT.md`, including a separate Satyricon correction. The build fails if any catalog record remains undated. Edit the decision/verification inputs, not the generated catalog. `research_dates.py` is an optional, cached Wikipedia research helper; its results in `date-research.json` do not automatically establish dates.

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

## Complete geographic mapping

The merge ends with `scripts/complete_mapping.py`. It preserves established associations, applies explicit work/author decisions from `data/mapping-decisions.json`, and resolves remaining named authors from cached biography origin fields. Historical empire labels are not treated as modern borders. Translated and anonymous texts use original source traditions. The generated `data/mapping-overrides.json` and `MAPPING_AUDIT.md` record methods and sources. The build fails if any work has no location or a country code lacks a polygon/point. `data/map-places.json` supplies small-territory markers.
