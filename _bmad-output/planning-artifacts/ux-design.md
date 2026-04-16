---
stepsCompleted: ["complete"]
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/architecture.md"
workflowType: 'ux-design'
project_name: 'MarketPilot Free Report'
user_name: 'Pedro'
date: '2026-04-15'
status: 'complete'
approvedMockups: 'Google Stitch — visual design locked'
---

# UX Design Specification — MarketPilot Free Report

**Author:** Pedro
**Date:** 2026-04-15
**Status:** Complete — based on approved Google Stitch mockups

---

## Overview

MarketPilot Free Report is a self-serve, zero-commitment web tool for Worten marketplace sellers to generate a competitive analysis report. The UX spans three pages: a form page (`index.html`), a progress screen (`progress.html`), and a report page (`report.html`).

The visual design is locked — approved mockups from Google Stitch define the layout and visual style. This document records the UX decisions, interaction specifications, component states, and edge case behaviours that implement those mockups.

---

## Design System

### Colour Palette

| Role | Hex | Usage |
|---|---|---|
| Primary | `#002366` | Logo, primary buttons, CTA banner background, progress bar fill, active states |
| Secondary | `#475569` | Body text, secondary labels, table column headers |
| Tertiary | `#501300` | Accent / destructive actions (error states if needed) |
| Neutral Background | `#F8FAFC` | Page background, section fills |
| White | `#FFFFFF` | Card backgrounds, form inputs, table rows |
| Semantic Green | `#16A34A` | "Em 1.º lugar" stat card accent |
| Semantic Red | `#DC2626` | "A perder posição" stat card accent |
| Semantic Blue | `#2563EB` | "Sem concorrência" stat card accent |

### Typography

| Role | Font | Usage |
|---|---|---|
| Headline | Manrope | Page titles, card titles, hero headline, section headings |
| Body | Inter | Form labels, table content, status messages, body paragraphs |
| Label | Inter | Uppercase overline labels, table column headers, small caps indicators |

### Button Styles

| Variant | Appearance | Usage |
|---|---|---|
| Primary | Navy fill (`#002366`), white text, rounded | Main CTA — "Gerar o meu relatório →", "Começar a automatizar →" |
| Secondary | Outlined (`#002366` border), navy text, rounded | Copy button on progress screen (default state) |
| Inverted | White fill, navy text, used on dark backgrounds | CTA button inside the navy banner on report page |

### Form Input Style

Inputs use a clean bordered style: `1px solid #CBD5E1` border, white fill, Inter body text, placeholder in `#94A3B8`. Labels sit above the input in Inter medium weight. Icon adornments (lock, mail) appear as trailing icons at `#94A3B8`.

---

## Page 1 — Form Page (`index.html`)

### Purpose

Capture the seller's Shop API Key and email address. Overcome the API key trust barrier before it becomes an objection. Initiate report generation.

---

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│ HEADER                                              │
│   MarketPilot (logo, navy)                          │
│   "Descobre onde estás a perder vendas no Worten"   │
├─────────────────────────────────────────────────────┤
│ HERO (centred, full-width)                          │
│   "INSIGHTS OFICIAIS WORTEN MARKETPLACE" (badge)    │
│   "O teu relatório gratuito de competitividade"     │
│   (subtext paragraph)                               │
├─────────────────────────────────────────────────────┤
│ FORM CARD (centred, max-width 480px)                │
│   Shop API Key field                                │
│   Email field                                       │
│   Primary button "Gerar o meu relatório →"         │
│   Trust message (lock icon)                         │
│   Privacy policy link                               │
├─────────────────────────────────────────────────────┤
│ MARKETPLACE PARTNER badge (centred, subtle)         │
├─────────────────────────────────────────────────────┤
│ FOOTER                                              │
│   MarketPilot © 2026 | Privacy Policy | Terms of   │
│   Service | Support (right-aligned)                 │
└─────────────────────────────────────────────────────┘
```

---

### Header

- **Logo:** "MarketPilot" in Manrope, navy (`#002366`). Text-only logo — no icon.
- **Tagline:** "Descobre onde estás a perder vendas no Worten" — Inter body, secondary colour (`#475569`), right-aligned or centre-adjacent to the logo.
- **No navigation links.** The header contains only the logo and tagline. No nav items, no user icons, no settings gear.

