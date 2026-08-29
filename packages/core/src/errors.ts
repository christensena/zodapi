import type { z } from 'zod'

import {
  type AliasOf,
  type ErrorVariant,
  type RouteByAlias,
  type RouteDef,
  jsonSchemasOfResponse,
  responseDefForStatus,
} from './route.js'
import {
  type ProblemDetails,
  type ValidationError,
  type ValidationTarget,
  isValidationErrorBody,
} from './validation-error.js'

/**
 * Thrown by the client for a response whose status is declared as a non-2xx
 * response in the route contract. Use the guards below to narrow `status`/`data`.
 */
export class ApiError<R extends RouteDef = RouteDef> extends Error {
  override name = 'ApiError'
  readonly route: R
  readonly status: number
  readonly data: unknown
  readonly headers: Headers

  constructor(route: R, status: number, data: unknown, headers: Headers) {
    super(`${route.method.toUpperCase()} ${route.path} failed with status ${status}`)
    this.route = route
    this.status = status
    this.data = data
    this.headers = headers
  }
}

/** An {@link ApiError} whose `status`/`data` are narrowed to the route's declared error responses. */
export type ApiErrorOf<R extends RouteDef> = ApiError<R> & ErrorVariant<R>

/** Thrown for a response status the route contract does not declare. */
export class UnexpectedResponseApiError extends ApiError {
  override name = 'UnexpectedResponseApiError'
  constructor(route: RouteDef, status: number, data: unknown, headers: Headers) {
    super(route, status, data, headers)
    this.message = `${route.method.toUpperCase()} ${route.path} returned undeclared status ${status}`
  }
}

/**
 * Thrown when an error decoder recognises a server-side validation failure
 * (zodapi's own problem+json 400, or a foreign flavor such as ASP.NET's
 * `ValidationProblemDetails`). `error` is a real `z.ZodError` revived from the
 * server's issues, so `z.flattenError`/`z.treeifyError` and existing
 * form-mapping code work identically to client-side validation failures.
 */
export class ValidationApiError<R extends RouteDef = RouteDef> extends ApiError<R> {
  override name = 'ValidationApiError'
  // Record-typed so z.flattenError gives indexable fieldErrors.
  readonly error: z.ZodError<Record<string, unknown>>
  /** Which request part failed, when the backend reports it. */
  readonly target: ValidationTarget | undefined

  constructor(
    route: R,
    status: number,
    data: unknown,
    headers: Headers,
    error: z.ZodError<Record<string, unknown>>,
    target?: ValidationTarget,
  ) {
    super(route, status, data, headers)
    this.error = error
    this.target = target
  }
}

/**
 * Thrown when an error decoder recognises a non-validation RFC 9457 problem
 * response. `problem` is the parsed problem-details body (extension members
 * included); `data` stays the raw body.
 */
export class ProblemApiError<R extends RouteDef = RouteDef> extends ApiError<R> {
  override name = 'ProblemApiError'
  readonly problem: ProblemDetails

  constructor(route: R, status: number, data: unknown, headers: Headers, problem: ProblemDetails) {
    super(route, status, data, headers)
    this.problem = problem
  }
}

/** Thrown client-side when request validation is enabled and an input fails its schema. */
export class RequestValidationError extends Error {
  override name = 'RequestValidationError'
  constructor(
    readonly target: 'param' | 'query' | 'header' | 'json',
    readonly error: z.ZodError,
  ) {
    super(`Request ${target} failed validation: ${error.message}`)
  }
}

/** Thrown client-side when response validation is enabled and a 2xx body fails its schema. */
export class ResponseValidationError extends Error {
  override name = 'ResponseValidationError'
  constructor(
    readonly status: number,
    readonly error: z.ZodError,
    readonly data: unknown,
  ) {
    super(`Response with status ${status} failed validation: ${error.message}`)
  }
}

function matchesRoute(route: RouteDef, err: ApiError): boolean {
  return err.route.method === route.method && err.route.path === route.path
}

function dataMatchesDeclaredResponse(route: RouteDef, status: number, data: unknown): boolean {
  const match = responseDefForStatus(route, status)
  if (!match) return false
  const schemas = jsonSchemasOfResponse(match.def)
  return schemas.length === 0 || schemas.some((schema) => schema.safeParse(data).success)
}

/**
 * True when `err` is an {@link ApiError} from `route` whose status and body match
 * one of the route's declared error responses (body is runtime-checked with zod).
 * Narrows `err.status`/`err.data` to the declared union.
 */
export function isErrorFromRoute<R extends RouteDef>(route: R, err: unknown): err is ApiErrorOf<R> {
  return (
    err instanceof ApiError &&
    matchesRoute(route, err) &&
    dataMatchesDeclaredResponse(route, err.status, err.data)
  )
}

/** Alias-addressed version of {@link isErrorFromRoute} (zodios `isErrorFromAlias` equivalent). */
export function isErrorFromAlias<Rs extends readonly RouteDef[], A extends AliasOf<Rs>>(
  routes: Rs,
  alias: A,
  err: unknown,
): err is ApiErrorOf<RouteByAlias<Rs, A>> {
  const route = routes.find((r) => r.alias === alias)
  return route !== undefined && isErrorFromRoute(route, err)
}

/** Narrow an error to one specific declared error status of a route. */
export function matchErrorByStatus<R extends RouteDef, const S extends ErrorVariant<R>['status']>(
  route: R,
  err: unknown,
  status: S,
): err is Extract<ApiErrorOf<R>, { status: S }> {
  return isErrorFromRoute(route, err) && err.status === status
}

/** True when `err` is an ApiError carrying the fixed zodapi 400 validation-error body. */
export function isValidationError(
  err: unknown,
): err is ApiError & { status: 400; data: ValidationError } {
  return err instanceof ApiError && err.status === 400 && isValidationErrorBody(err.data)
}

interface AxiosErrorLike {
  isAxiosError: boolean
  response?: { status: number; data: unknown }
}

/**
 * Zodios-parity guard for people using a raw axios instance (not the zodapi client):
 * recognises an `AxiosError` whose `response.status`/`response.data` match one of the
 * route's declared error responses, and narrows `response` accordingly.
 */
export function isAxiosErrorFromRoute<R extends RouteDef>(
  route: R,
  err: unknown,
): err is Error & { isAxiosError: true; response: ErrorVariant<R> & { headers: unknown } } {
  if (!(err instanceof Error)) return false
  const candidate = err as Partial<AxiosErrorLike>
  if (candidate.isAxiosError !== true || !candidate.response) return false
  return dataMatchesDeclaredResponse(route, candidate.response.status, candidate.response.data)
}
