import type { z } from 'zod'

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete' | 'head' | 'options' | 'trace'

/**
 * Structural shape of a route definition. The `route()` helper produces objects
 * satisfying this, as does `createRoute()` from `@hono/zod-openapi`.
 */
export interface RouteRequestDef {
  params?: z.ZodType | undefined
  query?: z.ZodType | undefined
  headers?: z.ZodType | z.ZodType[] | undefined
  cookies?: z.ZodType | undefined
  body?:
    | {
        content: Record<string, { schema?: unknown } | undefined>
        required?: boolean | undefined
        description?: string | undefined
      }
    | undefined
}

export interface RouteResponseDef {
  description?: string | undefined
  content?: Record<string, { schema?: unknown } | undefined> | undefined
}

export interface RouteDef {
  method: Method
  path: string
  alias?: string | undefined
  request?: RouteRequestDef | undefined
  responses: Record<string | number, RouteResponseDef>
}

type IsJsonMedia<M> = M extends `application/${infer Start}json${string}`
  ? Start extends '' | `${string}+` | `vnd.${string}+`
    ? true
    : false
  : false

/** The zod schema of the `application/json` (or `+json`) content entry, or `never`. */
export type JsonSchemaOf<C> =
  C extends Record<string, { schema?: unknown } | undefined>
    ? {
        [M in keyof C]: IsJsonMedia<M> extends true
          ? C[M] extends { schema: infer S extends z.ZodType }
            ? S
            : never
          : never
      }[keyof C]
    : never

export type JsonBodySchema<R extends RouteDef> = R['request'] extends {
  body: { content: infer C }
}
  ? JsonSchemaOf<C>
  : never

export type StatusOf<K> = K extends number ? K : K extends `${infer N extends number}` ? N : never

type IsSuccessStatus<N> = N extends number ? (`${N}` extends `2${string}` ? true : false) : false

export type SuccessStatuses<R extends RouteDef> = {
  [K in keyof R['responses']]: IsSuccessStatus<StatusOf<K>> extends true ? K : never
}[keyof R['responses']]

export type ErrorStatuses<R extends RouteDef> = {
  [K in keyof R['responses']]: K extends 'default'
    ? K
    : StatusOf<K> extends never
      ? never
      : IsSuccessStatus<StatusOf<K>> extends true
        ? never
        : K
}[keyof R['responses']]

export type ResponseBody<R extends RouteDef, K extends keyof R['responses']> =
  JsonSchemaOf<R['responses'][K]['content']> extends never
    ? undefined
    : z.output<JsonSchemaOf<R['responses'][K]['content']>>

/** Union of the (json) bodies of all 2xx responses; `undefined` for content-less ones. */
export type SuccessData<R extends RouteDef> = [SuccessStatuses<R>] extends [never]
  ? undefined
  : { [K in SuccessStatuses<R>]: ResponseBody<R, K> }[SuccessStatuses<R>]

/** Discriminated union of declared non-2xx responses: `{ status, data }`. */
export type ErrorVariant<R extends RouteDef> = [ErrorStatuses<R>] extends [never]
  ? never
  : {
      [K in ErrorStatuses<R>]: {
        status: K extends 'default' ? number : StatusOf<K>
        data: ResponseBody<R, K>
      }
    }[ErrorStatuses<R>]

export type AliasOf<Rs extends readonly RouteDef[]> = Rs[number] extends infer R
  ? R extends { alias: infer A extends string }
    ? A
    : never
  : never

export type RouteByAlias<Rs extends readonly RouteDef[], A extends string> = Extract<
  Rs[number],
  { alias: A }
>

/**
 * Runtime helper: all json content schemas of a response definition, in
 * declaration order (a response can declare several — e.g. a 400 with a custom
 * `application/json` body plus the merged problem+json `ValidationError`).
 */
export function jsonSchemasOfResponse(def: RouteResponseDef | undefined): z.ZodType[] {
  if (!def?.content) return []
  const schemas: z.ZodType[] = []
  for (const [media, mediaDef] of Object.entries(def.content)) {
    if (/^application\/([\w.-]+\+)?json/.test(media) && mediaDef?.schema) {
      const schema = mediaDef.schema
      if (typeof schema === 'object' && schema !== null && '_zod' in schema) {
        schemas.push(schema as z.ZodType)
      }
    }
  }
  return schemas
}

/** Runtime helper: the first json content schema of a response definition, if it is a zod schema. */
export function jsonSchemaOfResponse(def: RouteResponseDef | undefined): z.ZodType | undefined {
  return jsonSchemasOfResponse(def)[0]
}

/** Runtime helper: resolve a response definition for a concrete status, honouring '4XX'-style ranges and 'default'. */
export function responseDefForStatus(
  route: RouteDef,
  status: number,
): { key: string; def: RouteResponseDef } | undefined {
  const exact = route.responses[status]
  if (exact) return { key: String(status), def: exact }
  const range = route.responses[`${Math.floor(status / 100)}XX`]
  if (range) return { key: `${Math.floor(status / 100)}XX`, def: range }
  const fallback = route.responses['default']
  if (fallback) return { key: 'default', def: fallback }
  return undefined
}
