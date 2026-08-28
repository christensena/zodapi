---
'@zodapi/client': minor
---

`fullResponse` option (client-level or per call, in either direction): calls resolve with a
`FullResponse` envelope — `{ data, status, headers }` — instead of the bare parsed body, giving
access to the raw response's status and headers (pagination headers, tests). `data` is validated
and codec-decoded exactly as without the envelope, and the resolved type flips accordingly.
