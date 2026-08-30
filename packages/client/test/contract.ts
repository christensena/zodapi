import type { RouteDef } from '@zodapi/core'
import { createApp, queryArray, route, z } from '@zodapi/hono'

export const Thing = z.object({ id: z.string(), name: z.string() })
export const NotFound = z.object({
  error: z.object({ code: z.literal('NOT_FOUND'), message: z.string() }),
})
export const Conflict = z.object({
  error: z.object({ code: z.literal('CONFLICT'), existingId: z.string() }),
})

export const getThing = route({
  alias: 'getThing',
  method: 'get',
  path: '/things/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'ok', content: { 'application/json': { schema: Thing } } },
    404: { description: 'missing', content: { 'application/json': { schema: NotFound } } },
  },
})

export const listThings = route({
  alias: 'listThings',
  method: 'get',
  path: '/things',
  request: {
    query: z.object({
      limit: z.coerce.number<number | `${number}`>().int().min(1).default(10),
      exact: z.stringbool().optional(),
      tags: queryArray(z.string()).optional(),
    }),
  },
  responses: {
    200: {
      description: 'ok',
      content: {
        'application/json': {
          schema: z.object({ items: z.array(Thing), tags: z.array(z.string()) }),
        },
      },
    },
  },
})

export const createThing = route({
  alias: 'createThing',
  method: 'post',
  path: '/things',
  request: { body: { content: { 'application/json': { schema: Thing.omit({ id: true }) } } } },
  responses: {
    201: { description: 'created', content: { 'application/json': { schema: Thing } } },
    409: { description: 'conflict', content: { 'application/json': { schema: Conflict } } },
  },
})

export const BadInput = z.object({
  error: z.object({ code: z.literal('BAD_INPUT'), message: z.string() }),
})

// Declares its own plain application/json 400; route() merges the problem+json
// ValidationError content into it.
export const renameThing = route({
  alias: 'renameThing',
  method: 'post',
  path: '/things/{id}/rename',
  request: {
    params: z.object({ id: z.string() }),
    body: { content: { 'application/json': { schema: z.object({ name: z.string() }) } } },
  },
  responses: {
    200: { description: 'ok', content: { 'application/json': { schema: Thing } } },
    400: { description: 'bad input', content: { 'application/json': { schema: BadInput } } },
  },
})

// Declares only 200; the server handler deliberately returns 418.
export const teapot = route({
  method: 'get',
  path: '/teapot',
  responses: {
    200: { description: 'ok', content: { 'application/json': { schema: z.object({}) } } },
  },
})

// Declares {n: number}; the server handler deliberately returns a string.
export const badShape = route({
  method: 'get',
  path: '/bad-shape',
  responses: {
    200: {
      description: 'ok',
      content: { 'application/json': { schema: z.object({ n: z.number() }) } },
    },
  },
})

export const routes = [getThing, listThings, createThing, renameThing, teapot, badShape] as const

// Date-codec routes, exercised with a stub adapter rather than the hono app.
export const isoDatetimeToDate = z.codec(z.iso.datetime(), z.date(), {
  decode: (value) => new Date(value),
  encode: (date) => date.toISOString(),
})
export const isoDateToDate = z.codec(z.iso.date(), z.date(), {
  decode: (value) => new Date(`${value}T00:00:00Z`),
  encode: (date) => date.toISOString().slice(0, 10),
})

export const EventItem = z.object({ id: z.string(), at: isoDatetimeToDate })

export const getEvent = {
  alias: 'getEvent',
  method: 'get',
  path: '/events/{id}',
  request: { params: z.object({ id: z.string() }) },
  responses: {
    200: { description: 'ok', content: { 'application/json': { schema: EventItem } } },
  },
} as const satisfies RouteDef

export const createEvent = {
  alias: 'createEvent',
  method: 'post',
  path: '/events',
  request: {
    body: {
      content: {
        'application/json': {
          schema: z.object({ at: isoDatetimeToDate, day: isoDateToDate.optional() }),
        },
      },
    },
  },
  responses: {
    201: { description: 'created', content: { 'application/json': { schema: EventItem } } },
  },
} as const satisfies RouteDef

// A codec query param next to a one-way transform (queryArray): the client
// must encode `since` per key rather than z.encode-ing the whole object.
export const searchEvents = {
  alias: 'searchEvents',
  method: 'get',
  path: '/events',
  request: {
    query: z.object({
      since: isoDateToDate.optional(),
      tags: queryArray(z.string()).optional(),
    }),
  },
  responses: {
    200: { description: 'ok', content: { 'application/json': { schema: z.array(EventItem) } } },
  },
} as const satisfies RouteDef

export const codecRoutes = [getEvent, createEvent, searchEvents] as const

export function makeApp(counters: { createCalls: number }) {
  return createApp()
    .openapi(getThing, (c) => {
      const { id } = c.req.valid('param')
      if (id === 'missing') {
        return c.json({ error: { code: 'NOT_FOUND' as const, message: `no ${id}` } }, 404)
      }
      return c.json({ id, name: `thing-${id}` }, 200)
    })
    .openapi(listThings, (c) => {
      const { limit, tags } = c.req.valid('query')
      return c.json({ items: [{ id: '1', name: 'one' }].slice(0, limit), tags: tags ?? [] }, 200)
    })
    .openapi(createThing, (c) => {
      counters.createCalls++
      const body = c.req.valid('json')
      if (body.name === 'taken') {
        return c.json({ error: { code: 'CONFLICT' as const, existingId: '1' } }, 409)
      }
      return c.json({ id: 'new', ...body }, 201)
    })
    .openapi(renameThing, (c) => {
      const { id } = c.req.valid('param')
      const { name } = c.req.valid('json')
      if (name === 'bad') {
        return c.json({ error: { code: 'BAD_INPUT' as const, message: 'bad name' } }, 400)
      }
      return c.json({ id, name }, 200)
    })
    .openapi(teapot, (c) => c.json({ short: 'stout' } as {}, 418 as unknown as 200))
    .openapi(badShape, (c) => c.json({ n: 'not-a-number' as unknown as number }, 200))
}
