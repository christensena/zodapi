# @zodapi/codegen

Generates a [zodapi](https://github.com/christensena/zodapi) contract — zod schemas plus plain
`RouteDef` route objects — from an OpenAPI 3.1 document. For backends not written in TypeScript:
point it at the spec your Python/Go/.NET/... framework emits and consume the result with
`@zodapi/client`.

```sh
zodapi-codegen openapi.json -o contract.ts
```

or programmatically:

```ts
import { generateContract } from '@zodapi/codegen'

const source = generateContract(JSON.parse(await readFile('openapi.json', 'utf8')))
```

## What it generates

One file, importing only `zod` and `@zodapi/core`:

- an exported const per `components/schemas` entry — component name = const name, registered via
  `.meta({ id })` so the schemas re-serialize as the same `$ref` components; recursive schemas use
  zod 4 shape getters
- an exported const per operation, a plain object `satisfies RouteDef` — `operationId` becomes the
  client `alias` (no alias without one); the spec's declared responses are taken verbatim, nothing
  (like the zodapi `400`) is injected
- a `routes` tuple ready for `createClient(routes)` from `@zodapi/client`
- a `problemFlavor` const (`'zodapi' | 'problem-details' | undefined`, detected from the spec's
  error responses — zodapi's `urn:zodapi:validation` problem type, or an ASP.NET-style
  `ValidationProblemDetails`) to feed `decodersFor(problemFlavor)` when creating the client

Query parameters typed `array` are declared with `queryArray(item)` from `@zodapi/core`, matching
the zodapi `a[]=` convention.

Output is unformatted; run your formatter over it.

## Date conversion

By default ISO strings stay strings (`z.iso.datetime()` / `z.iso.date()`). Opt in to `Date`
conversion per format:

```sh
zodapi-codegen openapi.json -o contract.ts --dates-datetime --dates-date --dates-offset
```

```ts
generateContract(doc, { dates: { datetime: true, date: true, offset: true } })
```

- `datetime` / `--dates-datetime`: `format: date-time` fields become a bidirectional
  `z.codec(z.iso.datetime(), z.date(), ...)` — responses parse to `Date`, requests encode back to
  the wire string
- `date` / `--dates-date`: `format: date` fields become a codec decoding to `Date` at UTC midnight
  and encoding back to `YYYY-MM-DD`
- `offset` / `--dates-offset`: accept UTC offsets in date-time values
  (`z.iso.datetime({ offset: true })`)

The codecs are emitted once as shared `isoDatetimeToDate` / `isoDateToDate` consts; a field with
extra wire-side constraints or a `default` inlines the codec with those applied to its input side.

Because codecs change parsed values, `@zodapi/client` refuses calls whose validation mode would
skip a codec-bearing schema (see the client README); pair a dates contract with
`validate: 'response'` (the default) or `'both'`, and optionally `encodeRequests: true` to pass
`Date` objects in requests too.

## Fidelity

The converter covers the JSON Schema subset OpenAPI 3.1 uses: objects (required/optional,
`additionalProperties` as loose objects, catchalls, and records), arrays and tuples, unions
(`oneOf` is treated as `anyOf`), intersections (`allOf`), nullability in both encodings, enums and
consts, string formats (`email`, `uuid`, `uri`, `date-time`, ...), numeric/string/array
constraints, defaults, and `description`/`title`/`examples` metadata.

It is enforced by a round-trip test: a comprehensive hand-written contract is serialized to
OpenAPI, fed through the generator, and the document emitted from the generated contract must
deep-equal the original.

## Not covered

`webhooks`, refs outside `#/components/schemas` (component parameters/responses), response headers,
and OpenAPI 3.0 documents (3.1 only — 3.1 schemas are real JSON Schema, 3.0's `nullable` dialect is
not).

## Install

```sh
pnpm add -D @zodapi/codegen
```

The generated file needs `zod` and `@zodapi/core` at runtime.
