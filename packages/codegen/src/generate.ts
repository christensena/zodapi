import { NameAllocator, routeNameFromPath } from './names.js'
import {
  DATE_CODEC_FNS,
  convertSchema,
  dateCodecInput,
  type ConvertContext,
  type DateCodecKind,
  type DatesOptions,
  type JsonSchema,
} from './schema-to-zod.js'

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'] as const

const REF_PREFIX = '#/components/schemas/'

function isObject(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function json(value: unknown): string {
  return JSON.stringify(value)
}

/** All `#/components/schemas/*` names referenced anywhere inside `value`. */
function collectRefs(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, into)
    return
  }
  if (!isObject(value)) return
  const ref = value['$ref']
  if (typeof ref === 'string' && ref.startsWith(REF_PREFIX)) {
    into.add(ref.slice(REF_PREFIX.length))
  }
  for (const item of Object.values(value)) collectRefs(item, into)
}

/** DFS postorder so dependencies come before dependents; cycles resolve via object getters. */
function orderComponents(schemas: Record<string, unknown>): string[] {
  const order: string[] = []
  const visited = new Set<string>()
  const visit = (name: string): void => {
    if (visited.has(name) || !(name in schemas)) return
    visited.add(name)
    const deps = new Set<string>()
    collectRefs(schemas[name], deps)
    for (const dep of deps) visit(dep)
    order.push(name)
  }
  for (const name of Object.keys(schemas)) visit(name)
  return order
}

/** Splices extra entries into a trailing `.meta({ ... })` call, or appends one. */
function withMeta(code: string, entries: string[]): string {
  if (entries.length === 0) return code
  const tail = /^([\s\S]*)\.meta\(\{ ([\s\S]*) \}\)$/.exec(code)
  if (tail) return `${tail[1]}.meta({ ${entries.join(', ')}, ${tail[2]} })`
  return `${code}.meta({ ${entries.join(', ')} })`
}

// Mirrors ZODAPI_VALIDATION_TYPE from @zodapi/core (codegen only reads specs).
const ZODAPI_VALIDATION_TYPE = 'urn:zodapi:validation'

export type ProblemFlavor = 'zodapi' | 'problem-details'

function isZodapiValidationSchema(schema: JsonSchema): boolean {
  const properties = isObject(schema['properties']) ? schema['properties'] : {}
  const type = properties['type']
  if (!isObject(type)) return false
  // zod literals serialize as one-element enums; accept const too.
  const values = Array.isArray(type['enum']) ? type['enum'] : [type['const']]
  return values.includes(ZODAPI_VALIDATION_TYPE)
}

/** ASP.NET-style `ValidationProblemDetails`: an `errors` map of string arrays plus problem members. */
function isValidationProblemSchema(schema: JsonSchema): boolean {
  const properties = isObject(schema['properties']) ? schema['properties'] : {}
  const errors = properties['errors']
  if (!isObject(errors)) return false
  const additional = errors['additionalProperties']
  const items = isObject(additional) ? additional['items'] : undefined
  const errorsAreStringArrays =
    isObject(additional) &&
    additional['type'] === 'array' &&
    isObject(items) &&
    items['type'] === 'string'
  const hasProblemMember = ['type', 'title', 'status', 'detail'].some((m) => m in properties)
  return errorsAreStringArrays && hasProblemMember
}

/**
 * Detect which problem-details flavor a spec's error responses use, so
 * generated contracts can carry a `problemFlavor` hint for
 * `decodersFor(...)` on the client.
 */
