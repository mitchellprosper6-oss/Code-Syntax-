import * as db from '../db.js';
import { setTopicRating } from '../model.js';
import { esc, fmtDate, today, RATINGS, ratingInfo, fmtMinutes, uid, countdown, daysUntil } from '../util.js';
import { bind, emptyState, ring, toneFor, openDialog, toast, confirmDialog } from '../ui.js';
import { rerender, go } from '../router.js';
import { icon } from '../icons.js';
import { md } from '../md.js';
import { recall, studyQueue } from '../srs.js';
import { cardStats, cardListHtml, cardHandlers, addCard, generateCards, tickPlanItem } from '../study-ui.js';
import { studyGuide } from '../forms.js';
import { aiText } from '../ai.js';
import { KIND_LABEL } from '../planner.js';
import { openTimer } from '../timer.js';
import { chartFigure, lineChart } from '../charts.js';
import { setAssistant } from '../assistant.js';

let editing = false;
let editingTopic = null;

const EXPLAIN = [
  { key: 'simple', label: 'Explain it simply', icon: 'bulb', ask: 'Explain this topic simply, as if I am meeting it for the first time. Use an everyday analogy, then the proper engineering explanation.' },
  { key: 'example', label: 'Worked example', icon: 'edit', ask: 'Give me one exam-style worked example on this topic, step by step, with units, then a similar question for me to try (answer at the end).' },
  { key: 'mistakes', label: 'Common mistakes', icon: 'flag', ask: 'List the most common mistakes and misconceptions students make on this topic, and how to avoid each.' },
  { key: 'summary', label: 'One-page summary', icon: 'file', ask: 'Write a one-page revision summary: key definitions, formulas with units, and 3 things examiners look for.' },
];

