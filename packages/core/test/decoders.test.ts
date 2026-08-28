import {
  ProblemApiError,
  type RouteDef,
  ValidationApiError,
  decodeError,
  decodersFor,
  isValidationErrorBody,
  mediaTypeOf,
  problemDetails,
  validationErrorBody,
  zodapiValidationDecoder,
} from '@zodapi/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const route: RouteDef = { method: 'get', path: '/x', responses: {} }

function response(data: unknown, mediaType: string | undefined = 'application/problem+json') {
  return { route, status: 400, data, headers: new Headers(), mediaType }
}

describe('validationErrorBody()', () => {
  it('builds the fixed problem-details 400 body from a zod error', () => {
    const parsed = z.object({ limit: z.number().min(1) }).safeParse({ limit: 0 })
    const body = validationErrorBody('query', parsed.error!)
    expect(body.type).toBe('urn:zodapi:validation')
    expect(body.status).toBe(400)
    expect(body.target).toBe('query')
    expect(body.issues[0]?.path).toEqual(['limit'])
    expect(isValidationErrorBody(body)).toBe(true)
  })
})

describe('mediaTypeOf()', () => {
  it('strips parameters and lowercases', () => {
    expect(mediaTypeOf('Application/Problem+JSON; charset=utf-8')).toBe('application/problem+json')
    expect(mediaTypeOf('application/json')).toBe('application/json')
    expect(mediaTypeOf(null)).toBeUndefined()
    expect(mediaTypeOf('')).toBeUndefined()
  })
})

describe('zodapiValidationDecoder', () => {
  const body = validationErrorBody(
    'json',
    z.object({ name: z.string() }).safeParse({ name: 1 }).error!,
  )

  it('revives the issues as a real ZodError', () => {
    const err = decodeError([zodapiValidationDecoder], response(body))
    expect(err).toBeInstanceOf(ValidationApiError)
    if (err instanceof ValidationApiError) {
      expect(err.error).toBeInstanceOf(z.ZodError)
      expect(err.error.issues[0]?.code).toBe('invalid_type')
      expect(z.flattenError(err.error).fieldErrors['name']).toBeDefined()
      expect(err.target).toBe('json')
    }
  })

  it('skips non-matching media types and non-zodapi bodies', () => {
    expect(decodeError([zodapiValidationDecoder], response(body, 'application/json'))).toBeNull()
    expect(
      decodeError([zodapiValidationDecoder], { ...response(body), mediaType: undefined }),
    ).toBeNull()
    expect(
      decodeError([zodapiValidationDecoder], response({ status: 400, title: 'Bad Request' })),
    ).toBeNull()
  })
})

describe('problemDetails()', () => {
  const aspnet = {
    type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
    title: 'One or more validation errors occurred.',
    status: 400,
    errors: {
      'Customer.Email': ['bad email'],
      '$.items[0].qty': ['expected number', 'too small'],
      '': ['form-level failure'],
    },
  }

  it('maps a ValidationProblemDetails errors map to zod issues', () => {
    const err = decodeError([problemDetails()], response(aspnet))
    expect(err).toBeInstanceOf(ValidationApiError)
    if (err instanceof ValidationApiError) {
      const byPath = err.error.issues.map((issue) => [issue.path, issue.message])
      expect(byPath).toContainEqual([['customer', 'email'], 'bad email'])
      expect(byPath).toContainEqual([['items', 0, 'qty'], 'expected number'])
      expect(byPath).toContainEqual([['items', 0, 'qty'], 'too small'])
      expect(byPath).toContainEqual([[], 'form-level failure'])
      expect(err.target).toBe('json')
    }
  })

  it('supports pascal and custom-function key casing', () => {
    const pascal = decodeError([problemDetails({ keyCasing: 'pascal' })], response(aspnet))
    if (pascal instanceof ValidationApiError) {
      expect(pascal.error.issues.map((i) => i.path)).toContainEqual(['Customer', 'Email'])
    }
    const shouty = decodeError(
      [problemDetails({ keyCasing: (segment) => segment.toUpperCase() })],
      response(aspnet),
    )
    if (shouty instanceof ValidationApiError) {
      expect(shouty.error.issues.map((i) => i.path)).toContainEqual(['CUSTOMER', 'EMAIL'])
    }
  })

  it('turns a problem without an errors map into ProblemApiError', () => {
    const err = decodeError(
      [problemDetails()],
      response({ type: 'about:blank', title: 'Conflict', status: 409, traceId: 'abc' }),
    )
    expect(err).toBeInstanceOf(ProblemApiError)
    if (err instanceof ProblemApiError) {
      expect(err.problem.title).toBe('Conflict')
      expect(err.problem['traceId']).toBe('abc')
    }
  })

  it('sniffs plain application/json bodies only when opted in', () => {
    const problem = { title: 'Bad Request', status: 400 }
    expect(decodeError([problemDetails()], response(problem, 'application/json'))).toBeNull()
    const sniffed = decodeError(
      [problemDetails({ sniff: true })],
      response(problem, 'application/json'),
    )
    expect(sniffed).toBeInstanceOf(ProblemApiError)
    expect(
      decodeError([problemDetails({ sniff: true })], response({ foo: 1 }, 'application/json')),
    ).toBeNull()
  })
})

describe('decodersFor()', () => {
  it('always includes the zodapi decoder, most specific first', () => {
    expect(decodersFor(undefined)).toEqual([zodapiValidationDecoder])
    expect(decodersFor('zodapi')).toEqual([zodapiValidationDecoder])
    const both = decodersFor('problem-details')
    expect(both[0]).toBe(zodapiValidationDecoder)
    expect(both).toHaveLength(2)
  })

  it('prefers the zodapi decoder for zodapi bodies even with problemDetails registered', () => {
    const body = validationErrorBody(
      'query',
      z.object({ q: z.string() }).safeParse({ q: 1 }).error!,
    )
    const err = decodeError(decodersFor('problem-details'), response(body))
    expect(err).toBeInstanceOf(ValidationApiError)
    if (err instanceof ValidationApiError) {
      expect(err.error.issues[0]?.code).toBe('invalid_type')
      expect(err.target).toBe('query')
    }
  })
})
