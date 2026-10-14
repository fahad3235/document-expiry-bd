# Document Expiry BD

Offline, bilingual (English / বাংলা) tracker for the expiry dates of your important
documents — passport, NID, driving licence, birth certificate, TIN, trade licence,
student ID, visa, or anything custom. Never miss a renewal again.

Live demo: https://fahad3235.github.io/document-expiry-bd/

## Problem

Passports, licences, and certificates expire quietly, and an expired document is
usually discovered at the worst possible moment — at the airport, the bank, or a
government office. Most people track these dates in their head or on scraps of
paper. This app keeps every expiry in one place, shows exactly how many days are
left, and surfaces what needs attention first.

## Features

1. **Document register** — add documents with type (9 presets + custom), holder
   name, document number, issue date, expiry date, and notes. Inline validation
   (required fields, real calendar dates, issue ≤ expiry).
2. **Expiry status engine** — every document is classified as Expired, Expiring
   soon (≤ 30 days), Expiring within 90 days, or Valid, with an exact
   days-remaining count ("16 days left", "13 days ago").
3. **Dashboard** — totals by status, the single next-expiring document, and a
   "needs attention" list sorted by urgency.
4. **Renewals with history** — one-click renew moves the expiry forward and keeps
   a dated history of every renewal (old → new expiry). Renewing to an earlier
   date is rejected.
5. **Search, filter, edit, delete** — live text search plus status/type filters;
   full edit and delete with confirmation.
6. **Backup & restore** — JSON export/import with strict validation (wrong app
   tag, wrong version, bad dates, or duplicate ids reject the whole file and
   leave existing data untouched). Typed-DELETE erase-all.
7. **Bilingual + offline** — EN/বাংলা toggle persisted across sessions, Bengali
   digits in Bengali mode, localStorage persistence, zero network requests.

## Stack

- Vanilla HTML/CSS/JavaScript — no frameworks, no build step, no dependencies.
- `js/logic.js` holds all pure logic (date math, validation, import checks) and
  runs identically in Node and the browser.
- All source files are pure ASCII; Bengali text is stored as `\uXXXX` escapes
  (plus HTML entities in static markup) so nothing is lost in transport.

## Prerequisites

Any modern browser. For tests: Node.js 18+ and Chromium (tests use the system
Chromium at `/opt/meta-chromium/chrome` via `puppeteer-core`).

## Run locally

```bash
# Just open it — no server needed:
open index.html
# or serve it:
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## Testing

```bash
node tests/unit.test.js   # 47 logic checks (boundaries, validation, renewals, import)
node tests/smoke.mjs      # 18 headless-Chrome checks (CRUD, renew, filters, i18n, 390px, zero network)
```

`?asof=YYYY-MM-DD` on the page URL pins "today" for deterministic testing.

## Deployment

Static site — publish the whole directory to GitHub Pages (or any static host).
No server, no secrets, no environment variables.

## Limitations

- Personal reminder tool, **not** an official government service. Renewal rules,
  fees, and grace periods must be verified with the issuing authority.
- Data lives in the browser's localStorage on one device; there is no account,
  sync, or push-notification support. Export a JSON backup before clearing
  browser data.
- Dates use the Gregorian calendar only.

## Status

MVP complete. Tests: 47/47 unit + 18/18 headless-Chrome smoke, 0 console/page
errors. See `TEST_RESULTS.md` for the full run report.
