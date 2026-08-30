import { createApp, route, validationErrorResponse, z } from '@zodapi/hono'
import { describe, expect, it } from 'vitest'

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

describe('createApp()', () => {
  it('responds 400 with problem+json and documents ValidationError as a component', async () => {
    const app = createApp()
      .openapi(
        route({
          method: 'get',
          path: '/items/{id}',
          request: { params: z.object({ id: z.string().min(2) }) },
          responses: {
            200: { description: 'ok', content: { 'application/json': { schema: Item } } },
          },
        }),
        (c) => c.json({ id: c.req.valid('param').id }, 200),
      )
      .doc31('/openapi.json', { openapi: '3.1.0', info: { title: 't', version: '1' } })

    const bad = await app.request('/items/x')
    expect(bad.status).toBe(400)
    expect(bad.headers.get('content-type')).toContain('application/problem+json')
    const body = await bad.json()
    expect(body.type).toBe('urn:zodapi:validation')
    expect(body.status).toBe(400)
    expect(body.target).toBe('param')
    expect(body.issues[0]?.path).toEqual(['id'])

    const doc = await (await app.request('/openapi.json')).json()
    expect(doc.components.schemas.ValidationError).toBeDefined()
    expect(
      doc.paths['/items/{id}'].get.responses['400'].content['application/problem+json'].schema,
    ).toEqual({ $ref: '#/components/schemas/ValidationError' })
  })

  it('documents a discriminated union as oneOf with a discriminator object', async () => {
    const Circle = z.object({ shape: z.literal('circle'), radius: z.number() }).meta({
      id: 'Circle',
    })
    const Square = z.object({ shape: z.literal('square'), side: z.number() }).meta({
      id: 'Square',
    })
    const Shape = z.discriminatedUnion('shape', [Circle, Square]).meta({ id: 'Shape' })
    const app = createApp()
      .openapi(
        route({
          method: 'get',
          path: '/shape',
          responses: {
            200: { description: 'ok', content: { 'application/json': { schema: Shape } } },
          },
        }),
        (c) => c.json({ shape: 'circle' as const, radius: 1 }, 200),
      )
      .doc31('/openapi.json', { openapi: '3.1.0', info: { title: 't', version: '1' } })

    const doc = await (await app.request('/openapi.json')).json()
    expect(doc.components.schemas.Shape).toEqual({
      oneOf: [{ $ref: '#/components/schemas/Circle' }, { $ref: '#/components/schemas/Square' }],
      discriminator: {
        propertyName: 'shape',
        mapping: {
          circle: '#/components/schemas/Circle',
          square: '#/components/schemas/Square',
        },
      },
    })
  })

  it('lets a user-supplied defaultHook win', async () => {
    const app = createApp({
      defaultHook: (result, c) => {
        if (!result.success) return c.json({ custom: true }, 400)
      },
    }).openapi(
      route({
        method: 'get',
        path: '/x',
        request: { query: z.object({ n: z.coerce.number<number>() }) },
        responses: { 200: { description: 'ok' } },
      }),
      (c) => c.json({}, 200),
    )
    const res = await app.request('/x?n=abc')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ custom: true })
  })
})
