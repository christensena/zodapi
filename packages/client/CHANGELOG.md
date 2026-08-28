# @zodapi/client

## 0.2.0

### Minor Changes

- 39a6df6: `onError` retry hook (client-level or per call): called with `{ error, route, alias, attempt }`
  before an error is thrown; return `'retry'` to re-run the request — the `headers` function is
  re-evaluated on every attempt, so refreshing an expired auth token and retrying is a one-liner.
  Also, `encodeRequests` no longer requires request validation: encoding codec-bearing request data
  is a serialization concern and now always runs (an invalid value still throws
  `RequestValidationError`, since `z.encode` validates as it encodes).
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

- 15f515e: `fullResponse` option (client-level or per call, in either direction): calls resolve with a
  `FullResponse` envelope — `{ data, status, headers }` — instead of the bare parsed body, giving
  access to the raw response's status and headers (pagination headers, tests). `data` is validated
  and codec-decoded exactly as without the envelope, and the resolved type flips accordingly.
- d75f7d5: Codec support (pairs with `@zodapi/codegen`'s `dates` options): calls now fail fast when the
  effective validate mode would skip a codec-bearing schema, validated codec-bearing request data is
  re-encoded to its wire form (a date-only codec is no longer `JSON.stringify`'d as a full
  datetime), and a new `encodeRequests` option (client-level or per call) types request args as
  `z.output` and lets you pass decoded values — e.g. `Date` objects — which the client `z.encode`s
  onto the wire.

### Patch Changes

- Updated dependencies [154c44c]
- Updated dependencies [d75f7d5]
  - @zodapi/core@0.2.0