---

### Hero Section

- **Badge:** Small pill/chip above the headline — "INSIGHTS OFICIAIS WORTEN MARKETPLACE" in uppercase Inter label style, navy border, navy text.
- **Headline:** "O teu relatório gratuito de competitividade" — Manrope, large (display size, ~2.5rem–3rem), navy, centred. The word "competitividade" may be styled in navy bold or with a highlight treatment per the mockup.
- **Subtext:** "Liga o teu catálogo Worten e vê em 3 minutos quais os produtos onde estás a perder a primeira posição — e por quanto." — Inter body, secondary colour, centred, max-width constrained for readability.

---

### Form Card

- **Container:** White card (`#FFFFFF`), subtle box shadow, rounded corners (`border-radius: 12px`), centred, `max-width: 480px`, horizontal padding `24px`, vertical padding `32px`.

#### Shop API Key Field

- **Label:** "SHOP API KEY" — Inter, uppercase, label weight, `#475569`
- **Input:** Full-width text input; placeholder "Cola aqui a tua chave API do Worten"; trailing lock icon in `#94A3B8`
- **Validation:** Required. No format validation beyond non-empty at client side (server validates on submission).

#### Email Field

- **Label:** "EMAIL" — same style as above
- **Input:** `type="email"`, placeholder "O relatório é enviado para este email"; trailing mail icon in `#94A3B8`
- **Validation:** Required. Browser-native email format check.

#### Submit Button

- **Text:** "Gerar o meu relatório →"
- **Style:** Primary (navy fill, white text, full-width within card)
- **State — Default:** Navy fill, white text, pointer cursor
- **State — Loading:** See interaction spec below

#### Trust Message

- **Text:** "A tua chave é usada uma vez para gerar este relatório e nunca fica armazenada."
- **Icon:** Lock icon (outline), left-aligned with text, `#475569`
- **Style:** Inter body, same visual weight and size as the submit button label — NOT fine print. The trust message must not be de-emphasised.
- **Placement:** Immediately below the submit button, within the card.

#### Privacy Policy Link

- **Text:** "Política de privacidade"
- **Style:** Inter body, navy underline link
- **Placement:** Below the trust message, centred or left-aligned within the card

---

### Footer

- **Left:** "MarketPilot © 2026" — Inter, `#475569`, small
- **Right:** "Privacy Policy · Terms of Service · Support" — Inter, uppercase small caps or small body, `#94A3B8`, spaced links

---

### Form Page — Interaction Specifications

#### Submission — Default Flow

1. User fills both fields and clicks "Gerar o meu relatório →"
2. Client performs basic validation (see below) before submitting
3. On valid inputs: form POSTs to generation endpoint
4. Button transitions to **Loading state** immediately on click
5. On server response (job enqueued + `report_id` returned): browser navigates to `progress.html?job_id={job_id}&report_id={report_id}`

#### Form Validation — Empty Field

- **Trigger:** User clicks submit with one or both fields empty
- **Behaviour:** Highlight the empty field(s) with a red border (`#DC2626`); show an inline error message below each empty field
- **Error messages:**
  - API Key empty: "Introduz a tua chave API do Worten para continuar."
  - Email empty: "Introduz o teu email para receber o relatório."
- **Button:** Does not transition to loading state; remains clickable after user corrects the fields
- **Focus:** Move focus to the first invalid field

#### Form Validation — Invalid Email Format

- **Trigger:** User submits with a value in the email field that fails `type="email"` format check
- **Behaviour:** Highlight email field with red border; inline message "Introduz um email válido."
- **Browser native validation** is acceptable as a first pass

#### Submit — Loading State

- **Button appearance:** Navy fill retained; white spinner (CSS animation) replaces the arrow "→"; text changes to "A gerar..." or button text is replaced entirely by the spinner
- **Input fields:** Disabled (greyed out) — prevents re-submission while request is in flight
- **Duration:** Loading state holds until server responds (< 2s per NFR-P1)
- **On server error (non-enqueue):** Loading state clears; error message displayed (see below)

