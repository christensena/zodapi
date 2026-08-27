import { createClient, type ApiErrorOf, matchErrorByStatus, isErrorFromRoute } from '@zodapi/client'
import type { SuccessData, ErrorVariant } from '@zodapi/core'
import type { ValidationError } from '@zodapi/core'
import { describe, expectTypeOf, it } from 'vitest'

import { createThing, getThing, routes, teapot } from './contract.js'

const client = createClient(routes, { baseUrl: 'http://test.local' })

describe('client type inference', () => {
  it('types params, query, body and return values', () => {
    expectTypeOf(client.get<'/things/{id}'>)
      .parameter(1)
      .toExtend<{ params: { id: string } } | undefined>()
    expectTypeOf(client.getThing).returns.resolves.toEqualTypeOf<{ id: string; name: string }>()
    expectTypeOf(client.createThing).parameter(0).toExtend<{ body: { name: string } } | undefined>()
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
