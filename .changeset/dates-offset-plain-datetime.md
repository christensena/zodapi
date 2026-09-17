---
'@zodapi/codegen': patch
---

`--dates-offset` now widens plain `format: date-time` schemas, not just date codecs. Backends that serialize a UTC offset (`+00:00`) rather than `Z` were rejected by the generated `z.iso.datetime()` unless `--dates-datetime` was also on.
