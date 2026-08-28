---
'@zodapi/codegen': minor
---

Emit `z.discriminatedUnion(...)` for `oneOf`/`anyOf` schemas carrying an OpenAPI `discriminator`,
instead of a plain `z.union(...)` — better error messages and O(1) parse dispatch. Falls back
silently to `z.union` whenever the members cannot be proven safe (a non-`$ref` or forward-reference
member, a member without a `const`/string-enum discriminator property, or a `mapping` that
disagrees with the members); a `{type: "null"}` member becomes `.nullable()` on the union.
