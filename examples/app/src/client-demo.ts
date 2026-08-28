// Run `pnpm dev` in another terminal first, then `pnpm client-demo`.
import {
  ValidationApiError,
  createClient,
  isErrorFromRoute,
  matchErrorByStatus,
} from '@zodapi/client'
import * as api from '@zodapi/example-api'

const client = createClient(api.routes, {
  baseUrl: `http://localhost:${process.env.PORT ?? 3000}`,
})

// Path-addressed calls
const page = await client.get('/users', { query: { limit: 10, tags: ['math'] } })
console.log(
  'GET /users →',
  page.items.map((u) => u.name),
  `total=${page.total}`,
)

// Alias-addressed calls (zodios style)
const ada = await client.getUser({ params: { id: '1' } })
console.log('getUser(1) →', ada.name, ada.email)

// Declared error responses throw ApiError; guards narrow status AND data
try {
  await client.createUser({ body: { name: 'Ada 2', email: 'ada@example.com', tags: [] } })
} catch (err) {
  if (matchErrorByStatus(api.createUser, err, 409)) {
    console.log('409 conflict with existing user id:', err.data.error.existingId)
  } else {
    throw err
  }
}

// Server-side validation failures decode into ValidationApiError carrying a
// real ZodError — the same error handling as client-side validation.
try {
  await client.get('/users', { query: { limit: 0 }, validate: 'none' })
} catch (err) {
  if (err instanceof ValidationApiError) {
    console.log('400 validation error on', err.target, '→', err.error.issues[0]?.message)
  } else {
    throw err
  }
}

// isErrorFromRoute narrows to the union of the route's declared errors
try {
  await client.getUser({ params: { id: 'nope' } })
} catch (err) {
  if (isErrorFromRoute(api.getUser, err) && err.status === 404) {
    console.log('404 →', err.data.error.message)
  } else {
    throw err
  }
}
