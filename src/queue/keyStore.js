// src/queue/keyStore.js
// THE security boundary for API key lifetime in this application.
//
// RULES (non-negotiable):
// 1. _store is NEVER exported — it is module-private.
// 2. API keys are NEVER serialised (no JSON.stringify, no fs writes).
// 3. The Map is NEVER enumerated (no .keys(), .entries(), .values()).
// 4. This file has ZERO imports — pure key store, no queue coupling.
// 5. keyStore.delete(job_id) MUST be called in the worker's finally block (Story 2.2).
//
// Only src/routes/generate.js (Story 4.1) calls set().
// Only src/workers/reportWorker.js (Story 2.2) calls get() and delete().

const _store = new Map()

export const set    = (jobId, apiKey) => { _store.set(jobId, apiKey) }
export const get    = (jobId)         => _store.get(jobId)
export const has    = (jobId)         => _store.has(jobId)

function del(jobId) { _store.delete(jobId) }
export { del as delete }
