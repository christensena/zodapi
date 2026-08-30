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
import type { AdapterRequest } from '@zodapi/client'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import {
  BadInput,
  codecRoutes,
  createThing,
  getThing,
  makeApp,
  renameThing,
  routes,
} from './contract.js'

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

  it("passes a route's own application/json 400 through as a plain ApiError", async () => {
    const client = makeClient()
    const err = await client
      .renameThing({ params: { id: '1' }, body: { name: 'bad' } })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(err).not.toBeInstanceOf(ValidationApiError)
    expect(matchErrorByStatus(renameThing, err, 400)).toBe(true)
    if (matchErrorByStatus(renameThing, err, 400)) {
      // data is the union of both merged 400 bodies; isValidationError discriminates.
      expect(isValidationError(err)).toBe(false)
      expect(BadInput.parse(err.data).error.code).toBe('BAD_INPUT')
    }
  })

  it('still decodes a validation failure on a route with its own 400', async () => {
    const client = makeClient()
    const err = await client
      .renameThing({ params: { id: '1' }, body: {} as { name: string } })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ValidationApiError)
    if (err instanceof ValidationApiError) {
      expect(err.target).toBe('json')
    }
    // The merged problem+json content makes the validation body a declared 400 too.
    expect(matchErrorByStatus(renameThing, err, 400)).toBe(true)
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

describe('date codecs', () => {
  const eventJson = { id: '1', at: '2024-01-02T03:04:05.000Z' }

  function stubAdapter(status = 200, body: unknown = eventJson) {
    const calls: AdapterRequest[] = []
    const adapter: Adapter = (request) => {
      calls.push(request)
      return Promise.resolve({
        status,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: JSON.stringify(body),
      })
    }
    return { adapter, calls }
  }

  const sentBody = (calls: AdapterRequest[]): unknown => JSON.parse(calls[0]?.body ?? 'null')

  it('decodes response codecs when response validation is on (the default)', async () => {
    const { adapter } = stubAdapter()
    const client = createClient(codecRoutes, { baseUrl: 'http://test.local', adapter })
    const event = await client.getEvent({ params: { id: '1' } })
    expect(event.at).toBeInstanceOf(Date)
    expect(event.at.toISOString()).toBe('2024-01-02T03:04:05.000Z')
  })

  it('rejects before sending when response validation is off for a codec response', async () => {
    const { adapter, calls } = stubAdapter()
    const client = createClient(codecRoutes, {
      baseUrl: 'http://test.local',
      adapter,
      validate: 'none',
    })
    await expect(client.getEvent({ params: { id: '1' } })).rejects.toThrow(/contains a codec/)
    expect(calls).toHaveLength(0)
  })

  it('re-encodes validated request bodies so date-only values keep their wire form', async () => {
    const { adapter, calls } = stubAdapter(201)
    const client = createClient(codecRoutes, {
      baseUrl: 'http://test.local',
      adapter,
      validate: 'both',
    })
    await client.createEvent({ body: { at: '2024-01-02T03:04:05Z', day: '2024-01-02' } })
    expect(sentBody(calls)).toEqual({ at: '2024-01-02T03:04:05.000Z', day: '2024-01-02' })
  })

  it('encodes Date request values with encodeRequests', async () => {
    const { adapter, calls } = stubAdapter(201)
    const client = createClient(codecRoutes, {
      baseUrl: 'http://test.local',
      adapter,
      validate: 'both',
      encodeRequests: true,
    })
    await client.createEvent({
      body: { at: new Date('2024-01-02T03:04:05Z'), day: new Date('2024-01-02T00:00:00Z') },
    })
    expect(sentBody(calls)).toEqual({ at: '2024-01-02T03:04:05.000Z', day: '2024-01-02' })
  })

  it('flips encodeRequests per call', async () => {
    const { adapter, calls } = stubAdapter(201)
    const client = createClient(codecRoutes, {
      baseUrl: 'http://test.local',
      adapter,
      validate: 'both',
    })
    await client.createEvent({
      body: { at: new Date('2024-01-02T03:04:05Z') },
      encodeRequests: true,
    })
    expect(sentBody(calls)).toEqual({ at: '2024-01-02T03:04:05.000Z' })
  })

  it('encodes without request validation — encoding is a serialization concern', async () => {
    const { adapter, calls } = stubAdapter(201)
    const client = createClient(codecRoutes, {
      baseUrl: 'http://test.local',
      adapter,
      encodeRequests: true, // validate defaults to 'response'
    })
    await client.createEvent({
      body: { at: new Date('2024-01-02T03:04:05Z'), day: new Date('2024-01-02T00:00:00Z') },
    })
    expect(sentBody(calls)).toEqual({ at: '2024-01-02T03:04:05.000Z', day: '2024-01-02' })
  })

  it('throws RequestValidationError on encode failure even without request validation', async () => {
    const { adapter, calls } = stubAdapter(201)
    const client = createClient(codecRoutes, {
      baseUrl: 'http://test.local',
      adapter,
      validate: 'response',
      encodeRequests: true,
    })
    const err = await client
      .createEvent({ body: { at: 'not-a-date' as unknown as Date } })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RequestValidationError)
    expect(calls).toHaveLength(0)
  })

  it('reports invalid decoded values as RequestValidationError in encode mode', async () => {
    const { adapter, calls } = stubAdapter(201)
    const client = createClient(codecRoutes, {
      baseUrl: 'http://test.local',
      adapter,
      validate: 'both',
      encodeRequests: true,
    })
    const err = await client
      .createEvent({ body: { at: 'not-a-date' as unknown as Date } })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RequestValidationError)
    expect(calls).toHaveLength(0)
  })
})

