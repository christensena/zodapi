import { serve, type ServerType } from '@hono/node-server'
import axios from 'axios'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createClient, isErrorFromRoute } from '@zodapi/client'
import { axiosAdapter } from '@zodapi/client/axios'
import { isAxiosErrorFromRoute } from '@zodapi/core'
import { getThing, makeApp, routes } from './contract.js'

let server: ServerType
let baseUrl: string

beforeAll(async () => {
  const app = makeApp({ createCalls: 0 })
  await new Promise<void>((resolve) => {
    server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      baseUrl = `http://localhost:${info.port}`
      resolve()
    })
  })
})

afterAll(() => {
  server.close()
})

describe('axios adapter', () => {
  it('performs typed calls over axios', async () => {
    const client = createClient(routes, { baseUrl, adapter: axiosAdapter(axios.create()) })
    const thing = await client.getThing({ params: { id: '9' } })
    expect(thing).toEqual({ id: '9', name: 'thing-9' })
  })

  it('throws ApiError for declared errors, same as fetch', async () => {
    const client = createClient(routes, { baseUrl, adapter: axiosAdapter(axios.create()) })
    const err = await client.getThing({ params: { id: 'missing' } }).catch((e: unknown) => e)
    expect(isErrorFromRoute(getThing, err)).toBe(true)
  })
})

describe('isAxiosErrorFromRoute (raw axios usage)', () => {
  it('recognises and narrows a declared error response on a raw AxiosError', async () => {
    const err = await axios
      .get(`${baseUrl}/things/missing`)
      .then(() => null)
      .catch((e: unknown) => e)
    expect(isAxiosErrorFromRoute(getThing, err)).toBe(true)
    if (isAxiosErrorFromRoute(getThing, err) && err.response.status === 404) {
      expect(err.response.data.error.code).toBe('NOT_FOUND')
    }
  })

  it('rejects errors whose body does not match a declared response', async () => {
    const err = await axios
      .get(`${baseUrl}/no-such-path`)
      .then(() => null)
      .catch((e: unknown) => e)
    expect(isAxiosErrorFromRoute(getThing, err)).toBe(false)
  })
})