#### Server-Side Error on Submission

- **Trigger:** Server returns a non-success response on the form POST (e.g. network error, validation failure)
- **Behaviour:** Loading state clears; inline error message appears above the submit button
- **Error message:** "Algo correu mal. Tenta novamente ou contacta o suporte."
- **Button:** Returns to default (navy, "Gerar o meu relatório →") — user can retry

#### Invalid API Key Format (Server-Side)

- **Trigger:** Server validates API key format and returns a 400 with a specific error
- **Behaviour:** Loading clears; red border on API Key field; inline message below field
- **Error message:** "O formato da chave não é válido. Verifica se copiaste a chave correcta do portal Worten."

---

## Page 2 — Progress Screen (`progress.html`)

### Purpose

Keep the seller engaged during the 2–10 minute generation window. Surface the persistent report URL immediately (before generation completes) so the seller can save it independently of email delivery. Provide clear error communication if generation fails.

---

### Layout Structure

```
┌─────────────────────────────────────────────────────┐
│ HEADER                                              │
│   MarketPilot (logo only, navy)                     │
├─────────────────────────────────────────────────────┤
│ BODY (centred, vertically spaced)                   │
│   Icon block (bar chart icon in card)               │
│   ┌─────────────────────────────────────────────┐   │
│   │ PROGRESS CARD                               │   │
│   │   "A gerar o teu relatório..."              │   │
│   │   [Progress bar — animated fill]            │   │
│   │   "A obter catálogo... (12.400/31.179)"     │   │
│   │   ↺  PROCESSAMENTO EM TEMPO REAL            │   │
│   │                                             │   │
│   │   ┌───────────────────────────────────┐     │   │
│   │   │ LINK BOX                          │     │   │
│   │   │ "GUARDA ESTE LINK — O RELATÓRIO   │     │   │
│   │   │  FICA DISPONÍVEL 48 HORAS"        │     │   │
│   │   │ [URL input (read-only)] [Copy]    │     │   │
│   │   └───────────────────────────────────┘     │   │
│   │                                             │   │
│   │   "Vais receber também um email..."         │   │
│   └─────────────────────────────────────────────┘   │
│                                                     │
│   Step indicator (3 dots / pill progress)           │
├─────────────────────────────────────────────────────┤
│ FOOTER (same as form page)                          │
└─────────────────────────────────────────────────────┘
```

---

### Header

- **Logo:** "MarketPilot" in Manrope, navy — text only.
- **No navigation, no user icons, no settings gear.** The progress screen is stripped to logo only — no distractions while the job runs.

---

### Icon Block

- A rounded square card (light grey fill, `#F1F5F9`) containing a bar chart icon in navy — centred above the main progress card. Purely decorative, reinforces the analytics identity.

---

### Progress Card

- **Container:** White card, shadow, rounded corners, centred, `max-width: 540px`

#### Title

- **Text:** "A gerar o teu relatório..."
- **Style:** Manrope headline, navy, centred

#### Progress Bar

- **Component:** Full-width horizontal bar within the card
- **Track:** Light grey (`#E2E8F0`), rounded ends
- **Fill:** Navy (`#002366`), animated left-to-right fill
- **Animation:** The bar reflects actual job progress where possible. In the absence of granular percentage data, it animates in phases:
  - Phase 1 (catalog fetch): fills to ~30%
  - Phase 2 (competitor scan): fills to ~80%, with crawl animation to reflect long-running P11 batches
  - Phase 3 (building report): fills to ~95%
  - Complete: fills to 100% and triggers redirect
- **No percentage label** on the bar — the status message below provides the context

#### Live Status Message

- **Text examples (cycling per phase):**
  - "A obter catálogo... (12.400 / 31.179 produtos)"
  - "A verificar concorrentes... (4.800 / 12.400 produtos)"
  - "A construir relatório..."
