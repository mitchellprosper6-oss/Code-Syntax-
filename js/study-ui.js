// Shared study UI: flashcard lists/forms and revision-plan dialogs/timelines.

import * as db from './db.js';
import { esc, fmtDate, today, countdown, daysUntil } from './util.js';
import { formModal, confirmDialog, toast, emptyState } from './ui.js';
import { icon } from './icons.js';
import { newCard, isDue, isNew } from './srs.js';
import { cardFields, suggestCards } from './forms.js';
import { buildPlan, regenerate, examTargetDate, KIND_LABEL, KIND_HELP } from './planner.js';

// ---------- flashcards ----------
export async function addCard(base) {
  const v = await formModal({
    title: 'Add flashcard',
    fields: cardFields(),
    ai: { about: 'one flashcard (question on the front, short answer on the back)', context: base.context, quick: ['Turn my front into a good question and answer'] },
  });
  if (!v) return null;
  const { context, ...rest } = base;
  const c = await db.put('cards', newCard({ ...rest, front: v.front, back: v.back }));
  toast('Card added.');
  return c;
}

export async function editCard(card) {
  const v = await formModal({ title: 'Edit flashcard', fields: cardFields(), values: card, ai: false });
  if (!v) return null;
  return db.put('cards', { ...card, front: v.front, back: v.back });
}

export async function deleteCard(card) {
  if (!(await confirmDialog('Delete this flashcard and its review history?'))) return false;
  await db.del('cards', card.id);
  return true;
}

/** Ask Claude for cards, let the user pick, then save them. Returns the number saved. */
export async function generateCards({ exam = null, topic = null, skill = null, sourceText = '' }) {
  const cards = await suggestCards({ exam, topic, skill, sourceText: sourceText || topic?.notes || '' });
  if (!cards.length) return 0;
  await db.putMany('cards', cards.map((c) => ({ ...c, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })));
  return cards.length;
}

export function cardStats(cards) {
  const t = today();
  return {
    total: cards.length,
    due: cards.filter((c) => !isNew(c) && isDue(c, t)).length,
    fresh: cards.filter(isNew).length,
    mastered: cards.filter((c) => c.interval >= 21).length,
  };
}

export function cardListHtml(cards, { limit = 50 } = {}) {
  if (!cards.length) return '';
  return `<ul class="list card-list">${cards.slice(0, limit).map((c) => `<li>
      <div class="grow"><div class="front">${esc(c.front)}</div><div class="back">${esc(c.back)}</div>
        <div class="small muted">${isNew(c) ? 'New' : `Next review ${c.due <= today() ? 'today' : fmtDate(c.due)} · every ${c.interval}d`}${c.lapses ? ` · forgotten ${c.lapses}×` : ''}</div></div>
      <div class="actions"><button class="icon-btn" data-act="card-edit" data-id="${c.id}" aria-label="Edit card">${icon('edit', 16)}</button>
        <button class="icon-btn danger" data-act="card-del" data-id="${c.id}" aria-label="Delete card">${icon('trash', 16)}</button></div></li>`).join('')}</ul>
    ${cards.length > limit ? `<p class="small muted">Showing ${limit} of ${cards.length}.</p>` : ''}`;
}

/** Handlers for card-edit / card-del buttons. after() is called on change. */
export function cardHandlers(cards, after) {
  return {
    'card-edit': async (b) => (await editCard(cards.find((c) => c.id === b.dataset.id))) && after(),
    'card-del': async (b) => (await deleteCard(cards.find((c) => c.id === b.dataset.id))) && after(),
  };
}