export function detectProblemFlavor(doc: unknown): ProblemFlavor | undefined {
  if (!isObject(doc)) return undefined
  const components = isObject(doc['components']) ? doc['components'] : {}
  const schemas = isObject(components['schemas']) ? components['schemas'] : {}
  const resolve = (schema: unknown): JsonSchema | undefined => {
    if (!isObject(schema)) return undefined
    const ref = schema['$ref']
    if (typeof ref === 'string' && ref.startsWith(REF_PREFIX)) {
      const target = schemas[ref.slice(REF_PREFIX.length)]
      return isObject(target) ? target : undefined
    }
    return schema
  }

  let flavor: ProblemFlavor | undefined
  const paths = isObject(doc['paths']) ? doc['paths'] : {}
  for (const pathItem of Object.values(paths)) {
    if (!isObject(pathItem)) continue
    for (const method of METHODS) {
      const op = pathItem[method]
      if (!isObject(op) || !isObject(op['responses'])) continue
      for (const [status, response] of Object.entries(op['responses'])) {
        if (!/^[45]|^default$/.test(status)) continue
        if (!isObject(response) || !isObject(response['content'])) continue
        for (const mediaDef of Object.values(response['content'])) {
          const schema = resolve(isObject(mediaDef) ? mediaDef['schema'] : undefined)
          if (!schema) continue
          if (isZodapiValidationSchema(schema)) return 'zodapi'
          if (isValidationProblemSchema(schema)) flavor = 'problem-details'
        }
      }
    }
  }
  return flavor
}

interface ParameterObject {
  name: string
  in: 'path' | 'query' | 'header' | 'cookie'
  required?: boolean
  description?: string
  schema?: unknown
}

export interface GenerateOptions {
  /** Convert ISO date/time strings to `Date` objects via `z.codec`s. */
  dates?: DatesOptions | undefined
}

const DATE_CODEC_NAMES: Record<DateCodecKind, string> = {
  datetime: 'isoDatetimeToDate',
  date: 'isoDateToDate',
}

class Generator {
  private readonly names = new NameAllocator()
  private readonly declared = new Set<string>()
  private usesQueryArray = false
  private readonly dateCodecs = new Map<DateCodecKind, string>()
  private readonly schemas: JsonSchema
  private readonly ctx: ConvertContext = {
    dates: undefined,
    dateCodec: (kind) => {
      const existing = this.dateCodecs.get(kind)
      if (existing !== undefined) return existing
      // Distinct allocator key so a component named like the helper still wins its name.
      const ident = this.names.allocate(`date-codec:${kind}`, DATE_CODEC_NAMES[kind])
      this.dateCodecs.set(kind, ident)
      return ident
    },
    resolveRef: (ref) => {
      if (!ref.startsWith(REF_PREFIX)) throw new Error(`unsupported $ref: ${ref}`)
      const original = ref.slice(REF_PREFIX.length)
      const ident = this.names.lookup(original)
      if (ident === undefined) throw new Error(`$ref to unknown component: ${ref}`)
      return { ident, forward: !this.declared.has(original) }
    },
    resolveComponentSchema: (ref) => {
      if (!ref.startsWith(REF_PREFIX)) return undefined
      const target = this.schemas[ref.slice(REF_PREFIX.length)]
      return isObject(target) ? target : undefined
    },
  }

  constructor(
    private readonly doc: JsonSchema,
    options?: GenerateOptions,
  ) {
    const components = isObject(doc['components']) ? doc['components'] : {}
    this.schemas = isObject(components['schemas']) ? components['schemas'] : {}
    this.ctx.dates = options?.dates
  }

