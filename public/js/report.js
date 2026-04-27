// report.js — Story 6.1: Data Fetch, Skeleton, Your Position & PT/ES Toggle
// Handles: data fetch, skeleton loading, stat cards, PT/ES toggle
// Stories 6.2-6.6 will extend this file for tables, CSV, CTA, error states, mobile, a11y

const CTA_URL = 'mailto:pedro.barreira.business@gmail.com'

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

  // Toggle container and buttons — stable ID introduced with the 2026-04-27
  // design port (PT/ES → Portugal/Espanha solid-navy variant).
  const toggleContainer = document.getElementById('channel-toggle')
  const ptBtn = toggleContainer ? toggleContainer.querySelectorAll('button')[0] : null
  const esBtn = toggleContainer ? toggleContainer.querySelectorAll('button')[1] : null

  // Stat card number elements — 4-up grid (Em 1.º lugar, A perder, Sem
  // concorrência, Ao alcance). Stable IDs introduced with the design port.
  const statWinningEl = document.getElementById('stat-winning')
  const statLosingEl = document.getElementById('stat-losing')
  const statUncontestedEl = document.getElementById('stat-uncontested')
  const statReachEl = document.getElementById('stat-reach')
  const statNumbers = [statWinningEl, statLosingEl, statUncontestedEl, statReachEl].filter(Boolean)

  // Value-line elements — Σ(my_price) per bucket, surfaced as "valor de catálogo"
  const valueWinningEl = document.getElementById('value-winning')
  const valueLosingEl = document.getElementById('value-losing')
  const valueUncontestedEl = document.getElementById('value-uncontested')
  const valueReachEl = document.getElementById('value-reach')
  const valueLines = [valueWinningEl, valueLosingEl, valueUncontestedEl, valueReachEl].filter(Boolean)

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

    // Opportunities and Quick Wins tables both have 6 columns post-2026-04-27:
    // Produto, O teu preço, 1.º lugar €, Diferença €, Diferença %, Ver (link).
    tbodies[0].innerHTML = ''
    for (let i = 0; i < 4; i++) tbodies[0].appendChild(makeShimmerRow(6))

    tbodies[1].innerHTML = ''
    for (let i = 0; i < 4; i++) tbodies[1].appendChild(makeShimmerRow(6))
  }

  function applySkeletonStatCards () {
    // Cards 1-3 use shared shimmer; the navy-fill reach card (#stat-reach) needs
    // a translucent-white shimmer so the pulse stays visible on dark fill.
    statNumbers.forEach(el => {
      el.textContent = ''
      el.classList.add('animate-pulse', 'rounded')
      if (el === statReachEl) {
        el.style.background = 'rgba(255,255,255,0.15)'
      } else {
        el.classList.add('bg-surface-container')
      }
      el.style.minWidth = '4rem'
      el.style.minHeight = '1.5rem'
      el.style.display = 'inline-block'
    })
    valueLines.forEach(el => {
      el.textContent = ''
      el.classList.add('animate-pulse', 'rounded')
      if (el === valueReachEl) {
        el.style.background = 'rgba(255,255,255,0.15)'
      } else {
        el.classList.add('bg-surface-container')
      }
      el.style.minWidth = '3rem'
      el.style.minHeight = '0.875rem'
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
    statNumbers.concat(valueLines).forEach(el => {
      el.classList.remove('animate-pulse', 'bg-surface-container', 'rounded')
      el.style.background = ''
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

  // ── Story 6.2: Price/gap formatting helpers ──────────────────────────────

  // pt-PT price: "€799,00" (comma decimal, dot thousands, always 2 decimal places)
  function formatPrice (val) {
    const n = Number(val) || 0
    try {
      return '€' + n.toLocaleString('pt-PT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    } catch (_) {
      return '€' + n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    }
  }

  // Gap EUR: U+2212 MINUS SIGN prefix, absolute value in pt-PT format
  // gapEur is negative for opportunities (my_price > first_price)
  function formatGapEur (gapEur) {
    const absVal = Math.abs(Number(gapEur) || 0)
    try {
      return '\u2212\u20AC' + absVal.toLocaleString('pt-PT', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })
    } catch (_) {
      return '\u2212\u20AC' + absVal.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    }
  }

  // Gap pct: "0.8%" from 0.008. Guard against null/undefined/NaN to avoid "NaN%" output.
  function formatGapPct (gapPct) {
    const n = Number(gapPct) || 0
    return (n * 100).toFixed(1) + '%'
  }

  // Compact pt-PT currency for stat-card value-lines: "€248.500" (no decimals,
  // dot thousands). Designed for headline summaries — formatPrice stays for
  // per-row table cells where 2 decimals matter.
  function formatCurrencyCompact (val) {
    const n = Math.round(Number(val) || 0)
    try {
      return '€' + n.toLocaleString('pt-PT', { maximumFractionDigits: 0 })
    } catch (_) {
      return '€' + Math.abs(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    }
  }

  // ── Story 6.2: Opportunities table renderer ───────────────────────────────

  // Maiores Oportunidades shows only products in the competitive zone:
  // gap_pct <= 0.05 (within 5% of the 1st-place price). Products losing by
  // more than 5% are non-competitive — closing the gap would require pricing
  // below cost, so they're not actionable. (Vitórias Rápidas section uses
  // a tighter ≤2% threshold for is_quick_win.)
  const COMPETITIVE_GAP_THRESHOLD = 0.05

  // Row cap per visible table — opportunities are sorted desc by wow_score,
  // so the top N are the most actionable. Long-tail rows are available in
  // the CSV download. Without a cap a 31k-product report scrolls forever.
  const VISIBLE_ROW_CAP = 20

  // Worten storefront EAN-search URL. Mirakl OF21/P11 don't expose a direct
  // product page URL (verified via Mirakl MCP 2026-04-27 — the only URL fields
  // are product_media.dam_url / media_url which point at images). EAN search
  // is the most reliable cross-marketplace fallback.
  function eanSearchUrl (ean) {
    return 'https://www.worten.pt/search?query=' + encodeURIComponent(ean)
  }

  function makeLinkCell (ean, baseClassName) {
    const td = document.createElement('td')
    td.className = baseClassName + ' text-center'
    if (!ean) return td // no EAN → empty cell, no link
    const link = document.createElement('a')
    link.href = eanSearchUrl(ean)
    link.target = '_blank'
    link.rel = 'noopener noreferrer'
    link.className = 'inline-flex items-center justify-center gap-1 px-3 py-1.5 text-[12px] text-on-surface-variant hover:text-primary hover:bg-primary-fixed rounded-md transition-colors'
    link.title = 'Abrir página deste produto no Worten'
    const icon = document.createElement('span')
    icon.className = 'material-symbols-outlined'
    icon.style.fontSize = '16px'
    icon.textContent = 'open_in_new'
    link.appendChild(icon)
    td.appendChild(link)
    return td
  }

  // Append "A mostrar 20 de N..." note as a tfoot row, or remove the existing
  // one if N <= cap. Called by both renderers.
  function setRowCapFooter (tbody, totalRows, sectionLabel) {
    const table = tbody.closest('table')
    if (!table) return
    let tfoot = table.querySelector('tfoot')
    if (totalRows <= VISIBLE_ROW_CAP) {
      if (tfoot) tfoot.remove()
      return
    }
    if (!tfoot) {
      tfoot = document.createElement('tfoot')
      table.appendChild(tfoot)
    }
    tfoot.innerHTML = ''
    const tr = document.createElement('tr')
    const td = document.createElement('td')
    td.colSpan = 6
    td.className = 'px-6 pt-6 text-center text-xs text-on-surface-variant'
    td.textContent = 'A mostrar as ' + VISIBLE_ROW_CAP + ' principais ' + sectionLabel + ' de ' + totalRows + ' totais. Descarrega o CSV para a lista completa.'
    tr.appendChild(td)
    tfoot.appendChild(tr)
  }

  function renderOpportunities (opportunities) {
    const oppTbody = document.querySelectorAll('tbody')[0]
    if (!oppTbody) return
    oppTbody.innerHTML = ''

    const allOpps = opportunities || []
    const competitive = allOpps.filter(function (o) {
      return o.gap_pct != null && Number.isFinite(o.gap_pct) && o.gap_pct <= COMPETITIVE_GAP_THRESHOLD
    })

    // Cap visible rows; surface "X de N" in tfoot when truncated. The full
    // ranked list still lands in the CSV download.
    const totalCompetitive = competitive.length
    const visibleOpps = competitive.slice(0, VISIBLE_ROW_CAP)
    setRowCapFooter(oppTbody, totalCompetitive, 'oportunidades')

    if (competitive.length === 0) {
      const td = document.createElement('td')
      td.colSpan = 5
      td.className = 'px-6 py-8 text-on-surface-variant text-center'
      td.style.padding = '2rem 1.5rem'  // inline fallback for py-8 (Tailwind JIT safety)
      // Differentiate "winning all" vs "losing all by >5%" — both render an
      // empty table but mean opposite things to the user.
      if (allOpps.length === 0) {
        td.textContent = 'Estás em 1.º lugar em todos os produtos neste canal.'
      } else {
        td.textContent = 'Sem oportunidades competitivas (margem ≤5%) neste canal.'
      }
      const tr = document.createElement('tr')
      tr.appendChild(td)
      oppTbody.appendChild(tr)
      return
    }

    visibleOpps.forEach(function (item, idx) {
      const tr = document.createElement('tr')
      tr.className = 'bg-surface-container-lowest/50 hover:bg-surface-container-lowest transition-colors shadow-sm rounded-lg'
      if (idx === 0) {
        // First-row tint — inline style to avoid JIT purge of bg-blue-50
        tr.style.backgroundColor = '#EFF6FF'
      }

      // Column 1: Product title (rounded left, first row gets accent border)
      const tdProduct = document.createElement('td')
      tdProduct.className = 'px-6 py-6 rounded-l-lg font-bold text-primary'
      tdProduct.textContent = item.product_title || item.ean || ''
      if (idx === 0) tdProduct.classList.add('border-l-4', 'border-primary')

      // Column 2: My price
      const tdMyPrice = document.createElement('td')
      tdMyPrice.className = 'px-6 py-6 text-center'
      tdMyPrice.textContent = formatPrice(item.my_price)

      // Column 3: First price
      // Field name is `competitor_first` per computeReport.js scoreChannel output.
      const tdFirstPrice = document.createElement('td')
      tdFirstPrice.className = 'px-6 py-6 font-bold text-center'
      tdFirstPrice.textContent = formatPrice(item.competitor_first)

      // Column 4: Gap EUR (negative, red)
      const gapEur = (item.my_price || 0) - (item.competitor_first || 0)
      const tdGapEur = document.createElement('td')
      tdGapEur.className = 'px-6 py-6 text-center'
      tdGapEur.style.color = '#DC2626'
      tdGapEur.textContent = formatGapEur(gapEur)

      // Column 5: Gap pct — red pill (no longer rounded right; link cell takes that role)
      const tdGapPct = document.createElement('td')
      tdGapPct.className = 'px-6 py-6 text-center'
      const pill = document.createElement('span')
      pill.className = 'bg-error-container text-on-error-container px-2 py-0.5 rounded text-xs'
      pill.textContent = formatGapPct(item.gap_pct)
      tdGapPct.appendChild(pill)

      // Column 6: Worten product link (EAN search), rounded right
      const tdLink = makeLinkCell(item.ean, 'px-6 py-6 rounded-r-lg')

      tr.appendChild(tdProduct)
      tr.appendChild(tdMyPrice)
      tr.appendChild(tdFirstPrice)
      tr.appendChild(tdGapEur)
      tr.appendChild(tdGapPct)
      tr.appendChild(tdLink)
      oppTbody.appendChild(tr)
    })
  }

  // ── Story 6.2: Quick Wins table renderer ──────────────────────────────────

  function renderQuickWins (quickwins) {
    const qwTbody = document.querySelectorAll('tbody')[1]
    if (!qwTbody) return
    qwTbody.innerHTML = ''

    const allQuickWins = quickwins || []
    setRowCapFooter(qwTbody, allQuickWins.length, 'vitórias rápidas')

    if (allQuickWins.length === 0) {
      const td = document.createElement('td')
      td.colSpan = 6
      td.className = 'px-6 py-8 text-on-surface-variant text-center'
      td.style.padding = '2rem 1.5rem'  // inline fallback for py-8 (Tailwind JIT safety)
      td.textContent = 'Não há vitórias rápidas disponíveis neste canal.'
      const tr = document.createElement('tr')
      tr.appendChild(td)
      qwTbody.appendChild(tr)
      return
    }

    const visibleQuickWins = allQuickWins.slice(0, VISIBLE_ROW_CAP)

    visibleQuickWins.forEach(function (item) {
      const tr = document.createElement('tr')
      tr.className = 'hover:bg-surface-container transition-colors'

      // Column 1: Product title
      const tdProduct = document.createElement('td')
      tdProduct.className = 'px-6 py-5 border-b border-outline-variant/10 font-bold text-primary'
      tdProduct.textContent = item.product_title || item.ean || ''

      // Column 2: My price
      const tdMyPrice = document.createElement('td')
      tdMyPrice.className = 'px-6 py-5 border-b border-outline-variant/10 text-on-surface-variant text-center'
      tdMyPrice.textContent = formatPrice(item.my_price)

      // Column 3: First price
      // Field name is `competitor_first` per computeReport.js scoreChannel output.
      const tdFirstPrice = document.createElement('td')
      tdFirstPrice.className = 'px-6 py-5 border-b border-outline-variant/10 font-bold text-center'
      tdFirstPrice.textContent = formatPrice(item.competitor_first)

      // Column 4: Gap EUR
      const gapEur = (item.my_price || 0) - (item.competitor_first || 0)
      const tdGapEur = document.createElement('td')
      tdGapEur.className = 'px-6 py-5 border-b border-outline-variant/10 font-medium text-on-tertiary-fixed-variant text-center'
      tdGapEur.textContent = formatGapEur(gapEur)

      // Column 5: Gap pct pill
      const tdGapPct = document.createElement('td')
      tdGapPct.className = 'px-6 py-5 border-b border-outline-variant/10 text-center'
      const pill = document.createElement('span')
      pill.className = 'bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded text-xs'
      pill.textContent = formatGapPct(item.gap_pct)
      tdGapPct.appendChild(pill)

      // Column 6: Worten product link (EAN search)
      const tdLink = makeLinkCell(item.ean, 'px-6 py-5 border-b border-outline-variant/10')

      tr.appendChild(tdProduct)
      tr.appendChild(tdMyPrice)
      tr.appendChild(tdFirstPrice)
      tr.appendChild(tdGapEur)
      tr.appendChild(tdGapPct)
      tr.appendChild(tdLink)
      qwTbody.appendChild(tr)
    })
  }

  // ── AC-12: Render channel stat cards and tables ───────────────────────────
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
    const withinReach = summary.within_reach != null ? summary.within_reach : 0

    // Update stat cards with pt-PT locale formatting (AC-12)
    if (statWinningEl) statWinningEl.textContent = formatPtPT(winning)
    if (statLosingEl) statLosingEl.textContent = formatPtPT(losing)
    if (statUncontestedEl) statUncontestedEl.textContent = formatPtPT(uncontested)
    if (statReachEl) statReachEl.textContent = formatPtPT(withinReach)

    // Value-lines — Σ(my_price) per bucket. Older reports (generated before
    // *_value was added to summary) won't have these fields; fall back to "€—".
    function setValue(el, val) {
      if (!el) return
      el.textContent = (val == null || !Number.isFinite(Number(val))) ? '€—' : formatCurrencyCompact(val)
    }
    setValue(valueWinningEl, summary.winning_value)
    setValue(valueLosingEl, summary.losing_value)
    setValue(valueUncontestedEl, summary.uncontested_value)
    setValue(valueReachEl, summary.within_reach_value)

    const tbodies = document.querySelectorAll('tbody')
    if (tbodies.length < 2) return

    // AC-11: ES no-data edge case
    if (channel === 'es' && winning === 0 && losing === 0 && uncontested === 0) {
      renderNoData([tbodies[0], tbodies[1]])
      return
    }

    // Story 6.2: Render opportunities and quick wins rows for the active channel (AC-10)
    const opps = reportData['opportunities_' + channel] || []
    const qws  = reportData['quickwins_' + channel]     || []
    renderOpportunities(opps)
    renderQuickWins(qws)
  }

  // ── Task 5: PT/ES toggle handlers ─────────────────────────────────────────

  // Visual styling classes for the active vs inactive toggle button. Updated
  // for the 2026-04-27 design port: solid-navy active state (was white card
  // with shadow). Both buttons keep base styles (px-5 py-2 font-semibold
  // brand-font text-sm rounded-sm transition-colors) — the swap only toggles
  // background + text color + the hover hint on the inactive side.
  var TOGGLE_ACTIVE_CLASSES = ['bg-primary', 'text-white']
  var TOGGLE_INACTIVE_CLASSES = ['bg-transparent', 'text-on-surface-variant', 'hover:text-primary']

  function setToggleVisualState (activeBtn, inactiveBtn) {
    if (activeBtn) {
      activeBtn.classList.remove.apply(activeBtn.classList, TOGGLE_INACTIVE_CLASSES)
      activeBtn.classList.add.apply(activeBtn.classList, TOGGLE_ACTIVE_CLASSES)
    }
    if (inactiveBtn) {
      inactiveBtn.classList.remove.apply(inactiveBtn.classList, TOGGLE_ACTIVE_CLASSES)
      inactiveBtn.classList.add.apply(inactiveBtn.classList, TOGGLE_INACTIVE_CLASSES)
    }
  }

  function initToggleHandlers () {
    if (ptBtn) {
      ptBtn.addEventListener('click', function () {
        if (activeChannel === 'pt') return
        activeChannel = 'pt'
        if (ptBtn) ptBtn.setAttribute('aria-pressed', 'true')
        if (esBtn) esBtn.setAttribute('aria-pressed', 'false')
        setToggleVisualState(ptBtn, esBtn)
        renderChannel('pt')
      })
    }

    if (esBtn) {
      esBtn.addEventListener('click', function () {
        if (activeChannel === 'es') return
        activeChannel = 'es'
        if (ptBtn) ptBtn.setAttribute('aria-pressed', 'false')
        if (esBtn) esBtn.setAttribute('aria-pressed', 'true')
        setToggleVisualState(esBtn, ptBtn)
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
          removeSkeletonState(null)
          if (response.status < 500) {
            // 4xx (404, 410, etc.) — expired or not found
            showExpiryCard()
          } else {
            // 5xx — server error
            showFetchErrorCard()
          }
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
        removeSkeletonState(null)
        showFetchErrorCard()
      })
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

  // ── Story 6.4: "Desliza para ver mais →" scroll hint (mobile only) ────────
  // Injected once at init — structural, not data-dependent.
  // Uses matchMedia + inline style instead of md:hidden (Tailwind JIT CDN purge rule).

  function createScrollHint () {
    const p = document.createElement('p')
    p.textContent = '← desliza para ver mais →'
    p.style.cssText = 'text-align:center;font-size:0.75rem;color:#444650;margin-top:0.5rem;'
    return p
  }

  function applyScrollHintVisibility (hint, mq) {
    hint.style.display = mq.matches ? '' : 'none'
  }

  var scrollHintMq = window.matchMedia('(max-width: 639px)')
  var tableWrappers = document.querySelectorAll('div.overflow-x-auto')

  tableWrappers.forEach(function (wrapper) {
    var hint = createScrollHint()
    applyScrollHintVisibility(hint, scrollHintMq)
    wrapper.parentNode.insertBefore(hint, wrapper.nextSibling)
    scrollHintMq.addEventListener('change', function () {
      applyScrollHintVisibility(hint, scrollHintMq)
    })
  })

  // ── Story 6.5 scaffold: Expired / fetch-error states ─────────────────────
  // Full error-card rendering wired in Story 6.5.

  // Replaces main content with an error card while preserving the CTA banner (AC-5).
  // The CTA section lives inside <main> — using mainEl.innerHTML = '' would wipe it.
  // Instead: remove all children except the CTA section, then insert the card before it.
  function replaceMainContentWith (card) {
    const mainEl = document.querySelector('main')
    if (!mainEl) return
    const ctaSection = mainEl.querySelector('section.bg-gradient-to-br')
    // Remove all children except the CTA banner
    Array.from(mainEl.children).forEach(function (child) {
      if (child !== ctaSection) mainEl.removeChild(child)
    })
    // Insert error card before the CTA banner (or append if banner not found)
    if (ctaSection) {
      mainEl.insertBefore(card, ctaSection)
    } else {
      mainEl.appendChild(card)
    }
  }

  function showExpiryCard () {
    const card = document.createElement('div')
    card.className = 'py-24 flex flex-col items-center text-center gap-6 max-w-lg mx-auto'

    const icon = document.createElement('span')
    icon.className = 'material-symbols-outlined text-6xl text-secondary'
    icon.textContent = 'schedule'

    const heading = document.createElement('h2')
    heading.className = 'text-3xl font-extrabold text-primary tracking-tight'
    // AC-1: expiry message — "Este relatório já não está disponível"
    heading.textContent = 'Este relatório já não está disponível'

    const body = document.createElement('p')
    body.className = 'text-on-surface-variant font-medium'
    body.textContent = 'Os relatórios expiram ao fim de 48 horas. Gera um novo relatório para obteres dados actualizados.'

    // AC-1: CTA button — "Gerar um novo relatório →"
    const ctaBtn = document.createElement('a')
    ctaBtn.href = '/'
    ctaBtn.className = 'mt-4 px-8 py-4 bg-primary text-white font-bold rounded-lg hover:opacity-90 transition-opacity'
    ctaBtn.textContent = 'Gerar um novo relatório →'

    card.appendChild(icon)
    card.appendChild(heading)
    card.appendChild(body)
    card.appendChild(ctaBtn)

    replaceMainContentWith(card)
  }

  function showFetchErrorCard () {
    const card = document.createElement('div')
    card.className = 'py-24 flex flex-col items-center text-center gap-6 max-w-lg mx-auto'

    const icon = document.createElement('span')
    icon.className = 'material-symbols-outlined text-6xl text-error'
    icon.textContent = 'warning'

    const heading = document.createElement('h2')
    heading.className = 'text-3xl font-extrabold text-primary tracking-tight'
    // AC-2: error message — "Não foi possível carregar o relatório"
    heading.textContent = 'Não foi possível carregar o relatório'

    // AC-2: Recarregar button calls window.location.reload()
    const reloadBtn = document.createElement('button')
    reloadBtn.className = 'mt-4 px-8 py-4 bg-primary text-white font-bold rounded-lg hover:opacity-90 transition-opacity'
    reloadBtn.textContent = 'Recarregar'
    reloadBtn.addEventListener('click', function () {
      window.location.reload()
    })

    const contactLink = document.createElement('a')
    contactLink.href = CTA_URL
    contactLink.target = '_blank'
    contactLink.rel = 'noopener noreferrer'
    contactLink.className = 'text-primary font-medium underline'
    contactLink.textContent = 'Contacta-nos'

    card.appendChild(icon)
    card.appendChild(heading)
    card.appendChild(reloadBtn)
    card.appendChild(contactLink)

    replaceMainContentWith(card)
  }

  // Hoist scaffold references so they are not tree-shaken by future bundlers
  void showExpiryCard
  void showFetchErrorCard

  // Run on DOMContentLoaded or immediately if DOM is already ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
