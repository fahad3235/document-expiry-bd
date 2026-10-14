// Smoke test for document-expiry-bd via puppeteer-core + system Chromium.
// Run: node tests/smoke.mjs   (serves file:// with ?asof=2026-10-14)
import puppeteer from 'puppeteer-core';
import { fileURLToPath } from 'url';
import path from 'path';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PAGE = 'file://' + path.join(DIR, '..', 'index.html') + '?asof=2026-10-14';
let pass = 0, fail = 0;
const check = async (name, fn) => {
  try { await fn(); pass++; console.log('ok  ', name); }
  catch (e) { fail++; console.error('FAIL', name, '-', e.message); }
};
const text = (page, sel) => page.$eval(sel, (el) => el.textContent.trim());
const count = (page, sel) => page.$$eval(sel, (els) => els.length);

const browser = await puppeteer.launch({
  executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--allow-file-access-from-files']
});
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(PAGE, { waitUntil: 'load' });
await page.waitForSelector('#statTotal');

// Empty state
await check('empty state: totals 0, no-docs message', async () => {
  if ((await text(page, '#statTotal')) !== '0') throw new Error('total != 0');
  // Documents tab shows empty message
  await page.click('[data-tab="documents"]');
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes('No documents yet')) throw new Error('empty message missing');
});

// Add an expired passport
await check('add expired passport shows in dashboard + list', async () => {
  await page.click('[data-tab="documents"]');
  await page.select('#fType', 'Passport');
  await page.type('#fHolder', 'Fahad Test');
  await page.type('#fNumber', 'A1234567');
  await page.$eval('#fIssued', (el) => { el.value = '2021-01-15'; });
  await page.$eval('#fExpiry', (el) => { el.value = '2026-10-01'; });
  await page.click('#saveBtn');
  await page.waitForFunction(() => document.querySelector('#statExpired')?.textContent.trim() === '1');
  if ((await text(page, '#statExpired')) !== '1') throw new Error('expired != 1');
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes('Fahad Test') || !body.includes('A1234567')) throw new Error('doc not rendered');
  if (!body.includes('13 days ago')) throw new Error('days-ago text missing: ' + body.slice(0, 500));
});

// Add a valid NID (far future) + critical driving licence
await check('add valid NID + critical licence; counts + badges', async () => {
  await page.select('#fType', 'National ID (NID)');
  await page.$eval('#fHolder', (el) => { el.value = 'Meem Test'; });
  await page.$eval('#fNumber', (el) => { el.value = ''; });
  await page.$eval('#fIssued', (el) => { el.value = ''; });
  await page.$eval('#fExpiry', (el) => { el.value = '2030-01-01'; });
  await page.click('#saveBtn');
  await page.waitForFunction(() => document.querySelector('#statTotal')?.textContent.trim() === '2');
  await page.select('#fType', 'Driving Licence');
  await page.$eval('#fHolder', (el) => { el.value = 'Karim Test'; });
  await page.$eval('#fExpiry', (el) => { el.value = '2026-10-30'; });
  await page.click('#saveBtn');
  await page.waitForFunction(() => document.querySelector('#statTotal')?.textContent.trim() === '3');
  if ((await text(page, '#statCritical')) !== '1') throw new Error('critical != 1');
  if ((await text(page, '#statValid')) !== '1') throw new Error('valid != 1');
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes('16 days left')) throw new Error('16 days left missing');
});

// Dashboard urgent list + next-up
await check('dashboard: next-up is expired passport; urgent list has 2', async () => {
  await page.click('[data-tab="dashboard"]');
  await page.waitForSelector('#nextUpBox .doc-card');
  const next = await text(page, '#nextUpBox');
  if (!next.includes('Fahad Test')) throw new Error('next-up wrong: ' + next);
  const urgent = await count(page, '#urgentList .doc-card');
  if (urgent !== 2) throw new Error('urgent count ' + urgent);
});

