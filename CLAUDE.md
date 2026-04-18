# DynamicPriceIdea — Project Context for Claude Code

## Project Summary

Solo developer project (Pedro) building a Mirakl marketplace repricing tool MVP. Automated dynamic pricing engine that monitors competitor prices on Mirakl marketplaces and reprices listings to stay competitive.

**Stack:** Node.js (>=22), Fastify, Mirakl Marketplace Platform API
**Stage:** Sprint 1 in progress — Stories 1.1 complete, 1.2 next
**Repo:** On GitHub

## CRITICAL: Always Use Distillated Planning Documents

When any BMAD skill needs to reference planning artifacts, **always load the distillate versions** — NOT the originals. The distillates are LLM-optimized and contain all required information.

| Instead of | Use this |
|-----------|---------|
| `_bmad-output/planning-artifacts/epics.md` | `_bmad-output/planning-artifacts/epics-distillate.md` |
| `_bmad-output/planning-artifacts/architecture.md` | `_bmad-output/planning-artifacts/architecture-distillate.md` |
| `_bmad-output/planning-artifacts/prd.md` | `_bmad-output/planning-artifacts/prd-distillate.md` |

## CRITICAL: Mirakl API — Always Verify via MCP

Before assuming any Mirakl API behavior (endpoint names, field names, pagination, error codes, rate limits), **always check the Mirakl MCP first**. Never guess or rely on training data for Mirakl specifics.

- **Mirakl MCP is the single source of truth** for all Mirakl API details — endpoints, field names, pagination, error codes
- **Never assume** — always verify against MCP before implementing or recommending any API call
- Applies to **all agents**: BAD subagents (dev-story, code-review, test design) and all custom skills

## Key Project Facts

- **Platform:** Mirakl MMP (Marketplace Platform) only — no MiraklConnect
- **Price writes:** Use PRI01 endpoint, not OF24
- **Developer:** Pedro — non-developer entrepreneur, relies on AI for implementation
- **Methodology:** BMAD Method (full workflow: create-story → dev-story → code-review)
- **Token management:** Use `/compact` when context approaches limits. Start new sessions per major workflow step.

## Sprint Status

See `_bmad-output/implementation-artifacts/sprint-status.yaml` for current story states.
