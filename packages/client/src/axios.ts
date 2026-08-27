import type { AxiosInstance } from 'axios'

import type { Adapter } from './adapter.js'

/**
 * Adapter over an axios instance. Status handling stays with the zodapi client
 * (`validateStatus` is disabled), so declared error responses throw `ApiError`
 * exactly as with the fetch adapter.
 */
export function axiosAdapter(instance: AxiosInstance): Adapter {
  return async (request) => {
    const response = await instance.request<string>({
      url: request.url,
      method: request.method,
      headers: request.headers,
      ...(request.body !== undefined ? { data: request.body } : {}),
      ...(request.signal ? { signal: request.signal } : {}),
      responseType: 'text',
      transformResponse: (data) => data,
      validateStatus: () => true,
    })
    const headers = new Headers()
    for (const [key, value] of Object.entries(response.headers ?? {})) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, String(item))
      } else if (value !== undefined && value !== null) {
        headers.set(key, String(value))
      }
    }
    return { status: response.status, headers, text: response.data ?? '' }
  }
}
