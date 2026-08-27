# zodapi

A zodios-style, contract-first API toolkit for **zod 4 + Hono + OpenAPI 3.1**, assembled on top of
`@hono/zod-openapi` rather than reinventing it. Routes are defined once (zod 4 schemas, OpenAPI-style
paths) and shared by an idiomatic Hono server, a generated OpenAPI 3.1 document, and a typed
fetch/axios client with optional runtime validation and zodios-style error guards.

## Packages

| Package           | What it is                                                                                                                                                                                            |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@zodapi/core`    | Contract types, the fixed `ValidationError` 400 shape, `ApiError` + typed error guards (`isErrorFromRoute`, `matchErrorByStatus`, `isAxiosErrorFromRoute`, ...). No HTTP deps.                        |
| `@zodapi/hono`    | Thin preset over `@hono/zod-openapi`: `createApp()` (fixed 400 shape via `defaultHook`, `a[]=` query normalization) and `route()` (`createRoute` + injected 400 + `body.required` default + `alias`). |
| `@zodapi/client`  | `createClient(routes, ...)`: path- or alias-addressed typed calls over fetch (default) or axios (`@zodapi/client/axios`), with `validate: 'none' \| 'request' \| 'response' \| 'both'`.               |
| `@zodapi/codegen` | `zodapi-codegen openapi.json -o contract.ts`: generates a zodapi contract (zod schemas + route objects) from an OpenAPI 3.1 document, for backends not written in TypeScript.                         |

`examples/api` is a shared contract, `examples/app` a runnable server + client demo.

## Quick tour

Contract (shared):

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
export const routes = [getUser /* ... */] as const
```

Server (idiomatic Hono — `c.req.valid`, RPC types intact):

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

Validation failures return `400` with the fixed shape (also documented as the `ValidationError`
component on every route):

```json
{ "error": { "code": "VALIDATION", "target": "query", "issues": [ ... zod issues ... ] } }
```

Client:

```ts
import { createClient, isValidationError, matchErrorByStatus } from '@zodapi/client'

const client = createClient(routes, { baseUrl: 'http://localhost:3000' })

const user = await client.get('/users/{id}', { params: { id: '1' } }) // by path
const same = await client.getUser({ params: { id: '1' } }) // by alias

try {
  await client.createUser({ body: newUser })
} catch (err) {
  if (matchErrorByStatus(createUser, err, 409)) {
    err.data.error.existingId // fully typed, runtime-checked with zod
  }
}
```

Axios instead of fetch:

```ts
import { axiosAdapter } from '@zodapi/client/axios'
const client = createClient(routes, { baseUrl, adapter: axiosAdapter(axios.create()) })
```

`isAxiosErrorFromRoute(route, err)` recognises declared error responses on a raw `AxiosError`
(zodios `isErrorFromPath` equivalent) for code not using the zodapi client.

## Non-TypeScript backends

When the server is not written in TypeScript, generate the contract from its OpenAPI 3.1 document
instead of authoring it:

```sh
zodapi-codegen openapi.json -o contract.ts   # or: import { generateContract } from '@zodapi/codegen'
```

The generated file imports only `zod` and `@zodapi/core`: one exported const per
`components/schemas` entry (component name = const name, recursion via shape getters), one plain
`RouteDef` object per operation (`operationId` becomes the client `alias`; no alias without one),
and a `routes` tuple ready for `createClient(routes)`. The spec's declared responses are taken
verbatim — nothing (like the zodapi `400`) is injected. Output is unformatted; run your formatter
over it.

Fidelity is enforced by a round-trip test: a comprehensive hand-written contract is serialized to
OpenAPI, fed through the generator, and the doc emitted from the generated contract must equal the
original. Not covered: `webhooks`, refs outside `#/components/schemas`, response headers, and
OpenAPI 3.0 documents (3.1 only).

## Conventions

- **OpenAPI 3.1 only** (`app.doc31`).
- **Query arrays** use `a[]=1&a[]=2`. Declare them with `queryArray(item)`; `createApp()` strips the
  `[]` suffix at the edge (its `fetch`), so plain repeated keys work too. The normalization does not
  apply when the app is mounted under another Hono app via `.route()`.
- **Errors throw.** Declared non-2xx statuses throw `ApiError` (narrow with the guards); undeclared
  statuses throw `UnexpectedResponseError`; client-side validation failures throw
  `RequestValidationError` / `ResponseValidationError`.
- **Validation default** is `'response'` (2xx bodies parsed with the contract schema; error bodies
  are checked by the guards instead).
- `request.body.required` defaults to `true` so a missing/mismatched `Content-Type` is a 400, not a
  silently skipped validation.

## Development

```sh
mise install       # node + pnpm
pnpm install
pnpm build         # all packages (topological)
pnpm test          # vitest (build first)
pnpm typecheck     # includes type-level assertions in test/*.test-d.ts
pnpm dev           # example server on :3000 (PORT to override)
pnpm --filter @zodapi/example-app client-demo
```
