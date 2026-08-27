import {
  ApiError,
  RequestValidationError,
  ResponseValidationError,
  UnexpectedResponseError,
  jsonSchemaOfResponse,
  responseDefForStatus,
  type RouteDef,
} from '@zodapi/core'
import type { z } from 'zod'

import { fetchAdapter, type Adapter } from './adapter.js'
import type { ValidateMode, ZodapiClient } from './types.js'

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
}

interface AnyArgs {
  params?: Record<string, unknown> | undefined
  query?: Record<string, unknown> | undefined
  body?: unknown
  headers?: Record<string, string | undefined> | undefined
  signal?: AbortSignal | undefined
  validate?: ValidateMode | undefined
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

export function createClient<const Rs extends readonly RouteDef[]>(
  routes: Rs,
  options: ClientOptions,
): ZodapiClient<Rs> {
  const adapter = options.adapter ?? fetchAdapter()
  const defaultValidate = options.validate ?? 'response'

  const call = async (route: RouteDef, args: AnyArgs = {}): Promise<unknown> => {
    const validate = args.validate ?? defaultValidate
    const validateRequest = validate === 'request' || validate === 'both'
    const validateResponse = validate === 'response' || validate === 'both'

    const parseInput = <T>(
      target: 'param' | 'query' | 'header' | 'json',
      schema: z.ZodType | undefined,
      value: T,
    ): T => {
      if (!schema || !validateRequest) return value
      const result = schema.safeParse(value)
      if (!result.success) throw new RequestValidationError(target, result.error)
      return result.data as T
    }

    const request = route.request ?? {}
    const params = parseInput('param', request.params, args.params) as AnyArgs['params']
    const query = parseInput('query', request.query, args.query) as AnyArgs['query']
    const headerSchema = Array.isArray(request.headers) ? undefined : request.headers
    parseInput('header', headerSchema, args.headers)
    const bodySchema = jsonBodySchema(route)
    const body = bodySchema !== undefined ? parseInput('json', bodySchema, args.body) : args.body

    const headers: Record<string, string> = {}
    const baseHeaders =
      typeof options.headers === 'function' ? await options.headers() : options.headers
    Object.assign(headers, baseHeaders)
    for (const [key, value] of Object.entries(args.headers ?? {})) {
      if (value !== undefined) headers[key] = value
    }
    const hasBody = body !== undefined
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
        throw new UnexpectedResponseError(route, response.status, data, response.headers)
      }
      const schema = jsonSchemaOfResponse(match.def)
      if (schema && validateResponse) {
        const result = schema.safeParse(data)
        if (!result.success) {
          throw new ResponseValidationError(response.status, result.error, data)
        }
        return result.data
      }
      return data
    }
    if (match) throw new ApiError(route, response.status, data, response.headers)
    throw new UnexpectedResponseError(route, response.status, data, response.headers)
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
  return client as ZodapiClient<Rs>
}