- **Style:** Inter body, `#475569`, centred
- **Update frequency:** Refreshed on each status poll response (polling interval: 2–3 seconds)
- **Numbers:** When available from the job status endpoint, show actual progress counts. Format large numbers with `.` thousand separator (Portuguese locale).

#### "PROCESSAMENTO EM TEMPO REAL" Label

- **Component:** Inline label with a spinning indicator (CSS spinner or Lucide rotate-cw icon)
- **Text:** "PROCESSAMENTO EM TEMPO REAL" — Inter uppercase label, navy (`#002366`)
- **Style:** Small, uppercase tracking, with spinner to the left
- **Placement:** Below the status message, centred

---

### Report Link Box

- **Shown:** Immediately when the progress screen loads — before generation completes. The `report_id` is known from page load (passed via URL params from the form POST response).
- **Container:** Inner card within the progress card, light grey background (`#F8FAFC`), rounded, padded

#### Label

- **Text:** "GUARDA ESTE LINK — O RELATÓRIO FICA DISPONÍVEL 48 HORAS"
- **Style:** Inter uppercase label, `#475569`, small tracking — visually prominent enough to read but not competing with the progress title

#### URL Field

- **Component:** Read-only text input containing the full report URL (`https://marketpilot.pt/report/{report_id}`)
- **Style:** White fill, bordered, Inter mono or body, `#002366` text
- **Behaviour:** Read-only (`readonly` attribute). Clicking the field selects all text.

#### Copy Button

- **Style:** Secondary (outlined) icon button — copy icon (Lucide `copy`)
- **Default state:** Copy icon, navy outline
- **See interaction spec below for feedback states**

#### Note Below Link Box

- **Text:** "Vais receber também um email com o link quando estiver pronto."
- **Style:** Inter body, italic, `#94A3B8` (muted), centred

---

### Step Indicator

- Three pill/dot indicators at the bottom of the card area, representing Form → Progress → Report. The middle dot is active. Provides orientation without adding navigation.

---

### Progress Screen — Interaction Specifications

#### Copy Button — Feedback

1. User clicks the copy icon button
2. Browser copies the URL to clipboard (`navigator.clipboard.writeText(...)`)
3. Button transitions: icon changes to checkmark (`✓` or Lucide `check`), outline changes to green (`#16A34A`), for **2 seconds**
4. After 2 seconds: button returns to default copy icon state
5. **Fallback (clipboard API unavailable):** Select all text in the URL field instead; show tooltip "Link seleccionado — copia com Ctrl+C"

#### Auto-Redirect on Completion

1. Progress screen polls the job status endpoint every 2–3 seconds
2. When endpoint returns `status: "complete"` with `report_url`:
   - Progress bar fills to 100% (immediate, no animation delay)
   - Status message updates to "Relatório pronto!"
   - After 1.5 seconds: browser redirects to `report_url` (the `/report/{report_id}` page)
3. No manual "View Report" button is required — auto-redirect is the primary flow. However, if redirect does not fire within 3 seconds of status "complete" (defensive), show a fallback link: "O teu relatório está pronto — [ver relatório →]"

#### Error State Display

- **Trigger:** Status endpoint returns `status: "error"` with an `error_message`
- **Layout change:** Progress bar stops; fill colour changes to red (`#DC2626`) at current position — does not continue animating
- **Status message:** Replaced by the user-actionable error message from the server. Never raw API errors. Standard messages:
  - Empty catalog / suspended key: "Não foi possível obter o teu catálogo. Verifica se a chave está correcta e se a tua conta está activa no Worten. Se o problema persistir, contacta-nos."
  - Generation failed (generic): "Ocorreu um erro a gerar o teu relatório. Verifica a tua chave e tenta novamente. Se o problema persistir, contacta-nos."
- **"PROCESSAMENTO EM TEMPO REAL" label:** Hidden on error
- **Link box:** Remains visible (URL was already shown) but the label updates to "Este link não está disponível — a geração falhou."
- **CTA:** A "Tentar novamente" link (returns user to form page) and a contact link ("contacta-nos" → `mailto:` or WhatsApp)

#### Error State — Session Cleanup Note