describe('onError retry hook', () => {
  const thing = { id: '1', name: 'one' }

  function sequencedAdapter(responses: Array<{ status: number; body?: unknown } | Error>) {
    const calls: AdapterRequest[] = []
    const adapter: Adapter = (request) => {
      calls.push(request)
      const next = responses[Math.min(calls.length - 1, responses.length - 1)]
      if (next instanceof Error) return Promise.reject(next)
      return Promise.resolve({
        status: next?.status ?? 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        text: JSON.stringify(next?.body ?? {}),
      })
    }
    return { adapter, calls }
  }

  it('retries with refreshed headers after a 401', async () => {
    const { adapter, calls } = sequencedAdapter([{ status: 401 }, { status: 200, body: thing }])
    let token = 'expired'
    const client = createClient(routes, {
      baseUrl: 'http://test.local',
      adapter,
      headers: () => ({ authorization: `Bearer ${token}` }),
      onError: ({ error, attempt }) => {
        if (error instanceof ApiError && error.status === 401 && attempt === 1) {
          token = 'fresh'
          return 'retry'
        }
      },
    })
    const result = await client.getThing({ params: { id: '1' } })
    expect(result).toEqual(thing)
    expect(calls.map((c) => c.headers['authorization'])).toEqual(['Bearer expired', 'Bearer fresh'])
  })

  it('rethrows the original error when the hook does not return retry', async () => {
    const { adapter, calls } = sequencedAdapter([{ status: 500 }])
    const seen: number[] = []
    const client = createClient(routes, {
      baseUrl: 'http://test.local',
      adapter,
      onError: ({ attempt }) => {
        seen.push(attempt)
      },
    })
    await expect(client.getThing({ params: { id: '1' } })).rejects.toBeInstanceOf(ApiError)
    expect(seen).toEqual([1])
    expect(calls).toHaveLength(1)
  })

  it('bounds retries via the attempt counter', async () => {
    const { adapter, calls } = sequencedAdapter([{ status: 500 }])
    const client = createClient(routes, {
      baseUrl: 'http://test.local',
      adapter,
      onError: ({ attempt }) => (attempt <= 2 ? 'retry' : undefined),
    })
    await expect(client.getThing({ params: { id: '1' } })).rejects.toBeInstanceOf(ApiError)
    expect(calls).toHaveLength(3)
  })

  it('a per-call hook replaces the client-level one', async () => {
    const { adapter } = sequencedAdapter([{ status: 500 }])
    let clientLevelCalled = false
    const client = createClient(routes, {
      baseUrl: 'http://test.local',
      adapter,
      onError: () => {
        clientLevelCalled = true
        return 'retry'
      },
    })
    await expect(
      client.getThing({ params: { id: '1' }, onError: () => undefined }),
    ).rejects.toBeInstanceOf(ApiError)
    expect(clientLevelCalled).toBe(false)
  })

  it('retries network errors from the adapter', async () => {
    const { adapter, calls } = sequencedAdapter([
      new Error('socket hang up'),
      { status: 200, body: thing },
    ])
    const client = createClient(routes, {
      baseUrl: 'http://test.local',
      adapter,
      onError: ({ attempt }) => (attempt === 1 ? 'retry' : undefined),
    })
    await expect(client.getThing({ params: { id: '1' } })).resolves.toEqual(thing)
    expect(calls).toHaveLength(2)
  })

  it('does not consult the hook for client-side request validation failures', async () => {
    const { adapter, calls } = sequencedAdapter([{ status: 201, body: thing }])
    let hookCalled = false
    const client = createClient(routes, {
      baseUrl: 'http://test.local',
      adapter,
      validate: 'both',
      onError: () => {
        hookCalled = true
        return 'retry'
      },
    })
    const err = await client
      .createThing({ body: { name: 123 as unknown as string } })
      .catch((e: unknown) => e)
    expect(err).toBeInstanceOf(RequestValidationError)
    expect(hookCalled).toBe(false)
    expect(calls).toHaveLength(0)
  })
})

describe('fullResponse envelope', () => {
  it('resolves with data, status and headers per call', async () => {
    const client = makeClient()
    const result = await client.getThing({ params: { id: '9' }, fullResponse: true })
    expect(result.data).toEqual({ id: '9', name: 'thing-9' })
    expect(result.status).toBe(200)
    expect(result.headers).toBeInstanceOf(Headers)
    expect(result.headers.get('content-type')).toMatch(/json/)
  })

  it('honours a client-level default with per-call opt-out', async () => {
    const counters = { createCalls: 0 }
    const app = makeApp(counters)
    const client = createClient(routes, {
      baseUrl: 'http://test.local',
      adapter: fetchAdapter(app.request as unknown as typeof fetch),
      fullResponse: true,
    })
    const full = await client.getThing({ params: { id: '3' } })
    expect(full.data.name).toBe('thing-3')
    expect(full.status).toBe(200)
    const bare = await client.getThing({ params: { id: '3' }, fullResponse: false })
    expect(bare).toEqual({ id: '3', name: 'thing-3' })
  })

  it('still decodes codecs inside the envelope', async () => {
    const adapter: Adapter = () =>
      Promise.resolve({
        status: 200,
        headers: new Headers({ 'content-type': 'application/json', 'x-total': '42' }),
        text: JSON.stringify({ id: '1', at: '2024-01-02T03:04:05.000Z' }),
      })
    const client = createClient(codecRoutes, { baseUrl: 'http://test.local', adapter })
    const result = await client.getEvent({ params: { id: '1' }, fullResponse: true })
    expect(result.data.at).toBeInstanceOf(Date)
    expect(result.headers.get('x-total')).toBe('42')
  })
})
