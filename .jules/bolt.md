## 2025-05-14 - [OSM Stream Optimization]
**Learning:** The OSM data streaming process in `src/osm_stream.js` was a major bottleneck because it iterated over all configured spiders for every OSM element to check for ref/ref_key matches. Since most spiders share a small number of unique `ref_keys` (like "ref" or "branch"), grouping spiders by `ref_key` reduces complexity from O(Spiders) to O(RefKeys) per element.
**Action:** Always prefer grouping by shared properties (like `ref_key`) when performing lookups across a large set of configurations against a stream of data.

## 2026-06-13 - [Memoization of URL and Phone formatting]
**Learning:** Functions involving complex string parsing or external libraries like `libphonenumber-js` and `normalize-url` are significant bottlenecks when processing large datasets (10k+ items). Caching results of these pure functions with a small LRU cache yields massive (95%+) speedups for those operations.
**Action:** Always check for repeated calls to expensive parsing/normalization functions in the sync loop and apply memoization.
