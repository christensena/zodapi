import {
  ApiError,
  type ErrorDecoder,
  RequestValidationError,
  ResponseValidationError,
  UnexpectedResponseApiError,
  decodeError,
  jsonSchemaOfResponse,
  mediaTypeOf,
  responseDefForStatus,
  type RouteDef,
  schemaContainsCodec,
  zodapiValidationDecoder,
} from '@zodapi/core'
import { z } from 'zod'

import { fetchAdapter, type Adapter } from './adapter.js'
import type { OnError, ValidateMode, ZodapiClient } from './types.js'

export interface ClientOptions {
  baseUrl: string
  adapter?: Adapter
  /**
   * What to validate with zod at runtime. Defaults to 'response' (zodios
   * behaviour): 2xx bodies are parsed with the contract schema; error-response
   * bodies stay raw and are checked by the error guards instead.
   */
  validate?: ValidateMode
  /** Headers sent with every request; a function is re-evaluated per call. */
  headers?:
    | Record<string, string>
    | (() => Record<string, string> | Promise<Record<string, string>>)
  /**
   * Error decoders tried in order against every non-2xx response; the first
   * decoded error is thrown instead of a plain `ApiError`. Defaults to
   * zodapi's own problem+json 400 decoder; add `problemDetails(...)` (or use
   * `decodersFor(...)`) for non-zodapi backends. Pass `[]` to disable.
   */
  decoders?: readonly ErrorDecoder[]
  /**
   * Supply the request body in decoded (schema output) form — e.g. `Date`
   * objects where the contract uses date codecs — and let the client encode
   * it to the wire form with `z.encode`; the body arg is then typed with
   * `z.output` instead of `z.input`. Off by default; overridable per call.
   * Encoding is a serialization concern, independent of `validate`:
   * codec-bearing bodies are encoded whenever this is on (and `z.encode`
   * validates as it encodes, so an invalid value throws
   * `RequestValidationError` even with `validate: 'none'`). Note: `z.encode`
   * rejects one-way transforms, so a body schema mixing a codec with a
   * transform cannot be encoded.
   *
   * Params, query, and header values are unaffected: the transport turns them
   * into strings anyway, so they are always supplied decoded and
   * codec-bearing values are always encoded (per key, so a codec can sit next
   * to a `queryArray()`).
   */
  encodeRequests?: boolean
  /**
   * Resolve calls with a `FullResponse` envelope — `{ data, status, headers }`
   * — instead of the bare parsed body, for consumers that need the raw
   * response's status or headers (pagination headers, tests, ...). `data` is
   * still validated/decoded exactly as without the envelope. Defaults to
   * false. Overridable per call in either direction.
   */
  fullResponse?: boolean
  /**
   * Error hook with a retry decision, called whenever a call is about to
   * throw. Return `'retry'` (may be async) to re-run the request; any other
   * return value — or a throw from the hook itself — lets the original error
   * propagate.
   *
   * The hook receives the error, the route (and alias), and the 1-based
   * `attempt` count. It covers transport/network errors, `ApiError` and its
   * subclasses, and `ResponseValidationError`; client-side request
   * validation/encoding failures are thrown before the hook and never
   * retried. A `headers` function is re-evaluated on every attempt, which
   * makes token refresh a one-liner:
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
   * There is no built-in attempt cap — bound retries with `attempt`. A
   * per-call `onError` replaces this one for that call.
   */
  onError?: OnError
}

interface AnyArgs {
  params?: Record<string, unknown> | undefined
  query?: Record<string, unknown> | undefined
  body?: unknown
  headers?: Record<string, string | undefined> | undefined
  signal?: AbortSignal | undefined
  validate?: ValidateMode | undefined
  encodeRequests?: boolean | undefined
  fullResponse?: boolean | undefined
  onError?: OnError | undefined
}

function serializeQueryValue(value: unknown): string {
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

function buildUrl(baseUrl: string, route: RouteDef, args: AnyArgs): string {
  let path = route.path
  for (const [key, value] of Object.entries(args.params ?? {})) {
    path = path.replaceAll(`{${key}}`, encodeURIComponent(String(value)))
  }
  const missing = path.match(/\{([^}]+)\}/)
  if (missing) {
    throw new Error(`Missing path parameter '${missing[1]}' for ${route.method} ${route.path}`)
  }
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(args.query ?? {})) {
    if (value === undefined || value === null) continue
    if (Array.isArray(value)) {
      for (const item of value) search.append(`${key}[]`, serializeQueryValue(item))
    } else {
      search.append(key, serializeQueryValue(value))
    }
  }
  const query = search.toString()
  return `${baseUrl.replace(/\/+$/, '')}${path}${query ? `?${query}` : ''}`
}