The progress screen has no role in session cleanup — that happens server-side. The UX simply reflects the error state. The report link box shows that no report was generated.

---

## Page 3 — Report Page (`report.html`)

### Purpose

Present the seller's competitive position in a clear, ranked format that creates urgency and drives the "Começar a automatizar →" CTA click. The report is the sales instrument — every layout decision prioritises conversion over completeness.

---

### Layout Structure

```
┌──────────────────────────────────────────────────────────┐
│ HEADER                                                   │
│   MarketPilot (left)        Relatório gerado em [date]  │
├──────────────────────────────────────────────────────────┤
│ REPORT TITLE                                             │
│   "Relatório de Performance"                             │
│   Subtitle paragraph                                     │
│                             [PT] [ES] toggle            │
├──────────────────────────────────────────────────────────┤
│ SECTION 1 — "A TUA POSIÇÃO AGORA"                        │
│   [Em 1.º lugar] [A perder posição] [Sem concorrência]  │
├──────────────────────────────────────────────────────────┤
│ SECTION 2 — "Maiores oportunidades"                      │
│   Subtitle                                               │
│   Table (highlighted first row)                          │
├──────────────────────────────────────────────────────────┤
│ SECTION 3 — "Vitórias rápidas"                           │
│   Subtitle          [Descarregar relatório completo CSV] │
│   Table                                                  │
├──────────────────────────────────────────────────────────┤
│ CTA BANNER (full width, navy background)                 │
│   "Quer que isto aconteça automaticamente?"              │
│   "Começar a automatizar →" (inverted button)            │
├──────────────────────────────────────────────────────────┤
│ FOOTER (same as other pages)                             │
└──────────────────────────────────────────────────────────┘
```

---

### Report Page Initial Load State

The server serves `report.html` as a static file (`GET /report/:report_id`). The page's JS then fetches the report data from `GET /api/reports/:report_id` on load. There is a fetch gap between HTML render and data availability that must be handled.

#### Loading State (data fetch in flight)

- **Trigger:** Page has loaded; JS has fired the `GET /api/reports/:report_id` fetch; response not yet returned
- **Duration:** Should be < 2s for a pre-computed report (per NFR-P4)
- **UI:**
  - Header renders immediately (logo + date placeholder "—" until date is known)
  - Report title "Relatório de Performance" renders immediately (static copy)
  - In place of the three stat cards: three skeleton placeholder cards — same dimensions as the real cards, grey animated shimmer fill (`#E2E8F0` base with a sweep animation)
  - In place of each table: a skeleton block of four grey shimmer rows at the same row height as real table rows
  - PT/ES toggle renders immediately but is **disabled** (pointer-events none, reduced opacity) until data loads
  - CSV download link: hidden until data loads
  - CTA banner: renders immediately (static copy, no data dependency)

#### Loading → Populated Transition

- On successful fetch response: skeleton elements are replaced by real content (no fade — instant swap is fine at MVP)
- PT toggle activates; header date populates with `generated_at` from the response
- If the fetch takes > 3 seconds (unexpected): no change to loading UI — skeleton continues. Do not show an error for slow responses; NFR-P4 is < 2s and this is a p99 edge case.

#### Fetch Error State (report not found or server error)

- **Trigger:** `GET /api/reports/:report_id` returns 4xx or 5xx, or network error
- **Distinguishing from expired:** A 410 Gone response is the expired state (see Expired Report State below). A 404 or 5xx is a genuine fetch error.
- **UI:** Replace the skeleton area with a centred error card:
  - Icon: warning triangle, `#475569`
  - Headline: "Não foi possível carregar o relatório" — Manrope, navy
  - Body: "Ocorreu um erro ao carregar os dados. Tenta recarregar a página. Se o problema persistir, contacta-nos." — Inter body, `#475569`
  - Primary button: "Recarregar" — triggers `window.location.reload()`
  - Secondary link: "Contacta-nos" → contact channel
- Header and CTA banner remain visible

---

### Header

