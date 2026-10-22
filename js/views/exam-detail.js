import * as db from '../db.js';
import { readiness, topicCounts, newTopic, setTopicRating } from '../model.js';
import { esc, countdown, urgency, daysUntil, hasDate, whenText, fmtDate, RATINGS, ratingInfo } from '../util.js';
import { bind, catTag, readinessMeter, emptyState, formModal, confirmDialog, toast } from '../ui.js';
import { rerender, go } from '../router.js';
import { editExam, suggestTopics } from '../forms.js';
import { chartFigure, lineChart } from '../charts.js';
import { newTestFor } from './tests.js';

export async function render(el, { id }) {
  const e = await db.get('exams', id);
  if (!e) {
    el.innerHTML = `<div class="card"><h1>Exam not found</h1><p><a href="#/exams">Back to exams</a></p></div>`;
    return;
  }
  const [tests, attempts] = await Promise.all([db.getAll('tests'), db.getAll('attempts')]);
  const linked = tests.filter((t) => t.examId === id);
  const myAttempts = attempts.filter((a) => a.byExam?.[id]?.max).sort((a, b) => a.date.localeCompare(b.date));
  const d = hasDate(e.date) ? daysUntil(e.date.date) : null;
  const r = readiness(e);
  const counts = topicCounts(e.topics);

  // charts: exam % over time, and per-topic % over time (max 8 topics with data)
  const labels = myAttempts.map((a) => fmtDate(a.date));
  const examSeries = myAttempts.map((a) => (a.byExam[id].got / a.byExam[id].max) * 100);
  const topicsWithData = e.topics.filter((t) => myAttempts.some((a) => a.byTopic?.[`${id}:${t.id}`]?.max)).slice(0, 8);
  const topicSeries = topicsWithData.map((t) => ({
    label: t.name,
    data: myAttempts.map((a) => {
      const s = a.byTopic?.[`${id}:${t.id}`];
      return s?.max ? (s.got / s.max) * 100 : null;
    }),
  }));
  const pctText = (v) => (v == null ? '–' : Math.round(v) + '%');

  el.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/exams">← Exams</a></nav>
    <header class="page-head">
      <div>
        <div class="tags">${catTag(e.category)}<span class="tag">${esc(e.type)}</span></div>
        <h1 style="margin-top:.35rem">${esc(e.title)}</h1>
        <p class="muted">${esc(e.module || '')}${e.module ? ' · ' : ''}${esc(whenText(e.date))}
          ${d != null && d >= 0 ? `<span class="urg urg-${urgency(d)}">${countdown(d)}</span>` : ''}</p>
      </div>
      <div class="page-actions"><button class="btn" data-act="edit">Edit</button><button class="btn btn-danger" data-act="delete">Delete</button></div>
    </header>

    <div class="grid-2">
      <section class="card" aria-labelledby="h-ready">
        <div class="card-head"><h2 id="h-ready">Readiness</h2><span class="big-num">${r == null ? '–' : Math.round(r) + '%'}</span></div>
        ${readinessMeter(counts)}
        <p class="small muted mt">Readiness = share of topics marked Confident.</p>
      </section>
      <section class="card" aria-labelledby="h-fmt">
        <div class="card-head"><h2 id="h-fmt">Format & syllabus</h2><button class="btn btn-small" data-act="edit">Edit</button></div>
        <h3 class="small muted">Format notes</h3>${e.formatNotes ? `<p class="pre">${esc(e.formatNotes)}</p>` : `<p class="muted small">None yet.</p>`}
        <h3 class="small muted">Syllabus / criteria</h3>${e.syllabus ? `<p class="pre">${esc(e.syllabus)}</p>` : `<p class="muted small">To be added.</p>`}
      </section>
    </div>

    <section class="card mt" aria-labelledby="h-topics">
      <div class="card-head"><h2 id="h-topics">Topics</h2>
        <div class="row-wrap"><button class="btn btn-ai btn-small" data-act="ai-topics">✨ Suggest with AI</button><button class="btn btn-small" data-act="bulk">Add several</button></div></div>
      <form class="inline-form" data-form="add-topic" style="margin-bottom:.75rem">
        <label class="sr-only" for="new-topic">New topic</label>
        <input id="new-topic" name="name" placeholder="New topic, e.g. Phase diagrams" autocomplete="off">
        <button class="btn btn-primary" type="submit">+ Add topic</button>
      </form>
      ${e.topics.length ? `<ul class="list">${e.topics.map((t) => `
        <li class="topic-row">
          <div class="grow"><span class="title">${esc(t.name)}</span>
            <details class="small muted"><summary>History (${t.history?.length || 0})</summary>
              <ul>${(t.history || []).slice().reverse().map((h) => `<li>${fmtDate(h.date)}: ${esc(ratingInfo(h.rating).label)}</li>`).join('')}</ul></details></div>
          <div class="seg" role="group" aria-label="Rating for ${esc(t.name)}">${RATINGS.map((o) => `<button type="button" class="r-${o.color}" data-act="rate" data-id="${t.id}" data-r="${o.id}" aria-pressed="${t.rating === o.id}">${o.id === 'unknown' ? "Don't know" : o.label}</button>`).join('')}</div>
          <div class="actions">
            <button class="icon-btn" data-act="rename" data-id="${t.id}" aria-label="Rename ${esc(t.name)}">✎</button>
            <button class="icon-btn danger" data-act="del-topic" data-id="${t.id}" aria-label="Delete ${esc(t.name)}">✕</button></div>
        </li>`).join('')}</ul>`
      : emptyState('Add your first topic.')}
    </section>

    <section class="card mt" aria-labelledby="h-tests">
      <div class="card-head"><h2 id="h-tests">Practice tests</h2><button class="btn btn-small btn-primary" data-act="new-test">+ New practice test</button></div>
      ${linked.length ? `<ul class="list">${linked.map((t) => {
        const last = attempts.filter((a) => a.testId === t.id).sort((a, b) => b.date.localeCompare(a.date))[0];
        return `<li><a class="list-link grow" href="#/tests/${t.id}"><span class="title">${esc(t.title)}</span><br><span class="small muted">${t.questions.length} questions${last ? ` · last ${Math.round(last.pct)}% on ${fmtDate(last.date)}` : ' · not attempted'}</span></a>
          <a class="btn btn-small" href="#/tests/${t.id}/take">Take</a></li>`;
      }).join('')}</ul>` : `<p class="muted small">No practice tests linked to this exam yet.</p>`}
    </section>

    ${myAttempts.length ? `<div class="grid-2 mt">
      <section class="card">${chartFigure('c-exam', 'Score over time (this exam’s questions)', ['Date', 'Score'], myAttempts.map((a, i) => [labels[i], pctText(examSeries[i])]))}</section>
      <section class="card">${topicSeries.length ? chartFigure('c-topics', 'Score by topic over time', ['Date', ...topicSeries.map((s) => s.label)], myAttempts.map((a, i) => [labels[i], ...topicSeries.map((s) => pctText(s.data[i]))])) : '<p class="muted small">Tag questions with topics to see per-topic charts.</p>'}</section>
    </div>` : ''}`;

  if (myAttempts.length) {
    lineChart('c-exam', labels, [{ label: 'Score', data: examSeries }]);
    if (topicSeries.length) lineChart('c-topics', labels, topicSeries);
  }

  const save = async (fn) => {
    await db.update('exams', id, fn);
    rerender();
  };
  const addTopics = (names) => save((x) => {
    const have = new Set(x.topics.map((t) => t.name.toLowerCase()));
    for (const n of names) if (n && !have.has(n.toLowerCase())) { x.topics.push(newTopic(n)); have.add(n.toLowerCase()); }
  });

  el.querySelector('[data-form="add-topic"]').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = ev.target.elements.name.value.trim();
    if (name) addTopics([name]).then(() => document.getElementById('new-topic')?.focus());
  });

  bind(el, {
    edit: async () => (await editExam(e)) && rerender(),
    delete: async () => {
      if (!(await confirmDialog(`Delete “${e.title}” and all its topics? Practice tests stay, but lose their link to this exam.`))) return;
      await db.del('exams', id);
      toast('Exam deleted.');
      go('#/exams');
    },
    rate: (b) => save((x) => { setTopicRating(x.topics.find((t) => t.id === b.dataset.id), b.dataset.r); }),
    rename: async (b) => {
      const t = e.topics.find((x) => x.id === b.dataset.id);
      const v = await formModal({ title: 'Rename topic', fields: [{ name: 'name', label: 'Topic', required: true }], values: { name: t.name }, ai: false });
      if (v) save((x) => { x.topics.find((y) => y.id === t.id).name = v.name; });
    },
    'del-topic': async (b) => {
      const t = e.topics.find((x) => x.id === b.dataset.id);
      if (await confirmDialog(`Delete topic “${t.name}” and its rating history?`)) save((x) => { x.topics = x.topics.filter((y) => y.id !== t.id); });
    },
    bulk: async () => {
      const v = await formModal({ title: 'Add several topics', fields: [{ name: 'names', label: 'One topic per line', type: 'textarea', rows: 8 }], submitLabel: 'Add topics', ai: false });
      if (v) addTopics(v.names.split('\n').map((s) => s.replace(/^[-*•\d.)\s]+/, '').trim()).filter(Boolean));
    },
    'ai-topics': async () => {
      const items = await suggestTopics(e);
      if (!items.length) return;
      save((x) => {
        const have = new Set(x.topics.map((t) => t.name.toLowerCase()));
        for (const it of items) if (!have.has(it.name.toLowerCase())) x.topics.push(newTopic(it.name, it.rating || 'unknown'));
      });
    },
    'new-test': async () => {
      const t = await newTestFor(id);
      if (t) go(`#/tests/${t.id}/edit`);
    },
  });
}
