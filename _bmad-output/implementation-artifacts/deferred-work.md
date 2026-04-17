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

## Deferred from: code review of 1-2-fastify-server-with-log-redaction (2026-04-17)

- **No SIGTERM/SIGINT handler for graceful shutdown** [src/server.js] — on Coolify/Docker `docker stop` sends SIGTERM; without a handler in-flight requests may be dropped. Out of scope for Story 1.2; address in Story 1.5 (Docker/Coolify deployment config).
- **No test for missing static file returning 404** [tests/server.atdd.test.js] — `@fastify/static` default 404 for missing files is not explicitly tested. Low priority; add to integration test suite in a later story.
- **`fastify.log.error(err)` on listen failure passes full error object** [src/server.js:61] — low-probability leak if startup error carries sensitive content; consider logging only `err.code`/`err.constructor.name`/`err.message` explicitly once startup error classes are known.
- **Exported `fastify` from `server.js` is side-effectful** [src/server.js:66] — top-level `await fastify.listen()` means importing the exported instance binds a port; current tests avoid via `buildApp()`. Pattern matches spec; revisit when a future story needs to import the instance without starting the server.
