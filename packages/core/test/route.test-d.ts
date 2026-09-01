import { route } from '@zodapi/core'
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

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
    route({
      // @ts-expect-error 'id' is in the path but not the params schema
      method: 'get',
      path: '/things/{id}',
      request: { params: z.object({ userId: z.string() }) },
      responses: ok,
    })
  })

  it('rejects a parametrized path with no params schema', () => {
    route({
      // @ts-expect-error 'id' is in the path but there is no params schema
      method: 'get',
      path: '/things/{id}',
      responses: ok,
    })
  })

  it('rejects params schema keys not in the path', () => {
    route({
      // @ts-expect-error 'extra' is not a path param
      method: 'get',
      path: '/things/{id}',
      request: { params: z.object({ id: z.string(), extra: z.string() }) },
      responses: ok,
    })
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
    route({
      // @ts-expect-error z.object({}) declares no params
      method: 'get',
      path: '/things/{id}',
      request: { params: z.object({}) },
      responses: ok,
    })
  })
})

describe('route() wire string type check', () => {
  it('accepts string-compatible params and query value schemas', () => {
    route({
      method: 'get',
      path: '/things/{id}',
      request: {
        params: z.object({ id: z.coerce.number().int() }),
        query: z.object({
          q: z.string().optional(),
          role: z.enum(['admin', 'member']).optional(),
          limit: z.coerce.number().int().default(20), // input `unknown` — passes unchecked
          exact: z.stringbool().optional(),
          when: z.iso.datetime().optional(),
        }),
      },
      responses: ok,
    })
  })

  it('rejects z.coerce.number<number>(), indistinguishable from z.number()', () => {
    route({
      // @ts-expect-error the narrowed input type erases the coercion evidence
      method: 'get',
      path: '/things',
      request: { query: z.object({ n: z.coerce.number<number>() }) },
      responses: ok,
    })
  })

  it('rejects bare z.number()/z.boolean() in a query schema', () => {
    route({
      // @ts-expect-error `n` and `b` can never match a wire string
      method: 'get',
      path: '/things',
      request: { query: z.object({ n: z.number(), b: z.boolean() }) },
      responses: ok,
    })
  })

  it('rejects a bare z.number() path param', () => {
    route({
      // @ts-expect-error `id` can never match a wire string
      method: 'get',
      path: '/things/{id}',
      request: { params: z.object({ id: z.number() }) },
      responses: ok,
    })
  })

  it('rejects an optional/defaulted bare number, which is still never a string', () => {
    route({
      // @ts-expect-error `limit` can never match a wire string
      method: 'get',
      path: '/things',
      request: { query: z.object({ limit: z.number().optional() }) },
      responses: ok,
    })
  })

  it('accepts string arrays but rejects number arrays for repeated query keys', () => {
    route({
      method: 'get',
      path: '/things',
      request: { query: z.object({ tags: z.array(z.string()).optional() }) },
      responses: ok,
    })
    route({
      // @ts-expect-error `ids` items can never match wire strings
      method: 'get',
      path: '/things',
      request: { query: z.object({ ids: z.array(z.number()) }) },
      responses: ok,
    })
  })

  it('skips the check for schemas with non-literal keys', () => {
    route({
      method: 'get',
      path: '/things',
      request: { query: z.looseObject({ n: z.number() }) },
      responses: ok,
    })
  })

  it('writes readonly documentation arrays back to mutable in the built route', () => {
    const r = route({
      method: 'get',
      path: '/things',
      tags: ['things'],
      security: [{ bearer: [] }] as const,
      responses: ok,
    })
    expectTypeOf(r.tags).toEqualTypeOf<['things']>()
    expectTypeOf(r.security).toEqualTypeOf<[{ bearer: [] }]>()
  })

  it('collapses the config parameter to just the error object on failure', () => {
    const bad = {
      method: 'get',
      path: '/things',
      request: { query: z.object({ n: z.number() }) },
      responses: ok,
    } as const
    expectTypeOf<Parameters<typeof route<typeof bad>>[0]>().toEqualTypeOf<{
      'query values that can never match a wire string (use z.coerce.number() or z.stringbool())': 'n'
    }>()
  })
})
