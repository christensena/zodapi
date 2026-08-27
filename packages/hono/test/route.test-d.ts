import { route, z } from '@zodapi/hono'
import { describe, it } from 'vitest'

const ok = { 200: { description: 'ok' } }

describe('route() params/path type check', () => {
  it('accepts params matching the path', () => {
    route({
      method: 'get',
      path: '/things/{id}/subs/{subId}',
      request: { params: z.object({ id: z.string(), subId: z.string() }) },
      responses: ok,
    })
  })

  it('accepts a param-less path without a params schema', () => {
    route({ method: 'get', path: '/things', responses: ok })
  })

  it('rejects a path param missing from the params schema', () => {
    route(
      // @ts-expect-error 'id' is in the path but not the params schema
      {
        method: 'get',
        path: '/things/{id}',
        request: { params: z.object({ userId: z.string() }) },
        responses: ok,
      },
    )
  })

  it('rejects a parametrized path with no params schema', () => {
    route(
      // @ts-expect-error 'id' is in the path but there is no params schema
      {
        method: 'get',
        path: '/things/{id}',
        responses: ok,
      },
    )
  })

  it('rejects params schema keys not in the path', () => {
    route(
      // @ts-expect-error 'extra' is not a path param
      {
        method: 'get',
        path: '/things/{id}',
        request: { params: z.object({ id: z.string(), extra: z.string() }) },
        responses: ok,
      },
    )
  })

  it('skips the check for schemas with non-literal keys', () => {
    route({
      method: 'get',
      path: '/things/{id}',
      request: { params: z.looseObject({}) },
      responses: ok,
    })
  })

  it('rejects an empty params schema on a parametrized path', () => {
    route(
      // @ts-expect-error z.object({}) declares no params
      {
        method: 'get',
        path: '/things/{id}',
        request: { params: z.object({}) },
        responses: ok,
      },
    )
  })
})
