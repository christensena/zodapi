import {
  ApiError,
  RequestValidationError,
  ResponseValidationError,
  UnexpectedResponseError,
  createClient,
  fetchAdapter,
  isErrorFromAlias,
  isErrorFromRoute,
  isValidationError,
  matchErrorByStatus,
} from '@zodapi/client'
import { describe, expect, it } from 'vitest'

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
  it('surfaces server-side validation failures as ApiError with the fixed shape', async () => {
    const client = makeClient()
    const err = await client.listThings({ query: { limit: 0 } }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ApiError)
    expect(isValidationError(err)).toBe(true)
    if (isValidationError(err)) {
      expect(err.data.error.code).toBe('VALIDATION')
      expect(err.data.error.target).toBe('query')
      expect(err.data.error.issues[0]?.path).toEqual(['limit'])
    }
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
  it('throws UnexpectedResponseError for an undeclared status', async () => {
    const client = makeClient()
    const err = await client.get('/teapot').catch((e: unknown) => e)
    expect(err).toBeInstanceOf(UnexpectedResponseError)
    expect((err as UnexpectedResponseError).status).toBe(418)
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
