// document-expiry-bd \u2014 pure logic (no DOM). Node + browser compatible.
// All dates are ISO "YYYY-MM-DD" strings, compared as UTC calendar days.

'use strict';

const DOC_TYPES = [
  'Passport', 'National ID (NID)', 'Driving Licence', 'Birth Certificate',
  'TIN Certificate', 'Trade Licence', 'Student ID', 'Visa', 'Other'
];

const CRITICAL_DAYS = 30;
const WARNING_DAYS = 90;

function parseDay(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(iso + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return null;
  // Reject overflow dates like 2026-02-31 (Date rolls over to Mar 3).
  if (d.toISOString().slice(0, 10) !== iso) return null;
  return d;
}

function todayISO(asof) {
  if (asof) return asof;
  return new Date().toISOString().slice(0, 10);
}

// Whole days from `today` until `expiry`: negative = already expired.
function daysUntil(expiryISO, asof) {
  const exp = parseDay(expiryISO);
  const today = parseDay(todayISO(asof));
  if (!exp || !today) return null;
  return Math.round((exp.getTime() - today.getTime()) / 86400000);
}

function statusOf(doc, asof) {
  const d = daysUntil(doc.expiry, asof);
  if (d === null) return 'invalid';
  if (d < 0) return 'expired';
  if (d <= CRITICAL_DAYS) return 'critical';
  if (d <= WARNING_DAYS) return 'warning';
  return 'valid';
}

const STATUS_ORDER = { expired: 0, critical: 1, warning: 2, valid: 3, invalid: 4 };

// Urgency sort: worst status first, then fewest days remaining, then type+holder.
function sortDocs(docs, asof) {
  return [...docs].sort((a, b) => {
    const sa = STATUS_ORDER[statusOf(a, asof)];
    const sb = STATUS_ORDER[statusOf(b, asof)];
    if (sa !== sb) return sa - sb;
    const da = daysUntil(a.expiry, asof) ?? Infinity;
    const db = daysUntil(b.expiry, asof) ?? Infinity;
    if (da !== db) return da - db;
    const ta = (a.type || '') + (a.holder || '');
    const tb = (b.type || '') + (b.holder || '');
    return ta.localeCompare(tb);
  });
}

function counts(docs, asof) {
  const out = { total: docs.length, expired: 0, critical: 0, warning: 0, valid: 0 };
  for (const d of docs) {
    const s = statusOf(d, asof);
    if (s in out) out[s] += 1;
  }
  return out;
}

function nextExpiring(docs, asof) {
  const sorted = sortDocs(docs, asof);
  return sorted.length ? sorted[0] : null;
}

function validateDoc(d) {
  const errors = [];
  if (!d || typeof d !== 'object') return ['Document must be an object.'];
  if (!d.type || typeof d.type !== 'string' || !d.type.trim()) errors.push('Type is required.');
  else if (d.type.trim().length > 60) errors.push('Type must be 60 characters or fewer.');
  if (!d.holder || typeof d.holder !== 'string' || !d.holder.trim()) errors.push('Holder name is required.');
  else if (d.holder.trim().length > 80) errors.push('Holder name must be 80 characters or fewer.');
  if (d.number !== undefined && d.number !== null && typeof d.number !== 'string') errors.push('Document number must be text.');
  else if (typeof d.number === 'string' && d.number.length > 40) errors.push('Document number must be 40 characters or fewer.');
  if (d.issued) {
    if (!parseDay(d.issued)) errors.push('Issue date must be a valid YYYY-MM-DD date.');
  }
  if (!d.expiry) errors.push('Expiry date is required.');
  else if (!parseDay(d.expiry)) errors.push('Expiry date must be a valid YYYY-MM-DD date.');
  if (d.issued && d.expiry && parseDay(d.issued) && parseDay(d.expiry) && parseDay(d.issued) > parseDay(d.expiry)) {
    errors.push('Issue date cannot be after the expiry date.');
  }
  if (d.notes !== undefined && d.notes !== null && typeof d.notes !== 'string') errors.push('Notes must be text.');
  else if (typeof d.notes === 'string' && d.notes.length > 500) errors.push('Notes must be 500 characters or fewer.');
  if (d.history !== undefined) {
    if (!Array.isArray(d.history)) errors.push('Renewal history must be a list.');
    else {
      for (const h of d.history) {
        if (!h || typeof h !== 'object' || !parseDay(h.date) || !parseDay(h.oldExpiry) || !parseDay(h.newExpiry)) {
          errors.push('Renewal history entries must have valid date, oldExpiry and newExpiry.');
          break;
        }
      }
    }
  }
  return errors;
}

// Strict import validation: the whole file is rejected if anything is off.
// Stored docs keep their original ids (string) when present; ids are regenerated on add.
function validateImport(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'File must be a JSON object.' };
  if (data.app !== 'document-expiry-bd') return { ok: false, error: 'Not a Document Expiry BD export (bad app tag).' };
  if (data.version !== 1) return { ok: false, error: 'Unsupported export version.' };
  if (!Array.isArray(data.documents)) return { ok: false, error: 'documents must be a list.' };
  const seen = new Set();
  for (const d of data.documents) {
    const errs = validateDoc(d);
    if (errs.length) return { ok: false, error: 'Invalid document: ' + errs[0] };
    if (d.id !== undefined) {
      if (typeof d.id !== 'string' || !d.id) return { ok: false, error: 'Document id must be a non-empty string.' };
      if (seen.has(d.id)) return { ok: false, error: 'Duplicate document id in file.' };
      seen.add(d.id);
    }
  }
  return { ok: true, documents: data.documents };
}

