import {
  type Adapter,
  ApiError,
  ProblemApiError,
  RequestValidationError,
  ResponseValidationError,
  UnexpectedResponseApiError,
  ValidationApiError,
  createClient,
  decodersFor,
  fetchAdapter,
  isErrorFromAlias,
  isErrorFromRoute,
  isValidationError,
  matchErrorByStatus,
} from '@zodapi/client'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createThing, getThing, makeApp, routes } from './contract.js'

function makeClient(counters = { createCalls: 0 }) {
  const app = makeApp(counters)
  return createClient(routes, {
    baseUrl: 'http://test.local',
    adapter: fetchAdapter(app.request as unknown as typeof fetch),
  })
}

describe('path- and alias-addressed calls', () => {
  it('calls a route by method + path with params', async () => {
    const client = makeClient()
    const thing = await client.get('/things/{id}', { params: { id: '42' } })
    expect(thing).toEqual({ id: '42', name: 'thing-42' })
  })

  it('calls a route by alias', async () => {
    const client = makeClient()
    const thing = await client.getThing({ params: { id: '7' } })
    expect(thing.name).toBe('thing-7')
  })

  it('throws for an unregistered path', () => {
    const client = makeClient()
    // @ts-expect-error not a declared path
    expect(() => client.get('/nope')).toThrow(/No route registered/)
  })
})

describe('query serialization (a[] convention)', () => {
  it('serializes arrays with [] keys and the server parses them', async () => {
    const client = makeClient()
    const result = await client.listThings({ query: { tags: ['a', 'b'] } })
    expect(result.tags).toEqual(['a', 'b'])
  })

  it('round-trips a single-element array', async () => {
    const client = makeClient()
    const result = await client.listThings({ query: { tags: ['solo'] } })
    expect(result.tags).toEqual(['solo'])
  })

  it('coerces numeric query values', async () => {
    const client = makeClient()
    const result = await client.listThings({ query: { limit: 1 } })
    expect(result.items).toHaveLength(1)
  })
})

describe('the fixed 400 validation error shape', () => {
  it('decodes a server-side validation failure into ValidationApiError with a real ZodError', async () => {
    const client = makeClient()
    const err = await client.listThings({ query: { limit: 0 } }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ValidationApiError)
    if (err instanceof ValidationApiError) {
      expect(err.status).toBe(400)
      expect(err.target).toBe('query')
      expect(err.error).toBeInstanceOf(z.ZodError)
      expect(err.error.issues[0]?.path).toEqual(['limit'])
      expect(z.flattenError(err.error).fieldErrors['limit']).toBeDefined()
    }
    expect(isValidationError(err)).toBe(true)
    if (isValidationError(err)) {
      expect(err.data.type).toBe('urn:zodapi:validation')
      expect(err.data.target).toBe('query')
    }
  })

  it('falls back to a plain ApiError when decoders are disabled', async () => {
    const counters = { createCalls: 0 }
    const app = makeApp(counters)
    const client = createClient(routes, {
      baseUrl: 'http://test.local',
      adapter: fetchAdapter(app.request as unknown as typeof fetch),
      decoders: [],
    })
    const err = await client.listThings({ query: { limit: 0 } }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).not.toBeInstanceOf(ValidationApiError)
    expect(isValidationError(err)).toBe(true)
  })
})

describe('declared error responses and guards', () => {
  it('throws ApiError for a declared 404 and narrows via isErrorFromRoute', async () => {
    const client = makeClient()
    const err = await client.getThing({ params: { id: 'missing' } }).catch((e: unknown) => e)
    expect(isErrorFromRoute(getThing, err)).toBe(true)
    if (isErrorFromRoute(getThing, err) && err.status === 404) {
      expect(err.data.error.code).toBe('NOT_FOUND')
    }
  })

  it('narrows a specific status via matchErrorByStatus', async () => {
    const client = makeClient()
    const err = await client.createThing({ body: { name: 'taken' } }).catch((e: unknown) => e)
    expect(matchErrorByStatus(createThing, err, 409)).toBe(true)
    if (matchErrorByStatus(createThing, err, 409)) {
      expect(err.data.error.existingId).toBe('1')
    }
    expect(matchErrorByStatus(createThing, err, 400)).toBe(false)
  })

  it('narrows via isErrorFromAlias', async () => {
    const client = makeClient()
    const err = await client.getThing({ params: { id: 'missing' } }).catch((e: unknown) => e)
    expect(isErrorFromAlias(routes, 'getThing', err)).toBe(true)
    expect(isErrorFromAlias(routes, 'listThings', err)).toBe(false)
  })

  it('rejects errors from a different route', async () => {
    const client = makeClient()
    const err = await client.getThing({ params: { id: 'missing' } }).catch((e: unknown) => e)
    expect(isErrorFromRoute(createThing, err)).toBe(false)
  })
})

