/**
 * Converts an OpenAPI 3.1 (JSON Schema) subschema into zod source code.
 *
 * Coverage is deliberately the subset zod itself can express and re-serialize
 * via `z.toJSONSchema` — the round-trip test in this package is the contract:
 * fixture zod → OpenAPI → this converter → zod → OpenAPI must be identical.
 */

export type JsonSchema = Record<string, unknown>

/** Convert ISO date/time strings to `Date` objects via bidirectional `z.codec`s. */
export interface DatesOptions {
  /** `format: date-time` → `z.codec(z.iso.datetime(), z.date(), ...)`. */
  datetime?: boolean
  /** `format: date` → a codec decoding to `Date` at UTC midnight. */
  date?: boolean
  /** Accept UTC offsets in date-time values (`z.iso.datetime({ offset: true })`). */
  offset?: boolean
}

export type DateCodecKind = 'datetime' | 'date'

export interface ConvertContext {
  /** Resolve a `$ref` to a generated identifier; `forward` when the target is not yet declared. */
  resolveRef(ref: string): { ident: string; forward: boolean }
  /** Resolve a `$ref` to its raw component schema, for structural checks; `undefined` when unknown. */
  resolveComponentSchema(ref: string): JsonSchema | undefined
  /** Date-codec conversion options; absent → ISO strings stay strings. */
  dates?: DatesOptions | undefined
  /** Identifier of the shared date codec for `kind`, registering it as used. */
  dateCodec?: ((kind: DateCodecKind) => string) | undefined
}

/** A zod expression plus whether it references an identifier declared later in the file. */
export interface Expr {
  code: string
  forward: boolean
  /** Set when the schema's `default` was folded into the expression already. */
  defaultHandled?: boolean
}

function lit(code: string): Expr {
  return { code, forward: false }
}

function isSchemaObject(s: unknown): s is JsonSchema {
  return typeof s === 'object' && s !== null && !Array.isArray(s)
}

function json(value: unknown): string {
  return JSON.stringify(value)
}

const STRING_FORMATS: Record<string, string> = {
  email: 'z.email()',
  uuid: 'z.uuid()',
  url: 'z.url()',
  uri: 'z.url()',
  'date-time': 'z.iso.datetime()',
  date: 'z.iso.date()',
  time: 'z.iso.time()',
  duration: 'z.iso.duration()',
  ipv4: 'z.ipv4()',
  ipv6: 'z.ipv6()',
}

/** The input-side (wire) schema of a date codec. */
export function dateCodecInput(kind: DateCodecKind, dates: DatesOptions): string {
  return kind === 'datetime'
    ? `z.iso.datetime(${dates.offset ? '{ offset: true }' : ''})`
    : 'z.iso.date()'
}

/** decode/encode function source for each date codec kind. */
export const DATE_CODEC_FNS: Record<DateCodecKind, { decode: string; encode: string }> = {
  datetime: {
    decode: '(value) => new Date(value)',
    encode: '(date) => date.toISOString()',
  },
  date: {
    decode: '(value) => new Date(`${value}T00:00:00Z`)',
    encode: '(date) => date.toISOString().slice(0, 10)',
  },
}

function dateCodecExpr(kind: DateCodecKind, input: string): string {
  const fns = DATE_CODEC_FNS[kind]
  return `z.codec(${input}, z.date(), { decode: ${fns.decode}, encode: ${fns.encode} })`
}

