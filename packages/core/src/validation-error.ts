import { z } from 'zod'

export const ValidationTarget = z.enum(['json', 'form', 'query', 'param', 'header', 'cookie'])
export type ValidationTarget = z.infer<typeof ValidationTarget>

export const ValidationIssue = z.looseObject({
  code: z.string(),
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
})
export type ValidationIssue = z.infer<typeof ValidationIssue>

/**
 * The fixed 400 response body every zodapi server returns when request
 * validation fails. Registered as the `ValidationError` OpenAPI component.
 */
export const ValidationError = z
  .object({
    error: z.object({
      code: z.literal('VALIDATION'),
      target: ValidationTarget,
      issues: z.array(ValidationIssue),
    }),
  })
  .meta({ id: 'ValidationError' })
export type ValidationError = z.infer<typeof ValidationError>

/** Build the fixed 400 body from a zod error (server-side hook uses this). */
export function validationErrorBody(
  target: string,
  error: { issues: readonly { code: string; path: PropertyKey[]; message: string }[] },
): ValidationError {
  return {
    error: {
      code: 'VALIDATION',
      target: ValidationTarget.parse(target),
      issues: error.issues.map((issue) => ({
        ...issue,
        path: issue.path.filter((p): p is string | number => typeof p !== 'symbol'),
      })),
    },
  }
}

/** True when `data` is a zodapi validation-error body (e.g. the parsed body of a 400). */
export function isValidationErrorBody(data: unknown): data is ValidationError {
  return ValidationError.safeParse(data).success
}
