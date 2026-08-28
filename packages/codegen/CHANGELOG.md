# @zodapi/codegen

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
