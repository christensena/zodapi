---
'@zodapi/codegen': minor
---

`format: uuid` now generates `z.guid()` instead of `z.uuid()`. OpenAPI's `uuid` format means UUID-shaped, but `z.uuid()` also enforces the RFC 9562 version and variant bits, which identity providers such as AWS Cognito do not honour — their subject ids are rejected as invalid. `z.guid()` checks the 8-4-4-4-12 hex shape and nothing else. Pass a stricter schema by hand where the ids really are RFC-compliant.
