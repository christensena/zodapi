import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { queryArray, schemaContainsCodec } from '../src/index.js'

const isoDatetimeToDate = z.codec(z.iso.datetime(), z.date(), {
  decode: (value) => new Date(value),
  encode: (date) => date.toISOString(),
})

describe('schemaContainsCodec()', () => {
  it('finds a codec at the top level and nested', () => {
    expect(schemaContainsCodec(isoDatetimeToDate)).toBe(true)
    expect(schemaContainsCodec(z.object({ at: isoDatetimeToDate }))).toBe(true)
    expect(schemaContainsCodec(z.array(z.object({ at: isoDatetimeToDate.optional() })))).toBe(true)
    expect(schemaContainsCodec(z.union([z.string(), isoDatetimeToDate]))).toBe(true)
    expect(schemaContainsCodec(z.record(z.string(), isoDatetimeToDate))).toBe(true)
    expect(schemaContainsCodec(isoDatetimeToDate.nullable().default(new Date(0)))).toBe(true)
  })

  it('ignores one-way pipes (transform, preprocess, queryArray)', () => {
    expect(schemaContainsCodec(z.string().transform((s) => s.length))).toBe(false)
    expect(schemaContainsCodec(z.object({ tags: queryArray(z.string()) }))).toBe(false)
    expect(schemaContainsCodec(z.object({ name: z.string() }))).toBe(false)
  })

  it('terminates on recursive schemas', () => {
    interface Node {
      at: Date
      children: Node[]
    }
    const Node: z.ZodType<Node, unknown> = z.object({
      at: isoDatetimeToDate,
      get children() {
        return z.array(Node)
      },
    })
    expect(schemaContainsCodec(Node)).toBe(true)

    const Plain: z.ZodType<unknown> = z.lazy(() => z.object({ children: z.array(Plain) }))
    expect(schemaContainsCodec(Plain)).toBe(false)
  })
})