- **Left:** "MarketPilot" — Manrope, navy, text logo. No icon.
- **Right:** "Relatório gerado em [14 Abril 2026]" — Inter body, `#475569`, date formatted in Portuguese long format. Shows "—" as placeholder during the initial data fetch.
- **No navigation links.** Report page is intentionally minimal — no user menu, no settings, no back link.

---

### Report Title Block

- **Title:** "Relatório de Performance" — Manrope display, navy, left-aligned
- **Subtitle:** "Analise a sua competitividade nos mercados ibéricos. Identificamos as margens críticas onde o ajuste estratégico de preço pode desbloquear o primeiro lugar." — Inter body, `#475569`, left-aligned, max-width constrained
- **PT / ES Channel Toggle:** Positioned top-right of the content area (right-aligned to the content column)
  - Two pill buttons: `[PT]` `[ES]`
  - Active state: navy fill, white text
  - Inactive state: outlined, navy text
  - Default: PT selected

---

### Section 1 — "A Tua Posição Agora"

#### Section Label

- **Text:** "— A TUA POSIÇÃO AGORA" — Inter uppercase label with em dash prefix, `#002366`, tracking

#### Stat Cards

Three cards in a horizontal row (stack to single column on mobile):

| Card | Title | Number | Accent | Subtext |
|---|---|---|---|---|
| Em 1.º lugar | "EM 1.º LUGAR" | e.g. 4.821 | Green (`#16A34A`) | "SKUs dominando o Buy Box" |
| A perder posição | "A PERDER POSIÇÃO" | e.g. 1.340 | Red (`#DC2626`) | "Produtos ultrapassados hoje" |
| Sem concorrência | "SEM CONCORRÊNCIA" | e.g. 756 | Blue (`#2563EB`) | "Itens exclusivos em catálogo" |

**Card anatomy:**
- White fill, border in the respective accent colour (subtle, `1px`), or accent-coloured top border strip
- Card title: Inter uppercase label, accent colour
- Number: Manrope display, large (~2.5rem), navy — with a small trend icon (arrow up/down in accent colour) to the right of the number
- Subtext: Inter small, `#475569`
- Cards reflect data for the **active channel** (PT or ES per the toggle)

---

### Section 2 — "Maiores Oportunidades"

#### Section Header

- **Title:** "Maiores oportunidades" — Manrope heading, navy
- **Subtitle:** "Os produtos de maior valor onde estás a perder a primeira posição por uma pequena margem" — Inter body, `#475569`

#### Table

- **Columns:** Produto | O teu preço | Preço do 1.º lugar | Diferença € | Diferença % | Pontuação
- **Column headers:** Inter uppercase small, `#475569`, tracking
- **Sort:** Fixed — sorted by Pontuação (WOW score) descending. No client-side re-sort at MVP.
- **First row highlight:** The highest-scored product row has a light blue/navy tint background (`#EFF6FF` or similar) and a slightly bolder treatment — this is the single biggest opportunity and must be immediately obvious.
- **Subsequent rows:** Alternating white / `#F8FAFC` or all white — clean and scannable
- **Product column:** Shows product name in Inter body (navy) + EAN in Inter small (`#94A3B8`) below it; optional product thumbnail (small, 40×40px) if available
- **Price columns:** Euro values formatted as "€799,00" (Portuguese locale, comma decimal)
- **Diferença € column:** Negative value in red (`#DC2626`), e.g. "−€6,50"
- **Diferença % column:** Shown as a small pill/badge — red fill, white text, e.g. "0,8%"
- **Pontuação column:** Numeric WOW score, Inter body, right-aligned
- **Data scope:** Reflects active channel (PT or ES). Toggling PT/ES swaps the table data.
- **Empty state (no products losing 1st place in this channel):** Show a centred message "Estás em 1.º lugar em todos os produtos neste canal." with a green checkmark icon.

---

### Section 3 — "Vitórias Rápidas"

#### Section Header

- **Title:** "Vitórias rápidas" — Manrope heading, navy
- **Subtitle:** "Produtos onde uma redução de preço de ≤2% te coloca em primeiro lugar" — Inter body, `#475569`
- **CSV Download Link:** Right-aligned in the section header row — "↓ Descarregar relatório completo CSV" — Inter body, navy, underlined, with download icon

