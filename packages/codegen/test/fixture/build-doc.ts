// Mounts routes (hand-written or generated) and emits the OpenAPI 3.1 doc.
// createRoute() only adds getRoutingPath — unlike route() from @zodapi/core it
// injects nothing, so declared responses pass through verbatim.
import { createRoute } from '@hono/zod-openapi'
import type { RouteDef } from '@zodapi/core'
import { createApp } from '@zodapi/hono'

export function buildDoc(routes: readonly RouteDef[]): unknown {
  const app = createApp()
  for (const routeDef of routes) {
    const { alias: _alias, ...rest } = routeDef
    app.openapi(createRoute(rest as never), (() => new Response()) as never)
  }
  return app.getOpenAPI31Document({
    openapi: '3.1.0',
    info: { title: 'fixture', version: '1.0.0' },
  })
}