  generate(): string {
    const openapi = this.doc['openapi']
    if (typeof openapi !== 'string' || !openapi.startsWith('3.1')) {
      throw new Error(`expected an OpenAPI 3.1 document, got openapi: ${json(openapi)}`)
    }

    const schemas = this.schemas
    const order = orderComponents(schemas)
    // Allocate all component names first so refs resolve regardless of order.
    for (const name of Object.keys(schemas)) this.names.allocate(name)

    const componentDecls = order.map((name) => {
      const expr = convertSchema(schemas[name], this.ctx)
      const code = withMeta(expr.code, [`id: ${json(name)}`])
      this.declared.add(name)
      return `export const ${this.names.lookup(name)} = ${code}\n`
    })

    const routeDecls: string[] = []
    const routeIdents: string[] = []
    const paths = isObject(this.doc['paths']) ? this.doc['paths'] : {}
    for (const [path, pathItem] of Object.entries(paths)) {
      if (!isObject(pathItem)) continue
      for (const method of METHODS) {
        const op = pathItem[method]
        if (!isObject(op)) continue
        const ident = this.emitRoute(method, path, op, pathItem, routeDecls)
        routeIdents.push(ident)
      }
    }

    const imports = [
      `import type { RouteDef } from '@zodapi/core'`,
      ...(this.usesQueryArray ? [`import { queryArray } from '@zodapi/core'`] : []),
      `import { z } from 'zod'`,
    ]
    // RouteDef plus the documentation fields OpenAPI operations carry.
    const routeType =
      'type GeneratedRoute = RouteDef & {\n' +
      '  operationId?: string\n' +
      '  summary?: string\n' +
      '  description?: string\n' +
      '  tags?: readonly string[]\n' +
      '}\n'
    const routesArray =
      routeIdents.length === 0
        ? 'export const routes = [] as const\n'
        : `export const routes = [\n${routeIdents.map((r) => `  ${r},`).join('\n')}\n] as const\n`

    // Problem flavor of the spec's error responses; pair with decodersFor()
    // from @zodapi/client when creating a client for this contract.
    const flavor = detectProblemFlavor(this.doc)
    const flavorDecl = `export const problemFlavor: 'zodapi' | 'problem-details' | undefined = ${
      flavor === undefined ? 'undefined' : json(flavor)
    }\n`

    const dateCodecDecls = [...this.dateCodecs.entries()].map(([kind, ident]) => {
      const fns = DATE_CODEC_FNS[kind]
      const input = dateCodecInput(kind, this.ctx.dates ?? {})
      return (
        `export const ${ident} = z.codec(${input}, z.date(), {\n` +
        `  decode: ${fns.decode},\n` +
        `  encode: ${fns.encode},\n` +
        `})\n`
      )
    })

    return [
      '// Generated by @zodapi/codegen. Do not edit.',
      imports.join('\n'),
      ...(routeDecls.length > 0 ? [routeType] : []),
      ...dateCodecDecls,
      ...componentDecls,
      ...routeDecls,
      routesArray,
      flavorDecl,
    ].join('\n')
  }

  private emitRoute(
    method: string,
    path: string,
    op: JsonSchema,
    pathItem: JsonSchema,
    out: string[],
  ): string {
    const operationId = typeof op['operationId'] === 'string' ? op['operationId'] : undefined
    const ident = this.names.allocate(operationId ?? routeNameFromPath(method, path))

    const lines: string[] = [`export const ${ident} = {`]
    lines.push(`  method: ${json(method)},`)
    lines.push(`  path: ${json(path)},`)
    if (operationId !== undefined) {
      lines.push(`  alias: ${json(operationId)},`)
      lines.push(`  operationId: ${json(operationId)},`)
    }
    if (typeof op['summary'] === 'string') lines.push(`  summary: ${json(op['summary'])},`)
    if (typeof op['description'] === 'string') {
      lines.push(`  description: ${json(op['description'])},`)
    }
    if (Array.isArray(op['tags'])) lines.push(`  tags: ${json(op['tags'])},`)

    const requestLines = this.requestLines(op, pathItem)
    if (requestLines.length > 0) {
      lines.push('  request: {', ...requestLines, '  },')
    }

    lines.push('  responses: {')
    const responses = isObject(op['responses']) ? op['responses'] : {}
    for (const [status, response] of Object.entries(responses)) {
      if (!isObject(response)) continue
      const key = /^[0-9]+$/.test(status) ? status : json(status)
      lines.push(`    ${key}: {`)
      if (typeof response['description'] === 'string') {
        lines.push(`      description: ${json(response['description'])},`)
      }
      if (isObject(response['content'])) {
        lines.push(...this.contentLines(response['content'], '      '))
      }
      lines.push('    },')
    }
    lines.push('  },')
    lines.push('} as const satisfies GeneratedRoute')
    out.push(`${lines.join('\n')}\n`)
    return ident
  }