#### Table

- **Columns:** Same as Maiores oportunidades (Produto | O teu preço | Preço do 1.º lugar | Diferença € | Diferença % | Score)
- **Column header "Score"** is used in this section (per mockup) instead of "Pontuação" — consistent with what was shown in the Stitch design.
- **No first-row highlight** — all rows are equal weight in Quick Wins
- **Score column:** Shown as a visual bar or dash graphic (per mockup) rather than a raw number — a short horizontal bar reflecting relative score, navy fill
- **Data scope:** Reflects active channel (PT or ES)
- **Empty state:** "Não há vitórias rápidas disponíveis neste canal." with informational note.

---

### CTA Banner

- **Container:** Full-width section, navy background (`#002366`), generous vertical padding
- **Headline:** "Quer que isto aconteça automaticamente?" — Manrope heading, white
- **Subtext:** "Ative o Repricing Dinâmico e mantenha-se em 1.º lugar 24/7." — Inter body, white at 80% opacity
- **Button:** "Começar a automatizar →" — Inverted style (white fill, navy text), standard button padding
- **Layout:** Headline + subtext left-aligned within a max-width content column; button right-aligned (or centred on mobile)

---

### Footer

Same as other pages:
- Left: "MarketPilot © 2026" — Inter small, `#475569`
- Right: Privacy Policy · Terms of Service · Support — Inter small caps, `#94A3B8`

---

### Report Page — Interaction Specifications

#### PT / ES Channel Toggle

- **Behaviour:** Clicking `[ES]` when `[PT]` is active:
  1. Toggle updates active state (navy fill switches from PT to ES)
  2. All three stat cards update to ES channel numbers
  3. Maiores oportunidades table repopulates with ES channel data (WOW-sorted)
  4. Vitórias rápidas table repopulates with ES channel data
  5. No page reload — data for both channels is embedded in the page at load time (JSON in `<script>` block or data attributes)
- **Default:** PT active on first load
- **No animation required** — instant data swap is sufficient at MVP
- **Edge case — no ES data (seller has no active offers on Worten ES):** Clicking `[ES]` shows a message in each section: "Sem dados para Worten ES — este catálogo não tem ofertas activas neste canal."

#### CSV Download

- **Trigger:** User clicks "Descarregar relatório completo CSV"
- **Behaviour:** Browser initiates download of the pre-generated CSV file for this `report_id`
- **File name:** `marketpilot-report-{report_id-short}.csv` (first 8 chars of UUID sufficient)
- **Content:** Full catalog analysis — all SKUs, both channels, all columns (not just the top opportunities shown on-page)
- **Implementation:** Link points to a server endpoint that streams the stored `csv_data` blob. Response headers: `Content-Type: text/csv; charset=utf-8`, `Content-Disposition: attachment; filename="marketpilot-report-{id}.csv"`
- **Loading state:** Link text may briefly show "A preparar..." with a spinner if the download endpoint has latency > 1s. Return to normal text after download begins.

#### CTA Button — Destination

- **"Começar a automatizar →"** links to Pedro's contact channel. At M$P phase this is one of:
  - A WhatsApp link (`https://wa.me/...`) with a pre-filled message referencing the report
  - A `mailto:pedro@marketpilot.pt` with subject "Quero automatizar o repricing"
  - A simple contact form page
- **Implementation note:** The destination URL is a configurable constant in the frontend — not hardcoded across pages. Pedro can update this without a redeploy.
- **Behaviour:** Opens in a new tab (`target="_blank"` with `rel="noopener noreferrer"`).

#### Expired Report State (48h TTL)

- **Trigger:** A user opens a `/report/{report_id}` URL after the 48-hour TTL has passed
- **Server behaviour:** Returns a 410 Gone response (or 404 if 410 not feasible) — not a generic error page
- **Page displayed:** A dedicated expired state view, not the full report page. Content:
  - MarketPilot logo (header, same as report page)
  - Centred card:
    - Icon: clock or calendar, `#475569`
    - Headline: "Este relatório já não está disponível" — Manrope, navy
    - Body: "Os relatórios do MarketPilot são guardados durante 48 horas. Este relatório expirou. Para gerar um novo, clica no botão abaixo." — Inter body, `#475569`
    - Primary button: "Gerar um novo relatório →" — links back to `index.html`
  - Footer: same as other pages