function jsonBodySchema(route: RouteDef): z.ZodType | undefined {
  const body = route.request?.body
  return body ? jsonSchemaOfResponse(body) : undefined
}

/** The shape of a zod object schema, or `undefined` for non-object schemas. */
function objectShape(schema: z.ZodType): Record<string, z.ZodType> | undefined {
  const def = (schema as unknown as { _zod?: { def?: { type?: string; shape?: unknown } } })._zod
    ?.def
  return def?.type === 'object' && def.shape ? (def.shape as Record<string, z.ZodType>) : undefined
}

/**
 * With response validation off, a codec-bearing 2xx schema would return wire
 * data (e.g. ISO strings) while the types promise decoded values (`Date`) —
 * fail fast before the request is sent instead.
 */
function assertNoCodecInSuccessResponses(route: RouteDef): void {
  for (const [status, def] of Object.entries(route.responses)) {
    if (!String(status).startsWith('2')) continue
    const schema = jsonSchemaOfResponse(def)
    if (schema && schemaContainsCodec(schema)) {
      throw new Error(
        `Response schema (${status}) for ${route.method.toUpperCase()} ${route.path} contains a codec; ` +
          `enable response validation (validate: 'response' or 'both') so decoded values match the contract types`,
      )
    }
  }
}

export function createClient<const Rs extends readonly RouteDef[], const O extends ClientOptions>(
  routes: Rs,
  options: O,
): ZodapiClient<
  Rs,
  O extends { encodeRequests: true } ? 'output' : 'input',
  O extends { fullResponse: true } ? true : false
