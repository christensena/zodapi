---
'@zodapi/client': minor
---

Breaking: `encodeRequests` now defaults to `true` — request args are typed with `z.output` (decoded values: `Date` objects for date codecs, plain `number` for coerced params) and codec-bearing data is `z.encode`d to its wire form before sending. Keys the input side lets the caller omit (`.default()`ed or `.optional()` query params) stay optional. Pass `encodeRequests: false` (client-level or per call) to restore the previous wire-form (`z.input`) behaviour — required for schemas mixing a codec with a one-way transform like `queryArray()`, which `z.encode` rejects.
