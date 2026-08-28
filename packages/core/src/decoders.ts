import { z } from 'zod'

import { ProblemApiError, ValidationApiError } from './errors.js'
import type { RouteDef } from './route.js'
import {
  PROBLEM_JSON_CONTENT_TYPE,
  ProblemDetails,
  type ValidationError,
  type ValidationIssue,
  isValidationErrorBody,
} from './validation-error.js'

/** What a decoder sees for a non-2xx response. */
export interface DecodableResponse {
  route: RouteDef
  status: number
  data: unknown
  headers: Headers
  /** Lowercased media type of the response, parameters stripped. */
  mediaType: string | undefined
}

/**
 * Turns a recognised non-2xx response into the error to throw. Decoders run in
 * order; the first whose `mediaTypes` (and `canDecode`, if present) match wins.
 * `decode` may still return `null` to pass the response on.
 */
export interface ErrorDecoder {
  mediaTypes: readonly string[]
  canDecode?(response: DecodableResponse): boolean
  decode(response: DecodableResponse): Error | null
}

/** Lowercased media type of a content-type header value, parameters stripped. */
export function mediaTypeOf(contentType: string | null | undefined): string | undefined {
  const media = contentType?.split(';', 1)[0]?.trim().toLowerCase()
  return media ? media : undefined
}

/** Run `decoders` in order against a non-2xx response; the first decoded error wins. */
export function decodeError(
  decoders: readonly ErrorDecoder[],
  response: DecodableResponse,
): Error | null {
  for (const decoder of decoders) {
    if (response.mediaType === undefined) continue
    if (!decoder.mediaTypes.includes(response.mediaType)) continue
    if (decoder.canDecode && !decoder.canDecode(response)) continue
    const decoded = decoder.decode(response)
    if (decoded) return decoded
  }
  return null
}

/** Revive serialized zod issues as a real ZodError; original codes and extra members survive. */
function reviveIssues(issues: readonly ValidationIssue[]): z.ZodError<Record<string, unknown>> {
  const error = new z.ZodError(issues as unknown as z.core.$ZodIssue[])
  return error as z.ZodError<Record<string, unknown>>
}

/** Decodes zodapi's own problem+json 400 (`type: urn:zodapi:validation`) into a {@link ValidationApiError}. */
export const zodapiValidationDecoder: ErrorDecoder = {
  mediaTypes: [PROBLEM_JSON_CONTENT_TYPE],
  canDecode: ({ data }) => isValidationErrorBody(data),
  decode: ({ route, status, data, headers }) => {
    const body = data as ValidationError
    return new ValidationApiError(
      route,
      status,
      data,
      headers,
      reviveIssues(body.issues),
      body.target,
    )
  },
}

export type KeyCasing = 'camel' | 'pascal' | 'preserve' | ((segment: string) => string)

export interface ProblemDetailsOptions {
  /** Media types treated as problem responses. Default: `['application/problem+json']`. */
  contentTypes?: readonly string[]
  /**
   * Also shape-sniff `application/json` bodies (some proxies rewrite the media
   * type). Default: false.
   */
  sniff?: boolean
  /** Casing applied to each segment of a validation `errors` key. Default: 'camel'. */
  keyCasing?: KeyCasing
  /** Keys rooted like `$.items[0].qty` (JSON deserialization errors): strip the `$` root or keep it. Default: 'strip'. */
  jsonPathKeys?: 'strip' | 'preserve'
}

const ValidationProblemErrors = z.record(z.string(), z.array(z.string()))

function caseSegment(segment: string, casing: KeyCasing): string {
  if (typeof casing === 'function') return casing(segment)
  if (casing === 'preserve' || segment === '') return segment
  const head = casing === 'camel' ? segment[0]!.toLowerCase() : segment[0]!.toUpperCase()
  return head + segment.slice(1)
}

function pathOfKey(
  key: string,
  casing: KeyCasing,
  jsonPathKeys: 'strip' | 'preserve',
): (string | number)[] {
  let rest = key
  if (jsonPathKeys === 'strip' && rest.startsWith('$')) {
    rest = rest.startsWith('$.') ? rest.slice(2) : rest.slice(1)
  }
  const path: (string | number)[] = []
  for (const segment of rest.split('.')) {
    if (segment === '') continue
    const parts = /^([^[]*)((?:\[\d+\])*)$/.exec(segment)
    const name = parts?.[1] ?? segment
    if (name !== '') path.push(caseSegment(name, casing))
    for (const index of (parts?.[2] ?? '').matchAll(/\[(\d+)\]/g)) {
      path.push(Number(index[1]))
    }
  }
  return path
}

function looksLikeProblem(data: unknown): boolean {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return false
  const problem = data as Record<string, unknown>
  return (
    typeof problem['status'] === 'number' &&
    (typeof problem['title'] === 'string' ||
      typeof problem['type'] === 'string' ||
      typeof problem['detail'] === 'string')
  )
}

/**
 * Decoder for RFC 9457 problem-details responses from non-zodapi backends
 * (ASP.NET, Spring, ...). A problem carrying a `ValidationProblemDetails`-style
 * `errors` map becomes a {@link ValidationApiError} with the field errors mapped
 * to zod issues; any other problem becomes a {@link ProblemApiError}.
 */
export function problemDetails(options: ProblemDetailsOptions = {}): ErrorDecoder {
  const contentTypes = options.contentTypes ?? [PROBLEM_JSON_CONTENT_TYPE]
  const casing = options.keyCasing ?? 'camel'
  const jsonPathKeys = options.jsonPathKeys ?? 'strip'
  const mediaTypes = options.sniff ? [...contentTypes, 'application/json'] : [...contentTypes]
  return {
    mediaTypes,
    canDecode: ({ data, mediaType }) =>
      mediaType !== undefined && contentTypes.includes(mediaType)
        ? typeof data === 'object' && data !== null && !Array.isArray(data)
        : looksLikeProblem(data),
    decode: ({ route, status, data, headers }) => {
      const parsed = ProblemDetails.safeParse(data)
      if (!parsed.success) return null
      const problem = parsed.data
      const errors = ValidationProblemErrors.safeParse(problem['errors'])
      if (!errors.success) return new ProblemApiError(route, status, data, headers, problem)
      const issues = Object.entries(errors.data).flatMap(([key, messages]) => {
        const path = pathOfKey(key, casing, jsonPathKeys)
        return messages.map((message) => ({ code: 'custom', path, message }))
      })
      const target = Object.keys(errors.data).some((key) => key.startsWith('$'))
        ? ('json' as const)
        : undefined
      return new ValidationApiError(route, status, data, headers, reviveIssues(issues), target)
    },
  }
}

/** Problem flavor of a backend, as detected by `@zodapi/codegen` (`problemFlavor` export). */
export type ProblemFlavor = 'zodapi' | 'problem-details'

/**
 * Decoders matching a generated contract's `problemFlavor`. The zodapi decoder
 * is always included (most specific first), so one client works against either
 * backend kind.
 */
export function decodersFor(
  flavor: ProblemFlavor | undefined,
  options?: ProblemDetailsOptions,
): ErrorDecoder[] {
  return flavor === 'problem-details'
    ? [zodapiValidationDecoder, problemDetails(options)]
    : [zodapiValidationDecoder]
}
