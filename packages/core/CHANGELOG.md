# @zodapi/core

## 0.4.0

### Minor Changes

- 3804f0e: Generated contracts now emit `route({ ... })` from `@zodapi/core` instead of a plain object
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

- 60550c5: `route()` now lives here, so a contract depends on `zod` and `@zodapi/core` only.

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

### Patch Changes

- 6d5ef1f: Two fixes from adoption feedback:

  - `alias` is now a non-enumerable property on the built route (like `getRoutingPath`), so it no longer leaks into the generated OpenAPI document. It is still readable as `route.alias` everywhere.
  - The built route's type writes `readonly` back off the documentation arrays (`security`, `tags`, `servers`, `parameters`). Configs captured readonly — `as const` contract values, or plain inline literals under `route()`'s `const` type parameter — previously made the route unassignable to `app.openapi(...)`, collapsing `c.req.valid()` to `never`.

- 8325e89: `route()` now rejects at compile time params/query value schemas that can never match the wire's raw strings — a bare `z.number()` or `z.boolean()` type-checks but fails validation with a 400 on every request. Use coercing schemas instead: `z.coerce.number()` or `z.stringbool()` (not `z.coerce.boolean()`, whose JS truthiness turns `"false"` into `true`). Don't pass a type argument to `z.coerce.number` here: `z.coerce.number<number>()` narrows the declared input and is structurally identical to `z.number()` at the type level, so it is rejected too. Contracts that trip the new check were already failing every request at runtime.

  `queryArray()` documents that item schemas see raw wire strings and need the same treatment.

## 0.3.0

### Minor Changes

- f1d047e: `route()` no longer skips the `ValidationError` merge when a route declares its own 400: the `application/problem+json` content is merged into the declared 400's content map (kept verbatim when the route already declares problem+json), so the OpenAPI doc covers both bodies such a route can emit — its custom one and `createApp()`'s validation failure. Client-side, narrowing to a merged 400 gives the union of both bodies; `isValidationError` tells them apart. The error guards in `@zodapi/core` now accept a body matching any of a response's declared json content schemas (new `jsonSchemasOfResponse` helper), not just the first.

## 0.2.1

### Patch Changes

- 645feb2: Add `repository` metadata so npm links each package back to its source directory

## 0.2.0

### Minor Changes

- 154c44c: Standardise the fixed 400 validation error on RFC 9457 problem details and add pluggable error
  decoders.

  **Breaking — new 400 wire shape.** The `ValidationError` body is now an RFC 9457 problem served as
  `application/problem+json`, discriminated by `type: "urn:zodapi:validation"` and carrying `target`
  and the zod `issues` as extension members (the previous `{ error: { code: 'VALIDATION', ... } }`
  envelope is gone). `@zodapi/hono` emits the new shape/content type from `createApp()` and documents
  the 400 under `application/problem+json`.

  **Breaking — error renames.** `UnexpectedResponseError` is now `UnexpectedResponseApiError` and
  extends `ApiError`.

  **New — one validation-error path for any backend.** The client runs non-2xx responses through
  pluggable error decoders (`ClientOptions.decoders`). Server-side validation failures throw
  `ValidationApiError` whose `error` is a real `z.ZodError` revived from the server's issues, so
  `z.flattenError`/form mapping handle client- and server-side failures identically; other recognised
  problem+json responses throw `ProblemApiError`. zodapi's own decoder is registered by default;
  `problemDetails({ contentTypes, sniff, keyCasing, jsonPathKeys })` opts in foreign RFC 9457 backends
  (e.g. ASP.NET `ValidationProblemDetails`, keys camelCased and split into zod paths). Generated
  contracts from `@zodapi/codegen` now export a detected `problemFlavor` to feed
  `decodersFor(problemFlavor)`.

- d75f7d5: New `schemaContainsCodec(schema)`: true when a `z.codec` occurs anywhere in a schema tree
  (distinguishing codecs from one-way `.transform()` / `z.preprocess()` pipes such as
  `queryArray()`). Used by `@zodapi/client` to fail fast when validation is off for a codec-bearing
  schema.
