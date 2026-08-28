// Shapes foreign OpenAPI generators emit that zod's own serialization never
// produces, so the round-trip fixture cannot cover them.
import { describe, expect, it } from 'vitest'

import { generateContract } from '../src/index.js'
import { convertSchema, type ConvertContext } from '../src/schema-to-zod.js'

// Components resolvable through the mock context, keyed by bare name.
const components: Record<string, Record<string, unknown>> = {
  Cat: { type: 'object', properties: { kind: { const: 'cat' } }, required: ['kind'] },
  Dog: { type: 'object', properties: { kind: { enum: ['dog'] } }, required: ['kind'] },
  Fish: { type: 'object', properties: { fins: { type: 'number' } } },
}

const ctx: ConvertContext = {
  resolveRef: (ref) => ({ ident: ref.split('/').at(-1) ?? '', forward: false }),
  resolveComponentSchema: (ref) => components[ref.split('/').at(-1) ?? ''],
}

function code(schema: unknown): string {
  return convertSchema(schema, ctx).code
}

describe('convertSchema', () => {
  it('converts const to a literal', () => {
    expect(code({ const: 'fixed' })).toBe('z.literal("fixed")')
    expect(code({ const: 42 })).toBe('z.literal(42)')
  })

  it('treats oneOf like anyOf', () => {
    expect(code({ oneOf: [{ type: 'string' }, { type: 'number' }] })).toBe(
      'z.union([z.string(), z.number()])',
    )
  })

  describe('discriminator', () => {
    const cat = { $ref: '#/components/schemas/Cat' }
    const dog = { $ref: '#/components/schemas/Dog' }

    it('emits a discriminated union for oneOf with a discriminator', () => {
      expect(code({ oneOf: [cat, dog], discriminator: { propertyName: 'kind' } })).toBe(
        'z.discriminatedUnion("kind", [Cat, Dog])',
      )
    })

    it('honors a discriminator next to anyOf', () => {
      expect(code({ anyOf: [cat, dog], discriminator: { propertyName: 'kind' } })).toBe(
        'z.discriminatedUnion("kind", [Cat, Dog])',
      )
    })

    it('accepts a consistent mapping, with full refs or bare names', () => {
      const mapping = { cat: '#/components/schemas/Cat', dog: 'Dog' }
      expect(code({ oneOf: [cat, dog], discriminator: { propertyName: 'kind', mapping } })).toBe(
        'z.discriminatedUnion("kind", [Cat, Dog])',
      )
    })

    it('excludes a null member and appends .nullable()', () => {
      expect(
        code({ oneOf: [cat, dog, { type: 'null' }], discriminator: { propertyName: 'kind' } }),
      ).toBe('z.discriminatedUnion("kind", [Cat, Dog]).nullable()')
    })

    it('falls back when a member lacks the discriminator property', () => {
      const fish = { $ref: '#/components/schemas/Fish' }
      expect(code({ oneOf: [cat, fish], discriminator: { propertyName: 'kind' } })).toBe(
        'z.union([Cat, Fish])',
      )
    })

    it('falls back when a member is not a plain $ref', () => {
      const inline = { type: 'object', properties: { kind: { const: 'inline' } } }
      expect(code({ oneOf: [cat, inline], discriminator: { propertyName: 'kind' } })).toBe(
        `z.union([Cat, ${code(inline)}])`,
      )
    })

    it('falls back when a member is a forward reference', () => {
      const forwardCtx: ConvertContext = {
        ...ctx,
        resolveRef: (ref) => ({ ident: ref.split('/').at(-1) ?? '', forward: true }),
      }
      expect(
        convertSchema({ oneOf: [cat, dog], discriminator: { propertyName: 'kind' } }, forwardCtx)
          .code,
      ).toBe('z.union([Cat, Dog])')
    })

    it('falls back when the mapping disagrees with the members', () => {
      const mapping = { cat: '#/components/schemas/Dog' }
      expect(code({ oneOf: [cat, dog], discriminator: { propertyName: 'kind', mapping } })).toBe(
        'z.union([Cat, Dog])',
      )
    })
  })

  it('collapses a null branch into .nullable()', () => {
    expect(code({ anyOf: [{ type: 'string' }, { type: 'null' }] })).toBe('z.string().nullable()')
    expect(code({ type: ['integer', 'null'] })).toBe('z.int().nullable()')
  })

  it('keeps sibling keywords on a $ref', () => {
    expect(code({ $ref: '#/components/schemas/Role', default: 'member' })).toBe(
      'Role.default("member")',
    )
  })

  it('converts boolean schemas', () => {
    expect(code(true)).toBe('z.unknown()')
    expect(code(false)).toBe('z.never()')
  })

  it('applies pattern as a regex', () => {
    expect(code({ type: 'string', pattern: '^[a-z]+$' })).toBe(
      'z.string().regex(new RegExp("^[a-z]+$"))',
    )
  })

  it('converts a mixed-type enum to a union of literals', () => {
    expect(code({ enum: ['a', 1] })).toBe('z.union([z.literal("a"), z.literal(1)])')
  })

  it('converts a multi-type array to a union', () => {
    expect(code({ type: ['string', 'number', 'boolean'] })).toBe(
      'z.union([z.string(), z.number(), z.boolean()])',
    )
  })

  it('quotes property names that are not identifiers', () => {
    expect(code({ type: 'object', properties: { 'x-y': { type: 'string' } } })).toContain(
      '"x-y": z.string().optional()',
    )
  })

  it('rejects unsupported types', () => {
    expect(() => code({ type: 'file' })).toThrow('unsupported schema type')
  })
})

describe('generateContract', () => {
  it('rejects non-3.1 documents', () => {
    expect(() => generateContract({ openapi: '3.0.3', paths: {} })).toThrow(
      'expected an OpenAPI 3.1 document',
    )
  })

  it('rejects refs outside #/components/schemas', () => {
    expect(() =>
      generateContract({
        openapi: '3.1.0',
        paths: {
          '/x': {
            get: {
              responses: {
                200: {
                  description: 'ok',
                  content: {
                    'application/json': { schema: { $ref: '#/components/responses/X' } },
                  },
                },
              },
            },
          },
        },
      }),
    ).toThrow('unsupported $ref')
  })

  it('falls back to method + path for the const name and omits the alias', () => {
    const source = generateContract({
      openapi: '3.1.0',
      paths: {
        '/things/{id}': { get: { responses: { 200: { description: 'ok' } } } },
      },
    })
    expect(source).toContain('export const getThingsId = {')
    expect(source).not.toContain('alias:')
  })
})
