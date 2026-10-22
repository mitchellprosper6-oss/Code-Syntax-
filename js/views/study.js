import * as db from '../db.js';
import { loadAll, activityByDate, streak } from '../model.js';
import { esc, today, fmtDate, countdown, daysUntil, hasDate } from '../util.js';
import { bind, pageHead, emptyState, ring, toneFor, openDialog, toast } from '../ui.js';
import { rerender, go } from '../router.js';
import { icon } from '../icons.js';
import { studyQueue, recall, reviewsOn, isNew } from '../srs.js';
import { cardStats, planDialog, planProgress, tickPlanItem, addCard, generateCards } from '../study-ui.js';
import { KIND_LABEL } from '../planner.js';
import { openTimer } from '../timer.js';
import { heatmap } from './dashboard.js';
import { setAssistant } from '../assistant.js';

export async function render(el) {
  const data = await loadAll();
  const t = today();
  const activity = activityByDate(data);
  const newToday = data.cards.filter((c) => (c.history || [])[0]?.date === t).length;
  const queue = studyQueue(data.cards, newToday);
  const rec = recall(data.cards);
  const planByExam = Object.fromEntries(data.plans.map((p) => [p.id, p]));
  const todays = data.plans.flatMap((p) => {
    const exam = data.exams.find((e) => e.id === p.id);
    return exam ? p.items.filter((i) => i.date === t).map((it) => ({ it, exam, plan: p })) : [];
  });

  const deckRow = (label, sub, cards, href, q) => {
    const s = cardStats(cards);
    const dueNow = studyQueue(cards).length;
    return `<div class="deck"><span class="list-icon">${icon('cards', 18)}</span>
      <div class="grow"><a class="title list-link" href="${href}">${esc(label)}</a><div class="small muted">${sub ? esc(sub) + ' · ' : ''}${s.total} cards · ${s.mastered} mastered</div></div>
      ${dueNow ? `<span class="deck-due">${dueNow} due</span>` : ''}
      <a class="btn btn-small ${dueNow ? 'btn-primary' : ''}" href="#/study/review?${q}">${dueNow ? 'Review' : 'Practise'}</a></div>`;
  };

  const examDecks = data.exams.map((e) => {
    const cards = data.cards.filter((c) => c.examId === e.id);
    const topicRows = e.topics.map((tp) => ({ tp, cards: cards.filter((c) => c.topicId === tp.id) })).filter((x) => x.cards.length);
    return { e, cards, topicRows };
  });
  const skillDecks = data.skills.map((s) => ({ s, cards: data.cards.filter((c) => c.skillId === s.id) })).filter((x) => x.cards.length);

  el.innerHTML = `
    ${pageHead('Study', `<button class="btn" data-act="timer">${icon('timer', 16)} Focus timer</button>
      <a class="btn btn-primary ${queue.length ? '' : ''}" href="#/study/review" ${queue.length ? '' : 'aria-disabled="true"'}>${icon('cards', 16)} Review ${queue.length ? `(${queue.length})` : ''}</a>`,
      'Flashcards with spaced repetition, revision plans and focus time.')}

    <div class="stat-row">
      <div class="stat"><div class="label">${icon('cards', 14)} Due now</div><div class="value">${queue.length}</div></div>
      <div class="stat"><div class="label">${icon('check', 14)} Reviewed today</div><div class="value">${reviewsOn(data.cards, t)}</div></div>
      <div class="stat"><div class="label">${icon('flame', 14)} Streak</div><div class="value">${streak(activity)} days</div></div>
      <div class="stat"><div class="label">${icon('trend', 14)} Recall (30 days)</div><div class="value">${rec == null ? '–' : Math.round(rec) + '%'}</div></div>
      <div class="stat"><div class="label">${icon('layers', 14)} Cards</div><div class="value">${data.cards.length}</div></div>
    </div>

    <div class="grid-main mt">
      <div class="stack">
        <section class="card" aria-labelledby="h-today">
          <div class="card-head"><h2 id="h-today">${icon('route', 20)} Today's plan</h2></div>
          ${todays.length ? `<div class="plan-items">${todays.map(({ it, exam, plan }) => {
            const tp = exam.topics.find((x) => x.id === it.topicId);
            return `<div class="plan-item ${it.done ? 'done' : ''}"><input type="checkbox" class="check" data-act="plan-tick" data-plan="${plan.id}" data-item="${it.id}" ${it.done ? 'checked' : ''} aria-label="Done: ${esc(tp?.name || exam.title)}">
              <span class="kind kind-${it.kind}">${KIND_LABEL[it.kind]}</span><span class="grow title">${tp ? `<a href="#/exams/${exam.id}/topics/${tp.id}">${esc(tp.name)}</a>` : `<a href="#/exams/${exam.id}">${esc(exam.title)}</a>`} <span class="small muted">${esc(exam.title)}</span></span>
              <button class="btn btn-small" data-act="focus" data-exam="${exam.id}" data-topic="${tp?.id || ''}" data-label="${esc(tp ? tp.name + ' (' + exam.title + ')' : exam.title)}">${icon('play', 14)} ${it.minutes}m</button></div>`;
          }).join('')}</div>` : `<p class="muted small">No plan sessions today. Build a plan for an exam below.</p>`}
        </section>

        <section class="card" aria-labelledby="h-plans">
          <div class="card-head"><h2 id="h-plans">${icon('calendar', 20)} Revision plans</h2></div>
          ${data.exams.length ? `<ul class="list">${data.exams.map((e) => {
            const p = planByExam[e.id];
            const next = p?.items.find((i) => !i.done && i.date >= t);
            const d = hasDate(e.date) ? daysUntil(e.date.date) : null;
            return `<li>${ring(p ? planProgress(p) : null, { size: 46, stroke: 5, tone: 'accent', label: e.title + ' plan done' })}
              <div class="grow"><a class="title list-link" href="#/exams/${e.id}#plan">${esc(e.title)}</a><br>
              <span class="small muted">${p ? (next ? `Next: ${fmtDate(next.date)} · ${KIND_LABEL[next.kind]}` : 'All sessions done') : e.topics.length ? 'No plan yet' : 'Add topics first'}${d != null && d >= 0 ? ` · exam ${countdown(d)}` : ''}</span></div>
              <button class="btn btn-small ${p ? '' : 'btn-primary'}" data-act="plan" data-id="${e.id}">${p ? 'Rebuild' : 'Build plan'}</button></li>`;
          }).join('')}</ul>` : emptyState('Add an exam to plan revision.', `<a class="btn" href="#/exams">Go to exams</a>`)}
        </section>

        <section class="card" aria-labelledby="h-act">
          <div class="card-head"><h2 id="h-act">${icon('flame', 20)} Activity</h2></div>
          ${heatmap(activity)}
        </section>
      </div>

      <div class="stack">
        <section class="card" aria-labelledby="h-decks">
          <div class="card-head"><h2 id="h-decks">${icon('cards', 20)} Flashcard decks</h2>
            <div class="row-wrap"><button class="btn btn-small btn-ai" data-act="make">${icon('sparkles', 14)} Make cards</button></div></div>
          ${examDecks.some((x) => x.cards.length) || skillDecks.length ? `
            ${examDecks.filter((x) => x.cards.length).map((x) => `<h3 class="eyebrow">${esc(x.e.title)}</h3>
              ${x.topicRows.map((r) => deckRow(r.tp.name, '', r.cards, `#/exams/${x.e.id}/topics/${r.tp.id}`, `exam=${x.e.id}&topic=${r.tp.id}`)).join('')}
              ${x.cards.some((c) => !c.topicId) ? deckRow('General', '', x.cards.filter((c) => !c.topicId), `#/exams/${x.e.id}`, `exam=${x.e.id}&topic=none`) : ''}`).join('')}
            ${skillDecks.length ? `<h3 class="eyebrow">Skills</h3>${skillDecks.map((x) => deckRow(x.s.name, '', x.cards, `#/skills/${x.s.id}`, `skill=${x.s.id}`)).join('')}` : ''}`
          : emptyState('No flashcards yet. Make some from an exam topic or a skill; Claude can write them from your notes.', `<button class="btn btn-ai" data-act="make">${icon('sparkles', 16)} Make cards</button>`)}
        </section>
        <section class="card">
          <h2>How it works</h2>
          <ul class="small muted" style="padding-left:1.1rem;margin:0">
            <li><strong>Flashcards</strong> come back just before you'd forget them. Rate each one Again / Hard / Good / Easy.</li>
            <li><strong>Revision plans</strong> schedule Learn → Review sessions per topic, weighted to your weakest topics, and a mock test on the last day.</li>
            <li><strong>Topic pages</strong> hold your study notes, AI study guides, cards and scores in one place. Open one from an exam.</li>
          </ul>
        </section>
      </div>
    </div>`;

  setAssistant({
    key: 'study',
    title: 'Study',
    questions: ['How should I use my study time this week?', 'Make me a revision timetable for my next exam', 'Give me memory techniques for formulas'],
    actions: [{ label: 'Make flashcards', icon: 'cards', run: () => makeCards(data) }],
  });

  bind(el, {
    timer: () => openTimer(),
    focus: (b) => openTimer(b.dataset.topic ? { type: 'topic', id: b.dataset.topic, examId: b.dataset.exam, label: b.dataset.label } : null),
    'plan-tick': async (c) => {
      await tickPlanItem(c.dataset.plan, c.dataset.item, c.checked);
      rerender();
    },
    plan: async (b) => {
      const exam = data.exams.find((e) => e.id === b.dataset.id);
      if (await planDialog(exam)) go(`#/exams/${exam.id}`);
    },
    make: () => makeCards(data),
  });
}

