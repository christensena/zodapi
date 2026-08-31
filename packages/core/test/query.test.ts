import { wireBoolean, wireNumber } from '@zodapi/core'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

describe('wireNumber()', () => {
  const limit = wireNumber(z.int().min(1).max(100).default(20))

  it('parses the raw string the wire delivers', () => {
    expect(limit.parse('50')).toBe(50)
  })

  it('still accepts an already-decoded value', () => {
    expect(limit.parse(42)).toBe(42)
  })

  it('keeps the wrapped schema in force', () => {
    expect(() => limit.parse('0')).toThrow()
    expect(() => limit.parse('101')).toThrow()
    expect(() => limit.parse('1.5')).toThrow()
  })

  it('leaves a non-numeric string alone rather than passing on NaN', () => {
    expect(() => limit.parse('abc')).toThrow()
  })

  it('leaves an empty string alone rather than reading it as 0', () => {
    expect(() => wireNumber(z.int()).parse('')).toThrow()
  })

  it('applies the wrapped default when the value is absent', () => {
    expect(limit.parse(undefined)).toBe(20)
  })
})

describe('wireBoolean()', () => {
  const verbose = wireBoolean(z.boolean())

  it('parses the two strings a boolean is serialized as', () => {
    expect(verbose.parse('true')).toBe(true)
    expect(verbose.parse('false')).toBe(false)
  })

  it('still accepts an already-decoded value', () => {
    expect(verbose.parse(true)).toBe(true)
  })

  // Unlike z.coerce.boolean(), whose JS truthiness turns every non-empty
  // string — "false" included — into true.
  it('rejects any other string rather than reading it as truthy', () => {
    for (const value of ['1', '0', 'yes', 'TRUE', '']) {
      expect(() => verbose.parse(value)).toThrow()
    }
  })
})
