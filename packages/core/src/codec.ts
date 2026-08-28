import type { z } from 'zod'

interface SchemaLike {
  _zod: { def: { type: string } & Record<string, unknown> }
}

function isSchema(value: unknown): value is SchemaLike {
  return typeof value === 'object' && value !== null && '_zod' in value
}

function anyContains(values: unknown[], visited: Set<object>): boolean {
  return values.some((v) => isSchema(v) && walk(v, visited))
}

function walk(schema: SchemaLike, visited: Set<object>): boolean {
  if (visited.has(schema)) return false
  visited.add(schema)
  const def = schema._zod.def
  switch (def.type) {
    case 'pipe':
      // A codec is a pipe carrying a reverse transform; plain .transform()/
      // z.preprocess() pipes (e.g. queryArray) don't.
      return 'reverseTransform' in def || anyContains([def['in'], def['out']], visited)
    case 'object':
      return (
        anyContains(Object.values(def['shape'] ?? {}), visited) ||
        anyContains([def['catchall']], visited)
      )
    case 'array':
      return anyContains([def['element']], visited)
    case 'tuple':
      return anyContains(
        [...(Array.isArray(def['items']) ? def['items'] : []), def['rest']],
        visited,
      )
    case 'union':
      return anyContains(Array.isArray(def['options']) ? def['options'] : [], visited)
    case 'intersection':
      return anyContains([def['left'], def['right']], visited)
    case 'record':
    case 'map':
      return anyContains([def['keyType'], def['valueType']], visited)
    case 'set':
      return anyContains([def['valueType']], visited)
    case 'optional':
    case 'nonoptional':
    case 'nullable':
    case 'default':
    case 'prefault':
    case 'readonly':
    case 'catch':
    case 'promise':
      return anyContains([def['innerType']], visited)
    case 'lazy':
      return typeof def['getter'] === 'function' && anyContains([def['getter']()], visited)
    default:
      return false
  }
}

const containsCodecCache = new WeakMap<object, boolean>()

/**
 * True when `schema` contains a `z.codec(...)` anywhere in its tree (object
 * properties, array elements, unions, wrappers, lazy/recursive schemas).
 *
 * Codecs change the parsed value's shape (e.g. ISO string ↔ `Date`), so a
 * client skipping validation would return wire data that contradicts the
 * schema's output types — `@zodapi/client` uses this to fail fast instead.
 */
export function schemaContainsCodec(schema: z.ZodType): boolean {
  const cached = containsCodecCache.get(schema)
  if (cached !== undefined) return cached
  const result = isSchema(schema) && walk(schema, new Set())
  containsCodecCache.set(schema, result)
  return result
}
