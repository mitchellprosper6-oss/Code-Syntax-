import * as db from '../db.js';
import { esc, fmtDate, fmtDuration, kindLabel } from '../util.js';
import { bind, confirmDialog, toast, emptyState } from '../ui.js';
import { go } from '../router.js';
import { totalMarks } from '../questions.js';
import { chartFigure, lineChart } from '../charts.js';

export async function render(el, { id }) {
  const t = await db.get('tests', id);
  if (!t) {
    el.innerHTML = `<div class="card"><h1>Test not found</h1><p><a href="#/tests">Back to tests</a></p></div>`;
    return;
  }
  const [exams, all] = await Promise.all([db.getAll('exams'), db.getAll('attempts')]);
  const exam = exams.find((e) => e.id === t.examId);
  const attempts = all.filter((a) => a.testId === id).sort((a, b) => (a.finishedAt || a.date).localeCompare(b.finishedAt || b.date));
  const labels = attempts.map((a) => fmtDate(a.date));
  const counts = t.questions.reduce((m, q) => ((m[q.kind] = (m[q.kind] || 0) + 1), m), {});

  el.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/tests">← Practice tests</a></nav>
    <header class="page-head"><div><h1>${esc(t.title)}</h1>
      <p class="muted">${exam ? `<a href="#/exams/${exam.id}">${esc(exam.title)}</a> · ` : ''}${t.questions.length} questions · ${totalMarks(t)} marks${t.timeLimitMin ? ` · ${t.timeLimitMin} min when timed` : ''}</p></div>
      <div class="page-actions">
        <a class="btn btn-primary" href="#/tests/${id}/take">Take test</a>
        <a class="btn" href="#/tests/${id}/edit">Edit questions</a>
        <a class="btn" href="#/tests/${id}/print/test">Print / save test as PDF</a>
        <a class="btn" href="#/tests/${id}/print/answers">Print / save answer sheet</a>
        <button class="btn btn-danger" data-act="delete">Delete</button>
      </div></header>
    ${t.description ? `<p class="pre">${esc(t.description)}</p>` : ''}
    <p class="small muted">${Object.entries(counts).map(([k, n]) => `${n} ${kindLabel(k).toLowerCase()}`).join(' · ') || 'No questions yet.'}</p>

    <section class="card mt" aria-labelledby="h-hist">
      <h2 id="h-hist">Attempt history</h2>
      ${attempts.length ? `<div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">Score</th><th class="num">%</th><th class="num">Time</th><th>Mode</th></tr></thead>
        <tbody>${attempts.slice().reverse().map((a) => `<tr><td><a href="#/attempts/${a.id}">${fmtDate(a.date)}</a></td><td class="num">${a.score}/${a.max}</td><td class="num">${Math.round(a.pct)}%</td><td class="num">${fmtDuration(a.durationSec)}</td><td>${a.mode}</td></tr>`).join('')}</tbody></table></div>`
      : emptyState('No attempts yet.', `<a class="btn btn-primary" href="#/tests/${id}/take">Take the test</a>`)}
    </section>
    ${attempts.length ? `<section class="card mt">${chartFigure('c-test', 'Progress', ['Date', 'Score'], attempts.map((a, i) => [labels[i], Math.round(a.pct) + '%']))}</section>` : ''}`;

  if (attempts.length) lineChart('c-test', labels, [{ label: 'Score', data: attempts.map((a) => a.pct) }]);

  bind(el, {
    delete: async () => {
      if (!(await confirmDialog(`Delete “${t.title}”, its questions and all ${attempts.length} attempt${attempts.length === 1 ? '' : 's'}?`))) return;
      await db.del('tests', id);
      for (const a of attempts) await db.del('attempts', a.id);
      toast('Test deleted.');
      go('#/tests');
    },
  });
}
