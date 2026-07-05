# Security Audit Notes

Last checked: 2026-07-05

## npm audit

Command:

```powershell
npm audit --audit-level=moderate
```

Current result:

- 2 moderate findings reported through `next@16.2.10`
- Root cause: Next.js currently depends on `postcss@8.4.31`
- Advisory class reported by npm: PostCSS CSS stringify output issue

## Maintainer decision

Do not run `npm audit fix --force` for this finding in the current release.
The fix suggested by npm would install `next@9.3.3`, which is a breaking
downgrade for this Next.js 16 application.

The root `package.json` keeps a `postcss` override at `8.5.16` for dependency
paths that npm can override, but Next.js still installs its exact nested
dependency. Track upstream Next.js releases and update once the pinned nested
dependency is fixed without a major application downgrade.

## Release note

This project does not intentionally expose user-provided CSS stringify output
paths. Still, the audit item should remain visible until the upstream dependency
chain is fixed.

