# Changesets

This folder holds [changesets](https://github.com/changesets/changesets): one markdown
file per pending change, recording which packages it affects and at what bump level.

- `pnpm changeset` — describe a change (writes a file here; commit it with the work)
- `pnpm changeset:version` — consume the pending changesets, bump versions and write changelogs
- `pnpm changeset:publish` — build and publish what has been versioned

The private `examples/*` packages are excluded from versioning.
