import type { z } from 'zod'

import type { Method } from './route.js'
import { PROBLEM_JSON_CONTENT_TYPE, ValidationError } from './validation-error.js'

/** The 400 response definition `route()` adds to every route. */
export const validationErrorResponse = {
  description: 'Request validation failed',
  content: { [PROBLEM_JSON_CONTENT_TYPE]: { schema: ValidationError } },
} as const

type ValidationErrorResponse = typeof validationErrorResponse

/** A parameter group (path/query/cookie): a zod object, or one behind a transform. */
type RouteParameter = z.ZodObject | z.ZodPipe

interface MediaTypeConfig {
  schema?: unknown
  example?: unknown
  examples?: Record<string, unknown> | undefined
  encoding?: Record<string, unknown> | undefined
  itemSchema?: unknown
}

interface RequestBodyConfig {
  description?: string | undefined
  content: Record<string, MediaTypeConfig | undefined>
  required?: boolean | undefined
}

interface ResponseConfig {
  description?: string | undefined
  summary?: string | undefined
  headers?: z.ZodObject | Record<string, unknown> | undefined
  links?: Record<string, unknown> | undefined
  content?: Record<string, MediaTypeConfig | undefined> | undefined
}

/**
 * The config `route()` accepts. Mirrors `RouteConfig` from
 * `@hono/zod-openapi`/`@asteasolutions/zod-to-openapi` closely enough that the
 * result drops straight into `app.openapi(...)`, but is expressed in zod types
 * alone so contracts need no HTTP dependency. The request/response shapes are
 * exact (they drive every inference); the OpenAPI documentation fields are
 * typed loosely, and anything they reject is still caught by `app.openapi()`.
 */
export interface ZodapiRouteConfig {
  method: Method
  path: string
  /** zodios-style client method name. Stripped from the OpenAPI document. */
  alias?: string | undefined
  request?:
    | {
        body?: RequestBodyConfig | undefined
        params?: RouteParameter | undefined
        query?: RouteParameter | undefined
        cookies?: RouteParameter | undefined
        headers?: RouteParameter | z.ZodType[] | undefined
      }
    | undefined
  responses: Record<string | number, ResponseConfig>
  /**
   * Hono middleware. Typed as `unknown` to keep hono out of core — the `const`
   * type parameter on `route()` captures the real type, so hono still infers
   * the handler's `Env` from it.
   */
  middleware?: unknown
  summary?: string | undefined
  description?: string | undefined
  operationId?: string | undefined
  tags?: readonly string[] | undefined
  deprecated?: boolean | undefined
  security?: readonly Record<string, readonly string[]>[] | undefined
  servers?: readonly Record<string, unknown>[] | undefined
  externalDocs?: Record<string, unknown> | undefined
  parameters?: readonly Record<string, unknown>[] | undefined
  callbacks?: Record<string, unknown> | undefined
  [extension: `x-${string}`]: unknown
}

type ConvertPathType<T extends string> = T extends `${infer Start}/{${infer Param}}${infer Rest}`
  ? `${Start}/:${Param}${ConvertPathType<Rest>}`
  : T

type ProblemJsonContent = ValidationErrorResponse['content']

// A declared 400 with the ValidationError problem+json content merged into its
// content map; kept verbatim when it already declares application/problem+json.
type Merge400<Def> = Def extends { content: infer C }
  ? typeof PROBLEM_JSON_CONTENT_TYPE extends keyof C
    ? Def
    : Omit<Def, 'content'> & { content: C & ProblemJsonContent }
  : Def & { content: ProblemJsonContent }

type With400<Responses> = 400 extends keyof Responses
  ? Omit<Responses, 400> & { 400: Merge400<Responses[400]> }
  : '400' extends keyof Responses
    ? Omit<Responses, '400'> & { '400': Merge400<Responses['400']> }
    : Responses & { 400: ValidationErrorResponse }

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

/** `never` when the `{...}` path params and the params schema keys agree; an error-shaped type otherwise. */
type ParamsIssues<R extends ZodapiRouteConfig> = [
  Exclude<PathParamNames<R['path']>, ParamSchemaKeys<R>>,
] extends [never]
  ? [Exclude<ParamSchemaKeys<R>, PathParamNames<R['path']>>] extends [never]
    ? never
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

