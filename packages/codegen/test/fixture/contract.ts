// The hand-written comprehensive contract the round-trip test starts from.
// Every converter feature should appear here at least once.
import { queryArray, route } from '@zodapi/core'
import { z } from 'zod'

export const Role = z.enum(['admin', 'member', 'guest']).meta({ id: 'Role' })

export const User = z
  .object({
    id: z.uuid(),
    email: z.email(),
    name: z.string().min(1).max(100),
    age: z.int().min(0).max(150).optional(),
    score: z.number().gt(0).lt(1),
    bio: z.string().nullable(),
    role: Role,
    website: z.url().optional(),
    createdAt: z.iso.datetime(),
    birthDate: z.iso.date().optional(),
    tags: z.array(z.string()).min(1).max(10),
  })
  .meta({ id: 'User', description: 'A registered user' })

export const Category = z
  .object({
    name: z.string(),
    get children() {
      return z.array(Category)
    },
  })
  .meta({ id: 'Category' })

export const Widget = z
  .object({ kind: z.literal('widget'), size: z.number() })
  .meta({ id: 'Widget' })
export const Gadget = z
  .object({ kind: z.literal('gadget'), color: z.string() })
  .meta({ id: 'Gadget' })
export const Product = z.union([Widget, Gadget]).meta({ id: 'Product' })

export const UserCreated = z
  .object({ type: z.literal('user.created'), user: User })
  .meta({ id: 'UserCreated' })
export const UserDeleted = z
  .object({ type: z.literal('user.deleted'), userId: z.uuid() })
  .meta({ id: 'UserDeleted' })
export const Event = z.discriminatedUnion('type', [UserCreated, UserDeleted]).meta({ id: 'Event' })

export const Labels = z.record(z.string(), z.string()).meta({ id: 'Labels' })

export const NotFound = z
  .object({
    error: z.object({ code: z.literal('NOT_FOUND'), message: z.string() }),
  })
  .meta({ id: 'NotFound' })

export const Timestamps = z
  .object({ createdAt: z.iso.datetime(), updatedAt: z.iso.datetime() })
  .meta({ id: 'Timestamps' })

export const AuditedNote = z
  .intersection(z.object({ text: z.string() }), Timestamps)
  .meta({ id: 'AuditedNote' })

export const getUser = route({
  alias: 'getUser',
  operationId: 'getUser',
  method: 'get',
  path: '/users/{id}',
  summary: 'Fetch one user',
  tags: ['users'],
  request: {
    params: z.object({ id: z.uuid() }),
    headers: z.object({ 'x-request-id': z.string().optional() }),
  },
  responses: {
    200: { description: 'ok', content: { 'application/json': { schema: User } } },
    404: { description: 'missing', content: { 'application/json': { schema: NotFound } } },
  },
})

export const listUsers = route({
  alias: 'listUsers',
  operationId: 'listUsers',
  method: 'get',
  path: '/users',
  request: {
    query: z.object({
      limit: z.coerce.number().int().min(1).max(100).default(20),
      role: Role.optional(),
      tags: queryArray(z.string()).optional(),
      search: z.string().meta({ description: 'Free-text filter' }).optional(),
      since: z.iso.datetime().optional(),
    }),
  },
  responses: {
    200: {
      description: 'ok',
      content: {
        'application/json': {
          schema: z.object({
            items: z.array(User),
            total: z.int(),
            labels: Labels.optional(),
          }),
        },
      },
    },
  },
})

export const createUser = route({
  alias: 'createUser',
  method: 'post',
  path: '/users',
  request: {
    body: {
      description: 'The user to create',
      content: {
        'application/json': {
          schema: z.object({
            email: z.email(),
            name: z.string(),
            remindAt: z.iso.datetime().optional(),
            role: Role.default('member'),
            settings: z.looseObject({ theme: z.string() }).optional(),
          }),
        },
      },
    },
  },
  responses: {
    201: { description: 'created', content: { 'application/json': { schema: User } } },
    409: {
      description: 'conflict',
      content: {
        'application/json': {
          schema: z.object({ error: z.object({ code: z.literal('CONFLICT') }) }),
        },
      },
    },
  },
})

export const deleteUser = route({
  alias: 'deleteUser',
  method: 'delete',
  path: '/users/{id}',
  request: {
    params: z.object({ id: z.uuid() }),
    cookies: z.object({ session: z.string() }),
  },
  responses: {
    204: { description: 'deleted' },
  },
})

export const getCategories = route({
  alias: 'getCategories',
  method: 'get',
  path: '/categories',
  responses: {
    200: { description: 'ok', content: { 'application/json': { schema: z.array(Category) } } },
  },
})

export const listProducts = route({
  alias: 'listProducts',
  method: 'get',
  path: '/products',
  responses: {
    200: {
      description: 'ok',
      content: { 'application/json': { schema: z.array(Product) } },
    },
  },
})

export const listEvents = route({
  alias: 'listEvents',
  method: 'get',
  path: '/events',
  responses: {
    200: { description: 'ok', content: { 'application/json': { schema: z.array(Event) } } },
  },
})

export const exportReport = route({
  method: 'get',
  path: '/reports/{year}/export',
  request: {
    params: z.object({ year: z.coerce.number().int() }),
  },
  responses: {
    200: {
      description: 'report in the negotiated format',
      content: {
        'application/json': {
          schema: z.object({
            rows: z.array(z.tuple([z.string(), z.number(), z.boolean()])),
            matrix: z.array(z.array(z.number())),
            blob: z.unknown(),
          }),
        },
        'text/csv': { schema: z.string() },
      },
    },
  },
})

export const getNotes = route({
  alias: 'getNotes',
  operationId: 'getNotes',
  method: 'get',
  path: '/notes',
  responses: {
    200: {
      description: 'ok',
      content: { 'application/json': { schema: z.array(AuditedNote) } },
    },
  },
})

export const routes = [
  getUser,
  listUsers,
  createUser,
  deleteUser,
  getCategories,
  listProducts,
  listEvents,
  exportReport,
  getNotes,
] as const