/** Pick an exam topic or skill, then manual or AI cards. */
async function makeCards(data) {
  const opts = [
    ...data.exams.flatMap((e) => e.topics.map((t) => ({ v: `t|${e.id}|${t.id}`, label: `${t.name} — ${e.title}` }))),
    ...data.skills.map((s) => ({ v: `s|${s.id}`, label: `${s.name} (skill)` })),
  ];
  if (!opts.length) return toast('Add exam topics or skills first.');
  const { dlg, close, done } = openDialog(`<form class="modal-body"><div class="modal-head"><h2 class="modal-title">${icon('cards', 20)} Make flashcards</h2>
      <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
    <div class="field"><label for="mk-for">For</label><select id="mk-for" name="for">${opts.map((o) => `<option value="${esc(o.v)}">${esc(o.label)}</option>`).join('')}</select></div>
    <div class="modal-actions"><button type="button" class="btn" data-how="manual">Write one myself</button><button type="button" class="btn btn-ai" data-how="ai">${icon('sparkles', 16)} Generate with AI</button></div></form>`, { label: 'Make flashcards' });
  dlg.querySelectorAll('[data-how]').forEach((b) => b.addEventListener('click', () => close({ how: b.dataset.how, v: dlg.querySelector('select').value })));
  const r = await done;
  if (!r) return;
  const [kind, a, b] = r.v.split('|');
  const exam = kind === 't' ? data.exams.find((e) => e.id === a) : null;
  const topic = exam?.topics.find((t) => t.id === b) || null;
  const skill = kind === 's' ? data.skills.find((s) => s.id === a) : null;
  if (r.how === 'manual') {
    if (await addCard({ examId: exam?.id || null, topicId: topic?.id || null, skillId: skill?.id || null, context: { topic: topic?.name, skill: skill?.name } })) rerender();
  } else {
    const n = await generateCards({ exam, topic, skill });
    if (n) rerender();
  }
}
