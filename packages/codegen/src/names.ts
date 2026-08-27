const RESERVED = new Set([
  // generated-file imports and exports
  'z',
  'RouteDef',
  'GeneratedRoute',
  'queryArray',
  'routes',
  // JS reserved words that survive sanitization
  'break',
  'case',
  'catch',
  'class',
  'const',
  'continue',
  'debugger',
  'default',
  'delete',
  'do',
  'else',
  'enum',
  'export',
  'extends',
  'false',
  'finally',
  'for',
  'function',
  'if',
  'import',
  'in',
  'instanceof',
  'new',
  'null',
  'return',
  'super',
  'switch',
  'this',
  'throw',
  'true',
  'try',
  'typeof',
  'var',
  'void',
  'while',
  'with',
  'yield',
  'let',
  'static',
  'await',
])

function sanitize(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_$]/g, '_')
  const prefixed = /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned
  return prefixed === '' ? '_' : prefixed
}

/** Allocates unique, valid TS identifiers, remembering the mapping from original names. */
export class NameAllocator {
  private readonly used = new Set<string>(RESERVED)
  private readonly byOriginal = new Map<string, string>()

  allocate(original: string): string {
    const existing = this.byOriginal.get(original)
    if (existing !== undefined) return existing
    const base = sanitize(original)
    let candidate = base
    for (let i = 2; this.used.has(candidate); i++) {
      candidate = `${base}${i}`
    }
    this.used.add(candidate)
    this.byOriginal.set(original, candidate)
    return candidate
  }

  lookup(original: string): string | undefined {
    return this.byOriginal.get(original)
  }
}

/** `get` + '/things/{id}' → 'getThingsId' — fallback route name when there is no operationId. */
export function routeNameFromPath(method: string, path: string): string {
  const segments = path
    .split('/')
    .map((s) => s.replace(/[{}]/g, ''))
    .flatMap((s) => s.split(/[^A-Za-z0-9]+/))
    .filter(Boolean)
  const camel = segments.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join('')
  return `${method}${camel || 'Root'}`
}
