import { createRoute, type RouteConfig } from '@hono/zod-openapi'
import { ValidationError } from '@zodapi/core'

/** The 400 response definition `route()` adds to every route. */
export const validationErrorResponse = {
  description: 'Request validation failed',
  content: { 'application/json': { schema: ValidationError } },
} as const

type ValidationErrorResponse = typeof validationErrorResponse

type ConvertPathType<T extends string> = T extends `${infer Start}/{${infer Param}}${infer Rest}`
  ? `${Start}/:${Param}${ConvertPathType<Rest>}`
  : T

type With400<Responses> = 400 extends keyof Responses
  ? Responses
  : '400' extends keyof Responses
    ? Responses
    : Responses & { 400: ValidationErrorResponse }

export type ZodapiRouteConfig = RouteConfig & { alias?: string }

export type ZodapiRoute<R extends ZodapiRouteConfig> = Omit<R, 'responses'> & {
  responses: With400<R['responses']>
} & { getRoutingPath(): ConvertPathType<R['path']> }

/**
 * `createRoute` from `@hono/zod-openapi` plus zodapi conventions:
 * - merges a `400` `ValidationError` response into `responses` (unless the
 *   route declares its own 400), so docs and client error types include it
 * - defaults `request.body.required` to `true`, so a missing/mismatched
 *   `Content-Type` fails validation instead of silently skipping it
 * - carries an optional `alias` for zodios-style client method names
 *
 * The result is a plain route object: pass it to `app.openapi(...)` on the
 * server and into `createClient([...])` on the client.
 */
export function route<const R extends ZodapiRouteConfig>(config: R): ZodapiRoute<R>
export function route(config: ZodapiRouteConfig): unknown {
  const { alias, ...rest } = config
  const responses: Record<string, unknown> = { ...rest.responses }
  if (responses[400] === undefined) {
    responses[400] = validationErrorResponse
  }
  let request = rest.request
  if (request?.body && request.body.required === undefined) {
    request = { ...request, body: { ...request.body, required: true } }
  }
  const built = createRoute({
    ...rest,
    ...(request ? { request } : {}),
    responses: responses as RouteConfig['responses'],
  })
  return alias === undefined ? built : Object.assign(built, { alias })
}
