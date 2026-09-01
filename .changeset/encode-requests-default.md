---
'@zodapi/client': minor
---

Breaking: params, query, and header args are now always supplied in decoded (`z.output`) form — the transport turns them into strings regardless — with codec-bearing values always `z.encode`d to their wire form, per key, so a codec (`z.stringbool()`, a date codec) can sit next to a one-way transform like `queryArray()`. Keys the input side lets the caller omit (`.default()`ed or `.optional()`) stay omittable. `encodeRequests` now governs only the request body and keeps its previous default (`false`: wire-form `z.input` bodies; `true`: decoded `z.output` bodies, `z.encode`d before sending).
