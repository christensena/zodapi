---
'@zodapi/hono': minor
---

`createApp({ zodError })` answers a `ZodError` raised behind a handler as a validation failure instead of letting it fall through to the app's catch-all, normally a bare `500`. Pass `true` for the same `400` problem document the request validator returns, or a function to turn it into the app's own error type. Off by default. `withZodErrors(option, handler)` is exported for wrapping an error handler directly.

This deliberately does not cover `ResponseValidationError` from `@zodapi/client`: an upstream response that broke its own contract is a server fault, and answering the caller `400` would blame them for something they cannot fix.

Note for anyone who has tried this as middleware: it cannot work. hono resolves `onError` inside `compose`, so a middleware awaiting `next()` never observes an error the handler threw — `next()` simply resolves. The hook has to be on the error handler.
