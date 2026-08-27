---
'@zodapi/codegen': minor
---

New package: generate a zodapi contract (zod schemas + `RouteDef` route objects) from an OpenAPI 3.1
document, for backends not written in TypeScript. Ships a `zodapi-codegen` CLI and a
`generateContract()` API; fidelity is enforced by a round-trip test (contract → OpenAPI → generator
→ OpenAPI must be identical).
