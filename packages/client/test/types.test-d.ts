import {
  createClient,
  type ApiErrorOf,
  type FullResponse,
  type OnError,
  matchErrorByStatus,
  isErrorFromRoute,
} from '@zodapi/client'
import type { SuccessData, ErrorVariant } from '@zodapi/core'
import type { ValidationError } from '@zodapi/core'
import { describe, expectTypeOf, it } from 'vitest'

import {
  codecRoutes,
  createThing,
  getEvent,
  getThing,
  renameThing,
  routes,
  teapot,
} from './contract.js'

const client = createClient(routes, { baseUrl: 'http://test.local' })

describe('client type inference', () => {
  it('types params, query, body and return values', () => {
    expectTypeOf(client.get<'/things/{id}'>)
      .parameter(1)
      .toExtend<{ params: { id: string } } | undefined>()
    expectTypeOf(client.getThing({ params: { id: '1' } })).resolves.toEqualTypeOf<{
      id: string
      name: string
    }>()
    expectTypeOf(client.createThing).parameter(0).toExtend<{ body: { name: string } } | undefined>()
  })

  it('accepts a per-call onError hook', () => {
    expectTypeOf<{ params: { id: string }; onError: OnError }>().toExtend<
      NonNullable<Parameters<typeof client.getThing>[0]>
    >()
  })

  it('makes args optional when nothing is required', () => {
    type ListArgs = Parameters<typeof client.listThings>
    expectTypeOf<ListArgs['length']>().toEqualTypeOf<0 | 1>()
  })

  it('exposes only declared methods and aliases', () => {
    expectTypeOf(client).not.toHaveProperty('put')
    expectTypeOf(client).toHaveProperty('getThing')
    expectTypeOf(client).toHaveProperty('post')
  })
})

describe('SuccessData / ErrorVariant', () => {
  it('SuccessData is the 2xx json body', () => {
    expectTypeOf<SuccessData<typeof getThing>>().toEqualTypeOf<{ id: string; name: string }>()
    expectTypeOf<SuccessData<typeof teapot>>().toEqualTypeOf<Record<string, never>>()
  })

  it('ErrorVariant unions declared non-2xx responses including the injected 400', () => {
    type V = ErrorVariant<typeof getThing>
    expectTypeOf<Extract<V, { status: 404 }>['data']>().toEqualTypeOf<{
      error: { code: 'NOT_FOUND'; message: string }
    }>()
    expectTypeOf<Extract<V, { status: 400 }>['data']>().toEqualTypeOf<ValidationError>()
  })

  it('a merged own-400 is the union of the custom body and ValidationError', () => {
    type V = ErrorVariant<typeof renameThing>
    expectTypeOf<Extract<V, { status: 400 }>['data']>().toEqualTypeOf<
      { error: { code: 'BAD_INPUT'; message: string } } | ValidationError
    >()
  })
})

describe('guard narrowing', () => {
  it('isErrorFromRoute narrows to the declared union', () => {
    const err: unknown = null
    if (isErrorFromRoute(getThing, err)) {
      expectTypeOf(err).toExtend<ApiErrorOf<typeof getThing>>()
      if (err.status === 404) {
        expectTypeOf(err.data.error.code).toEqualTypeOf<'NOT_FOUND'>()
      }
    }
  })

  it('matchErrorByStatus narrows to one status', () => {
    const err: unknown = null
    if (matchErrorByStatus(createThing, err, 409)) {
      expectTypeOf(err.data.error.existingId).toEqualTypeOf<string>()
      expectTypeOf(err.status).toEqualTypeOf<409>()
    }
  })

  it('rejects statuses the route does not declare', () => {
    const err: unknown = null
    // @ts-expect-error 500 is not a declared error status of createThing
    matchErrorByStatus(createThing, err, 500)
  })
})

describe('date codec typing', () => {
  const codecClient = createClient(codecRoutes, { baseUrl: 'http://test.local', validate: 'both' })
  const encodeClient = createClient(codecRoutes, {
    baseUrl: 'http://test.local',
    validate: 'both',
    encodeRequests: true,
  })

  it('responses decode to Date', () => {
    expectTypeOf(codecClient.getEvent({ params: { id: '1' } })).resolves.toEqualTypeOf<{
      id: string
      at: Date
    }>()
    expectTypeOf<SuccessData<typeof getEvent>>().toEqualTypeOf<{ id: string; at: Date }>()
  })

  it('request args are wire strings by default, Date with encodeRequests', () => {
    type InArgs = Parameters<typeof codecClient.createEvent>[0]
    expectTypeOf<{ body: { at: string } }>().toExtend<InArgs>()
    expectTypeOf<{ body: { at: Date } }>().not.toExtend<InArgs>()

    type EncArgs = Parameters<typeof encodeClient.createEvent>[0]
    expectTypeOf<{ body: { at: Date } }>().toExtend<EncArgs>()
    expectTypeOf<{ body: { at: string } }>().not.toExtend<EncArgs>()
  })

  it('per-call encodeRequests flips the request value types', () => {
    type InArgs = Parameters<typeof codecClient.createEvent>[0]
    expectTypeOf<{ body: { at: Date }; encodeRequests: true }>().toExtend<InArgs>()
    expectTypeOf<{ body: { at: string }; encodeRequests: true }>().not.toExtend<InArgs>()

    type EncArgs = Parameters<typeof encodeClient.createEvent>[0]
    expectTypeOf<{ body: { at: string }; encodeRequests: false }>().toExtend<EncArgs>()
  })
})

describe('fullResponse typing', () => {
  it('per-call fullResponse: true flips the resolved type to the envelope', () => {
    expectTypeOf(
      client.getThing({ params: { id: '1' }, fullResponse: true }),
    ).resolves.toEqualTypeOf<FullResponse<typeof getThing>>()
    expectTypeOf(client.getThing({ params: { id: '1' } })).resolves.toEqualTypeOf<{
      id: string
      name: string
    }>()
  })

  it('client-level fullResponse: true makes the envelope the default', () => {
    const fullClient = createClient(routes, { baseUrl: 'http://test.local', fullResponse: true })
    expectTypeOf(fullClient.getThing({ params: { id: '1' } })).resolves.toEqualTypeOf<
      FullResponse<typeof getThing>
    >()
    expectTypeOf(
      fullClient.getThing({ params: { id: '1' }, fullResponse: false }),
    ).resolves.toEqualTypeOf<{ id: string; name: string }>()
  })
})

describe('query typing', () => {
  it('queryArray keeps array input typing', () => {
    expectTypeOf(client.listThings).parameter(0).toExtend<
      | {
          query?: { limit?: number | undefined; tags?: string | string[] | undefined } | undefined
        }
      | undefined
    >()
  })
})
