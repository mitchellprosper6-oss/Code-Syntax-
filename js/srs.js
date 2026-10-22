// Spaced repetition (SM-2 style) for flashcards.
// Grades: 1 Again, 2 Hard, 3 Good, 4 Easy.

import { today, parseDate, isoDate, uid } from './util.js';

export const GRADES = [
  { g: 1, label: 'Again', key: '1', cls: 'red' },
  { g: 2, label: 'Hard', key: '2', cls: 'amber' },
  { g: 3, label: 'Good', key: '3', cls: 'green' },
  { g: 4, label: 'Easy', key: '4', cls: 'accent' },
];

export const NEW_PER_DAY = 20;

export const newCard = (v = {}) => ({
  id: uid(), front: '', back: '', examId: null, topicId: null, skillId: null, sourceFileId: null,
  due: today(), interval: 0, ease: 2.5, reps: 0, lapses: 0, lastReviewed: null, history: [],
  ...v,
});

const addDays = (n) => {
  const d = parseDate(today());
  d.setDate(d.getDate() + n);
  return isoDate(d);
};

/** Apply a grade and return the updated card (pure). */
export function grade(card, g) {
  const c = { ...card, history: [...(card.history || []), { date: today(), g }].slice(-30), lastReviewed: new Date().toISOString() };
  if (g === 1) {
    c.reps = 0;
    c.lapses = (c.lapses || 0) + 1;
    c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = today();
    return c;
  }
  const q = g + 1; // Hard=3, Good=4, Easy=5 on SM-2's 0–5 scale
  c.ease = Math.max(1.3, c.ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)));
  if (c.reps === 0) c.interval = g === 4 ? 4 : 1;
  else if (c.reps === 1) c.interval = g === 2 ? 3 : g === 4 ? 8 : 6;
  else c.interval = Math.max(c.interval + 1, Math.round(c.interval * (g === 2 ? 1.2 : g === 4 ? c.ease * 1.3 : c.ease)));
  c.reps += 1;
  c.due = addDays(c.interval);
  return c;
}

/** When the card would next be due for each grade, as short text ("1d", "6d"…). */
export function previewIntervals(card) {
  return GRADES.map(({ g }) => {
    const n = grade(card, g).interval;
    return n === 0 ? 'now' : n < 30 ? `${n}d` : n < 365 ? `${Math.round(n / 30)}mo` : `${(n / 365).toFixed(1)}y`;
  });
}

export const isDue = (c, d = today()) => c.due <= d;
export const isNew = (c) => !c.lastReviewed;

/** Cards to study now: due reviews first, then up to NEW_PER_DAY new cards. */
export function studyQueue(cards, newDoneToday = 0) {
  const due = cards.filter((c) => !isNew(c) && isDue(c)).sort((a, b) => a.due.localeCompare(b.due));
  const fresh = cards.filter(isNew).slice(0, Math.max(0, NEW_PER_DAY - newDoneToday));
  return [...due, ...fresh];
}

/** Share of reviews in the last 30 days that were remembered (Hard or better). */
export function recall(cards) {
  const since = addDays(-30);
  let n = 0, ok = 0;
  for (const c of cards) for (const h of c.history || []) if (h.date >= since) { n++; if (h.g >= 2) ok++; }
  return n ? (ok / n) * 100 : null;
}

export const reviewsOn = (cards, d) => cards.reduce((s, c) => s + (c.history || []).filter((h) => h.date === d).length, 0);
