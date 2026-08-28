---
'@zodapi/client': minor
---

`onError` retry hook (client-level or per call): called with `{ error, route, alias, attempt }`
before an error is thrown; return `'retry'` to re-run the request — the `headers` function is
re-evaluated on every attempt, so refreshing an expired auth token and retrying is a one-liner.
Also, `encodeRequests` no longer requires request validation: encoding codec-bearing request data
is a serialization concern and now always runs (an invalid value still throws
`RequestValidationError`, since `z.encode` validates as it encodes).