// ---------- revision plans ----------
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Create or rebuild the revision plan for an exam. Returns the saved plan or null. */
export async function planDialog(exam) {
  if (!exam.topics.length) {
    toast('Add topics to this exam first; the plan is built from them.');
    return null;
  }
  const existing = await db.get('plans', exam.id);
  const target = examTargetDate(exam);
  const s = existing?.settings || { perDay: 1, minutes: 45, skipWeekdays: [] };
  const v = await formModal({
    title: existing ? 'Rebuild revision plan' : 'Build a revision plan',
    intro: `Spreads your ${exam.topics.length} topics over the days before the exam. Topics you don't know get the most sessions; the last day is a mock test. ${existing ? 'Finished and past sessions are kept.' : ''}`,
    fields: [
      { name: 'end', label: 'Exam date', type: 'date', required: true, help: target?.approx ? 'Approximate (exam date is TBC). Change it when you know.' : '' },
      { name: 'perDay', label: 'Sessions per day', type: 'select', options: [1, 2, 3, 4].map((n) => ({ value: String(n), label: String(n) })) },
      { name: 'minutes', label: 'Minutes per session', type: 'select', options: [25, 30, 45, 60, 90].map((n) => ({ value: String(n), label: `${n} min` })) },
      ...WEEKDAYS.map((d, i) => ({ name: `skip${i}`, label: `Rest day: ${d}`, type: 'checkbox' })),
    ],
    values: {
      end: existing?.settings?.end || target?.date || '',
      perDay: String(s.perDay),
      minutes: String(s.minutes),
      ...Object.fromEntries(WEEKDAYS.map((_, i) => [`skip${i}`, s.skipWeekdays.includes(i)])),
    },
    submitLabel: existing ? 'Rebuild plan' : 'Build plan',
    ai: false,
  });
  if (!v) return null;
  if (v.end <= today()) {
    toast('The exam date must be in the future.');
    return null;
  }
  const settings = { end: v.end, perDay: Number(v.perDay), minutes: Number(v.minutes), skipWeekdays: WEEKDAYS.map((_, i) => i).filter((i) => v[`skip${i}`]) };
  const items = existing ? regenerate(exam, existing, settings) : buildPlan(exam, { ...settings, start: today() });
  const plan = await db.put('plans', { id: exam.id, examId: exam.id, settings, items });
  toast(`Plan ready: ${items.filter((i) => !i.done).length} sessions.`);
  return plan;
}

export function planProgress(plan) {
  const n = plan.items.length;
  return n ? (plan.items.filter((i) => i.done).length / n) * 100 : 0;
}

/** Timeline grouped by day. Shows from today (plus recent undone) unless all=true. */
export function planTimelineHtml(exam, plan, { all = false, days = 14 } = {}) {
  const t = today();
  const topicName = (id) => exam.topics.find((x) => x.id === id)?.name || '(deleted topic)';
  const byDay = new Map();
  for (const it of plan.items) {
    if (!all && it.date < t && it.done) continue;
    if (!byDay.has(it.date)) byDay.set(it.date, []);
    byDay.get(it.date).push(it);
  }
  const dayKeys = [...byDay.keys()].sort();
  const shown = all ? dayKeys : dayKeys.slice(0, days);
  if (!shown.length) return emptyState('All sessions done. Rebuild the plan to add more.');
  return `<div class="plan">${shown.map((d) => {
    const dd = daysUntil(d);
    return `<div class="plan-day ${d === t ? 'is-today' : ''}"><div class="plan-date">${d === t ? 'Today' : dd === 1 ? 'Tomorrow' : fmtDate(d).replace(/ \d{4}$/, '')}<small>${d < t ? 'missed' : new Date(d + 'T12:00').toLocaleDateString(undefined, { weekday: 'short' })}</small></div>
      <div class="plan-items">${byDay.get(d).map((it) => `<div class="plan-item ${it.done ? 'done' : ''}">
        <input type="checkbox" class="check" data-act="plan-tick" data-plan="${plan.id}" data-item="${it.id}" ${it.done ? 'checked' : ''} aria-label="Done: ${esc(KIND_LABEL[it.kind])} ${esc(it.topicId ? topicName(it.topicId) : exam.title)}">
        <span class="kind kind-${it.kind}" title="${esc(KIND_HELP[it.kind])}">${KIND_LABEL[it.kind]}</span>
        <span class="grow title">${it.topicId ? `<a href="#/exams/${exam.id}/topics/${it.topicId}">${esc(topicName(it.topicId))}</a>` : esc(exam.title)}</span>
        <span class="small muted">${it.minutes}m</span></div>`).join('')}</div></div>`;
  }).join('')}${!all && dayKeys.length > days ? `<p class="small muted mt">+ ${dayKeys.length - days} more days until ${fmtDate(plan.settings.end)} (${countdown(daysUntil(plan.settings.end))}).</p>` : ''}</div>`;
}

export async function tickPlanItem(planId, itemId, done) {
  await db.update('plans', planId, (p) => {
    const it = p.items.find((x) => x.id === itemId);
    it.done = done;
    it.doneAt = done ? today() : null;
  });
}
