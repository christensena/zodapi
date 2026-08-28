# @zodapi/core

Shared foundation of [zodapi](https://github.com/christensena/zodapi): contract types, the fixed
`ValidationError` 400 shape, typed error classes + guards, and the `queryArray` helper. No HTTP
dependencies — servers, clients, and generated contracts all build on this.

## Contract types

`RouteDef` is the structural shape of a route definition — `createRoute()` from
`@hono/zod-openapi` (and `route()` from `@zodapi/hono`) produce objects satisfying it, so contracts
can be shared with `@zodapi/client` without importing hono:

```ts
interface RouteDef {
  method: Method // 'get' | 'post' | ...
  path: string // '/users/{id}'
  alias?: string // zodios-style client method name
  request?: { params?; query?; headers?; cookies?; body? }
  responses: Record<string | number, { description?; content? }>
}
```

Type helpers derive everything a typed client needs from a route: `SuccessData` (union of 2xx json
bodies), `ErrorVariant` (discriminated union of declared non-2xx responses as `{ status, data }`),
`JsonBodySchema`, `AliasOf`, `RouteByAlias`, and more. Runtime helpers `jsonSchemaOfResponse` and
`responseDefForStatus` resolve response definitions (honouring `4XX` ranges and `default`).

## The fixed validation-error shape

Every zodapi server responds to request-validation failures with `400` as an
[RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) problem
(`Content-Type: application/problem+json`), discriminated by its `type` URI and carrying the zod
issues and failing request target as extension members. Documented as the `ValidationError` OpenAPI
component:

```json
{
  "type": "urn:zodapi:validation",
  "status": 400,
  "target": "query",
  "issues": [ ... zod issues ... ]
}
```

`ValidationError` (the zod schema), `ProblemDetails` (the generic RFC 9457 shape),
`validationErrorBody(target, zodError)`, `isValidationErrorBody(data)`,
`PROBLEM_JSON_CONTENT_TYPE`, and `ZODAPI_VALIDATION_TYPE` live here.

## Errors and guards

The client throws typed errors; the guards narrow them against a route's declared responses (bodies
are runtime-checked with zod):

- `ApiError` — declared non-2xx response; `UnexpectedResponseApiError` — undeclared status;
  `RequestValidationError` / `ResponseValidationError` — client-side validation failures.
- `ValidationApiError` — a decoded server-side validation failure. Its `error` is a real
  `z.ZodError` revived from the server's issues, so `z.flattenError` / `z.treeifyError` and existing
  form-mapping code handle server and client failures identically; `target` says which request part
  failed when known.
- `ProblemApiError` — a decoded non-validation problem+json response; `problem` is the parsed
  RFC 9457 body, extension members included.
- `isErrorFromRoute(route, err)` / `isErrorFromAlias(routes, alias, err)` — narrow to the route's
  declared error union (zodios `isErrorFromPath` / `isErrorFromAlias` equivalents).
- `matchErrorByStatus(route, err, 409)` — narrow to one declared status.
- `isValidationError(err)` — the fixed 400 shape above.
- `isAxiosErrorFromRoute(route, err)` — same narrowing on a raw `AxiosError`, for code using axios
  directly rather than the zodapi client.

## Error decoders

Decoders turn recognised non-2xx responses into the typed errors above, keyed by media type first
(the RFC 9457 way), so one client-side error path works against any backend:

- `zodapiValidationDecoder` — zodapi's own 400 (`type: urn:zodapi:validation`); losslessly revives
  the zod issues. Registered by default in `@zodapi/client`.
- `problemDetails(options?)` — foreign RFC 9457 backends (ASP.NET, Spring, ...). A
  `ValidationProblemDetails`-style `errors` map becomes a `ValidationApiError` (keys split into zod
  paths, `keyCasing` defaults to `'camel'`, `$.`-rooted JSON keys stripped via `jsonPathKeys`);
  other problems become `ProblemApiError`. `contentTypes` and `sniff` control detection.
- `decodersFor(problemFlavor, options?)` — the right decoder list for a generated contract's
  `problemFlavor` (see `@zodapi/codegen`).

## Query arrays

zodapi serialises query arrays as `a[]=1&a[]=2`. Declare them with `queryArray(item)` — it wraps a
lone value into a one-element array before `z.array(item)`, because Hono hands single-occurrence
keys to the schema as a bare string.

## Install

```sh
pnpm add @zodapi/core zod
```

See the [zodapi monorepo](https://github.com/christensena/zodapi) for the full picture:
`@zodapi/hono` (server), `@zodapi/client` (typed client), `@zodapi/codegen` (contracts from OpenAPI
docs for non-TypeScript backends).