// Search filter
await check('search filter narrows list', async () => {
  await page.click('[data-tab="documents"]');
  await page.type('#q', 'Karim');
  await page.waitForFunction(() => document.querySelectorAll('#docList .doc-card').length === 1);
  const body = await text(page, '#docList');
  if (!body.includes('Karim Test')) throw new Error('search result wrong');
  await page.$eval('#q', (el) => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.waitForFunction(() => document.querySelectorAll('#docList .doc-card').length === 3);
});

// Status filter
await check('status filter expired shows 1', async () => {
  await page.select('#statusFilter', 'expired');
  await page.waitForFunction(() => document.querySelectorAll('#docList .doc-card').length === 1);
  if (!(await text(page, '#docList')).includes('Fahad Test')) throw new Error('status filter wrong');
  await page.select('#statusFilter', 'all');
  await page.waitForFunction(() => document.querySelectorAll('#docList .doc-card').length === 3);
});

// Validation: missing holder
await check('validation: empty holder rejected inline', async () => {
  await page.$eval('#fHolder', (el) => { el.value = ''; });
  await page.$eval('#fExpiry', (el) => { el.value = '2027-01-01'; });
  await page.click('#saveBtn');
  await page.waitForFunction(() => document.querySelector('#formError').textContent.includes('Holder'));
  if ((await text(page, '#statTotal')) !== '3') throw new Error('invalid doc was added');
});

// Edit: change holder name
await check('edit updates holder', async () => {
  const cards = await page.$$('#docList .doc-card');
  // find the Meem card's edit button
  const idx = await page.$$eval('#docList .doc-card', (cs) => cs.findIndex((c) => c.innerText.includes('Meem Test')));
  await page.$$eval('#docList .doc-card button[data-act="edit"]', (btns, i) => btns[i].click(), idx);
  await page.waitForFunction(() => document.querySelector('#fHolder').value === 'Meem Test');
  await page.$eval('#fHolder', (el) => { el.value = 'Meem Edited'; });
  await page.click('#saveBtn');
  await page.waitForFunction(() => document.body.innerText.includes('Meem Edited'));
});

// Renew: expired passport -> 2031-10-01, history entry appears
await check('renew moves expiry + records history', async () => {
  await page.evaluate(() => { window.__confirm = true; });
  const idx = await page.$$eval('#docList .doc-card', (cs) => cs.findIndex((c) => c.innerText.includes('Fahad Test')));
  // stub prompt
  await page.evaluate(() => { window.prompt = () => '2031-10-01'; });
  await page.$$eval('#docList .doc-card button[data-act="renew"]', (btns, i) => btns[i].click(), idx);
  await page.waitForFunction(() => document.body.innerText.includes('Renewal history'));
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes('2026-10-01 \u2192 2031-10-01')) throw new Error('history entry missing');
  if ((await text(page, '#statExpired')) !== '0') throw new Error('expired should be 0 after renew');
  if ((await text(page, '#statValid')) !== '2') throw new Error('valid should be 2 after renew');
});

// Renew with earlier date rejected (alert)
await check('renew with earlier date rejected', async () => {
  await page.evaluate(() => { window.prompt = () => '2020-01-01'; window.__alert = null; window.alert = (m) => { window.__alert = m; }; });
  const idx = await page.$$eval('#docList .doc-card', (cs) => cs.findIndex((c) => c.innerText.includes('Fahad Test')));
  await page.$$eval('#docList .doc-card button[data-act="renew"]', (btns, i) => btns[i].click(), idx);
  await page.waitForFunction(() => window.__alert !== null);
  const body = await page.evaluate(() => document.body.innerText);
  if (body.includes('2020-01-01 \u2192')) throw new Error('bad renew recorded');
});

// Delete: remove Karim licence
await check('delete removes doc', async () => {
  await page.evaluate(() => { window.confirm = () => true; });
  const idx = await page.$$eval('#docList .doc-card', (cs) => cs.findIndex((c) => c.innerText.includes('Karim Test')));
  await page.$$eval('#docList .doc-card button[data-act="del"]', (btns, i) => btns[i].click(), idx);
  await page.waitForFunction(() => document.querySelector('#statTotal').textContent.trim() === '2');
});

