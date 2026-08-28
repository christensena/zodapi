import type { JsonBodySchema, Method, RouteDef, SuccessData } from '@zodapi/core'
import type { z } from 'zod'

export type ValidateMode = 'none' | 'request' | 'response' | 'both'

/**
 * Which side of the request schemas the caller supplies: 'input' (wire form,
 * the default) or 'output' (decoded form, when `encodeRequests` is on — e.g.
 * `Date` objects where a contract uses date codecs).
 */
export type RequestIO = 'input' | 'output'

type Simplify<T> = { [K in keyof T]: T[K] } & {}

type OtherIO<M extends RequestIO> = M extends 'input' ? 'output' : 'input'

type SchemaVal<S extends z.ZodType, M extends RequestIO> = M extends 'output'
  ? z.output<S>
  : z.input<S>

type ParamsArg<R extends RouteDef, M extends RequestIO> = R['request'] extends {
  params: infer S extends z.ZodType
}
  ? { params: SchemaVal<S, M> }
  : {}

type QueryArg<R extends RouteDef, M extends RequestIO> = R['request'] extends {
  query: infer S extends z.ZodType
}
  ? {} extends SchemaVal<S, M>
    ? { query?: SchemaVal<S, M> }
    : { query: SchemaVal<S, M> }
  : {}

type BodyArg<R extends RouteDef, M extends RequestIO> = [JsonBodySchema<R>] extends [never]
  ? {}
  : { body: SchemaVal<JsonBodySchema<R>, M> }

type HeadersArg<R extends RouteDef, M extends RequestIO> = R['request'] extends {
  headers: infer S extends z.ZodType
}
  ? { headers: SchemaVal<S, M> & Record<string, string | undefined> }
  : { headers?: Record<string, string | undefined> }

type BaseArgs<R extends RouteDef, M extends RequestIO> = ParamsArg<R, M> &
  QueryArg<R, M> &
  BodyArg<R, M> &
  HeadersArg<R, M> & {
    signal?: AbortSignal
    /** Override the client-level validation mode for this call. */
    validate?: ValidateMode
  }

type EncodeFlag<M extends RequestIO> = M extends 'output' ? true : false

/**
 * Args for one call. The default member matches the client's request IO mode;
 * flipping `encodeRequests` per call flips the request value types with it.
 */
export type RequestArgs<R extends RouteDef, M extends RequestIO = 'input'> =
  | Simplify<BaseArgs<R, M> & { encodeRequests?: EncodeFlag<M> }>
  | Simplify<BaseArgs<R, OtherIO<M>> & { encodeRequests: EncodeFlag<OtherIO<M>> }>

type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T]

export type ArgsTuple<R extends RouteDef, M extends RequestIO = 'input'> = [
  RequiredKeys<Simplify<BaseArgs<R, M>>>,
] extends [never]
  ? [args?: RequestArgs<R, M>]
  : [args: RequestArgs<R, M>]

type PathsFor<Rs extends readonly RouteDef[], M extends Method> = Extract<
  Rs[number],
  { method: M }
>['path']

type RouteFor<Rs extends readonly RouteDef[], M extends Method, P extends string> = Extract<
  Rs[number],
  { method: M; path: P }
>

export type MethodCallers<Rs extends readonly RouteDef[], IO extends RequestIO = 'input'> = {
  [M in Rs[number]['method']]: <P extends PathsFor<Rs, M>>(
    path: P,
    ...args: ArgsTuple<RouteFor<Rs, M, P>, IO>
  ) => Promise<SuccessData<RouteFor<Rs, M, P>>>
}

export type AliasCallers<Rs extends readonly RouteDef[], IO extends RequestIO = 'input'> = {
  [R in Rs[number] as R extends { alias: infer A extends string } ? A : never]: (
    ...args: ArgsTuple<R, IO>
  ) => Promise<SuccessData<R>>
}

export type ZodapiClient<
  Rs extends readonly RouteDef[],
  IO extends RequestIO = 'input',
> = MethodCallers<Rs, IO> & AliasCallers<Rs, IO>
