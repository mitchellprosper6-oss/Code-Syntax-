// Small shared helpers: ids, dates, formatting, escaping.

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

export const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pad = (n) => String(n).padStart(2, '0');

/** Local date as YYYY-MM-DD. */
export const isoDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoDate();

/** Parse YYYY-MM-DD as a local date (not UTC). */
export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

export function daysUntil(s) {
  const d = parseDate(s);
  if (!d) return null;
  const t = new Date();
  const t0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((d - t0) / 86400000);
}

export function countdown(days) {
  if (days == null) return '';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}

/** Urgency colour: under 7 days red, under 21 amber, otherwise green. Past = red. */
export function urgency(days) {
  if (days == null) return 'none';
  if (days < 7) return 'red';
  if (days < 21) return 'amber';
  return 'green';
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function fmtDate(s, opts = {}) {
  const d = parseDate(s);
  if (!d) return '';
  const base = `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, opts.long ? undefined : 3)} ${d.getFullYear()}`;
  return opts.weekday ? `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${base}` : base;
}

export function fmtMonth(ym) {
  if (!ym) return '';
  const [y, m] = ym.split('-').map(Number);
  return m ? `${MONTHS[m - 1]} ${y}` : String(y);
}

export const fmtDateTime = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${fmtDate(isoDate(d))}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** A deadline/date object {date, tbc, approxMonth} as text. */
export function whenText(w) {
  if (!w) return 'No date';
  if (w.date && !w.tbc) return fmtDate(w.date, { weekday: true });
  return w.approxMonth ? `TBC (approx. ${fmtMonth(w.approxMonth)})` : 'Date TBC';
}

export const hasDate = (w) => !!(w && w.date && !w.tbc);

export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export function fmtMinutes(min) {
  min = Math.round(min || 0);
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const round = (n) => Math.round(n);

/** Monday of the week containing date string s. */
export function weekStart(s) {
  const d = parseDate(s);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return isoDate(d);
}

export const thisMonth = () => today().slice(0, 7);

export function byOrder(a, b) {
  return (a.order ?? 0) - (b.order ?? 0);
}

export function move(arr, i, dir) {
  const j = i + dir;
  if (j < 0 || j >= arr.length) return arr;
  const copy = arr.slice();
  [copy[i], copy[j]] = [copy[j], copy[i]];
  return copy;
}

export const debounce = (fn, ms = 400) => {
  let t;
  return (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
};

export const CATEGORIES = [
  { id: 'uni', label: 'Uni' },
  { id: 'work', label: 'Work' },
  { id: 'personal', label: 'Personal' },
];
export const catLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || 'Uncategorised';

export const PROJECT_STATUSES = [
  { id: 'not-started', label: 'Not started' },
  { id: 'in-progress', label: 'In progress' },
  { id: 'submitted', label: 'Submitted' },
  { id: 'done', label: 'Done' },
];
export const statusLabel = (id) => PROJECT_STATUSES.find((s) => s.id === id)?.label || id;
export const isClosed = (p) => p.status === 'submitted' || p.status === 'done';

export const RATINGS = [
  { id: 'confident', label: 'Confident', short: 'Good at', color: 'green' },
  { id: 'practice', label: 'Needs practice', short: 'Need practice', color: 'amber' },
  { id: 'unknown', label: "Don't know yet", short: "Don't know", color: 'red' },
];
export const ratingInfo = (id) => RATINGS.find((r) => r.id === id) || RATINGS[2];

export const LEVELS = ['Beginner', 'Developing', 'Competent', 'Proficient', 'Advanced'];

export const PHASES = [
  { id: 'p1', label: 'Phase 1 · now' },
  { id: 'p2', label: 'Phase 2 · later' },
  { id: 'ongoing', label: 'Ongoing' },
  { id: 'unset', label: 'Phase not set' },
];
export const phaseLabel = (id) => PHASES.find((p) => p.id === id)?.label || 'Phase not set';

export const QUESTION_KINDS = [
  { id: 'mcq', label: 'Multiple choice' },
  { id: 'short', label: 'Short answer' },
  { id: 'numerical', label: 'Numerical' },
  { id: 'long', label: 'Long / worked answer' },
];
export const kindLabel = (id) => QUESTION_KINDS.find((k) => k.id === id)?.label || id;

export const RESOURCE_KINDS = ['Course', 'Book', 'Video', 'Link', 'Software tutorial', 'Other'];
