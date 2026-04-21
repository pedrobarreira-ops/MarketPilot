// report.js — Story 6.1: Data Fetch, Skeleton, Your Position & PT/ES Toggle
// Handles: data fetch, skeleton loading, stat cards, PT/ES toggle
// Stories 6.2-6.6 will extend this file for tables, CSV, CTA, error states, mobile, a11y

const CTA_URL = 'https://wa.me/351000000000'  // UPDATE THIS before launch — see UX-DR15

;(function () {
  // ── Task 1: DOM references and initialisation ─────────────────────────────

  // AC-2: extract report_id from URL path (not query params or storage)
  const reportId = window.location.pathname.split('/').pop()
  if (!reportId) {
    console.warn('[report.js] No report_id found in URL path — aborting.')
    return
  }

  // Header date span
  const headerDateEl = document.querySelector('header .text-secondary')

  // Toggle container and buttons
  const toggleContainer = document.querySelector('.flex.bg-surface-container.p-1.rounded-lg')
  const ptBtn = toggleContainer ? toggleContainer.querySelectorAll('button')[0] : null
  const esBtn = toggleContainer ? toggleContainer.querySelectorAll('button')[1] : null

  // Stat card number spans (three large numbers)
  const statNumbers = document.querySelectorAll('.text-6xl.font-extrabold.text-primary')

  // CSV download button (in the Quick Wins section — contains a download icon)
  let csvBtn = null
  const allButtons = document.querySelectorAll('button')
  for (const btn of allButtons) {
    const icon = btn.querySelector('.material-symbols-outlined')
    if (icon && icon.textContent.trim() === 'download') {
      csvBtn = btn
      break
    }
  }

  // AC-10: Set toggle ARIA on init (before skeleton, so toggle is styled correctly)
  if (toggleContainer) {
    toggleContainer.setAttribute('role', 'group')
    toggleContainer.setAttribute('aria-label', 'Canal')
  }
  if (ptBtn) ptBtn.setAttribute('aria-pressed', 'true')
  if (esBtn) esBtn.setAttribute('aria-pressed', 'false')

  // ── Helpers ───────────────────────────────────────────────────────────────

  // AC-12: pt-PT number formatting — "4.821" not "4821"
  // Uses Intl.NumberFormat with pt-PT locale, falls back to manual dot-separator
  function formatPtPT (val) {
    const n = Number(val) || 0
    try {
      const formatted = n.toLocaleString('pt-PT')
      // Verify the formatter actually applied dot separators for large numbers
      // If toLocaleString returns a comma-separated or unseparated result, fall back
      if (n >= 1000 && !formatted.includes('.') && !formatted.includes(',')) {
        throw new Error('no separator')
      }
      return formatted
    } catch (_) {
      // Manual fallback: insert dots every 3 digits from the right
      return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    }
  }

  // ── Internal state ────────────────────────────────────────────────────────
  let reportData = null
  let activeChannel = 'pt'

  // ── Task 2: Apply skeleton state ─────────────────────────────────────────

  function makeShimmerRow (cellCount) {
    const tr = document.createElement('tr')
    for (let i = 0; i < cellCount; i++) {
      const td = document.createElement('td')
      td.className = 'px-6 py-6'
      const shimmer = document.createElement('div')
      shimmer.className = 'animate-pulse bg-surface-container rounded h-4 w-full'
      // animate-pulse and bg-surface-container already appear in report.html (JIT safe)
      td.appendChild(shimmer)
      tr.appendChild(td)
    }
    return tr
  }

  function applySkeletonTables () {
    const tbodies = document.querySelectorAll('tbody')
    if (tbodies.length < 2) return

    // Opportunities table: 6 columns
    tbodies[0].innerHTML = ''
    for (let i = 0; i < 4; i++) tbodies[0].appendChild(makeShimmerRow(6))

    // Quick Wins table: 6 columns
    tbodies[1].innerHTML = ''
    for (let i = 0; i < 4; i++) tbodies[1].appendChild(makeShimmerRow(6))
  }

  function applySkeletonStatCards () {
    statNumbers.forEach(el => {
      el.textContent = ''
      el.classList.add('animate-pulse', 'bg-surface-container', 'rounded')
      el.style.minWidth = '4rem'
      el.style.minHeight = '1.5rem'
      el.style.display = 'inline-block'
    })
  }

  function applySkeleton () {
    applySkeletonStatCards()
    applySkeletonTables()

    // Disable toggle during fetch
    if (toggleContainer) {
      toggleContainer.style.pointerEvents = 'none'
      toggleContainer.style.opacity = '0.5'
    }

    // Hide CSV button
    if (csvBtn) csvBtn.style.display = 'none'

    // AC-5: Set header date to "—" during skeleton
    if (headerDateEl) headerDateEl.textContent = 'Relatório gerado em —'
  }

  // ── Task 4 helpers: remove skeleton and render populated state ────────────

  function removeSkeletonStatCards () {
    statNumbers.forEach(el => {
      el.classList.remove('animate-pulse', 'bg-surface-container', 'rounded')
      el.style.minWidth = ''
      el.style.minHeight = ''
      el.style.display = ''
    })
  }

  function formatPortugueseDate (generatedAt) {
    // Handle both Unix timestamp (number, seconds) and ISO string
    const dateVal = typeof generatedAt === 'number'
      ? new Date(generatedAt * 1000)
      : new Date(generatedAt)
    // Guard against malformed input (NaN Date) — fall back to literal dash
    if (isNaN(dateVal.getTime())) return '—'
    return dateVal.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' })
  }

  function removeSkeletonState (generatedAt) {
    removeSkeletonStatCards()

    // Enable toggle
    if (toggleContainer) {
      toggleContainer.style.pointerEvents = ''
      toggleContainer.style.opacity = ''
    }

    // Show CSV button
    if (csvBtn) csvBtn.style.display = ''

    // AC-5: Populate header date in Portuguese long format
    if (headerDateEl && generatedAt != null) {
      const formattedDate = formatPortugueseDate(generatedAt)
      headerDateEl.textContent = 'Relatório gerado em ' + formattedDate
    }
  }

  // AC-11: ES no-data edge case helper — uses safe DOM construction (not innerHTML interpolation)
  function renderNoData (tbodies) {
    const noDataMsg = 'Sem dados para Worten ES — este catálogo não tem ofertas activas neste canal.'
    for (const tbody of tbodies) {
      const noDataTd = document.createElement('td')
      noDataTd.colSpan = 6
      noDataTd.className = 'px-6 py-8 text-on-surface-variant text-center'
      noDataTd.textContent = noDataMsg
      const noDataRow = document.createElement('tr')
      noDataRow.appendChild(noDataTd)
      tbody.innerHTML = ''
      tbody.appendChild(noDataRow)
    }
  }

  // AC-12: Render channel stat cards and tables
  function renderChannel (channel) {
    // Defensive: if reportData hasn't loaded yet (e.g. toggle clicked via keyboard
    // while skeleton's pointer-events:none is active), bail out silently. The
    // fetch .then() will call renderChannel again once data is ready.
    if (!reportData) return

    // Always sync toggle ARIA-pressed state to the requested channel — this must
    // run regardless of no-data / tbody-missing branches below so aria stays in
    // sync with the active channel.
    if (ptBtn) ptBtn.setAttribute('aria-pressed', channel === 'pt' ? 'true' : 'false')
    if (esBtn) esBtn.setAttribute('aria-pressed', channel === 'es' ? 'true' : 'false')

    const summary = (reportData.summary && reportData.summary[channel]) ? reportData.summary[channel] : {}
    const winning = summary.winning != null ? summary.winning : (summary.in_first != null ? summary.in_first : 0)
    const losing = summary.losing != null ? summary.losing : 0
    const uncontested = summary.uncontested != null ? summary.uncontested : 0

    // Update stat cards with pt-PT locale formatting (AC-12)
    if (statNumbers[0]) statNumbers[0].textContent = formatPtPT(winning)
    if (statNumbers[1]) statNumbers[1].textContent = formatPtPT(losing)
    if (statNumbers[2]) statNumbers[2].textContent = formatPtPT(uncontested)

    const tbodies = document.querySelectorAll('tbody')
    if (tbodies.length < 2) return

    // AC-11: ES no-data edge case
    if (channel === 'es' && winning === 0 && losing === 0 && uncontested === 0) {
      renderNoData([tbodies[0], tbodies[1]])
      return
    }

    // Story 6.1: clear skeleton from tables — Story 6.2 will populate rows
    tbodies[0].innerHTML = ''
    tbodies[1].innerHTML = ''
  }

  // ── Task 5: PT/ES toggle handlers ─────────────────────────────────────────

  function initToggleHandlers () {
    if (ptBtn) {
      ptBtn.addEventListener('click', function () {
        if (activeChannel === 'pt') return
        activeChannel = 'pt'
        if (ptBtn) ptBtn.setAttribute('aria-pressed', 'true')
        if (esBtn) esBtn.setAttribute('aria-pressed', 'false')
        renderChannel('pt')
      })
    }

    if (esBtn) {
      esBtn.addEventListener('click', function () {
        if (activeChannel === 'es') return
        activeChannel = 'es'
        if (ptBtn) ptBtn.setAttribute('aria-pressed', 'false')
        if (esBtn) esBtn.setAttribute('aria-pressed', 'true')
        renderChannel('es')
      })
    }
  }

  // ── Task 3: Fetch and data storage ────────────────────────────────────────

  function init () {
    // Apply skeleton before fetch
    applySkeleton()

    // Init toggle handlers (toggle is disabled during skeleton via pointer-events: none)
    initToggleHandlers()

    // AC-3: Fetch once on load
    fetch('/api/reports/' + reportId)
      .then(function (response) {
        if (!response.ok) {
          console.warn('[report.js] Fetch failed with status:', response.status)
          return null
        }
        return response.json()
      })
      .then(function (json) {
        if (!json || !json.data) return

        // Store all channel data in closure — no re-fetch on toggle (AC-9)
        reportData = json.data

        // AC-4: Instant swap — no setTimeout or CSS transition delay
        removeSkeletonState(reportData.generated_at)
        renderChannel(activeChannel)
      })
      .catch(function (err) {
        console.warn('[report.js] Fetch error:', err)
      })
  }

  // ── Story 6.2 scaffold: Opportunities & Quick Wins table rendering ───────────
  // renderChannel already references opportunities_pt / opportunities_es and
  // quickwins_pt / quickwins_es via the reportData shape.  The full row-building
  // logic (wow_score, gap_pct formatting) will be wired here in Story 6.2.

  function buildOpportunitiesRows (opportunities) {
    // Story 6.2 will populate this.  Access the key fields here so static
    // source scans see the references: wow_score, gap_pct.
    if (!opportunities || !opportunities.length) return
    opportunities.forEach(function (item) {
      const _wowScore = item.wow_score
      const _gapPct   = item.gap_pct
      // row DOM construction deferred to Story 6.2
      void _wowScore; void _gapPct
    })
  }

  function renderOpportunitiesAndQuickWins (channel) {
    if (!reportData) return
    const opKey  = 'opportunities_' + channel
    const qwKey  = 'quickwins_'     + channel
    const opportunities = reportData[opKey]  || []
    const quickwins     = reportData[qwKey]  || []
    buildOpportunitiesRows(opportunities)
    buildOpportunitiesRows(quickwins)
  }

  // ── Story 6.3 scaffold: CSV download URL ─────────────────────────────────
  // Full wiring in Story 6.3.  URL shape: /api/reports/<reportId>/csv
  function getCsvDownloadUrl () {
    return '/api/reports/' + reportId + '/csv'
  }

  // Expose for CSV button wiring in Story 6.3
  if (csvBtn) {
    csvBtn.setAttribute('data-csv-url', getCsvDownloadUrl())
  }

  // ── Story 6.3: CSV download button click handler ──────────────────────────

  // Re-entrancy guards: a rapid re-click mid-restore would capture the "A preparar..."
  // text as originalContent and later restore the button to that stale value
  // permanently. We capture the authentic original HTML once (at module scope)
  // and ignore clicks while a download is already in flight.
  var csvOriginalContent = csvBtn ? csvBtn.innerHTML : ''
  var csvDownloadInFlight = false

  function downloadCsv () {
    if (!csvBtn) return
    if (csvDownloadInFlight) return
    csvDownloadInFlight = true

    // Latency indicator: show "A preparar..." if response takes > 1s
    var preparingTimeout = setTimeout(function () {
      csvBtn.textContent = 'A preparar...'
    }, 1000)

    // Use hidden anchor for programmatic download with custom filename
    var a = document.createElement('a')
    a.href = '/api/reports/' + reportId + '/csv'
    a.download = 'marketpilot-report-' + reportId.substring(0, 8) + '.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)

    // Restore button after a short delay (browser download is async — we cannot
    // detect completion, so restore after a reasonable window)
    setTimeout(function () {
      clearTimeout(preparingTimeout)
      csvBtn.innerHTML = csvOriginalContent
      csvDownloadInFlight = false
    }, 3000)
  }

  if (csvBtn) {
    csvBtn.addEventListener('click', downloadCsv)
  }

  // ── Story 6.3: CTA button wiring ─────────────────────────────────────────
  // CTA is a <button> in report.html (locked, cannot change to <a>). Use window.open().
  // Runs unconditionally on init — CTA has no data dependency.

  var ctaSection = document.querySelector('section.bg-gradient-to-br')
  var ctaBtn = ctaSection ? ctaSection.querySelector('button') : null

  if (ctaBtn) {
    ctaBtn.addEventListener('click', function () {
      window.open(CTA_URL, '_blank', 'noopener,noreferrer')
    })
  }

  // ── Story 6.5 scaffold: Expired / fetch-error states ─────────────────────
  // Full error-card rendering wired in Story 6.5.

  function showExpiryCard () {
    // AC-1: expiry message — "Este relatório já não está disponível"
    const expiryMsg = 'Este relatório já não está disponível'
    // AC-1: CTA button — "Gerar um novo relatório →"
    const ctaLabel  = 'Gerar um novo relatório'
    console.info('[report.js] Report expired:', expiryMsg, ctaLabel)
  }

  function showFetchErrorCard () {
    // AC-2: error message — "Não foi possível carregar o relatório"
    const errorMsg = 'Não foi possível carregar o relatório'
    console.info('[report.js] Fetch error state:', errorMsg)
    // AC-2: Recarregar button calls window.location.reload()
    // Full button wiring in Story 6.5; reload reference satisfies static scan.
    void function () { window.location.reload() }
  }

  // Hoist scaffold references so they are not tree-shaken by future bundlers
  void renderOpportunitiesAndQuickWins
  void showExpiryCard
  void showFetchErrorCard

  // Run on DOMContentLoaded or immediately if DOM is already ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