function stringExpr(schema: JsonSchema, ctx: ConvertContext): Expr {
  const format = typeof schema['format'] === 'string' ? schema['format'] : undefined
  const kind: DateCodecKind | undefined =
    format === 'date-time' && ctx.dates?.datetime === true
      ? 'datetime'
      : format === 'date' && ctx.dates?.date === true
        ? 'date'
        : undefined
  if (kind !== undefined && ctx.dateCodec !== undefined) {
    // Constraints and `default` belong to the codec's input (wire) side; the
    // shared helper covers the bare case, anything else inlines the codec.
    const bare = dateCodecInput(kind, ctx.dates ?? {})
    let input = bare
    if (typeof schema['minLength'] === 'number') input += `.min(${schema['minLength']})`
    if (typeof schema['maxLength'] === 'number') input += `.max(${schema['maxLength']})`
    let defaultHandled = false
    if ('default' in schema) {
      input += `.default(${json(schema['default'])})`
      defaultHandled = true
    }
    if (input === bare) return { code: ctx.dateCodec(kind), forward: false }
    return { code: dateCodecExpr(kind, input), forward: false, defaultHandled }
  }

  let code = (format !== undefined && STRING_FORMATS[format]) || 'z.string()'
  if (typeof schema['minLength'] === 'number') code += `.min(${schema['minLength']})`
  if (typeof schema['maxLength'] === 'number') code += `.max(${schema['maxLength']})`
  if (typeof schema['pattern'] === 'string' && (format === undefined || !STRING_FORMATS[format])) {
    code += `.regex(new RegExp(${json(schema['pattern'])}))`
  }
  return lit(code)
}

function numberExpr(schema: JsonSchema, integer: boolean): string {
  let code = integer ? 'z.int()' : 'z.number()'
  if (typeof schema['minimum'] === 'number') code += `.min(${schema['minimum']})`
  if (typeof schema['maximum'] === 'number') code += `.max(${schema['maximum']})`
  if (typeof schema['exclusiveMinimum'] === 'number') code += `.gt(${schema['exclusiveMinimum']})`
  if (typeof schema['exclusiveMaximum'] === 'number') code += `.lt(${schema['exclusiveMaximum']})`
  if (typeof schema['multipleOf'] === 'number') code += `.multipleOf(${schema['multipleOf']})`
  return code
}

function enumExpr(values: unknown[]): string {
  if (values.length > 0 && values.every((v) => typeof v === 'string')) {
    return `z.enum([${values.map(json).join(', ')}])`
  }
  if (values.length === 1) return `z.literal(${json(values[0])})`
  return `z.union([${values.map((v) => `z.literal(${json(v)})`).join(', ')}])`
}

function objectExpr(schema: JsonSchema, ctx: ConvertContext, indent: string): Expr {
  const properties = isSchemaObject(schema['properties']) ? schema['properties'] : undefined
  const required = new Set(Array.isArray(schema['required']) ? schema['required'] : [])
  const additional = schema['additionalProperties']

  // A pure map type: no declared properties, values constrained by additionalProperties.
  if (properties === undefined && isSchemaObject(additional)) {
    const value = convertSchema(additional, ctx, indent)
    return { code: `z.record(z.string(), ${value.code})`, forward: value.forward }
  }

  const inner = `${indent}  `
  const entries: string[] = []
  let forward = false
  for (const [key, propSchema] of Object.entries(properties ?? {})) {
    const prop = convertSchema(propSchema, ctx, inner)
    const withOptional = required.has(key) ? prop.code : `${prop.code}.optional()`
    const name = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : json(key)
    // Forward references must be deferred; zod object shapes support getters for this.
    entries.push(
      prop.forward
        ? `${inner}get ${name}() {\n${inner}  return ${withOptional}\n${inner}},`
        : `${inner}${name}: ${withOptional},`,
    )
    forward ||= prop.forward
  }
  const shape = entries.length === 0 ? '{}' : `{\n${entries.join('\n')}\n${indent}}`

  let code: string
  if (additional === true || (isSchemaObject(additional) && Object.keys(additional).length === 0)) {
    code = `z.looseObject(${shape})`
  } else if (isSchemaObject(additional)) {
    const catchall = convertSchema(additional, ctx, indent)
    forward ||= catchall.forward
    code = `z.object(${shape}).catchall(${catchall.code})`
  } else {
    code = `z.object(${shape})`
  }
  return { code, forward }
}

