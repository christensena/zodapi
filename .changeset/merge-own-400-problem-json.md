---
'@zodapi/hono': minor
'@zodapi/core': minor
---

`route()` no longer skips the `ValidationError` merge when a route declares its own 400: the `application/problem+json` content is merged into the declared 400's content map (kept verbatim when the route already declares problem+json), so the OpenAPI doc covers both bodies such a route can emit — its custom one and `createApp()`'s validation failure. Client-side, narrowing to a merged 400 gives the union of both bodies; `isValidationError` tells them apart. The error guards in `@zodapi/core` now accept a body matching any of a response's declared json content schemas (new `jsonSchemasOfResponse` helper), not just the first.
