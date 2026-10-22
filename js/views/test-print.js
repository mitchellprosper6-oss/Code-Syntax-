import * as db from '../db.js';
import { esc } from '../util.js';
import { totalMarks } from '../questions.js';

export async function render(el, { id, sheet }) {
  const t = await db.get('tests', id);
  if (!t) {
    el.innerHTML = `<div class="card"><h1>Test not found</h1></div>`;
    return;
  }
  const exam = t.examId ? await db.get('exams', t.examId) : null;
  const answers = sheet === 'answers';
  el.innerHTML = `
    <div class="no-print row-wrap" style="margin-bottom:1rem">
      <a class="btn" href="#/tests/${id}">← Back</a>
      <button class="btn btn-primary" data-print>Print / Save as PDF</button>
      <span class="small muted">In the print dialog choose “Save as PDF” (on iPhone: Share → Print, then pinch out to save).</span>
    </div>
    <article class="card print-sheet">
      <h1>${esc(t.title)}${answers ? ' — Answer sheet' : ''}</h1>
      <p class="muted">${exam ? esc(exam.title) + ' · ' : ''}${t.questions.length} questions · ${totalMarks(t)} marks${!answers && t.timeLimitMin ? ` · ${t.timeLimitMin} minutes` : ''}</p>
      ${t.questions.map((q, i) => `<div class="q">
        <div class="q-head"><strong>${i + 1}.</strong><span class="small">[${q.marks} mark${q.marks === 1 ? '' : 's'}]</span></div>
        <div class="q-prompt">${esc(q.prompt)}</div>
        ${q.kind === 'mcq' ? `<ol type="A">${q.options.map((o, j) => `<li>${esc(o)}${answers && j === q.correctIndex ? ' <strong>✓</strong>' : ''}</li>`).join('')}</ol>` : ''}
        ${answers
          ? `${q.kind === 'numerical' ? `<p><strong>Answer:</strong> ${esc(q.answer)} ${esc(q.unit || '')}${q.tolerance ? ` (± ${esc(q.tolerance)})` : ''}</p>` : ''}
             ${q.kind === 'short' && q.answer ? `<p><strong>Answer:</strong> ${esc(q.answer.split('|').join(' / '))}</p>` : ''}
             ${q.modelAnswer && q.kind !== 'mcq' ? `<div class="model">${esc(q.modelAnswer)}</div>` : ''}`
          : q.kind === 'mcq' ? '' : `<div style="height:${q.kind === 'long' ? 9 : q.kind === 'short' ? 3 : 2.5}rem;border-bottom:1px solid #999"></div>`}
      </div>`).join('')}
    </article>`;
  el.querySelector('[data-print]').addEventListener('click', () => window.print());
}