function newId() {
  return 'doc-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function addDoc(docs, d) {
  const errs = validateDoc(d);
  if (errs.length) return { ok: false, errors: errs };
  const doc = {
    id: newId(),
    type: d.type.trim(),
    holder: d.holder.trim(),
    number: (d.number || '').trim(),
    issued: d.issued || '',
    expiry: d.expiry,
    notes: (d.notes || '').trim(),
    history: Array.isArray(d.history) ? d.history : []
  };
  return { ok: true, docs: [...docs, doc], doc };
}

function updateDoc(docs, id, patch) {
  const idx = docs.findIndex((d) => d.id === id);
  if (idx === -1) return { ok: false, errors: ['Document not found.'] };
  const merged = { ...docs[idx], ...patch, id: docs[idx].id };
  const errs = validateDoc(merged);
  if (errs.length) return { ok: false, errors: errs };
  const next = [...docs];
  next[idx] = merged;
  return { ok: true, docs: next, doc: merged };
}

function deleteDoc(docs, id) {
  return docs.filter((d) => d.id !== id);
}

// Record a renewal: move expiry forward and append a history entry.
// newExpiry must be strictly after the current expiry.
function renewDoc(docs, id, newExpiry, asof) {
  const idx = docs.findIndex((d) => d.id === id);
  if (idx === -1) return { ok: false, errors: ['Document not found.'] };
  if (!parseDay(newExpiry)) return { ok: false, errors: ['New expiry must be a valid YYYY-MM-DD date.'] };
  const cur = docs[idx];
  if (parseDay(newExpiry) <= parseDay(cur.expiry)) {
    return { ok: false, errors: ['New expiry must be after the current expiry date.'] };
  }
  const entry = { date: todayISO(asof), oldExpiry: cur.expiry, newExpiry };
  const next = [...docs];
  next[idx] = { ...cur, expiry: newExpiry, history: [...(cur.history || []), entry] };
  return { ok: true, docs: next, doc: next[idx] };
}

function filterDocs(docs, query, statusFilter, typeFilter, asof) {
  const q = (query || '').trim().toLowerCase();
  return docs.filter((d) => {
    if (statusFilter && statusFilter !== 'all' && statusOf(d, asof) !== statusFilter) return false;
    if (typeFilter && typeFilter !== 'all' && d.type !== typeFilter) return false;
    if (q) {
      const hay = [d.type, d.holder, d.number, d.notes].join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

const BN_DIGITS = ['\u09e6', '\u09e7', '\u09e8', '\u09e9', '\u09ea', '\u09eb', '\u09ec', '\u09ed', '\u09ee', '\u09ef'];
function toBengaliDigits(str) {
  return String(str).replace(/[0-9]/g, (ch) => BN_DIGITS[Number(ch)]);
}

function formatDaysRemaining(days, lang) {
  if (days === null) return lang === 'bn' ? '\u2014' : '\u2014';
  if (days < 0) {
    const n = Math.abs(days);
    return lang === 'bn'
      ? (toBengaliDigits(n) + (n === 1 ? ' \u09a6\u09bf\u09a8 \u0986\u0997\u09c7 \u09ae\u09c7\u09af\u09bc\u09be\u09a6 \u09b6\u09c7\u09b7' : ' \u09a6\u09bf\u09a8 \u0986\u0997\u09c7 \u09ae\u09c7\u09af\u09bc\u09be\u09a6 \u09b6\u09c7\u09b7'))
      : (n + (n === 1 ? ' day ago' : ' days ago'));
  }
  if (days === 0) return lang === 'bn' ? '\u0986\u099c \u09ae\u09c7\u09af\u09bc\u09be\u09a6 \u09b6\u09c7\u09b7' : 'Expires today';
  if (days === 1) return lang === 'bn' ? '\u09e7 \u09a6\u09bf\u09a8 \u09ac\u09be\u0995\u09bf' : '1 day left';
  return lang === 'bn' ? toBengaliDigits(days) + ' \u09a6\u09bf\u09a8 \u09ac\u09be\u0995\u09bf' : days + ' days left';
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DOC_TYPES, CRITICAL_DAYS, WARNING_DAYS,
    parseDay, todayISO, daysUntil, statusOf, sortDocs, counts, nextExpiring,
    validateDoc, validateImport, newId, addDoc, updateDoc, deleteDoc, renewDoc,
    filterDocs, toBengaliDigits, formatDaysRemaining
  };
}
