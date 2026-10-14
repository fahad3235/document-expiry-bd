// Unit tests for document-expiry-bd logic. Run: node tests/unit.test.js
'use strict';
const assert = require('assert');
const L = require('../js/logic.js');

const ASOF = '2026-10-14';
let pass = 0, fail = 0;
function check(name, fn) {
  try { fn(); pass++; }
  catch (e) { fail++; console.error('FAIL:', name, '-', e.message); }
}

// --- daysUntil / statusOf boundaries (asof 2026-10-14) ---
check('daysUntil same day = 0', () => assert.strictEqual(L.daysUntil('2026-10-14', ASOF), 0));
check('daysUntil tomorrow = 1', () => assert.strictEqual(L.daysUntil('2026-10-15', ASOF), 1));
check('daysUntil yesterday = -1', () => assert.strictEqual(L.daysUntil('2026-10-13', ASOF), -1));
check('daysUntil leap year 2028-02-29', () => assert.strictEqual(L.daysUntil('2028-02-29', ASOF), 503));
check('daysUntil invalid date null', () => assert.strictEqual(L.daysUntil('2026-02-31', ASOF), null));
check('daysUntil garbage null', () => assert.strictEqual(L.daysUntil('hello', ASOF), null));

const mk = (expiry, extra = {}) => ({ type: 'Passport', holder: 'Fahad', expiry, ...extra });
check('status expired', () => assert.strictEqual(L.statusOf(mk('2026-10-13'), ASOF), 'expired'));
check('status critical at 0 days', () => assert.strictEqual(L.statusOf(mk('2026-10-14'), ASOF), 'critical'));
check('status critical at 30 days', () => assert.strictEqual(L.statusOf(mk('2026-11-13'), ASOF), 'critical'));
check('status warning at 31 days', () => assert.strictEqual(L.statusOf(mk('2026-11-14'), ASOF), 'warning'));
check('status warning at 90 days', () => assert.strictEqual(L.statusOf(mk('2027-01-12'), ASOF), 'warning'));
check('status valid at 91 days', () => assert.strictEqual(L.statusOf(mk('2027-01-13'), ASOF), 'valid'));
check('status invalid date', () => assert.strictEqual(L.statusOf(mk('2026-02-31'), ASOF), 'invalid'));

// --- sortDocs: expired, then critical nearest, then warning, then valid ---
check('sortDocs urgency order', () => {
  const docs = [mk('2027-06-01'), mk('2026-10-01'), mk('2026-10-20'), mk('2026-12-01')];
  const sorted = L.sortDocs(docs, ASOF);
  assert.deepStrictEqual(sorted.map((d) => d.expiry), ['2026-10-01', '2026-10-20', '2026-12-01', '2027-06-01']);
});

// --- counts ---
check('counts', () => {
  const docs = [mk('2026-10-01'), mk('2026-10-20'), mk('2026-12-01'), mk('2027-06-01'), mk('2027-06-02')];
  assert.deepStrictEqual(L.counts(docs, ASOF), { total: 5, expired: 1, critical: 1, warning: 1, valid: 2 });
});

// --- nextExpiring ---
check('nextExpiring picks worst', () => {
  const docs = [mk('2027-06-01'), mk('2026-10-01')];
  assert.strictEqual(L.nextExpiring(docs, ASOF).expiry, '2026-10-01');
});
check('nextExpiring empty null', () => assert.strictEqual(L.nextExpiring([], ASOF), null));

// --- validateDoc ---
check('validateDoc valid', () => assert.deepStrictEqual(L.validateDoc(mk('2027-01-01', { issued: '2022-01-01' })), []));
check('validateDoc missing type', () => assert.ok(L.validateDoc(mk('2027-01-01', { type: '' })).length));
check('validateDoc missing holder', () => assert.ok(L.validateDoc(mk('2027-01-01', { holder: '  ' })).length));
check('validateDoc missing expiry', () => assert.ok(L.validateDoc({ type: 'Passport', holder: 'F' }).length));
check('validateDoc issued after expiry', () => assert.ok(L.validateDoc(mk('2027-01-01', { issued: '2027-02-01' })).length));
check('validateDoc bad expiry format', () => assert.ok(L.validateDoc(mk('not-a-date')).length));
check('validateDoc notes too long', () => assert.ok(L.validateDoc(mk('2027-01-01', { notes: 'x'.repeat(501) })).length));
check('validateDoc bad history', () => assert.ok(L.validateDoc(mk('2027-01-01', { history: [{ date: 'bad' }] })).length));

// --- validateImport strictness ---
const good = { app: 'document-expiry-bd', version: 1, documents: [mk('2027-01-01')] };
check('validateImport good', () => assert.strictEqual(L.validateImport(good).ok, true));
check('validateImport wrong app', () => assert.strictEqual(L.validateImport({ ...good, app: 'other' }).ok, false));
check('validateImport wrong version', () => assert.strictEqual(L.validateImport({ ...good, version: 2 }).ok, false));
check('validateImport documents not array', () => assert.strictEqual(L.validateImport({ ...good, documents: {} }).ok, false));
check('validateImport bad doc rejected', () => assert.strictEqual(L.validateImport({ ...good, documents: [mk('bad')] }).ok, false));
check('validateImport duplicate id rejected', () => {
  const d1 = { ...mk('2027-01-01'), id: 'x' }, d2 = { ...mk('2027-02-01'), id: 'x' };
  assert.strictEqual(L.validateImport({ ...good, documents: [d1, d2] }).ok, false);
});
check('validateImport null rejected', () => assert.strictEqual(L.validateImport(null).ok, false));

