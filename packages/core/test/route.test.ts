import { route, validationErrorResponse } from '@zodapi/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

const Item = z.object({ id: z.string() })

describe('route()', () => {
  it('injects the fixed 400 validation error response', () => {
    const r = route({
      method: 'get',
      path: '/items/{id}',
      request: { params: z.object({ id: z.string() }) },
      responses: {
        200: { description: 'ok', content: { 'application/json': { schema: Item } } },
      },
    })
    expect(r.responses[400]).toBe(validationErrorResponse)
    expect(r.getRoutingPath()).toBe('/items/:id')
  })

  it('merges the problem+json content into an explicitly declared 400', () => {
    const BadInput = z.object({ reason: z.string() })
    const r = route({
      method: 'get',
      path: '/items',
      responses: {
        200: { description: 'ok' },
        400: {
          description: 'my own 400',
          content: { 'application/json': { schema: BadInput } },
        },
      },
    })
    expect(r.responses[400].description).toBe('my own 400')
    expect(r.responses[400].content['application/json'].schema).toBe(BadInput)
    expect(r.responses[400].content['application/problem+json']).toBe(
      validationErrorResponse.content['application/problem+json'],
    )
  })

  it('adds the problem+json content to a content-less declared 400', () => {
    const r = route({
      method: 'get',
      path: '/items',
      responses: { 200: { description: 'ok' }, 400: { description: 'bad' } },
    })
    expect(r.responses[400].content).toEqual(validationErrorResponse.content)
  })

  it('keeps a declared 400 verbatim when it already declares problem+json', () => {
    const custom = {
      description: 'my own problem',
      content: { 'application/problem+json': { schema: z.object({ type: z.string() }) } },
    }
    const r = route({
      method: 'get',
      path: '/items',
      responses: { 200: { description: 'ok' }, 400: custom },
    })
    expect(r.responses[400]).toBe(custom)
  })

  it('defaults request.body.required to true, preserving an explicit false', () => {
    const body = { content: { 'application/json': { schema: Item } } }
    const required = route({
      method: 'post',
      path: '/items',
      request: { body },
      responses: { 201: { description: 'created' } },
    })
    expect((required.request.body as { required?: boolean }).required).toBe(true)

    const optional = route({
      method: 'post',
      path: '/items-opt',
      request: { body: { ...body, required: false } },
      responses: { 201: { description: 'created' } },
    })
    expect(optional.request?.body?.required).toBe(false)
  })

  it('throws when a path param is missing from the params schema', () => {
    const bad: unknown = {
      method: 'get',
      path: '/items/{id}',
      responses: { 200: { description: 'ok' } },
    }
    expect(() => route(bad as never)).toThrow(
      "route(): params do not match path '/items/{id}' (get): missing from params schema: id",
    )
  })

  it('throws when the params schema declares keys not in the path', () => {
    const bad: unknown = {
      method: 'get',
      path: '/items/{id}',
      request: { params: z.object({ userId: z.string() }) },
      responses: { 200: { description: 'ok' } },
    }
    expect(() => route(bad as never)).toThrow(
      "route(): params do not match path '/items/{id}' (get): missing from params schema: id; not in path: userId",
    )
  })

  it('skips the params check for schemas whose keys are not knowable', () => {
    for (const params of [z.record(z.string(), z.string()), z.looseObject({})]) {
      const config: unknown = {
        method: 'get',
        path: '/items/{id}',
        request: { params },
        responses: { 200: { description: 'ok' } },
      }
      expect(() => route(config as never)).not.toThrow()
    }
  })

  it('treats an empty params schema as declaring no params', () => {
    const bad: unknown = {
      method: 'get',
      path: '/items/{id}',
      request: { params: z.object({}) },
      responses: { 200: { description: 'ok' } },
    }
    expect(() => route(bad as never)).toThrow('missing from params schema: id')
  })

  it('keeps getRoutingPath non-enumerable, so it stays out of spreads and the document', () => {
    const r = route({
      method: 'get',
      path: '/items/{id}',
      request: { params: z.object({ id: z.string() }) },
      responses: { 200: { description: 'ok' } },
    })
    expect(Object.keys(r)).not.toContain('getRoutingPath')
    expect({ ...r }).not.toHaveProperty('getRoutingPath')
  })

  it('carries the alias through', () => {
    const r = route({
      alias: 'listItems',
      method: 'get',
      path: '/items',
      responses: { 200: { description: 'ok' } },
    })
    expect(r.alias).toBe('listItems')
  })
})
