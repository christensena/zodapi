import { describe, expect, it } from 'vitest'

import { detectProblemFlavor, generateContract } from '../src/index.js'
import { buildDoc } from './fixture/build-doc.js'
import { routes } from './fixture/contract.js'

function docWith400(schema: unknown, components: Record<string, unknown> = {}): unknown {
  return {
    openapi: '3.1.0',
    info: { title: 't', version: '1' },
    components: { schemas: components },
    paths: {
      '/things': {
        get: {
          responses: {
            200: { description: 'ok' },
            400: { description: 'bad', content: { 'application/problem+json': { schema } } },
          },
        },
      },
    },
  }
}

const aspnetValidationProblem = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    title: { type: 'string' },
    status: { type: 'integer' },
    detail: { type: 'string' },
    errors: {
      type: 'object',
      additionalProperties: { type: 'array', items: { type: 'string' } },
    },
  },
}

describe('detectProblemFlavor()', () => {
  it('detects zodapi from the fixture doc (injected 400 with the type const)', () => {
    expect(detectProblemFlavor(buildDoc(routes))).toBe('zodapi')
  })

  it('detects ASP.NET-style ValidationProblemDetails via $ref', () => {
    const doc = docWith400(
      { $ref: '#/components/schemas/HttpValidationProblemDetails' },
      { HttpValidationProblemDetails: aspnetValidationProblem },
    )
    expect(detectProblemFlavor(doc)).toBe('problem-details')
  })

  it('returns undefined when error responses match no known flavor', () => {
    expect(detectProblemFlavor(docWith400({ type: 'string' }))).toBeUndefined()
  })
})

describe('problemFlavor export', () => {
  it('is emitted in generated contracts', () => {
    const source = generateContract(buildDoc(routes))
    expect(source).toContain(
      "export const problemFlavor: 'zodapi' | 'problem-details' | undefined = \"zodapi\"",
    )
  })
})
