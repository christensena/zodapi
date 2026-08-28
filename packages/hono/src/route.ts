import { createRoute, type RouteConfig } from '@hono/zod-openapi'
import { PROBLEM_JSON_CONTENT_TYPE, ValidationError } from '@zodapi/core'
import type { z } from 'zod'

/** The 400 response definition `route()` adds to every route. */
export const validationErrorResponse = {
  description: 'Request validation failed',
  content: { [PROBLEM_JSON_CONTENT_TYPE]: { schema: ValidationError } },
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

type PathParamNames<T extends string> = T extends `${string}{${infer P}}${infer Rest}`
  ? P | PathParamNames<Rest>
  : never

// Keys the params schema declares. Non-object schemas and schemas with
// non-literal keys (catchall/looseObject) can't be checked — mirror the
// path's own params so the check passes. An empty z.object({}) also has
// `string` keys (output `Record<string, never>`) but declares nothing.
type ParamSchemaKeys<R extends ZodapiRouteConfig> = R['request'] extends {
  params: infer S extends z.ZodType
}
  ? z.output<S> extends Record<string, unknown>
    ? string extends keyof z.output<S>
      ? [z.output<S>[string]] extends [never]
        ? never
        : PathParamNames<R['path']>
      : Extract<keyof z.output<S>, string>
    : PathParamNames<R['path']>
  : never

/** `unknown` when the `{...}` path params and the params schema keys agree; an error-shaped type otherwise. */
type ParamsCheck<R extends ZodapiRouteConfig> = [
  Exclude<PathParamNames<R['path']>, ParamSchemaKeys<R>>,
] extends [never]
  ? [Exclude<ParamSchemaKeys<R>, PathParamNames<R['path']>>] extends [never]
    ? unknown
    : {
        'params schema declares keys missing from the path': Exclude<
          ParamSchemaKeys<R>,
          PathParamNames<R['path']>
        >
      }
  : {
      'path params missing from the params schema': Exclude<
        PathParamNames<R['path']>,
        ParamSchemaKeys<R>
      >
    }

export type ZodapiRoute<R extends ZodapiRouteConfig> = Omit<R, 'responses'> & {
  responses: With400<R['responses']>
} & { getRoutingPath(): ConvertPathType<R['path']> }

interface ZodObjectDefLike {
  type?: string
  shape?: Record<string, unknown>
  catchall?: { _zod?: { def?: { type?: string } } }
}

/**
 * Keys of a zod object schema's shape, or `undefined` when they can't be known:
 * not an object schema, or one with a catchall (looseObject) accepting
 * arbitrary keys.
 */
function objectShapeKeys(schema: unknown): string[] | undefined {
  if (typeof schema !== 'object' || schema === null || !('_zod' in schema)) return undefined
  const def = (schema as { _zod: { def?: ZodObjectDefLike } })._zod.def
  if (def?.type !== 'object' || !def.shape) return undefined
  if (def.catchall && def.catchall._zod?.def?.type !== 'never') return undefined
  return Object.keys(def.shape)
}

function assertParamsMatchPath(config: ZodapiRouteConfig): void {
  const pathParams = Array.from(config.path.matchAll(/\{([^}]+)\}/g), (m) => m[1] as string)
  const paramsSchema = config.request?.params
  const keys = objectShapeKeys(paramsSchema)
  if (paramsSchema !== undefined && keys === undefined) return
  const declared = keys ?? []
  const missing = pathParams.filter((p) => !declared.includes(p))
  const extra = declared.filter((k) => !pathParams.includes(k))
  if (missing.length === 0 && extra.length === 0) return
  const details = [
    missing.length ? `missing from params schema: ${missing.join(', ')}` : '',
    extra.length ? `not in path: ${extra.join(', ')}` : '',
  ]
    .filter(Boolean)
    .join('; ')
  throw new Error(
    `route(): params do not match path '${config.path}' (${config.method}): ${details}`,
  )
}

/**
 * `createRoute` from `@hono/zod-openapi` plus zodapi conventions:
 * - merges a `400` `ValidationError` response into `responses` (unless the
 *   route declares its own 400), so docs and client error types include it
 * - defaults `request.body.required` to `true`, so a missing/mismatched
 *   `Content-Type` fails validation instead of silently skipping it
 * - checks `{...}` path params against the params schema keys — both as a
 *   compile-time error and a definition-time throw on mismatch
 * - carries an optional `alias` for zodios-style client method names
 *
 * The result is a plain route object: pass it to `app.openapi(...)` on the
 * server and into `createClient([...])` on the client.
 */
export function route<const R extends ZodapiRouteConfig>(config: R & ParamsCheck<R>): ZodapiRoute<R>
export function route(config: ZodapiRouteConfig): unknown {
  assertParamsMatchPath(config)
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
