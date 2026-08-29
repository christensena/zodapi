# @zodapi/hono

Thin preset over [`@hono/zod-openapi`](https://github.com/honojs/middleware/tree/main/packages/zod-openapi)
for [zodapi](https://github.com/christensena/zodapi): a `createApp()` factory and a `route()` helper
that bake in the zodapi conventions while keeping idiomatic Hono (`c.req.valid`, RPC types, `.doc31`).

## route()

`createRoute` plus conventions:

- merges a `400` `ValidationError` response into `responses` (unless the route declares its own
  400), so docs and client error types include it
- defaults `request.body.required` to `true`, so a missing/mismatched `Content-Type` fails
  validation instead of silently skipping it
- checks `{...}` path params against the params schema keys — both as a compile-time error and a
  definition-time throw on mismatch
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

A route that declares its own `400` keeps it verbatim — nothing is merged. Client-side, error
decoding is keyed on the `application/problem+json` media type, so a custom `application/json` 400
body is not decoded — it throws a plain `ApiError`, narrowed with the guards like any other
declared status. Note that `createApp()`'s validation hook still answers request-validation
failures on such a route with the zodapi problem-details 400 (which the client decodes into
`ValidationApiError` regardless of what the route declares), so the route can respond 400 with two
shapes while the OpenAPI doc only shows the custom one.

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
