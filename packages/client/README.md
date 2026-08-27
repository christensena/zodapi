# @zodapi/client

Typed HTTP client over [zodapi](https://github.com/christensena/zodapi) route contracts:
path- or alias-addressed calls, optional zod validation at runtime, and zodios-style error guards.
Works over fetch by default, axios via `@zodapi/client/axios`, or any custom adapter.

```ts
import { createClient, isValidationError, matchErrorByStatus } from '@zodapi/client'
import { createUser, routes } from './contract.js'

const client = createClient(routes, { baseUrl: 'http://localhost:3000' })

const user = await client.get('/users/{id}', { params: { id: '1' } }) // by path
const same = await client.getUser({ params: { id: '1' } }) // by alias

try {
  await client.createUser({ body: newUser })
} catch (err) {
  if (matchErrorByStatus(createUser, err, 409)) {
    err.data.error.existingId // fully typed, runtime-checked with zod
  } else if (isValidationError(err)) {
    err.data.error.issues // the fixed zodapi 400 shape
  }
}
```

Argument objects (`params`, `query`, `body`, `headers`, `signal`) are typed from the route's
request schemas; return types are the union of the route's declared 2xx json bodies.

## Options

```ts
createClient(routes, {
  baseUrl: 'http://localhost:3000',
  validate: 'response', // 'none' | 'request' | 'response' | 'both' (default 'response')
  headers: () => ({ authorization: `Bearer ${token}` }), // static object or (async) function
  adapter: fetchAdapter(), // transport seam
})
```

- **Validation default is `'response'`** (zodios behaviour): 2xx bodies are parsed with the
  contract schema; error-response bodies stay raw and are checked by the error guards instead.
  Override per call with `{ validate: ... }`.
- **Errors throw.** Declared non-2xx statuses throw `ApiError` (narrow with `isErrorFromRoute`,
  `isErrorFromAlias`, `matchErrorByStatus`, `isValidationError` — all re-exported from
  `@zodapi/core`); undeclared statuses throw `UnexpectedResponseError`; client-side validation
  failures throw `RequestValidationError` / `ResponseValidationError`.
- **Query arrays** are serialised with the `[]` key suffix (`tags[]=a&tags[]=b`), matching the
  normalisation `createApp()` from `@zodapi/hono` applies at the edge.

## Axios

```ts
import axios from 'axios'
import { axiosAdapter } from '@zodapi/client/axios'

const client = createClient(routes, { baseUrl, adapter: axiosAdapter(axios.create()) })
```

Status handling stays with the zodapi client (`validateStatus` is disabled), so declared error
responses throw `ApiError` exactly as with the fetch adapter. axios is an optional peer dependency.
A custom transport is just an `Adapter`: `(request: AdapterRequest) => Promise<AdapterResponse>`.

## Install

```sh
pnpm add @zodapi/client zod
```

Contracts come from `@zodapi/hono` route definitions shared out of a TypeScript backend, or from
`@zodapi/codegen` for backends that only publish an OpenAPI 3.1 document.
