# @zodapi/hono

## 0.4.0

### Minor Changes

- 60550c5: `@zodapi/hono` is now server-only: it exports `createApp()` (plus `OpenAPIHono` and `createRoute`
  from `@hono/zod-openapi`) and nothing else. Contracts no longer import it, so they no longer pull
  hono into client bundles.

  Everything else it re-exported moved to, or was already in, `@zodapi/core` — import from there
  instead: `route`, `validationErrorResponse`, `ZodapiRoute`, `ZodapiRouteConfig`, `queryArray`,
  `ValidationError`, `PROBLEM_JSON_CONTENT_TYPE`, `ZODAPI_VALIDATION_TYPE`.

  The `z` re-export is gone; use `import { z } from 'zod'`. It was `@hono/zod-openapi`'s re-export of
  the same zod instance, and importing it was enough to drag the whole hono chain into a contract.
  It also carried the `.openapi()` prototype method — replace `.openapi('User')` with zod's
  `.meta({ id: 'User' })`, which produces the same component and `$ref`.

  ```diff
  - import { queryArray, route, z } from '@zodapi/hono'
  + import { queryArray, route } from '@zodapi/core'
  + import { z } from 'zod'
  ```

  The `hono` peer range is now `^4.10.0` rather than `>=4.10.0`: `@zodapi/core` models hono's
  `RouteConfig` structurally, and an unbounded range let a future major widen it with no signal.

- 8325e89: `route()` now rejects at compile time params/query value schemas that can never match the wire's raw strings — a bare `z.number()` or `z.boolean()` type-checks but fails validation with a 400 on every request. Use coercing schemas instead: `z.coerce.number()` or `z.stringbool()` (not `z.coerce.boolean()`, whose JS truthiness turns `"false"` into `true`). Don't pass a type argument to `z.coerce.number` here: `z.coerce.number<number>()` narrows the declared input and is structurally identical to `z.number()` at the type level, so it is rejected too. Contracts that trip the new check were already failing every request at runtime.

  `queryArray()` documents that item schemas see raw wire strings and need the same treatment.

### Patch Changes

- Updated dependencies [3804f0e]
- Updated dependencies [60550c5]
- Updated dependencies [6d5ef1f]
- Updated dependencies [8325e89]
  - @zodapi/core@0.4.0

## 0.3.0

### Minor Changes

- f1d047e: `route()` no longer skips the `ValidationError` merge when a route declares its own 400: the `application/problem+json` content is merged into the declared 400's content map (kept verbatim when the route already declares problem+json), so the OpenAPI doc covers both bodies such a route can emit — its custom one and `createApp()`'s validation failure. Client-side, narrowing to a merged 400 gives the union of both bodies; `isValidationError` tells them apart. The error guards in `@zodapi/core` now accept a body matching any of a response's declared json content schemas (new `jsonSchemasOfResponse` helper), not just the first.

### Patch Changes

- Updated dependencies [f1d047e]
  - @zodapi/core@0.3.0

## 0.2.1

### Patch Changes

- 645feb2: Add `repository` metadata so npm links each package back to its source directory
- Updated dependencies [645feb2]
  - @zodapi/core@0.2.1

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

### Patch Changes

- Updated dependencies [154c44c]
- Updated dependencies [d75f7d5]
  - @zodapi/core@0.2.0
