# @zodapi/core

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
