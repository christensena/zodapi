import { z } from '@hono/zod-openapi'
import { queryArray, route } from '@zodapi/hono'

export const User = z
  .object({
    id: z.number(),
    name: z.string(),
    email: z.email(),
    tags: z.array(z.string()),
  })
  .openapi('User')
export type User = z.infer<typeof User>

export const NewUser = User.omit({ id: true }).openapi('NewUser')
export type NewUser = z.infer<typeof NewUser>

export const NotFound = z
  .object({
    error: z.object({ code: z.literal('NOT_FOUND'), message: z.string() }),
  })
  .openapi('NotFound')
export type NotFound = z.infer<typeof NotFound>

export const Conflict = z
  .object({
    error: z.object({
      code: z.literal('CONFLICT'),
      message: z.string(),
      existingId: z.number(),
    }),
  })
  .openapi('Conflict')
export type Conflict = z.infer<typeof Conflict>

export const listUsers = route({
  alias: 'listUsers',
  method: 'get',
  path: '/users',
  request: {
    query: z.object({
      q: z.string().optional(),
      // Query values are strings on the wire: use coercing schemas
      // (z.stringbool, not z.coerce.boolean — "false" would coerce to true).
      exact: z.stringbool().optional(),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      tags: queryArray(z.string()).optional(),
    }),
  },
  responses: {
    200: {
      description: 'Matching users',
      content: {
        'application/json': {
          schema: z.object({ items: z.array(User), total: z.number() }),
        },
      },
    },
  },
})

export const getUser = route({
  alias: 'getUser',
  method: 'get',
  path: '/users/{id}',
  request: {
    params: z.object({ id: z.coerce.number().int().min(1) }),
  },
  responses: {
    200: {
      description: 'The user',
      content: { 'application/json': { schema: User } },
    },
    404: {
      description: 'No user with that id',
      content: { 'application/json': { schema: NotFound } },
    },
  },
})

export const createUser = route({
  alias: 'createUser',
  method: 'post',
  path: '/users',
  request: {
    body: { content: { 'application/json': { schema: NewUser } } },
  },
  responses: {
    201: {
      description: 'Created user',
      content: { 'application/json': { schema: User } },
    },
    409: {
      description: 'A user with that email already exists',
      content: { 'application/json': { schema: Conflict } },
    },
  },
})

export const deleteUser = route({
  alias: 'deleteUser',
  method: 'delete',
  path: '/users/{id}',
  request: {
    params: z.object({ id: z.coerce.number().int().min(1) }),
  },
  responses: {
    204: { description: 'Deleted' },
  },
})

export const routes = [listUsers, getUser, createUser, deleteUser] as const