describe('undeclared statuses', () => {
  it('throws UnexpectedResponseApiError for an undeclared status', async () => {
    const client = makeClient()
    const err = await client.get('/teapot').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(UnexpectedResponseApiError)
    expect((err as UnexpectedResponseApiError).status).toBe(418)
  })
})

describe('problem-details decoders (foreign backends)', () => {
  function stubAdapter(
    status: number,
    body: unknown,
    contentType = 'application/problem+json',
  ): Adapter {
    return () =>
      Promise.resolve({
        status,
        headers: new Headers({ 'content-type': contentType }),
        text: JSON.stringify(body),
      })
  }

  function makeStubClient(adapter: Adapter, decoders = decodersFor('problem-details')) {
    return createClient(routes, { baseUrl: 'http://test.local', adapter, decoders })
  }

  const aspnetValidationProblem = {
    type: 'https://tools.ietf.org/html/rfc9110#section-15.5.1',
    title: 'One or more validation errors occurred.',
    status: 400,
    errors: {
      'Customer.Email': ['The Email field is not a valid e-mail address.'],
      '$.items[0].qty': ['Expected a number.'],
    },
  }

  it('maps an ASP.NET ValidationProblemDetails into ValidationApiError with camelCased paths', async () => {
    const client = makeStubClient(stubAdapter(400, aspnetValidationProblem))
    const err = await client.getThing({ params: { id: '1' } }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ValidationApiError)
    if (err instanceof ValidationApiError) {
      const paths = err.error.issues.map((issue) => issue.path)
      expect(paths).toContainEqual(['customer', 'email'])
      expect(paths).toContainEqual(['items', 0, 'qty'])
      expect(err.target).toBe('json')
    }
  })

  it('honours keyCasing and jsonPathKeys options', async () => {
    const client = makeStubClient(
      stubAdapter(400, aspnetValidationProblem),
      decodersFor('problem-details', { keyCasing: 'preserve', jsonPathKeys: 'preserve' }),
    )
    const err = await client.getThing({ params: { id: '1' } }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ValidationApiError)
    if (err instanceof ValidationApiError) {
      const paths = err.error.issues.map((issue) => issue.path)
      expect(paths).toContainEqual(['Customer', 'Email'])
      expect(paths).toContainEqual(['$', 'items', 0, 'qty'])
    }
  })

  it('decodes a non-validation problem into ProblemApiError, even on an undeclared status', async () => {
    const problem = { type: 'about:blank', title: 'Service Unavailable', status: 503 }
    const client = makeStubClient(stubAdapter(503, problem))
    const err = await client.getThing({ params: { id: '1' } }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ProblemApiError)
    if (err instanceof ProblemApiError) {
      expect(err.problem.title).toBe('Service Unavailable')
      expect(err.status).toBe(503)
    }
  })

  it('does not decode foreign problems unless problemDetails is opted in', async () => {
    const client = createClient(routes, {
      baseUrl: 'http://test.local',
      adapter: stubAdapter(400, aspnetValidationProblem),
    })
    const err = await client.getThing({ params: { id: '1' } }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).not.toBeInstanceOf(ValidationApiError)
  })
})

describe('validation modes', () => {
  it('validates 2xx bodies by default and throws ResponseValidationError on mismatch', async () => {
    const client = makeClient()
    const err = await client.get('/bad-shape').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ResponseValidationError)
  })

  it("returns the raw body with validate: 'none'", async () => {
    const client = makeClient()
    const result = await client.get('/bad-shape', { validate: 'none' })
    expect(result).toEqual({ n: 'not-a-number' })
  })

  it("validates the request client-side with validate: 'both' without hitting the server", async () => {
    const counters = { createCalls: 0 }
    const client = makeClient(counters)
    const err = await client
      .createThing({ body: { name: 123 as unknown as string }, validate: 'both' })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RequestValidationError)
    expect((err as RequestValidationError).target).toBe('json')
    expect(counters.createCalls).toBe(0)
  })
})
