import { OpenAPIHono, type OpenAPIHonoOptions } from '@hono/zod-openapi'
import { validationErrorBody } from '@zodapi/core'
import type { Env, Hono } from 'hono'

/**
 * Rewrites `a[]=1&a[]=2` query keys to `a=1&a=2` at the edge so contract
 * schemas use plain key names while clients follow the `[]` array convention.
 */
function normalizeBracketQuery(request: Request): Request {
  if (!request.url.includes('[]=') && !request.url.includes('%5B%5D=')) return request
  const url = new URL(request.url)
  const params = new URLSearchParams()
  for (const [key, value] of url.searchParams) {
    params.append(key.endsWith('[]') ? key.slice(0, -2) : key, value)
  }
  const search = params.toString()
  url.search = search ? `?${search}` : ''
  return new Request(url.toString(), request)
}

export type CreateAppInit<E extends Env> = ConstructorParameters<typeof Hono>[0] &
  OpenAPIHonoOptions<E>

/**
 * An `OpenAPIHono` whose validation failures respond `400` with the fixed
 * `ValidationError` shape from `@zodapi/core`, and whose edge accepts the
 * `a[]=` query-array convention. Pass your own `defaultHook` to override the
 * error shape. Note: the `[]` normalization lives on this app's `fetch`, so it
 * does not apply when the app is mounted under another Hono app via `.route()`.
 */
export function createApp<E extends Env = Env>(init?: CreateAppInit<E>): OpenAPIHono<E> {
  const app = new OpenAPIHono<E>({
    ...init,
    defaultHook:
      init?.defaultHook ??
      ((result, c) => {
        if (!result.success) {
          return c.json(validationErrorBody(result.target, result.error), 400)
        }
      }),
  })
  const originalFetch = app.fetch
  app.fetch = (request, ...rest) => originalFetch(normalizeBracketQuery(request), ...rest)
  return app
}
