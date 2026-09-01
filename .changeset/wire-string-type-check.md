---
'@zodapi/hono': minor
'@zodapi/core': patch
---

`route()` now rejects at compile time params/query value schemas that can never match the wire's raw strings — a bare `z.number()` or `z.boolean()` type-checks but fails validation with a 400 on every request. Use coercing schemas instead: `z.coerce.number()` or `z.stringbool()` (not `z.coerce.boolean()`, whose JS truthiness turns `"false"` into `true`). Don't pass a type argument to `z.coerce.number` here: `z.coerce.number<number>()` narrows the declared input and is structurally identical to `z.number()` at the type level, so it is rejected too. Contracts that trip the new check were already failing every request at runtime.

`queryArray()` documents that item schemas see raw wire strings and need the same treatment.