function arrayExpr(schema: JsonSchema, ctx: ConvertContext, indent: string): Expr {
  const prefixItems = schema['prefixItems']
  if (Array.isArray(prefixItems)) {
    const members = prefixItems.map((m) => convertSchema(m, ctx, indent))
    const rest = isSchemaObject(schema['items'])
      ? convertSchema(schema['items'], ctx, indent)
      : undefined
    const args = `[${members.map((m) => m.code).join(', ')}]${rest ? `, ${rest.code}` : ''}`
    return {
      code: `z.tuple(${args})`,
      forward: members.some((m) => m.forward) || (rest?.forward ?? false),
    }
  }
  const items =
    schema['items'] === undefined ? lit('z.unknown()') : convertSchema(schema['items'], ctx, indent)
  let code = `z.array(${items.code})`
  if (typeof schema['minItems'] === 'number') code += `.min(${schema['minItems']})`
  if (typeof schema['maxItems'] === 'number') code += `.max(${schema['maxItems']})`
  return { code, forward: items.forward }
}

function unionExpr(members: unknown[], ctx: ConvertContext, indent: string): Expr {
  // X | null → X.nullable()
  if (members.length === 2) {
    const nullIdx = members.findIndex((m) => isSchemaObject(m) && m['type'] === 'null')
    if (nullIdx !== -1) {
      const other = convertSchema(members[1 - nullIdx], ctx, indent)
      return { code: `${other.code}.nullable()`, forward: other.forward }
    }
  }
  const exprs = members.map((m) => convertSchema(m, ctx, indent))
  return {
    code: `z.union([${exprs.map((e) => e.code).join(', ')}])`,
    forward: exprs.some((e) => e.forward),
  }
}

/** The string values `properties[propertyName]` pins a member to, or `undefined` if unusable. */
function discriminatorValues(component: JsonSchema, propertyName: string): string[] | undefined {
  const properties = isSchemaObject(component['properties']) ? component['properties'] : undefined
  const property = properties?.[propertyName]
  if (!isSchemaObject(property)) return undefined
  if (typeof property['const'] === 'string') return [property['const']]
  const values = property['enum']
  if (Array.isArray(values) && values.length > 0 && values.every((v) => typeof v === 'string')) {
    return values
  }
  return undefined
}

/**
 * `oneOf`/`anyOf` with a `discriminator` → `z.discriminatedUnion(...)`, or `undefined` to fall
 * back to a plain union. zod validates lazily at parse time, so a member the guards cannot prove
 * safe (non-`$ref`, forward reference, or no `const`/string-enum discriminator property) would
 * make the generated contract throw in userland — fall back instead. A `{type: "null"}` member is
 * excluded from the union and restored with `.nullable()`.
 */
function discriminatedUnionExpr(
  schema: JsonSchema,
  members: unknown[],
  ctx: ConvertContext,
): Expr | undefined {
  const discriminator = schema['discriminator']
  if (!isSchemaObject(discriminator)) return undefined
  const propertyName = discriminator['propertyName']
  if (typeof propertyName !== 'string') return undefined

  const refs: string[] = []
  let nullable = false
  for (const member of members) {
    if (!isSchemaObject(member)) return undefined
    if (member['type'] === 'null') {
      nullable = true
      continue
    }
    if (typeof member['$ref'] !== 'string' || Object.keys(member).length !== 1) return undefined
    refs.push(member['$ref'])
  }
  if (refs.length < 2) return undefined

  const idents: string[] = []
  const valuesByRef = new Map<string, string[]>()
  for (const ref of refs) {
    const component = ctx.resolveComponentSchema(ref)
    if (component === undefined) return undefined
    const values = discriminatorValues(component, propertyName)
    if (values === undefined) return undefined
    const { ident, forward } = ctx.resolveRef(ref)
    if (forward) return undefined
    idents.push(ident)
    valuesByRef.set(ref, values)
  }

  // `mapping` is redundant (zod reads the values off each member) but when present it must agree
  // with the members: every entry must target a member whose discriminator values include the key.
  const mapping = discriminator['mapping']
  if (mapping !== undefined) {
    if (!isSchemaObject(mapping)) return undefined
    for (const [value, target] of Object.entries(mapping)) {
      if (typeof target !== 'string') return undefined
      // Mapping values may be a full `$ref` or a bare component name.
      const ref = refs.find((r) => r === target || r.endsWith(`/${target}`))
      if (ref === undefined || !valuesByRef.get(ref)?.includes(value)) return undefined
    }
  }

  let code = `z.discriminatedUnion(${json(propertyName)}, [${idents.join(', ')}])`
  if (nullable) code += '.nullable()'
  return { code, forward: false }
}