// Persistence across reload
await check('reload persistence', async () => {
  await page.reload({ waitUntil: 'load' });
  await page.waitForSelector('#statTotal');
  if ((await text(page, '#statTotal')) !== '2') throw new Error('total != 2 after reload');
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes('Meem Edited')) throw new Error('edited doc lost after reload');
});

// Export -> erase -> import round-trip (via localStorage API in page)
await check('export/import round-trip via validateImport path', async () => {
  const exported = await page.evaluate(() => {
    const docs = JSON.parse(localStorage.getItem('document-expiry-bd:v1'));
    return { app: 'document-expiry-bd', version: 1, documents: docs };
  });
  if (exported.documents.length !== 2) throw new Error('export doc count wrong');
  // erase via UI
  await page.click('[data-tab="data"]');
  await page.type('#eraseConfirm', 'DELETE');
  await page.click('#eraseBtn');
  await page.waitForFunction(() => document.querySelector('#statTotal').textContent.trim() === '0');
  // import by injecting through the file-less path: set localStorage via validateImport in page
  const ok = await page.evaluate((data) => {
    const v = validateImport(data);
    if (!v.ok) return false;
    localStorage.setItem('document-expiry-bd:v1', JSON.stringify(v.documents));
    location.reload();
    return true;
  }, exported);
  if (!ok) throw new Error('validateImport failed');
  await page.waitForFunction(() => document.querySelector('#statTotal')?.textContent.trim() === '2');
});

// Malformed import rejected (file input path)
await check('malformed import rejected, data intact', async () => {
  await page.click('[data-tab="data"]');
  // write a bad file via DataTransfer into the file input
  await page.evaluate(async () => {
    const bad = new File([JSON.stringify({ app: 'wrong', version: 1, documents: [] })], 'bad.json', { type: 'application/json' });
    const dt = new DataTransfer();
    dt.items.add(bad);
    const input = document.querySelector('#importFile');
    input.files = dt.files;
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForFunction(() => document.querySelector('#dataMsg').textContent.includes('Import failed'));
  if ((await text(page, '#statTotal')) !== '2') throw new Error('data lost after bad import');
});

// Bengali toggle
await check('BN toggle renders Bengali + persists', async () => {
  await page.click('#langBtn');
  await page.waitForFunction(() => document.body.innerText.includes('\u09a8\u09a5\u09bf\u09b0 \u09ae\u09c7\u09af\u09bc\u09be\u09a6 \u099f\u09cd\u09b0\u09cd\u09af\u09be\u0995\u09be\u09b0'));
  await page.click('[data-tab="dashboard"]');
  await new Promise((r) => setTimeout(r, 150));
  const body = await page.evaluate(() => document.body.innerText);
  if (!body.includes('\u09ae\u09cb\u099f \u09a8\u09a5\u09bf')) throw new Error('BN dashboard label missing');
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => document.body.innerText.includes('\u09a8\u09a5\u09bf\u09b0 \u09ae\u09c7\u09af\u09bc\u09be\u09a6 \u099f\u09cd\u09b0\u09cd\u09af\u09be\u0995\u09be\u09b0'));
  // switch back to EN for remaining checks
  await page.click('#langBtn');
  await page.waitForFunction(() => document.body.innerText.includes('Document Expiry BD'));
});

// 390px mobile: no horizontal overflow on all tabs
await check('390px mobile no overflow', async () => {
  await page.setViewport({ width: 390, height: 844 });
  for (const tab of ['dashboard', 'documents', 'data']) {
    await page.click(`[data-tab="${tab}"]`);
    await new Promise((r) => setTimeout(r, 150));
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (over > 1) throw new Error(`overflow ${over}px on ${tab}`);
  }
});

// Zero network requests (file:// only)
await check('zero network requests', async () => {
  const reqs = [];
  page.on('request', (r) => reqs.push(r.url()));
  await page.reload({ waitUntil: 'load' });
  await new Promise((r) => setTimeout(r, 400));
  const net = reqs.filter((u) => !u.startsWith('file://') && !u.startsWith('data:'));
  if (net.length) throw new Error('network: ' + net.join(', '));
});

await check('no console/page errors', async () => {
  if (errors.length) throw new Error(errors.join(' | '));
});

await browser.close();
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
