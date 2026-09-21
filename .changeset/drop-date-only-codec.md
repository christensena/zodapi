---
'@zodapi/codegen': minor
---

The date-only codec is gone: `dates: { date: true }` / `--dates-date` no longer exist, and `format: date` fields always generate `z.iso.date()` strings. The server serialises a `Date` with `JSON.stringify`, which emits the full timestamp, so a codec encoding to `YYYY-MM-DD` could never round-trip through a hono handler. The date-time codec (`--dates-datetime`) is unaffected, since `toJSON()` and `toISOString()` agree. Date-only conversion returns once `Temporal.PlainDate` is the output type.
