# TEST_RESULTS — document-expiry-bd (run #60, 2026-10-14)

## Unit tests — `node tests/unit.test.js`
**47 passed, 0 failed.**

Covered:
- `daysUntil`: same-day 0, +1/−1, leap day 2028-02-29 = 503 days from 2026-10-14,
  invalid `2026-02-31` → null, garbage → null.
- Status boundaries (asof 2026-10-14): −1 expired; 0 and 30 critical; 31 and 90
  warning; 91 valid; invalid date → invalid.
- Urgency sort: expired → critical (nearest) → warning → valid.
- Counts, next-expiring, empty → null.
- `validateDoc`: 8 rejection cases (missing type/holder/expiry, issued>expiry,
  bad format, notes >500, bad history) + valid case.
- `validateImport`: wrong app tag / version / non-array / bad doc / duplicate id /
  null all rejected; good file accepted.
- add/update/delete incl. invalid-patch and unknown-id rejection.
- `renewDoc`: moves expiry, appends `{date, oldExpiry, newExpiry}` history entry;
  earlier, same, and invalid dates rejected; double renew accumulates 2 entries.
- `filterDocs`: search by holder/number, status filter, type filter, combined.
- Bengali digits `2026-10-14` → `২০২৬-১০-১৪`; days-remaining strings in EN + BN.

## Headless-Chrome smoke — `node tests/smoke.mjs` (puppeteer-core, file://, ?asof=2026-10-14)
**18 passed, 0 failed. 0 console/page errors.**

Covered: empty state; add expired passport (badge "13 days ago"); add valid NID +
critical licence (counts 3/1/1/1, "16 days left"); dashboard next-up + urgent list
(2); search filter; status filter; empty-holder inline validation (no add);
edit holder; renew expired → 2031-10-01 with history entry + counts update
(expired 0, valid 2); renew-to-earlier-date rejected via alert; delete; reload
persistence; export→erase→import round-trip; malformed import rejected with data
intact; BN toggle renders Bengali + persists across reload; 390px mobile — zero
horizontal overflow on all 3 tabs; zero non-file network requests.

## Repairs
- 1 test-side syntax fix (extra paren in unit test) before first run.
- 1 test-side fix: BN check ran while Dashboard tab was hidden (`innerText`
  excludes hidden sections) — test now opens the Dashboard tab first.
- 1 app-hygiene fix: ASCII-ify step left `\uXXXX` escapes in raw HTML text/title
  (HTML does not interpret them) — replaced with `&mdash;`/`&hellip;`/plain ASCII;
  JS-string escapes kept. Both suites re-run green after the fix.

## Hygiene
- All app sources pure ASCII (`grep -P [^\x00-\x7F]` zero matches in
  `index.html`, `js/`, `tests/`).
- No secrets. No fabricated data — ships empty.
