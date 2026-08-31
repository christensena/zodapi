---
'@zodapi/codegen': minor
'@zodapi/core': minor
---

Generated contracts now emit `route({ ... })` from `@zodapi/core` instead of a plain object
`satisfies RouteDef`, so a contract generated from an OpenAPI document mounts on a `createApp()`
server as well as feeding `createClient()` — `app.openapi()` needs the `getRoutingPath()` that
`route()` attaches. The `GeneratedRoute` helper type is gone; the operation documentation fields it
carried are part of the config `route()` accepts.

Two consequences of going through `route()`. An operation whose spec declares no `400` now gets the
zodapi `ValidationError` response injected, and one that declares its own keeps it with the
problem+json content merged alongside — previously the spec's responses were emitted verbatim. And
a templated path whose parameter the spec never declares now throws when the generated module is
imported, rather than producing a route that 400s on every request.

Numeric and boolean path and query parameters are wrapped in `wireNumber(...)` / `wireBoolean(...)`
so they decode the raw strings the wire delivers; without that, `route()`'s wire-string check
rejects them at compile time. These preserve the declared schema, so the document generated from
the contract still equals the source document — `z.coerce.number()` and `z.stringbool()` would not
(a bare `z.coerce.number()` documents itself as `type: ["number", "null"]`, `z.stringbool()` as
`type: "string"`).

Adds `wireNumber(schema)` and `wireBoolean(schema)` beside `queryArray`: they let a numeric or
boolean params/query schema accept the raw string the wire delivers, without altering the schema
itself or the OpenAPI document generated from it. Written for `@zodapi/codegen`, which has to
reproduce a source specification exactly; a hand-written contract has no such constraint and should
keep using `z.coerce.number()` / `z.stringbool()`.