// --- add/update/delete ---
check('addDoc appends with id + history', () => {
  const r = L.addDoc([], mk('2027-01-01'));
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.docs.length, 1);
  assert.ok(r.doc.id.startsWith('doc-'));
  assert.deepStrictEqual(r.doc.history, []);
});
check('addDoc invalid rejected', () => assert.strictEqual(L.addDoc([], mk('bad')).ok, false));
check('updateDoc edits', () => {
  const r0 = L.addDoc([], mk('2027-01-01'));
  const r = L.updateDoc(r0.docs, r0.doc.id, { holder: 'Meem' });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.docs[0].holder, 'Meem');
});
check('updateDoc unknown id', () => assert.strictEqual(L.updateDoc([], 'nope', { holder: 'X' }).ok, false));
check('updateDoc invalid patch rejected', () => {
  const r0 = L.addDoc([], mk('2027-01-01'));
  assert.strictEqual(L.updateDoc(r0.docs, r0.doc.id, { expiry: 'bad' }).ok, false);
});
check('deleteDoc removes', () => {
  const r0 = L.addDoc([], mk('2027-01-01'));
  assert.strictEqual(L.deleteDoc(r0.docs, r0.doc.id).length, 0);
});

// --- renewDoc ---
check('renewDoc moves expiry + history entry', () => {
  const r0 = L.addDoc([], mk('2026-10-01'));
  const r = L.renewDoc(r0.docs, r0.doc.id, '2031-10-01', ASOF);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.doc.expiry, '2031-10-01');
  assert.strictEqual(r.doc.history.length, 1);
  assert.deepStrictEqual(r.doc.history[0], { date: ASOF, oldExpiry: '2026-10-01', newExpiry: '2031-10-01' });
});
check('renewDoc earlier date rejected', () => {
  const r0 = L.addDoc([], mk('2027-01-01'));
  assert.strictEqual(L.renewDoc(r0.docs, r0.doc.id, '2026-01-01', ASOF).ok, false);
});
check('renewDoc same date rejected', () => {
  const r0 = L.addDoc([], mk('2027-01-01'));
  assert.strictEqual(L.renewDoc(r0.docs, r0.doc.id, '2027-01-01', ASOF).ok, false);
});
check('renewDoc invalid date rejected', () => {
  const r0 = L.addDoc([], mk('2027-01-01'));
  assert.strictEqual(L.renewDoc(r0.docs, r0.doc.id, 'bad', ASOF).ok, false);
});
check('renewDoc twice accumulates history', () => {
  const r0 = L.addDoc([], mk('2026-10-01'));
  const r1 = L.renewDoc(r0.docs, r0.doc.id, '2031-10-01', ASOF);
  const r2 = L.renewDoc(r1.docs, r1.doc.id, '2036-10-01', ASOF);
  assert.strictEqual(r2.doc.history.length, 2);
});

// --- filterDocs ---
check('filterDocs search + status + type', () => {
  const docs = [
    mk('2026-10-01', { type: 'Passport', holder: 'Fahad' }),
    mk('2027-06-01', { type: 'NID', holder: 'Meem' }),
    mk('2026-11-01', { type: 'Passport', holder: 'Karim', number: 'PP-99' })
  ];
  assert.strictEqual(L.filterDocs(docs, 'fahad', 'all', 'all', ASOF).length, 1);
  assert.strictEqual(L.filterDocs(docs, 'PP-99', 'all', 'all', ASOF).length, 1);
  assert.strictEqual(L.filterDocs(docs, '', 'expired', 'all', ASOF).length, 1);
  assert.strictEqual(L.filterDocs(docs, '', 'all', 'Passport', ASOF).length, 2);
  assert.strictEqual(L.filterDocs(docs, '', 'valid', 'Passport', ASOF).length, 0);
});

// --- Bengali digits / days remaining ---
check('toBengaliDigits', () => assert.strictEqual(L.toBengaliDigits('2026-10-14'), '\u09e8\u09e6\u09e8\u09ec-\u09e7\u09e6-\u09e7\u09ea'));
check('formatDaysRemaining en', () => {
  assert.strictEqual(L.formatDaysRemaining(0, 'en'), 'Expires today');
  assert.strictEqual(L.formatDaysRemaining(1, 'en'), '1 day left');
  assert.strictEqual(L.formatDaysRemaining(5, 'en'), '5 days left');
  assert.strictEqual(L.formatDaysRemaining(-1, 'en'), '1 day ago');
  assert.strictEqual(L.formatDaysRemaining(-3, 'en'), '3 days ago');
});
check('formatDaysRemaining bn', () => {
  assert.strictEqual(L.formatDaysRemaining(0, 'bn'), '\u0986\u099c \u09ae\u09c7\u09af\u09bc\u09be\u09a6 \u09b6\u09c7\u09b7');
  assert.strictEqual(L.formatDaysRemaining(5, 'bn'), '\u09eb \u09a6\u09bf\u09a8 \u09ac\u09be\u0995\u09bf');
  assert.strictEqual(L.formatDaysRemaining(-3, 'bn'), '\u09e9 \u09a6\u09bf\u09a8 \u0986\u0997\u09c7 \u09ae\u09c7\u09af\u09bc\u09be\u09a6 \u09b6\u09c7\u09b7');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
