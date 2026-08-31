---
'@zodapi/hono': major
---

`@zodapi/hono` is now server-only: it exports `createApp()` (plus `OpenAPIHono` and `createRoute`
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
