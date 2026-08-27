export { createClient, type ClientOptions } from './client.js'
export { fetchAdapter, type Adapter, type AdapterRequest, type AdapterResponse } from './adapter.js'
export type {
  AliasCallers,
  ArgsTuple,
  MethodCallers,
  RequestArgs,
  ValidateMode,
  ZodapiClient,
} from './types.js'
export {
  ApiError,
  type ApiErrorOf,
  RequestValidationError,
  ResponseValidationError,
  UnexpectedResponseError,
  isAxiosErrorFromRoute,
  isErrorFromAlias,
  isErrorFromRoute,
  isValidationError,
  matchErrorByStatus,
} from '@zodapi/core'
