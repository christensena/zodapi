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
 * string: `z.string()`, an enum, `z.coerce.number<number | string>()`,
 * `z.stringbool()` — a bare `z.number()`/`z.boolean()` item fails validation
 * on every request.
 */
export function queryArray<S extends z.ZodType>(
  item: S,
): z.ZodType<Array<z.output<S>>, Array<z.input<S>> | z.input<S>> {
  return z.preprocess(
    (value) => (value === undefined || Array.isArray(value) ? value : [value]),
    z.array(item),
  ) as unknown as z.ZodType<Array<z.output<S>>, Array<z.input<S>> | z.input<S>>
}
