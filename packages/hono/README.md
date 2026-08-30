# @zodapi/hono

Thin preset over [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi)
for [zodapi](https://github.com/christensena/zodapi): a `createApp()` factory and a `route()` helper
that bake in the zodapi conventions while keeping idiomatic Hono (`c.req.valid`, RPC types, `.doc31`).

## route()

`createRoute` plus conventions:

- merges a `400` `ValidationError` response into `responses`, so docs and client error types
  include it; a route declaring its own 400 gets the problem+json content merged into it instead
  (kept verbatim when it already declares `application/problem+json`)
- defaults `request.body.required` to `true`, so a missing/mismatched `Content-Type` fails
  validation instead of silently skipping it
- checks `{...}` path params against the params schema keys — both as a compile-time error and a
  definition-time throw on mismatch
- rejects at compile time params/query value schemas that can never match the wire's raw strings
  (see [below](#params-and-query-are-strings-on-the-wire))
- carries an optional `alias` for zodios-style client method names

```ts
import { route, z } from '@zodapi/hono'

export const getUser = route({
  alias: 'getUser',
  method: 'get',
  path: '/users/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'The user', content: { 'application/json': { schema: User } } },
    404: { description: 'Missing', content: { 'application/json': { schema: NotFound } } },
  },
})
```

The result is a plain route object: pass it to `app.openapi(...)` on the server and into
`createClient([...])` from `@zodapi/client`.

A route that declares its own `400` keeps it, with the `ValidationError` problem+json content
merged into its `content` map — such a route can genuinely respond 400 two ways (its custom body
from the handler, and the zodapi validation failure from `createApp()`'s hook), and the OpenAPI
doc now covers both. The content types disambiguate client-side: error decoding is keyed on the
`application/problem+json` media type, so the custom `application/json` 400 body is not decoded —
it throws a plain `ApiError`, narrowed with the guards like any other declared status (to the
union of both bodies; `isValidationError` tells them apart) — while a validation failure decodes
into `ValidationApiError`. A route that declares its own `application/problem+json` 400 content is
kept fully verbatim.

### Params and query are strings on the wire

Path and query values reach the server as raw strings (repeated query keys as arrays of strings),
so a bare `z.number()` or `z.boolean()` type-checks but fails validation on every request with a 400. `route()` rejects such schemas at compile time; declare the wire form in the input type
instead:

```ts
query: z.object({
  limit: z.coerce.number<number | `${number}`>().int().max(100).default(20),
  exact: z.stringbool().optional(),
  tags: queryArray(z.string()).optional(),
})
```

- ``z.coerce.number<number | `${number}`>()`` coerces the wire string; the template-literal input
  type admits only numeric strings, so a `@zodapi/client` in wire-form mode with
  `encodeRequests: false` accepts `42` or `'42'` but not `'abc'` (in the default encode mode args
  are typed `z.output` — a plain `number`). The type argument matters: plain `z.coerce.number()` types its
  input as `unknown`, and `z.coerce.number<number>()` is indistinguishable from `z.number()` at
  the type level, so neither tells the compile-time check (or the client's argument types) which
  strings are welcome.
- `z.stringbool()` parses `"true"`/`"false"` (and friends) into a boolean. Avoid
  `z.coerce.boolean()`: it applies JS truthiness, so any non-empty string — `"false"` included —
  coerces to `true`.
- `queryArray()` items are raw strings too; give it a string-accepting item schema the same way.

## createApp()

An `OpenAPIHono` whose validation failures respond `400` with the fixed `ValidationError`
problem-details shape from `@zodapi/core`, served as `application/problem+json` (pass your own
`defaultHook` to override), and whose edge accepts the `a[]=` query-array convention
(`a[]=1&a[]=2` is normalised to repeated plain keys before validation).

```ts
import { createApp } from '@zodapi/hono'

const app = createApp()
  .openapi(getUser, (c) => {
    const { id } = c.req.valid('param')
    // ...
    return c.json(user, 200)
  })
  .doc31('/openapi.json', { openapi: '3.1.0', info: { title: 'API', version: '1.0.0' } })
```

Note: the `[]` normalisation lives on this app's `fetch`, so it does not apply when the app is
mounted under another Hono app via `.route()`.

`OpenAPIHono`, `createRoute`, and `z` are re-exported from `@hono/zod-openapi`, and `queryArray` /
`ValidationError` from `@zodapi/core`, so contracts can import everything from one place.

## Install

```sh
pnpm add @zodapi/hono @hono/zod-openapi hono zod
```

See the [zodapi monorepo](https://github.com/christensena/zodapi) for `@zodapi/client` (typed
client) and `@zodapi/codegen` (contracts from OpenAPI docs for non-TypeScript backends).
