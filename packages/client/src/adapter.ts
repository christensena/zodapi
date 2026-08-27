import type { Method } from '@zodapi/core'

export interface AdapterRequest {
  method: Method
  url: string
  headers: Record<string, string>
  body?: string | undefined
  signal?: AbortSignal | undefined
}

export interface AdapterResponse {
  status: number
  headers: Headers
  text: string
}

/** Transport seam: fetch and axios adapters are provided; bring your own if needed. */
export type Adapter = (request: AdapterRequest) => Promise<AdapterResponse>

export function fetchAdapter(fetchImpl: typeof fetch = fetch): Adapter {
  return async (request) => {
    const response = await fetchImpl(request.url, {
      method: request.method.toUpperCase(),
      headers: request.headers,
      ...(request.body !== undefined ? { body: request.body } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
    })
    return { status: response.status, headers: response.headers, text: await response.text() }
  }
}