  private requestLines(op: JsonSchema, pathItem: JsonSchema): string[] {
    const lines: string[] = []
    const parameters = [
      ...(Array.isArray(pathItem['parameters']) ? pathItem['parameters'] : []),
      ...(Array.isArray(op['parameters']) ? op['parameters'] : []),
    ].filter((p): p is ParameterObject => {
      if (!isObject(p)) return false
      if (typeof p['$ref'] === 'string') throw new Error(`unsupported $ref parameter: ${p['$ref']}`)
      return typeof p['name'] === 'string' && typeof p['in'] === 'string'
    })

    const groups: Array<{ key: string; in: ParameterObject['in'] }> = [
      { key: 'params', in: 'path' },
      { key: 'query', in: 'query' },
      { key: 'headers', in: 'header' },
      { key: 'cookies', in: 'cookie' },
    ]
    for (const group of groups) {
      const members = parameters.filter((p) => p.in === group.in)
      if (members.length === 0) continue
      const entries = members.map((p) => {
        let code = this.parameterExpr(p)
        if (p.required !== true && group.in !== 'path') code += '.optional()'
        const name = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(p.name) ? p.name : json(p.name)
        return `      ${name}: ${code},`
      })
      lines.push(`    ${group.key}: z.object({`, ...entries, '    }),')
    }

    const body = op['requestBody']
    if (isObject(body)) {
      lines.push('    body: {')
      if (typeof body['description'] === 'string') {
        lines.push(`      description: ${json(body['description'])},`)
      }
      if (isObject(body['content'])) lines.push(...this.contentLines(body['content'], '      '))
      if (typeof body['required'] === 'boolean') {
        lines.push(`      required: ${body['required']},`)
      }
      lines.push('    },')
    }
    return lines
  }

  private parameterExpr(p: ParameterObject): string {
    const schema = p.schema ?? {}
    if (p.in === 'query' && isObject(schema) && schema['type'] === 'array') {
      this.usesQueryArray = true
      const items =
        schema['items'] === undefined ? 'z.unknown()' : this.expr(schema['items'], '      ')
      const description =
        typeof p.description === 'string' ? `.meta({ description: ${json(p.description)} })` : ''
      return `queryArray(${items})${description}`
    }
    let code = this.expr(schema, '      ')
    if (typeof p.description === 'string' && !(isObject(schema) && 'description' in schema)) {
      code = withMeta(code, [`description: ${json(p.description)}`])
    }
    return code
  }

  private contentLines(content: JsonSchema, indent: string): string[] {
    const lines: string[] = [`${indent}content: {`]
    for (const [media, mediaDef] of Object.entries(content)) {
      if (!isObject(mediaDef)) continue
      if (mediaDef['schema'] === undefined) {
        lines.push(`${indent}  ${json(media)}: {},`)
      } else {
        const schema = this.expr(mediaDef['schema'], `${indent}    `)
        lines.push(
          `${indent}  ${json(media)}: {`,
          `${indent}    schema: ${schema},`,
          `${indent}  },`,
        )
      }
    }
    lines.push(`${indent}},`)
    return lines
  }

  private expr(schema: unknown, indent: string): string {
    return convertSchema(schema, this.ctx, indent).code
  }
}

/**
 * Generate zodapi contract source (zod schemas + `RouteDef` route objects) from
 * a parsed OpenAPI 3.1 document. The result imports only `zod` and
 * `@zodapi/core`, and exports one const per component schema, one per
 * operation, and a `routes` tuple for `createClient(routes)`.
 */
export function generateContract(doc: unknown, options?: GenerateOptions): string {
  if (!isObject(doc)) throw new Error('expected a parsed OpenAPI document object')
  return new Generator(doc, options).generate()
}
