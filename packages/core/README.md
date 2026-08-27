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

Every zodapi server responds to request-validation failures with `400` and this body, documented as
the `ValidationError` OpenAPI component:

```json
{ "error": { "code": "VALIDATION", "target": "query", "issues": [ ... zod issues ... ] } }
```

`ValidationError` (the zod schema), `validationErrorBody(target, zodError)`, and
`isValidationErrorBody(data)` live here.

## Errors and guards

The client throws typed errors; the guards narrow them against a route's declared responses (bodies
are runtime-checked with zod):

- `ApiError` — declared non-2xx response; `UnexpectedResponseError` — undeclared status;
  `RequestValidationError` / `ResponseValidationError` — client-side validation failures.
- `isErrorFromRoute(route, err)` / `isErrorFromAlias(routes, alias, err)` — narrow to the route's
  declared error union (zodios `isErrorFromPath` / `isErrorFromAlias` equivalents).
- `matchErrorByStatus(route, err, 409)` — narrow to one declared status.
- `isValidationError(err)` — the fixed 400 shape above.
- `isAxiosErrorFromRoute(route, err)` — same narrowing on a raw `AxiosError`, for code using axios
  directly rather than the zodapi client.

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
