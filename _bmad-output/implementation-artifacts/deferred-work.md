# Deferred Work

Items deferred during code review. Each entry includes the review date and source story.

---

## Deferred from: code review of 1-1-project-scaffold (2026-04-16)

- **Add `test` script and test runner setup** — scaffold only per spec; runner decision belongs to first testing story in Epic 1.
- **Add lint/format scripts (ESLint + Prettier)** — project-level tooling decision, not scaffold-scope.
- **SQLITE_PATH directory writability pre-check** [src/config.js:24] — better-sqlite3 errors with clear SQLITE_CANTOPEN at runtime; fail-fast is nice-to-have.
- **NODE_ENV unknown-value warning** [src/config.js:20] — defensive check; not spec-required.
- **CTA_URL placeholder guard at deploy time** [public/js/report.js:4] — launch-checklist concern per UX-DR15.
- **Add `license` field to package.json** — add before any public release.
- **Strict Node version enforcement** (preinstall hook or `engine-strict=true` in .npmrc) [package.json] — `engines` is advisory but acceptable for internal scaffold.
- **Run `npm audit` on committed package-lock.json** — ops housekeeping; verify no transitive vulnerabilities before deploy.
