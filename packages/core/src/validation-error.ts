import { z } from 'zod'

/** Media type of RFC 9457 problem-details responses, including zodapi's own 400. */
export const PROBLEM_JSON_CONTENT_TYPE = 'application/problem+json'

/** The problem `type` URI identifying zodapi's request-validation failure. */
export const ZODAPI_VALIDATION_TYPE = 'urn:zodapi:validation'

export const ValidationTarget = z.enum(['json', 'form', 'query', 'param', 'header', 'cookie'])
export type ValidationTarget = z.infer<typeof ValidationTarget>

export const ValidationIssue = z.looseObject({
  code: z.string(),
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
})
export type ValidationIssue = z.infer<typeof ValidationIssue>

/** Generic RFC 9457 problem-details shape; loose so extension members pass through. */
export const ProblemDetails = z.looseObject({
  type: z.string().optional(),
  title: z.string().optional(),
  status: z.int().optional(),
  detail: z.string().optional(),
  instance: z.string().optional(),
})
export type ProblemDetails = z.infer<typeof ProblemDetails>

/**
 * The fixed 400 response body every zodapi server returns when request
 * validation fails: an RFC 9457 problem (`application/problem+json`)
 * discriminated by its `type` URI, carrying the zod issues and the failing
 * request target as extension members. Registered as the `ValidationError`
 * OpenAPI component.
 */
export const ValidationError = z
  .looseObject({
    type: z.literal(ZODAPI_VALIDATION_TYPE),
    status: z.literal(400),
    target: ValidationTarget,
    issues: z.array(ValidationIssue),
  })
  .meta({ id: 'ValidationError' })
export type ValidationError = z.infer<typeof ValidationError>

/** Build the fixed 400 body from a zod error (server-side hook uses this). */
export function validationErrorBody(
  target: string,
  error: { issues: readonly { code: string; path: PropertyKey[]; message: string }[] },
): ValidationError {
  return {
    type: ZODAPI_VALIDATION_TYPE,
    status: 400,
    target: ValidationTarget.parse(target),
    issues: error.issues.map((issue) => ({
      ...issue,
      path: issue.path.filter((p): p is string | number => typeof p !== 'symbol'),
    })),
  }
}

/** True when `data` is a zodapi validation-error body (e.g. the parsed body of a 400). */
export function isValidationErrorBody(data: unknown): data is ValidationError {
  return ValidationError.safeParse(data).success
}