function baseExpr(schema: JsonSchema, ctx: ConvertContext, indent: string): Expr {
  const ref = schema['$ref']
  if (typeof ref === 'string') {
    const { ident, forward } = ctx.resolveRef(ref)
    return { code: ident, forward }
  }

  if ('const' in schema) return lit(`z.literal(${json(schema['const'])})`)
  if (Array.isArray(schema['enum'])) return lit(enumExpr(schema['enum']))

  const anyOf = schema['anyOf'] ?? schema['oneOf']
  if (Array.isArray(anyOf)) {
    return discriminatedUnionExpr(schema, anyOf, ctx) ?? unionExpr(anyOf, ctx, indent)
  }
  if (Array.isArray(schema['allOf'])) {
    const members = schema['allOf'].map((m) => convertSchema(m, ctx, indent))
    const code = members
      .map((m) => m.code)
      .reduce((acc, next) => (acc === '' ? next : `z.intersection(${acc}, ${next})`), '')
    return { code: code || 'z.unknown()', forward: members.some((m) => m.forward) }
  }

  const type = schema['type']
  if (Array.isArray(type)) {
    if (type.length === 2 && type.includes('null')) {
      const other = baseExpr({ ...schema, type: type.find((t) => t !== 'null') }, ctx, indent)
      return {
        code: `${other.code}.nullable()`,
        forward: other.forward,
        ...(other.defaultHandled !== undefined && { defaultHandled: other.defaultHandled }),
      }
    }
    return unionExpr(
      type.map((t) => ({ ...schema, type: t })),
      ctx,
      indent,
    )
  }

  switch (type) {
    case 'string':
      return stringExpr(schema, ctx)
    case 'number':
      return lit(numberExpr(schema, false))
    case 'integer':
      return lit(numberExpr(schema, true))
    case 'boolean':
      return lit('z.boolean()')
    case 'null':
      return lit('z.null()')
    case 'object':
      return objectExpr(schema, ctx, indent)
    case 'array':
      return arrayExpr(schema, ctx, indent)
    case undefined:
      // Untyped but with object/array keywords still convert structurally.
      if ('properties' in schema || 'additionalProperties' in schema) {
        return objectExpr(schema, ctx, indent)
      }
      if ('items' in schema || 'prefixItems' in schema) return arrayExpr(schema, ctx, indent)
      return lit('z.unknown()')
    default:
      throw new Error(`unsupported schema type: ${json(type)}`)
  }
}

/** Metadata keywords carried through `.meta()` / `.default()` rather than validation. */
function metaSuffix(schema: JsonSchema, skipDefault: boolean): string {
  let code = ''
  if (!skipDefault && 'default' in schema) code += `.default(${json(schema['default'])})`
  const meta: string[] = []
  if (typeof schema['title'] === 'string') meta.push(`title: ${json(schema['title'])}`)
  if (typeof schema['description'] === 'string') {
    meta.push(`description: ${json(schema['description'])}`)
  }
  if (Array.isArray(schema['examples'])) meta.push(`examples: ${json(schema['examples'])}`)
  if (schema['deprecated'] === true) meta.push('deprecated: true')
  if (meta.length > 0) code += `.meta({ ${meta.join(', ')} })`
  return code
}

export function convertSchema(schema: unknown, ctx: ConvertContext, indent = ''): Expr {
  if (schema === true) return lit('z.unknown()')
  if (schema === false) return lit('z.never()')
  if (!isSchemaObject(schema)) throw new Error(`expected a schema object, got ${json(schema)}`)
  const base = baseExpr(schema, ctx, indent)
  return {
    code: base.code + metaSuffix(schema, base.defaultHandled === true),
    forward: base.forward,
  }
}