export async function render(el, { id, topicId }) {
  const exam = await db.get('exams', id);
  const topic = exam?.topics.find((t) => t.id === topicId);
  if (!topic) {
    el.innerHTML = `<div class="card"><h1>Topic not found</h1><p><a href="#/exams">Back to exams</a></p></div>`;
    return;
  }
  const [allCards, tests, attempts, sessions, plan, files] = await Promise.all([
    db.getAll('cards'), db.getAll('tests'), db.getAll('attempts'), db.getAll('sessions'), db.get('plans', id), db.getAll('files'),
  ]);
  const cards = allCards.filter((c) => c.topicId === topicId).sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  const cs = cardStats(cards);
  const rec = recall(cards);
  const questions = tests.flatMap((t) => t.questions.filter((q) => q.topicId === topicId).map((q) => ({ q, t })));
  const key = `${id}:${topicId}`;
  const scored = attempts.filter((a) => a.byTopic?.[key]?.max).sort((a, b) => a.date.localeCompare(b.date));
  const scores = scored.map((a) => (a.byTopic[key].got / a.byTopic[key].max) * 100);
  const avgScore = scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : null;
  const minutes = sessions.filter((s) => s.topicId === topicId).reduce((m, s) => m + (s.minutes || 0), 0);
  const planned = (plan?.items || []).filter((i) => i.topicId === topicId && i.date >= today()).slice(0, 5);
  if (editingTopic !== topicId) editing = false;
  editingTopic = topicId;
  const r = ratingInfo(topic.rating);
  const label = `${topic.name} (${exam.title})`;

  el.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/exams/${id}">${icon('left', 14)} ${esc(exam.title)}</a></nav>
    <header class="page-head">
      <div class="topic-hero">
        ${ring(topic.rating === 'confident' ? 100 : topic.rating === 'practice' ? 50 : 10, { size: 64, tone: r.color, text: icon(topic.rating === 'confident' ? 'check' : topic.rating === 'practice' ? 'trend' : 'info', 22), label: r.label })}
        <div><span class="tag tag-${r.color}">${esc(r.label)}</span><h1 style="margin-top:.3rem">${esc(topic.name)}</h1>
          <p class="muted small">${esc(exam.module || '')}${exam.module ? ' · ' : ''}${esc(exam.title)}</p></div>
      </div>
      <div class="page-actions">
        <div class="seg" role="group" aria-label="How well do you know this topic?">${RATINGS.map((o) => `<button type="button" class="r-${o.color}" data-act="rate" data-r="${o.id}" aria-pressed="${topic.rating === o.id}">${o.id === 'unknown' ? "Don't know" : o.label}</button>`).join('')}</div>
        <button class="btn" data-act="focus">${icon('timer', 16)} Study now</button>
      </div>
    </header>

    <div class="stat-row">
      <div class="stat"><div class="label">${icon('cards', 14)} Flashcards</div><div class="value">${cs.total}<span class="small muted"> · ${studyQueue(cards).length} due</span></div></div>
      <div class="stat"><div class="label">${icon('trend', 14)} Recall</div><div class="value">${rec == null ? '–' : Math.round(rec) + '%'}</div></div>
      <div class="stat"><div class="label">${icon('test', 14)} Practice score</div><div class="value">${avgScore == null ? '–' : Math.round(avgScore) + '%'}</div></div>
      <div class="stat"><div class="label">${icon('timer', 14)} Focus time</div><div class="value">${minutes ? fmtMinutes(minutes) : '–'}</div></div>
    </div>

    <div class="grid-main mt">
      <div class="stack">
        <section class="card" aria-labelledby="h-notes">
          <div class="card-head"><h2 id="h-notes">${icon('book', 20)} Study notes</h2>
            <div class="row-wrap">${editing ? '' : `<button class="btn btn-small" data-act="edit-notes">${icon('edit', 14)} ${topic.notes ? 'Edit' : 'Write notes'}</button>`}
              <button class="btn btn-small btn-ai" data-act="guide">${icon('sparkles', 14)} ${topic.notes ? 'Improve with AI' : 'AI study guide'}</button></div></div>
          ${editing
            ? `<form class="notes-editor" data-form="notes"><label class="sr-only" for="notes-ta">Notes (Markdown)</label>
                <textarea id="notes-ta" name="notes" placeholder="# Key ideas&#10;- …&#10;&#10;Markdown works: **bold**, lists, ## headings">${esc(topic.notes || '')}</textarea>
                <div class="row-wrap mt"><button class="btn btn-primary" type="submit">Save notes</button><button class="btn" type="button" data-act="cancel-notes">Cancel</button>
                <span class="small muted">Markdown: # heading, - bullet, **bold**, \`code\`</span></div></form>`
            : topic.notes ? md(topic.notes) : emptyState('No notes yet. Write your own, paste from Obsidian, or let Claude write a study guide.', `<button class="btn btn-ai" data-act="guide">${icon('sparkles', 16)} Write a study guide</button>`)}
        </section>

        <section class="card" aria-labelledby="h-learn">
          <div class="card-head"><h2 id="h-learn">${icon('bulb', 20)} Learn it with AI</h2></div>
          <div class="action-grid">${EXPLAIN.map((x) => `<button class="action-tile" data-act="explain" data-k="${x.key}">${icon(x.icon, 18)}<span>${x.label}</span></button>`).join('')}</div>
          <p class="small muted" style="margin:.75rem 0 0">Answers can be added to your notes.</p>
        </section>

        ${scores.length ? `<section class="card">${chartFigure('c-topic', 'Practice score over time', ['Date', 'Score'], scored.map((a, i) => [fmtDate(a.date), Math.round(scores[i]) + '%']))}</section>` : ''}
      </div>

      <div class="stack">
        <section class="card" aria-labelledby="h-cards">
          <div class="card-head"><h2 id="h-cards">${icon('cards', 20)} Flashcards</h2>
            <div class="row-wrap"><button class="btn btn-small" data-act="add-card">${icon('plus', 14)} Add</button><button class="btn btn-small btn-ai" data-act="gen-cards">${icon('sparkles', 14)} Generate</button></div></div>
          ${cs.total ? `<div class="spread"><span class="small muted">${cs.fresh} new · ${cs.mastered} mastered</span>
              <a class="btn btn-primary btn-small" href="#/study/review?exam=${id}&topic=${topicId}">${icon('play', 14)} ${studyQueue(cards).length ? 'Review' : 'Practise'}</a></div>
            <details class="mt"><summary class="small">Show all ${cs.total} cards</summary>${cardListHtml(cards)}</details>`
          : `<p class="muted small">No cards yet. Generate them from your notes${topic.notes ? '' : ' (write or generate notes first for best results)'}.</p>`}
        </section>

        <section class="card" aria-labelledby="h-prac">
          <div class="card-head"><h2 id="h-prac">${icon('test', 20)} Practice questions</h2></div>
          <p class="small muted">${questions.length} question${questions.length === 1 ? '' : 's'} tagged with this topic${questions.length ? ` across ${new Set(questions.map((x) => x.t.id)).size} test(s)` : ''}.</p>
          <div class="row-wrap">${questions.length ? `<button class="btn btn-primary btn-small" data-act="quiz">${icon('play', 14)} Quiz me</button>` : ''}
            <button class="btn btn-small btn-ai" data-act="gen-q">${icon('sparkles', 14)} Make questions</button></div>
        </section>

        ${planned.length ? `<section class="card" aria-labelledby="h-plan"><div class="card-head"><h2 id="h-plan">${icon('route', 20)} Planned sessions</h2></div>
          <div class="plan-items">${planned.map((it) => `<div class="plan-item"><input type="checkbox" class="check" data-act="plan-tick" data-item="${it.id}" ${it.done ? 'checked' : ''} aria-label="Done ${fmtDate(it.date)}"><span class="kind kind-${it.kind}">${KIND_LABEL[it.kind]}</span><span class="grow">${it.date === today() ? 'Today' : fmtDate(it.date)} <span class="small muted">(${countdown(daysUntil(it.date))})</span></span><span class="small muted">${it.minutes}m</span></div>`).join('')}</div></section>` : ''}

        <section class="card" aria-labelledby="h-hist">
          <div class="card-head"><h2 id="h-hist">${icon('trend', 20)} Rating history</h2></div>
          <ul class="list">${(topic.history || []).slice().reverse().slice(0, 8).map((h) => `<li><span class="dot dot-${ratingInfo(h.rating).color}"></span><span class="grow">${esc(ratingInfo(h.rating).label)}</span><span class="small muted">${fmtDate(h.date)}</span></li>`).join('')}</ul>
        </section>
      </div>
    </div>`;

  if (scores.length) lineChart('c-topic', scored.map((a) => fmtDate(a.date)), [{ label: 'Score', data: scores }]);

  const saveTopic = async (fn) => {
    await db.update('exams', id, (e) => fn(e.topics.find((t) => t.id === topicId)));
  };
  const appendNotes = async (text, heading) => {
    await saveTopic((t) => {
      t.notes = t.notes ? `${t.notes.trimEnd()}\n\n---\n\n${heading ? `## ${heading}\n\n` : ''}${text}` : text;
    });
  };

  setAssistant({
    key: `topic:${key}`,
    title: label,
    data: { exam: { title: exam.title, module: exam.module, type: exam.type, syllabus: exam.syllabus }, topic: { name: topic.name, rating: topic.rating, notes: (topic.notes || '').slice(0, 20000) }, practiceScores: scores.map(Math.round), flashcards: cards.length },
    questions: ['Quiz me with 5 quick questions', 'What do I need to know about this for the exam?', 'Explain the hardest part of this topic'],
    actions: [
      { label: 'Write study guide', icon: 'book', run: () => el.querySelector('[data-act=guide]')?.click() },
      { label: 'Generate flashcards', icon: 'cards', run: () => el.querySelector('[data-act=gen-cards]')?.click() },
      { label: 'Study this now', icon: 'timer', run: () => openTimer({ type: 'topic', id: topicId, examId: id, label }) },
    ],
    onSave: { label: 'Add to notes', run: async (text) => { await appendNotes(text, `Notes from assistant (${fmtDate(today())})`); rerender(); } },
  });

  el.querySelector('[data-form=notes]')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const notes = e.target.elements.notes.value;
    await saveTopic((t) => { t.notes = notes; });
    editing = false;
    toast('Notes saved.');
    rerender();
  });

  bind(el, {
    rate: async (b) => {
      await saveTopic((t) => setTopicRating(t, b.dataset.r));
      rerender();
    },
    focus: () => openTimer({ type: 'topic', id: topicId, examId: id, label }),
    'edit-notes': () => {
      editing = true;
      rerender();
    },
    'cancel-notes': () => {
      editing = false;
      rerender();
    },
    guide: async () => {
      const source = await pickSource(files);
      if (source === null) return;
      const text = await studyGuide(exam, topic, source);
      if (!text) return;
      if (topic.notes) {
        const how = await choose('Add the study guide', 'Your topic already has notes.', [['append', 'Add below my notes'], ['replace', 'Replace my notes']]);
        if (!how) return;
        if (how === 'replace') await saveTopic((t) => { t.notes = text; });
        else await appendNotes(text, `AI study guide (${fmtDate(today())})`);
      } else await saveTopic((t) => { t.notes = text; });
      toast('Study guide saved to notes.');
      rerender();
    },
    explain: async (b) => {
      const x = EXPLAIN.find((e) => e.key === b.dataset.k);
      const text = await aiText({
        title: `${x.label}: ${topic.name}`,
        about: x.ask,
        context: { exam: exam.title, module: exam.module, topic: topic.name, myNotes: (topic.notes || '').slice(0, 8000) },
        quick: ['Shorter please', 'Go deeper', 'Use a mechanical engineering example'],
      });
      if (!text) return;
      const { dlg, close, done } = openDialog(`<div class="modal-body"><div class="modal-head"><h2 class="modal-title">${icon(x.icon, 20)} ${esc(x.label)}</h2>
          <button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>${md(text)}
        <div class="modal-actions"><button class="btn" data-close>Close</button><button class="btn btn-primary" data-add>${icon('plus', 16)} Add to notes</button></div></div>`, { wide: true, label: x.label });
      dlg.querySelector('[data-add]').addEventListener('click', () => close(true));
      if (await done) {
        await appendNotes(text, x.label);
        toast('Added to notes.');
        rerender();
      }
    },
    'add-card': async () => (await addCard({ examId: id, topicId, context: { topic: topic.name, exam: exam.title } })) && rerender(),
    'gen-cards': async () => {
      const n = await generateCards({ exam, topic });
      if (n) rerender();
    },
    ...cardHandlers(cards, rerender),
    quiz: async () => {
      const qs = questions.map((x) => x.q);
      const shuffled = [...qs].sort(() => Math.random() - 0.5).slice(0, 15);
      const t = await db.put('tests', { title: `Quiz: ${topic.name}`, examId: id, timeLimitMin: Math.max(5, shuffled.length * 2), description: `Auto-built from questions tagged “${topic.name}”.`, questions: shuffled.map((q) => ({ ...q, id: uid() })), quick: true });
      go(`#/tests/${t.id}/take`);
    },
    'gen-q': async () => {
      const t = await db.put('tests', { title: `${topic.name} practice`, examId: id, timeLimitMin: 20, description: '', questions: [] });
      go(`#/tests/${t.id}/edit?generate=1&topic=${encodeURIComponent(topic.name)}`);
    },
    'plan-tick': async (c) => {
      await tickPlanItem(id, c.dataset.item, c.checked);
      rerender();
    },
  });
}

