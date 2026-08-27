import type { z } from 'zod'
import type { JsonBodySchema, Method, RouteDef, SuccessData } from '@zodapi/core'

export type ValidateMode = 'none' | 'request' | 'response' | 'both'

type Simplify<T> = { [K in keyof T]: T[K] } & {}

type ParamsArg<R extends RouteDef> = R['request'] extends { params: infer S extends z.ZodType }
  ? { params: z.input<S> }
  : {}

type QueryArg<R extends RouteDef> = R['request'] extends { query: infer S extends z.ZodType }
  ? {} extends z.input<S>
    ? { query?: z.input<S> }
    : { query: z.input<S> }
  : {}

type BodyArg<R extends RouteDef> = [JsonBodySchema<R>] extends [never]
  ? {}
  : { body: z.input<JsonBodySchema<R>> }

type HeadersArg<R extends RouteDef> = R['request'] extends { headers: infer S extends z.ZodType }
  ? { headers: z.input<S> & Record<string, string | undefined> }
  : { headers?: Record<string, string | undefined> }

export type RequestArgs<R extends RouteDef> = Simplify<
  ParamsArg<R> &
    QueryArg<R> &
    BodyArg<R> &
    HeadersArg<R> & {
      signal?: AbortSignal
      /** Override the client-level validation mode for this call. */
      validate?: ValidateMode
    }
>

type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T]

export type ArgsTuple<R extends RouteDef> = [RequiredKeys<RequestArgs<R>>] extends [never]
  ? [args?: RequestArgs<R>]
  : [args: RequestArgs<R>]

type PathsFor<Rs extends readonly RouteDef[], M extends Method> = Extract<
  Rs[number],
  { method: M }
>['path']

type RouteFor<Rs extends readonly RouteDef[], M extends Method, P extends string> = Extract<
  Rs[number],
  { method: M; path: P }
>

export type MethodCallers<Rs extends readonly RouteDef[]> = {
  [M in Rs[number]['method']]: <P extends PathsFor<Rs, M>>(
    path: P,
    ...args: ArgsTuple<RouteFor<Rs, M, P>>
  ) => Promise<SuccessData<RouteFor<Rs, M, P>>>
}

export type AliasCallers<Rs extends readonly RouteDef[]> = {
  [R in Rs[number] as R extends { alias: infer A extends string } ? A : never]: (
    ...args: ArgsTuple<R>
  ) => Promise<SuccessData<R>>
}

export type ZodapiClient<Rs extends readonly RouteDef[]> = MethodCallers<Rs> & AliasCallers<Rs>