> {
  const adapter = options.adapter ?? fetchAdapter()
  const defaultValidate = options.validate ?? 'response'
  const defaultEncodeRequests = options.encodeRequests ?? false
  const defaultFullResponse = options.fullResponse ?? false
  const decoders = options.decoders ?? [zodapiValidationDecoder]

  const call = async (route: RouteDef, args: AnyArgs = {}): Promise<unknown> => {
    const validate = args.validate ?? defaultValidate
    const encodeRequests = args.encodeRequests ?? defaultEncodeRequests
    const fullResponse = args.fullResponse ?? defaultFullResponse
    const onError = args.onError ?? options.onError
    const validateRequest = validate === 'request' || validate === 'both'
    const validateResponse = validate === 'response' || validate === 'both'

    if (!validateResponse) assertNoCodecInSuccessResponses(route)

    const parseBody = <T>(schema: z.ZodType, value: T): T => {
      // The wire form of a codec is its input side, so codec-bearing values
      // need z.encode regardless of the validate mode — JSON.stringify would
      // serialize e.g. a date-only codec's Date as a full datetime.
      if (encodeRequests && schemaContainsCodec(schema)) {
        const encoded = z.safeEncode(schema, value as never)
        if (!encoded.success) throw new RequestValidationError('json', encoded.error)
        return encoded.data as T
      }
      if (!validateRequest) return value
      if (schemaContainsCodec(schema)) {
        // Parsing decodes; re-encode so the wire keeps the codec input form.
        const parsed = schema.safeParse(value)
        if (!parsed.success) throw new RequestValidationError('json', parsed.error)
        const encoded = z.safeEncode(schema, parsed.data as never)
        if (!encoded.success) throw new RequestValidationError('json', encoded.error)
        return encoded.data as T
      }
      const result = schema.safeParse(value)
      if (!result.success) throw new RequestValidationError('json', result.error)
      return result.data as T
    }

    // Params, query, and headers are always supplied decoded (the transport
    // turns them into strings regardless of the IO mode), so codec-bearing
    // values are always encoded to their wire form — per key when the schema
    // is an object, so a codec key can sit next to a one-way transform like
    // queryArray() that z.encode would reject.
    const encodeWireValues = <T>(
      target: 'param' | 'query' | 'header',
      schema: z.ZodType | undefined,
      value: T,
    ): T => {
      if (!schema || value === undefined) return value
      let out: T = value
      const shape = objectShape(schema)
      if (shape && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const entries = Object.entries(value as Record<string, unknown>).map(([key, val]) => {
          const valueSchema = shape[key]
          if (val === undefined || !valueSchema || !schemaContainsCodec(valueSchema)) {
            return [key, val] as const
          }
          const encoded = z.safeEncode(valueSchema, val as never)
          if (!encoded.success) throw new RequestValidationError(target, encoded.error)
          return [key, encoded.data] as const
        })
        out = Object.fromEntries(entries) as T
      } else if (schemaContainsCodec(schema)) {
        const encoded = z.safeEncode(schema, value as never)
        if (!encoded.success) throw new RequestValidationError(target, encoded.error)
        out = encoded.data as T
      }
      if (validateRequest) {
        // The encoded values are the schema's input form, so plain parsing
        // validates them.
        const result = schema.safeParse(out)
        if (!result.success) throw new RequestValidationError(target, result.error)
      }
      return out
    }

    // Serialization happens once, outside the retry loop: the same input
    // cannot fail differently on a retry, so these errors never reach onError.
    const request = route.request ?? {}
    const params = encodeWireValues('param', request.params, args.params) as AnyArgs['params']
    const query = encodeWireValues('query', request.query, args.query) as AnyArgs['query']
    const headerSchema = Array.isArray(request.headers) ? undefined : request.headers
    encodeWireValues('header', headerSchema, args.headers)
    const bodySchema = jsonBodySchema(route)
    const body = bodySchema !== undefined ? parseBody(bodySchema, args.body) : args.body
    const hasBody = body !== undefined

    const attemptOnce = async (): Promise<unknown> => {
      const headers: Record<string, string> = {}
      const baseHeaders =
        typeof options.headers === 'function' ? await options.headers() : options.headers
      Object.assign(headers, baseHeaders)
      for (const [key, value] of Object.entries(args.headers ?? {})) {
        if (value !== undefined) headers[key] = value
      }
      if (hasBody && !Object.keys(headers).some((h) => h.toLowerCase() === 'content-type')) {
        headers['content-type'] = 'application/json'
      }

      const response = await adapter({
        method: route.method,
        url: buildUrl(options.baseUrl, route, { ...args, params, query }),
        headers,
        body: hasBody ? JSON.stringify(body) : undefined,
        signal: args.signal,
      })

      let data: unknown
      if (response.text !== '' && response.status !== 204 && response.status !== 205) {
        if (/\bjson\b/i.test(response.headers.get('content-type') ?? '')) {
          try {
            data = JSON.parse(response.text)
          } catch {
            data = response.text
          }
        } else {
          data = response.text
        }
      }

      const match = responseDefForStatus(route, response.status)
      if (response.status >= 200 && response.status < 300) {
        if (!match) {
          throw new UnexpectedResponseApiError(route, response.status, data, response.headers)
        }
        const resolve = (body: unknown): unknown =>
          fullResponse ? { data: body, status: response.status, headers: response.headers } : body
        const schema = jsonSchemaOfResponse(match.def)
        if (schema && validateResponse) {
          const result = schema.safeParse(data)
          if (!result.success) {
            throw new ResponseValidationError(response.status, result.error, data)
          }
          return resolve(result.data)
        }
        return resolve(data)
      }
      const decoded = decodeError(decoders, {
        route,
        status: response.status,
        data,
        headers: response.headers,
        mediaType: mediaTypeOf(response.headers.get('content-type')),
      })
      if (decoded) throw decoded
      if (match) throw new ApiError(route, response.status, data, response.headers)
      throw new UnexpectedResponseApiError(route, response.status, data, response.headers)
    }

    if (onError === undefined) return attemptOnce()
    for (let attempt = 1; ; attempt++) {
      try {
        return await attemptOnce()
      } catch (error) {
        const decision = await onError({ error, route, alias: route.alias, attempt })
        if (decision !== 'retry') throw error
      }
    }
  }

  const client: Record<string, unknown> = {}
  const byMethodPath = new Map<string, RouteDef>()
  for (const route of routes) {
    byMethodPath.set(`${route.method} ${route.path}`, route)
    if (route.alias !== undefined) {
      client[route.alias] = (args?: AnyArgs) => call(route, args)
    }
  }
  for (const method of new Set(routes.map((r) => r.method))) {
    client[method] = (path: string, args?: AnyArgs) => {
      const route = byMethodPath.get(`${method} ${path}`)
      if (!route) {
        throw new Error(`No route registered for ${method.toUpperCase()} ${path}`)
      }
      return call(route, args)
    }
  }
  return client as ZodapiClient<
    Rs,
    O extends { encodeRequests: true } ? 'output' : 'input',
    O extends { fullResponse: true } ? true : false
  >
}
