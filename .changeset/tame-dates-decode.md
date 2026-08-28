---
'@zodapi/codegen': minor
---

Optional `Date` conversion for ISO strings: `generateContract(doc, { dates: { datetime, date, offset } })`
(CLI: `--dates-datetime`, `--dates-date`, `--dates-offset`). Matching `format: date-time` / `date`
fields are emitted as bidirectional `z.codec`s (shared `isoDatetimeToDate` / `isoDateToDate`
helpers; inlined when wire-side constraints or a `default` apply), so responses parse to `Date`
and requests encode back to wire strings. Round-trip fidelity to the source document is preserved.
