import { z } from 'zod'

/**
 * Query-string array schema for the `a[]=1&a[]=2` convention.
 *
 * Hono's validator hands single-occurrence keys to the schema as a bare string,
 * so this wraps a lone value into a one-element array before `z.array(item)`.
 * The client serialises array values with a `[]` key suffix; `createApp()` from
 * `@zodapi/hono` strips the suffix at the edge so both `a[]=x` and repeated
 * `a=x` forms validate.
 *
 * Item values are raw strings on the wire, so the item schema must accept a
 * string: `z.string()`, an enum, `z.coerce.number()`, `z.stringbool()` — a
 * bare `z.number()`/`z.boolean()` item fails validation on every request.
 */
export function queryArray<S extends z.ZodType>(
  item: S,
): z.ZodType<Array<z.output<S>>, Array<z.input<S>> | z.input<S>> {
  return z.preprocess(
    (value) => (value === undefined || Array.isArray(value) ? value : [value]),
    z.array(item),
  ) as unknown as z.ZodType<Array<z.output<S>>, Array<z.input<S>> | z.input<S>>
}

/**
 * Wraps a numeric params/query schema so it also accepts the raw string the
 * wire delivers, leaving the schema — and so the OpenAPI document generated
 * from it — untouched.
 *
 * Preferred over `z.coerce.number()` when the contract has to reproduce an
 * existing specification: a coercing schema documents itself differently
 * (a bare `z.coerce.number()` becomes `type: ["number", "null"]`), while this
 * preprocess leaves the declared schema, its constraints and its `default`
 * exactly as written. Hand-written contracts have no such constraint and can
 * use `z.coerce.number()` directly.
 *
 * A non-numeric string is passed through untouched, so the wrapped schema
 * reports the failure rather than seeing a silent `NaN` or an empty string
 * turning into `0`.
 */
export function wireNumber<S extends z.ZodType>(
  schema: S,
): z.ZodType<z.output<S>, string | z.input<S>> {
  return z.preprocess(
    (value) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value),
    schema,
  ) as unknown as z.ZodType<z.output<S>, string | z.input<S>>
}

/**
 * Wraps a boolean params/query schema so it also accepts the raw string the
 * wire delivers, leaving the schema — and the OpenAPI document — untouched.
 * See {@link wireNumber}.
 *
 * Only `"true"` and `"false"` are recognised; anything else is passed through
 * for the wrapped schema to reject. That is deliberately narrower than
 * `z.coerce.boolean()`, whose JS truthiness turns `"false"` into `true`.
 */
export function wireBoolean<S extends z.ZodType>(
  schema: S,
): z.ZodType<z.output<S>, string | z.input<S>> {
  return z.preprocess((value) => {
    if (value === 'true') return true
    if (value === 'false') return false
    return value
  }, schema) as unknown as z.ZodType<z.output<S>, string | z.input<S>>
}
