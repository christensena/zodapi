---
'@zodapi/core': minor
---

New `schemaContainsCodec(schema)`: true when a `z.codec` occurs anywhere in a schema tree
(distinguishing codecs from one-way `.transform()` / `z.preprocess()` pipes such as
`queryArray()`). Used by `@zodapi/client` to fail fast when validation is off for a codec-bearing
schema.