/** Optional: choose uploaded files to base the AI on. '' = none, null = cancelled. */
async function pickSource(files) {
  const withText = files.filter((f) => f.extractedText);
  if (!withText.length) return '';
  const { dlg, close, done } = openDialog(`<form class="modal-body"><h2 class="modal-title">${icon('file', 20)} Use your notes?</h2>
      <p class="muted small">Pick files for Claude to base the study guide on, or skip to use general knowledge.</p>
      ${withText.map((f) => `<label class="inline" style="display:flex;margin:.35rem 0"><input type="checkbox" value="${f.id}"> ${esc(f.name)}</label>`).join('')}
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button type="button" class="btn" data-skip>Skip</button><button class="btn btn-primary" type="submit">Use selected</button></div></form>`, { label: 'Choose source files' });
  dlg.querySelector('[data-skip]').addEventListener('click', () => close(''));
  dlg.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const ids = [...dlg.querySelectorAll('input:checked')].map((x) => x.value);
    close(withText.filter((f) => ids.includes(f.id)).map((f) => `===== ${f.name} =====\n${f.extractedText}`).join('\n\n'));
  });
  return done;
}

function choose(title, text, options) {
  const { dlg, close, done } = openDialog(`<div class="modal-body"><h2 class="modal-title">${esc(title)}</h2><p>${esc(text)}</p>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button>${options.map(([v, l], i) => `<button class="btn ${i === 0 ? 'btn-primary' : ''}" data-v="${v}">${esc(l)}</button>`).join('')}</div></div>`, { label: title });
  dlg.querySelectorAll('[data-v]').forEach((b) => b.addEventListener('click', () => close(b.dataset.v)));
  return done;
}
