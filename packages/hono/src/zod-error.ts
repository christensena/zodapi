import { PROBLEM_JSON_CONTENT_TYPE, validationErrorBody } from '@zodapi/core'
import type { Context, Env, ErrorHandler } from 'hono'
import { ZodError } from 'zod'

/**
 * How a `ZodError` raised behind a handler is answered: `true` for the same
 * `400` problem document the request validator returns, or a function turning
 * it into the app's own error, which `onError` then maps as it sees fit.
 */
export type ZodErrorOption = true | ((err: ZodError) => unknown)

/**
 * The request validator's own `400` problem document, built from a `ZodError`
 * raised behind the handler. Reported against the `json` target: the issues
 * came from the app's own `.parse()`, not from a known part of the request.
 */
export const zodErrorResponse = (err: ZodError, c: Context): Response =>
  c.json(validationErrorBody('json', err), 400, { 'content-type': PROBLEM_JSON_CONTENT_TYPE })

/**
 * Wraps an error handler so a `ZodError` is answered as a validation failure
 * rather than falling through to the handler's catch-all.
 *
 * A bare `.parse()` behind a handler throws the raw `ZodError`, which carries
 * no status of its own. Without this every stray parse failure collapses into
 * whatever the handler does with an unrecognised error, normally a bare `500`.
 *
 * This cannot be a middleware: hono resolves `onError` inside `compose`, so a
 * middleware awaiting `next()` never sees an error a handler threw.
 *
 * Note the direction. This is for validating data on its way *in*, or data the
 * app parses itself. A `ResponseValidationError` from `@zodapi/client` — an
 * upstream response that broke its own contract — is a different class and is
 * deliberately left alone: the caller sent nothing wrong, so it is a `5xx`.
 */
export const withZodErrors =
  <E extends Env>(option: ZodErrorOption, handler: ErrorHandler<E>): ErrorHandler<E> =>
  (err, c) => {
    if (!(err instanceof ZodError)) return handler(err, c)
    return option === true ? zodErrorResponse(err, c) : handler(option(err) as Error, c)
  }
