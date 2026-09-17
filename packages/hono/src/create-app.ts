import { OpenAPIHono, type OpenAPIHonoOptions } from '@hono/zod-openapi'
import { PROBLEM_JSON_CONTENT_TYPE, validationErrorBody } from '@zodapi/core'
import type { Env, Hono } from 'hono'
import { ZodError } from 'zod'

import { withZodErrors, type ZodErrorOption, zodErrorResponse } from './zod-error.js'

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
  OpenAPIHonoOptions<E> & {
    /**
     * Opt in: answer a `ZodError` raised behind a handler as a validation
     * failure — `'validationError'` for the validator's own `400` problem
     * document, or a function turning it into the app's error type. Applies to the handler
     * given to `onError`, whenever it is registered. See {@link withZodErrors}.
     */
    zodError?: ZodErrorOption
  }

/**
 * An `OpenAPIHono` whose validation failures respond `400` with the fixed
 * `ValidationError` problem-details shape from `@zodapi/core` (served as
 * `application/problem+json`), and whose edge accepts the
 * `a[]=` query-array convention. Pass your own `defaultHook` to override the
 * error shape. Note: the `[]` normalization lives on this app's `fetch`, so it
 * does not apply when the app is mounted under another Hono app via `.route()`.
 */
export function createApp<E extends Env = Env>(init?: CreateAppInit<E>): OpenAPIHono<E> {
  const { zodError, ...honoInit } = init ?? {}
  const app = new OpenAPIHono<E>({
    ...honoInit,
    defaultHook:
      init?.defaultHook ??
      ((result, c) => {
        if (!result.success) {
          return c.json(validationErrorBody(result.target, result.error), 400, {
            'content-type': PROBLEM_JSON_CONTENT_TYPE,
          })
        }
      }),
  })
  if (zodError) {
    // hono keeps a single error handler, so wrap whichever one is registered
    // later rather than installing our own and being replaced by it.
    const register = app.onError.bind(app)
    register((err, c) =>
      err instanceof ZodError ? zodErrorResponse(err, c) : c.text('Internal Server Error', 500),
    )
    app.onError = (handler) => register(withZodErrors<E>(zodError, handler))
  }
  const originalFetch = app.fetch
  app.fetch = (request, ...rest) => originalFetch(normalizeBracketQuery(request), ...rest)
  return app
}