// Params and query values reach the server as raw strings (repeated query
// keys as arrays of strings), so a value schema whose input type admits
// neither fails validation on every request — bare z.number()/z.boolean()
// type-check but 400 at runtime. Use z.coerce.number() (input `unknown`) or
// z.stringbool() instead; z.coerce.number<number>() narrows its input and is
// structurally identical to z.number(), so it is rejected too. Unknowable
// inputs (plain z.coerce.number(), z.any()), non-object schemas, and shapes
// with non-literal keys pass unchecked.
type NonWireKeys<S> = S extends z.ZodType
  ? z.input<S> extends Record<string, unknown>
    ? string extends keyof z.input<S>
      ? never
      : {
          [K in keyof z.input<S>]-?: unknown extends z.input<S>[K]
            ? never
            : [Extract<z.input<S>[K], string | readonly string[]>] extends [never]
              ? K
              : never
        }[keyof z.input<S>]
    : never
  : never

/** `never` when every params/query value schema can accept a wire string; an error-shaped type otherwise. */
type WireIssues<R extends ZodapiRouteConfig> = [
  NonWireKeys<R['request'] extends { params: infer S } ? S : never>,
] extends [never]
  ? [NonWireKeys<R['request'] extends { query: infer S } ? S : never>] extends [never]
    ? never
    : {
        'query values that can never match a wire string (use z.coerce.number() or z.stringbool())': NonWireKeys<
          R['request'] extends { query: infer S } ? S : never
        >
      }
  : {
      'params values that can never match a wire string (use z.coerce.number() or z.stringbool())': NonWireKeys<
        R['request'] extends { params: infer S } ? S : never
      >
    }

type RouteIssues<R extends ZodapiRouteConfig> = ParamsIssues<R> | WireIssues<R>

// On success the parameter type is R itself; on failure it is only the small
// error object — keeping the inferred config type out of the failure branch
// is what keeps route()'s type errors short.
type ValidatedRouteConfig<R extends ZodapiRouteConfig> = [RouteIssues<R>] extends [never]
  ? R
  : RouteIssues<R>

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
 * Inlined `createRoute` from `@hono/zod-openapi`, so contracts carry no HTTP
 * dependency. `getRoutingPath` must stay non-enumerable: an enumerable one
 * leaks the function into `{...route}` spreads and the generated document.
 */
function withRoutingPath(config: { path: string } & Record<string, unknown>): unknown {
  const built = {
    ...config,
    getRoutingPath() {
      return config.path.replaceAll(/\/{(.+?)}/g, '/:$1')
    },
  }
  return Object.defineProperty(built, 'getRoutingPath', { enumerable: false })
}

/**
 * A route definition carrying the zodapi conventions:
 * - merges a `400` `ValidationError` response into `responses`, so docs and
 *   client error types include it; a route declaring its own 400 gets the
 *   problem+json content merged into it instead (kept verbatim when it already
 *   declares `application/problem+json`)
 * - defaults `request.body.required` to `true`, so a missing/mismatched
 *   `Content-Type` fails validation instead of silently skipping it
 * - checks `{...}` path params against the params schema keys — both as a
 *   compile-time error and a definition-time throw on mismatch
 * - rejects at compile time params/query value schemas that can never match
 *   the wire's raw strings — bare `z.number()`/`z.boolean()` type-check but
 *   400 on every request; use `z.coerce.number()` or `z.stringbool()` (not
 *   `z.coerce.boolean()`, which coerces any non-empty string — `"false"`
 *   included — to `true`; not `z.coerce.number<number>()`, whose narrowed
 *   input is indistinguishable from `z.number()`)
 * - carries an optional `alias` for zodios-style client method names
 *
 * The result is a plain object with a `getRoutingPath()`: pass it to
 * `app.openapi(...)` on the server and into `createClient([...])` on the
 * client. Only `zod` is needed to define one.
 */
export function route<const R extends ZodapiRouteConfig>(
  config: ValidatedRouteConfig<R>,
): ZodapiRoute<R>
export function route(config: ZodapiRouteConfig): unknown {
  assertParamsMatchPath(config)
  const { alias, ...rest } = config
  const responses: Record<string, unknown> = { ...rest.responses }
  const own400 = responses[400] as { content?: Record<string, unknown> } | undefined
  if (own400 === undefined) {
    responses[400] = validationErrorResponse
  } else if (own400.content?.[PROBLEM_JSON_CONTENT_TYPE] === undefined) {
    responses[400] = {
      ...own400,
      content: { ...own400.content, ...validationErrorResponse.content },
    }
  }
  let request = rest.request
  if (request?.body && request.body.required === undefined) {
    request = { ...request, body: { ...request.body, required: true } }
  }
  const built = withRoutingPath({
    ...rest,
    ...(request ? { request } : {}),
    responses: responses as ZodapiRouteConfig['responses'],
  })
  return alias === undefined ? built : Object.assign(built as object, { alias })
}
