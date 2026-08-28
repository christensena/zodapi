import type { JsonBodySchema, Method, RouteDef, SuccessData } from '@zodapi/core'
import type { z } from 'zod'

export type ValidateMode = 'none' | 'request' | 'response' | 'both'

/** What an {@link OnError} hook receives when a call is about to throw. */
export interface ErrorContext {
  /**
   * The error that will be thrown if the hook does not return `'retry'`: a
   * transport/network error from the adapter, an `ApiError` (or subclass:
   * `UnexpectedResponseApiError`, `ValidationApiError`, `ProblemApiError`), or
   * a `ResponseValidationError`. Narrow with `instanceof` before deciding.
   */
  error: unknown
  /** The route definition of the failing call. */
  route: RouteDef
  /** The route's alias, when it has one. */
  alias: string | undefined
  /**
   * How many attempts have failed so far, starting at 1. There is no built-in
   * cap — use this to bound retries (e.g. `attempt === 1` for a single retry).
   */
  attempt: number
}

/**
 * Error hook with a retry decision.
 *
 * Called whenever a call is about to throw (may be async). Return `'retry'`
 * to re-run the request; any other return value — or a throw from the hook
 * itself — lets the original error propagate. The literal return type leaves
 * room for future decisions without a breaking change.
 *
 * The client re-evaluates a `headers` function on every attempt, so the
 * refresh-token flow is just:
 *
 * ```ts
 * onError: async ({ error, attempt }) => {
 *   if (error instanceof ApiError && error.status === 401 && attempt === 1) {
 *     await refreshTokens() // headers() picks up the new token on the retry
 *     return 'retry'
 *   }
 * }
 * ```
 *
 * Client-side request validation/encoding failures
 * (`RequestValidationError`) are thrown before the hook and never retried —
 * the same input would fail the same way again.
 */
export type OnError = (context: ErrorContext) => 'retry' | void | Promise<'retry' | void>

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
    /**
     * Error hook for this call, replacing any client-level `onError`. Return
     * `'retry'` to re-run the request — see {@link OnError}.
     */
    onError?: OnError
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
