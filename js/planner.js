// Revision planner: spreads an exam's topics over the days before the exam.
// Weaker topics get more sessions; the same topic is not repeated on consecutive days when avoidable;
// first session on a topic is "learn", later ones "review"; the last day is a mock test.

import { today, parseDate, isoDate, uid, hasDate } from './util.js';

const WEIGHT = { unknown: 3, practice: 2, confident: 1 };

export function examTargetDate(exam) {
  if (hasDate(exam.date)) return { date: exam.date.date, approx: false };
  if (exam.date?.approxMonth) return { date: `${exam.date.approxMonth}-01`, approx: true };
  return null;
}

export function dateRange(from, to, skipWeekdays = []) {
  const out = [];
  const d = parseDate(from), end = parseDate(to);
  while (d < end) {
    if (!skipWeekdays.includes(d.getDay())) out.push(isoDate(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

/**
 Build plan items. opts: {start, end (exam date, exclusive), perDay, minutes, skipWeekdays}
 keep: existing items to keep (done or in the past) — they count towards each topic's total.
*/
export function buildPlan(exam, opts, keep = []) {
  const days = dateRange(opts.start, opts.end, opts.skipWeekdays || []);
  if (!days.length) return keep;
  const topics = exam.topics;
  const count = Object.fromEntries(topics.map((t) => [t.id, 0]));
  const lastDay = {};
  for (const k of keep) if (k.topicId in count) { count[k.topicId]++; lastDay[k.topicId] = k.date; }
  const items = [...keep];
  const mockDay = days.length > 2 ? days[days.length - 1] : null;
  for (const day of days) {
    if (day === mockDay) {
      items.push({ id: uid(), date: day, topicId: null, kind: 'mock', minutes: opts.minutes * Math.max(1, opts.perDay), done: false });
      continue;
    }
    const used = new Set();
    for (let s = 0; s < opts.perDay && topics.length; s++) {
      const prev = isoDate(new Date(parseDate(day).getTime() - 86400000));
      const scored = topics
        .filter((t) => !used.has(t.id))
        .map((t) => ({ t, score: (WEIGHT[t.rating] || 2) / (1 + count[t.id]) - (lastDay[t.id] === prev ? 0.6 : 0) }))
        .sort((a, b) => b.score - a.score);
      if (!scored.length) break;
      const t = scored[0].t;
      used.add(t.id);
      items.push({ id: uid(), date: day, topicId: t.id, kind: count[t.id] ? 'review' : 'learn', minutes: opts.minutes, done: false });
      count[t.id]++;
      lastDay[t.id] = day;
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

/** Rebuild from today, keeping finished and past sessions. */
export function regenerate(exam, plan, opts) {
  const t = today();
  const keep = (plan?.items || []).filter((i) => i.done || i.date < t);
  return buildPlan(exam, { ...opts, start: t }, keep);
}

export const KIND_LABEL = { learn: 'Learn', review: 'Review', mock: 'Mock test' };
export const KIND_HELP = {
  learn: 'Read your notes / study guide, then make flashcards.',
  review: 'Review flashcards and do practice questions.',
  mock: 'Do a full timed practice test.',
};
