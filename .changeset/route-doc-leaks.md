---
'@zodapi/core': patch
---

Two fixes from adoption feedback:

- `alias` is now a non-enumerable property on the built route (like `getRoutingPath`), so it no longer leaks into the generated OpenAPI document. It is still readable as `route.alias` everywhere.
- The built route's type writes `readonly` back off the documentation arrays (`security`, `tags`, `servers`, `parameters`). Configs captured readonly — `as const` contract values, or plain inline literals under `route()`'s `const` type parameter — previously made the route unassignable to `app.openapi(...)`, collapsing `c.req.valid()` to `never`.
