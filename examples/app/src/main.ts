import { serve } from '@hono/node-server'

import { app } from './server.js'

const port = Number(process.env.PORT ?? 3000)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`zodapi example API listening on http://localhost:${info.port}`)
  console.log(`OpenAPI 3.1 document:               http://localhost:${info.port}/openapi.json`)
  console.log(`Try:  curl 'http://localhost:${info.port}/users?tags[]=math&limit=10'`)
})
