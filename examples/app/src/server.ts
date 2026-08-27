import * as api from '@zodapi/example-api'
import type { User } from '@zodapi/example-api'
import { createApp } from '@zodapi/hono'

const users = new Map<string, User>(
  [
    {
      id: '1',
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      tags: ['math', 'pioneer'],
    },
    {
      id: '2',
      name: 'Grace Hopper',
      email: 'grace@example.com',
      tags: ['compilers'],
    },
  ].map((u) => [u.id, u]),
)

export const openApiDoc = {
  openapi: '3.1.0',
  info: { title: 'zodapi example API', version: '0.1.0' },
} as const

export const app = createApp()
  .openapi(api.listUsers, (c) => {
    const { q, limit, tags } = c.req.valid('query')
    let items = [...users.values()]
    if (q) items = items.filter((u) => u.name.toLowerCase().includes(q.toLowerCase()))
    if (tags) items = items.filter((u) => tags.some((tag) => u.tags.includes(tag)))
    return c.json({ items: items.slice(0, limit), total: items.length }, 200)
  })
  .openapi(api.getUser, (c) => {
    const { id } = c.req.valid('param')
    const user = users.get(id)
    if (!user) {
      return c.json({ error: { code: 'NOT_FOUND' as const, message: `No user ${id}` } }, 404)
    }
    return c.json(user, 200)
  })
  .openapi(api.createUser, (c) => {
    const newUser = c.req.valid('json')
    const existing = [...users.values()].find((u) => u.email === newUser.email)
    if (existing) {
      return c.json(
        {
          error: {
            code: 'CONFLICT' as const,
            message: `User with email ${newUser.email} already exists`,
            existingId: existing.id,
          },
        },
        409,
      )
    }
    const user: User = { id: crypto.randomUUID(), ...newUser }
    users.set(user.id, user)
    return c.json(user, 201)
  })
  .openapi(api.deleteUser, (c) => {
    const { id } = c.req.valid('param')
    if (users.has(id)) {
      users.delete(id)
    }
    return new Response(null, { status: 204 })
  })
  .doc31('/openapi.json', openApiDoc)

export type App = typeof app
