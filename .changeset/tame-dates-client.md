---
'@zodapi/client': minor
---

Codec support (pairs with `@zodapi/codegen`'s `dates` options): calls now fail fast when the
effective validate mode would skip a codec-bearing schema, validated codec-bearing request data is
re-encoded to its wire form (a date-only codec is no longer `JSON.stringify`'d as a full
datetime), and a new `encodeRequests` option (client-level or per call) types request args as
`z.output` and lets you pass decoded values — e.g. `Date` objects — which the client `z.encode`s
onto the wire.
