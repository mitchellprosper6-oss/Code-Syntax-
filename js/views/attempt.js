import * as db from '../db.js';
import { setTopicRating } from '../model.js';
import { esc, fmtDate, fmtDuration, kindLabel, ratingInfo } from '../util.js';
import { bind, confirmDialog, toast } from '../ui.js';
import { rerender, go } from '../router.js';
import { suggestRating } from '../questions.js';

export async function render(el, { id }) {
  const a = await db.get('attempts', id);
  if (!a) {
    el.innerHTML = `<div class="card"><h1>Attempt not found</h1><p><a href="#/tests">Back to tests</a></p></div>`;
    return;
  }
  const [test, exams] = await Promise.all([db.get('tests', a.testId), db.getAll('exams')]);
  const questions = a.questions || test?.questions || [];
  const topics = Object.entries(a.byTopic || {}).map(([k, v]) => {
    const [examId, topicId] = k.split(':');
    const exam = exams.find((e) => e.id === examId);
    const topic = exam?.topics.find((t) => t.id === topicId);
    const pct = v.max ? (v.got / v.max) * 100 : 0;
    return { examId, topicId, exam, topic, pct, ...v, suggestion: topic ? suggestRating(pct, topic.rating) : null };
  }).filter((x) => x.topic);
  const suggestions = topics.filter((x) => x.suggestion);
  const band = (p) => (p >= 70 ? 'green' : p >= 50 ? 'amber' : 'red');

  el.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb">${test ? `<a href="#/tests/${test.id}">← ${esc(test.title)}</a>` : `<a href="#/tests">← Practice tests</a>`}</nav>
    <header class="page-head"><div><h1>Result: ${Math.round(a.pct)}%</h1>
      <p class="muted">${test ? esc(test.title) + ' · ' : ''}${fmtDate(a.date, { weekday: true })} · ${a.mode} · ${fmtDuration(a.durationSec)}</p></div>
      <div class="page-actions">${test ? `<a class="btn btn-primary" href="#/tests/${test.id}/take">Try again</a>` : ''}<button class="btn btn-danger" data-act="delete">Delete attempt</button></div></header>

    <div class="stat-row">
      <div class="stat"><div class="label">Score</div><div class="value">${a.score}/${a.max}</div></div>
      <div class="stat"><div class="label">Percent</div><div class="value">${Math.round(a.pct)}%</div></div>
      <div class="stat"><div class="label">Time taken</div><div class="value">${fmtDuration(a.durationSec)}</div></div>
      <div class="stat"><div class="label">Questions</div><div class="value">${a.answers.length}</div></div>
    </div>

    ${suggestions.length ? `<section class="card mt banner-info" aria-labelledby="h-sug">
      <div class="card-head"><h2 id="h-sug">Suggested rating updates</h2><button class="btn btn-primary btn-small" data-act="apply-all">Apply all</button></div>
      <ul class="list">${suggestions.map((s) => `<li><div class="grow"><span class="title">${esc(s.topic.name)}</span> <span class="small muted">${esc(s.exam.title)}</span><br>
        <span class="small">Scored ${Math.round(s.pct)}% · ${esc(ratingInfo(s.topic.rating).label)} → <strong>${esc(ratingInfo(s.suggestion).label)}</strong></span></div>
        <button class="btn btn-small" data-act="apply" data-exam="${s.examId}" data-topic="${s.topicId}" data-r="${s.suggestion}">Apply</button></li>`).join('')}</ul>
    </section>` : ''}

    <section class="card mt" aria-labelledby="h-topic">
      <h2 id="h-topic">By topic</h2>
      ${topics.length ? `<div class="table-wrap"><table><thead><tr><th>Topic</th><th>Exam</th><th class="num">Marks</th><th class="num">%</th><th>Current rating</th></tr></thead>
        <tbody>${topics.map((x) => `<tr><td>${esc(x.topic.name)}</td><td class="small">${esc(x.exam.title)}</td><td class="num">${x.got}/${x.max}</td><td class="num"><span class="urg urg-${band(x.pct)}">${Math.round(x.pct)}%</span></td><td>${esc(ratingInfo(x.topic.rating).label)}</td></tr>`).join('')}</tbody></table></div>`
      : `<p class="muted small">No questions in this test were tagged with topics.</p>`}
    </section>

    <section class="card mt" aria-labelledby="h-ans">
      <h2 id="h-ans">Answers</h2>
      ${a.answers.map((ans, i) => {
        const q = questions.find((x) => x.id === ans.qId);
        if (!q) return '';
        const resp = q.kind === 'mcq' ? (ans.response != null && ans.response !== '' ? q.options[+ans.response] : null) : ans.response;
        return `<div class="q"><div class="q-head"><strong>Question ${i + 1}</strong><span class="urg urg-${ans.awarded >= ans.max ? 'green' : ans.awarded > 0 ? 'amber' : 'red'}">${ans.awarded}/${ans.max}</span></div>
          <div class="q-prompt">${esc(q.prompt)}</div>
          <p class="small muted" style="margin:0">Your answer (${kindLabel(q.kind)})</p><div class="model">${resp ? esc(resp) : '<em>No answer</em>'}</div>
          <p class="small muted" style="margin:0">Model answer</p><div class="model">${esc(q.kind === 'mcq' ? q.options[q.correctIndex] : q.kind === 'numerical' ? `${q.answer} ${q.unit || ''}${q.tolerance ? ` (± ${q.tolerance})` : ''}\n${q.modelAnswer || ''}` : q.modelAnswer)}</div></div>`;
      }).join('')}
    </section>`;

  const apply = (examId, topicId, r) => db.update('exams', examId, (e) => { setTopicRating(e.topics.find((t) => t.id === topicId), r); });
  bind(el, {
    apply: async (b) => {
      await apply(b.dataset.exam, b.dataset.topic, b.dataset.r);
      toast('Rating updated.');
      rerender();
    },
    'apply-all': async () => {
      for (const s of suggestions) await apply(s.examId, s.topicId, s.suggestion);
      toast(`Updated ${suggestions.length} rating${suggestions.length === 1 ? '' : 's'}.`);
      rerender();
    },
    delete: async () => {
      if (!(await confirmDialog('Delete this attempt? It will be removed from history and charts.'))) return;
      await db.del('attempts', id);
      toast('Attempt deleted.');
      go(test ? `#/tests/${test.id}` : '#/tests?tab=history');
    },
  });
}
