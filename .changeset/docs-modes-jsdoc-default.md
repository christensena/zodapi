---
'@zodapi/codegen': minor
---

`docs` option (CLI `--docs jsdoc|meta|none`) controlling how OpenAPI documentation
(`title`/`description`/`examples`/`deprecated`, operation summaries/tags) is emitted. The new
default is `'jsdoc'`: JSDoc comments on component consts, object properties, parameters, and route
consts — hover docs with zero runtime weight, no `.meta()` calls, no route doc fields. `'meta'`
restores the previous full-fidelity output (`.meta({ id, ... })` registration plus
`operationId`/`summary`/`description`/`tags` route fields — required to regenerate a spec from the
contract); `'none'` drops documentation entirely. `default` values, response descriptions, and
`alias` are structural and kept in every mode.
