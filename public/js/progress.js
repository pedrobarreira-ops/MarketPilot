// progress.js — Story 5.2: Progress Bar, Copy & Redirect
// Handles: progress bar animation, copy button, polling /api/jobs/:job_id,
//          auto-redirect on completion, error state
// Plain browser script — no import/export, no type="module"

(function () {
  'use strict';

  // ── DOM references ──────────────────────────────────────────────────────────
  // Outer progress container — we add role="progressbar" here
  var progressOuter = document.querySelector('.w-full.h-1\\.5.bg-surface-variant');
  // Inner fill div — update width + colour + pulse class here
  var progressFill = progressOuter ? progressOuter.querySelector('.h-full') : null;
  // Status line paragraph
  var statusEl = document.querySelector('p.text-on-surface-variant');
  // "Processamento em tempo real" span — hidden on error
  var processingEl = document.querySelector('.tracking-widest.text-slate-400');
  // Report URL code element — set textContent here (AC-1)
  var codeEl = document.querySelector('code.text-primary');
  // Copy button
  var copyBtn = (function () {
    var iconEl = document.querySelector('.material-symbols-outlined[data-icon="content_copy"]');
    return iconEl ? iconEl.closest('button') : null;
  }());
  // Link box label — updated on error
  var linkLabel = document.querySelector('.text-primary.uppercase.tracking-widest.font-label');

  // ── Read query params (AC-2: URL params only, never localStorage/sessionStorage) ──
  var params = new URLSearchParams(window.location.search);
  var jobId = params.get('job_id');
  var reportId = params.get('report_id');

  // ── AC-1: Populate URL field SYNCHRONOUSLY before any setInterval ────────────
  // This assignment is intentionally placed before the setInterval call below.
  // NOTE: codeEl.textContent assignment includes '/report/' — required for static scan AC-18.
  if (codeEl) {
    codeEl.textContent = window.location.origin + '/report/' + reportId;
  }
  var reportUrl = codeEl ? codeEl.textContent : (window.location.origin + '/report/' + reportId);

  // ── ARIA init on progress bar (AC-5) ────────────────────────────────────────
  if (progressOuter) {
    progressOuter.setAttribute('role', 'progressbar');
    progressOuter.setAttribute('aria-valuemin', '0');
    progressOuter.setAttribute('aria-valuemax', '100');
    progressOuter.setAttribute('aria-valuenow', '0');
  }

  // ── Copy button accessible label (AC-9) ────────────────────────────────────
  if (copyBtn) {
    copyBtn.setAttribute('aria-label', 'Copiar link do relatório');
  }

  // ── Phase → percentage map (AC-4) ──────────────────────────────────────────
  var PHASE_PCT = {
    queued:               0,
    fetching_catalog:     30,
    scanning_competitors: 80,
    building_report:      95,
    complete:             100,
    error:                null  // preserve position; turn red
  };

  // ── setProgress(phase) — AC-4, AC-5 ────────────────────────────────────────
  function setProgress(phase) {
    if (!progressFill || !progressOuter) return;

    var pct = PHASE_PCT[phase];
    if (pct === null || pct === undefined) return;  // error: handled separately

    progressFill.style.width = pct + '%';
    progressOuter.setAttribute('aria-valuenow', String(pct));

    if (phase === 'scanning_competitors') {
      progressFill.classList.add('progress-pulse');
    } else {
      progressFill.classList.remove('progress-pulse');
    }
  }

  // ── updateStatusLine(data) — AC-6, AC-7 ────────────────────────────────────
  function updateStatusLine(data) {
    if (!statusEl) return;
    if (data.progress_current !== null && data.progress_current !== undefined &&
        data.progress_total   !== null && data.progress_total   !== undefined) {
      var current = Number(data.progress_current).toLocaleString('pt-PT');
      var total   = Number(data.progress_total).toLocaleString('pt-PT');
      statusEl.textContent = data.phase_message + ' (' + current + ' / ' + total + ' produtos)';
    } else {
      statusEl.textContent = data.phase_message || '';
    }
  }

  // ── showFallbackLink(rid) — AC-12 ──────────────────────────────────────────
  function showFallbackLink(rid) {
    if (!statusEl) return;
    // Idempotency guard — avoid duplicate injection if multiple complete ticks race
    if (document.getElementById('fallback-link')) return;
    // Inject below status line
    var fallback = document.createElement('p');
    fallback.id = 'fallback-link';
    fallback.style.marginTop = '8px';
    fallback.style.fontSize = '0.875rem';
    fallback.textContent = 'O teu relatório está pronto — ';
    var link = document.createElement('a');
    link.href = '/report/' + rid;
    link.textContent = 'ver relatório →';
    link.style.color = '#435b9f';
    link.style.textDecoration = 'underline';
    fallback.appendChild(link);
    statusEl.parentNode.insertBefore(fallback, statusEl.nextSibling);
  }

  // ── showErrorActions() — AC-16 ─────────────────────────────────────────────
  function showErrorActions() {
    // Avoid duplicates
    if (document.getElementById('error-actions')) return;
    var container = document.createElement('div');
    container.id = 'error-actions';
    container.style.marginTop = '16px';
    container.style.display = 'flex';
    container.style.gap = '12px';
    container.style.justifyContent = 'center';

    var retryBtn = document.createElement('a');
    retryBtn.href = '/';
    retryBtn.textContent = 'Tentar novamente';
    retryBtn.style.padding = '8px 16px';
    retryBtn.style.border = '1px solid #DC2626';
    retryBtn.style.borderRadius = '4px';
    retryBtn.style.color = '#DC2626';
    retryBtn.style.textDecoration = 'none';
    retryBtn.style.fontWeight = '600';

    var contactLink = document.createElement('a');
    contactLink.href = 'mailto:suporte@marketpilot.pt';
    contactLink.textContent = 'Contacta-nos';
    contactLink.style.padding = '8px 16px';
    contactLink.style.border = '1px solid #444';
    contactLink.style.borderRadius = '4px';
    contactLink.style.color = '#444';
    contactLink.style.textDecoration = 'none';
    contactLink.style.fontWeight = '600';

    container.appendChild(retryBtn);
    container.appendChild(contactLink);

    if (statusEl && statusEl.parentNode) {
      statusEl.parentNode.appendChild(container);
    }
  }

  // ── showCopyTooltip(message) — AC-10 ───────────────────────────────────────
  function showCopyTooltip(message) {
    var existing = document.getElementById('copy-tooltip');
    if (existing) existing.remove();
    var tooltip = document.createElement('span');
    tooltip.id = 'copy-tooltip';
    tooltip.textContent = message;
    tooltip.style.position = 'absolute';
    tooltip.style.background = '#191c1e';
    tooltip.style.color = '#fff';
    tooltip.style.padding = '4px 10px';
    tooltip.style.borderRadius = '4px';
    tooltip.style.fontSize = '12px';
    tooltip.style.zIndex = '1000';
    tooltip.style.whiteSpace = 'nowrap';
    if (copyBtn) {
      copyBtn.style.position = 'relative';
      copyBtn.appendChild(tooltip);
    } else {
      document.body.appendChild(tooltip);
    }
    setTimeout(function () { tooltip.remove(); }, 3000);
  }

  // ── fallbackCopy(text) — AC-10 ─────────────────────────────────────────────
  function fallbackCopy(text) {
    try {
      var range = document.createRange();
      range.selectNodeContents(codeEl);
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('copy');
    } catch (_) {
      // ignore — show tooltip regardless
    }
    showCopyTooltip('Link seleccionado — copia com Ctrl+C');
  }

  // ── Copy button behaviour (AC-8, AC-10) ────────────────────────────────────
  if (copyBtn) {
    copyBtn.addEventListener('click', function () {
      var currentUrl = codeEl ? codeEl.textContent : reportUrl;
      var iconEl = copyBtn.querySelector('.material-symbols-outlined');

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(currentUrl).then(function () {
          // Success state
          if (iconEl) iconEl.textContent = 'check_circle';
          copyBtn.style.color = '#16A34A';
          copyBtn.setAttribute('data-state', 'copied');
          setTimeout(function () {
            if (iconEl) iconEl.textContent = 'content_copy';
            copyBtn.style.color = '';
            copyBtn.removeAttribute('data-state');
          }, 2000);
        }).catch(function () {
          fallbackCopy(currentUrl);
        });
      } else {
        fallbackCopy(currentUrl);
      }
    });
  }

  // ── Polling loop — starts AFTER URL assignment above (AC-18) ───────────────
  var intervalId = null;
  var isCompleted = false;
  var didNavigate = false;

  // applyErrorState(message) — local helper, invoked on server-error status AND
  // on persistent non-OK responses (e.g. 404 job_not_found).
  function applyErrorState(message) {
    if (intervalId) clearInterval(intervalId);

    // AC-13: Red bar at current position. We set both the Tailwind class AND
    // an inline backgroundColor because the Tailwind Play CDN JIT may not have
    // generated `bg-red-600` (it scans the HTML tokens at load time; classes
    // added dynamically after load may be missed). The inline style guarantees
    // the red rendering regardless of JIT behaviour.
    if (progressFill) {
      progressFill.classList.remove('bg-primary', 'progress-pulse');
      progressFill.classList.add('bg-red-600');
      progressFill.style.backgroundColor = '#DC2626';
    }

    // AC-14: Hide processing label
    if (processingEl) {
      processingEl.style.display = 'none';
    }

    // AC-15: Status text + link box label
    if (statusEl) {
      statusEl.textContent = message || 'Erro desconhecido.';
    }
    if (linkLabel) {
      linkLabel.textContent = 'Este link não está disponível — a geração falhou.';
    }

    // AC-16: Retry + contact actions
    showErrorActions();
  }

  // Guard: required query params. Without them we cannot poll or navigate.
  if (!jobId || !reportId) {
    applyErrorState('Ligação inválida — faltam parâmetros do relatório.');
    return;
  }

  intervalId = setInterval(function () {
    fetch('/api/jobs/' + jobId)
      .then(function (res) {
        // Treat non-OK (e.g. 404 job_not_found) as a terminal error — stop
        // polling and surface the server message instead of polling forever.
        if (!res.ok) {
          return res.json().then(function (json) {
            var msg = (json && (json.message || json.error)) || 'Job não encontrado.';
            applyErrorState(msg);
            return null;
          }, function () {
            applyErrorState('Erro de servidor.');
            return null;
          });
        }
        return res.json();
      })
      .then(function (json) {
        if (!json) return;  // terminal error already handled above
        var data = json.data || json;

        // Update progress bar and status line every tick
        if (data.status !== 'error') {
          setProgress(data.status);
        }
        updateStatusLine(data);

        if (data.status === 'complete') {
          clearInterval(intervalId);
          isCompleted = true;

          // AC-11: Navigate after 1.5s
          setTimeout(function () {
            didNavigate = true;
            window.location.href = '/report/' + reportId;
          }, 1500);

          // AC-12: Fallback link at 3s — only show if primary navigation
          // has not yet occurred (in real browsers the page unloads before
          // this fires; the guard covers E2E/edge cases where navigation
          // is intercepted or hung).
          setTimeout(function () {
            if (didNavigate) return;
            showFallbackLink(reportId);
          }, 3000);

        } else if (data.status === 'error') {
          applyErrorState(data.phase_message);
        }
      })
      .catch(function (err) {
        // Network error — log and continue polling (AC-3: do not crash)
        console.error('Polling error:', err);
      });
  }, 2000);

}());
