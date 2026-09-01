# @zodapi/codegen

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

## 0.3.1

### Patch Changes

- 645feb2: Add `repository` metadata so npm links each package back to its source directory

## 0.3.0

### Minor Changes

- 6a21b43: `docs` option (CLI `--docs jsdoc|meta|none`) controlling how OpenAPI documentation
  (`title`/`description`/`examples`/`deprecated`, operation summaries/tags) is emitted. The new
  default is `'jsdoc'`: JSDoc comments on component consts, object properties, parameters, and route
  consts — hover docs with zero runtime weight, no `.meta()` calls, no route doc fields. `'meta'`
  restores the previous full-fidelity output (`.meta({ id, ... })` registration plus
  `operationId`/`summary`/`description`/`tags` route fields — required to regenerate a spec from the
  contract); `'none'` drops documentation entirely. `default` values, response descriptions, and
  `alias` are structural and kept in every mode.

## 0.2.0

### Minor Changes

- b98cc3f: New package: generate a zodapi contract (zod schemas + `RouteDef` route objects) from an OpenAPI 3.1
  document, for backends not written in TypeScript. Ships a `zodapi-codegen` CLI and a
  `generateContract()` API; fidelity is enforced by a round-trip test (contract → OpenAPI → generator
  → OpenAPI must be identical).
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

- 56da36a: Emit `z.discriminatedUnion(...)` for `oneOf`/`anyOf` schemas carrying an OpenAPI `discriminator`,
  instead of a plain `z.union(...)` — better error messages and O(1) parse dispatch. Falls back
  silently to `z.union` whenever the members cannot be proven safe (a non-`$ref` or forward-reference
  member, a member without a `const`/string-enum discriminator property, or a `mapping` that
  disagrees with the members); a `{type: "null"}` member becomes `.nullable()` on the union.
- d75f7d5: Optional `Date` conversion for ISO strings: `generateContract(doc, { dates: { datetime, date, offset } })`
  (CLI: `--dates-datetime`, `--dates-date`, `--dates-offset`). Matching `format: date-time` / `date`
  fields are emitted as bidirectional `z.codec`s (shared `isoDatetimeToDate` / `isoDateToDate`
  helpers; inlined when wire-side constraints or a `default` apply), so responses parse to `Date`
  and requests encode back to wire strings. Round-trip fidelity to the source document is preserved.
- 5f01e34: Optional `type <Name> = z.infer<typeof <Name>>` aliases per component schema (the zodios codegen
  convention): `generateContract(doc, { exportTypes: true })` / CLI `--export-types`.