- **No error code** (404/410) is surfaced to the user — clean expiry message only

---

## Responsive Design

### Breakpoints

| Breakpoint | Width | Layout adjustment |
|---|---|---|
| Mobile | < 640px | Single column. Stat cards stack vertically. Tables become horizontally scrollable within a scroll container. Form card full-width. CTA banner stacks headline and button vertically. |
| Tablet | 640px – 1024px | Two-column stat cards. Tables visible. Form card centred. |
| Desktop | > 1024px | Full layout as described. Stat cards in a row. Tables full-width within content column. |

### Mobile-Specific Rules

- Progress screen: card fills full screen width (minus 16px margin each side)
- Report tables: wrap in `overflow-x: auto` scroll container with a "← desliza para ver mais →" hint on mobile
- PT/ES toggle: always visible, doesn't collapse into a dropdown

---

## Accessibility

- All form inputs have associated `<label>` elements (not placeholder-only)
- Error messages are associated with inputs via `aria-describedby`
- The progress bar uses `role="progressbar"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`
- Copy button has `aria-label="Copiar link do relatório"`
- PT/ES toggle uses `role="group"` with `aria-label="Canal"` and `aria-pressed` on each button
- Colour is not the only differentiator — stat card sections also use distinct labels and icons
- Sufficient contrast: navy `#002366` on white `#FFFFFF` passes WCAG AA (contrast ratio ~10:1)

---

## State Summary

### Form Page States

| State | Trigger | UI |
|---|---|---|
| Default | Page load | Empty form, navy button enabled |
| Validation error | Submit with empty field | Red border + inline error on offending field(s) |
| Loading | Valid submit clicked | Button shows spinner, inputs disabled |
| Server error | API returns error on POST | Loading clears, error message above button |
| Invalid key format | Server 400 on key validation | Red border + inline error on API Key field |

### Progress Screen States

| State | Trigger | UI |
|---|---|---|
| Generating | Job running | Animated bar, live status message, link box visible |
| Complete | Status: "complete" | Bar at 100%, "Relatório pronto!", auto-redirect in 1.5s |
| Error | Status: "error" | Bar stops (red at position), error message, retry link |

### Report Page States

| State | Trigger | UI |
|---|---|---|
| Loading | Page load, data fetch in flight | Skeleton shimmer cards + rows; toggle disabled; CSV link hidden |
| Populated — PT active | Fetch success / PT toggle click | All sections show PT channel data; toggle and CSV link enabled |
| Populated — ES active | ES toggle click | All sections show ES channel data |
| No ES data | ES toggle on empty-ES report | Per-section empty state messages |
| Fetch error | `/api/reports/:id` returns 4xx/5xx or network error | Centred error card with Reload button and contact link |
| CSV downloading | Download link click | Link text briefly shows loading indicator |
| Expired | TTL passed, `/report/:id` returns 410 | Expiry card with "Generate new report" CTA |

---

## User Journey to UX Mapping

| Journey | Key UX Decision |
|---|---|
| Warm lead (Rui, mobile) | Trust message same weight as button — reassures after Pedro's outreach. Report mobile-responsive. WOW score makes #1 opportunity obvious on first scroll. |
| Cold prospect (Ana, self-serve) | Progress screen meaningful messages (not just spinner) — keeps her engaged. Link box shown immediately — she can bookmark before email arrives. |
| Edge case (Miguel, suspended key) | Error on progress screen is user-actionable — he knows to check his account, not debug an API error. |
| Live demo (Pedro, screen-share) | Screen-share-friendly layout — no clutter. Sub-90s generation for mid-size catalogs. No admin mode needed — the public tool is the demo. |

---

*End of UX Design Specification — MarketPilot Free Report*
