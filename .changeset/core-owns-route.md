---
'@zodapi/core': minor
---

`route()` now lives here, so a contract depends on `zod` and `@zodapi/core` only.

It previously came from `@zodapi/hono`, whose `createRoute` import pulled the `@hono/zod-openapi`
barrel — `hono`, `@asteasolutions/zod-to-openapi`, `openapi3-ts` and `yaml` — into every package
holding a contract. Bundlers that do not tree-shake within modules shipped all of it to clients
that never call it, and `sideEffects: false` could not help: the barrel runs
`extendZodWithOpenApi(z)` at import time. The eight lines of `createRoute` that `route()` actually
used are inlined instead.

Behaviour is unchanged — the injected `400`, the `body.required` default, the path-param and
wire-string checks, and `alias` all work as before, and the emitted OpenAPI document is
byte-identical. The result still carries a non-enumerable `getRoutingPath()`, so it drops straight
into `app.openapi(...)`.

Name OpenAPI components with zod's own `.meta({ id: 'User' })`. `.openapi('User')` is a prototype
method patched on by importing `@hono/zod-openapi`, so a contract using it stays coupled to hono;
both produce the same `$ref`.

`ZodapiRouteConfig` is now defined in terms of zod types rather than re-exporting hono's
`RouteConfig`. The request and response shapes are exact; the OpenAPI documentation fields are
typed loosely, and anything they let through is still caught by `app.openapi(...)`. One deliberate
narrowing: `method` does not accept OAS 3.2's `'query'`, matching `RouteDef['method']`, which
drives the client.
