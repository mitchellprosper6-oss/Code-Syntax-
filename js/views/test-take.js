import * as db from '../db.js';
import { esc, fmtDuration, today, kindLabel } from '../util.js';
import { bind, confirmDialog, emptyState } from '../ui.js';
import { go } from '../router.js';
import { totalMarks, autoMark, aggregate } from '../questions.js';

// In-progress test lives in memory (survives re-renders, not page reloads).
let session = null;
let ticker = null;

export async function render(el, { id }) {
  clearInterval(ticker);
  const t = await db.get('tests', id);
  if (!t) {
    el.innerHTML = `<div class="card"><h1>Test not found</h1><p><a href="#/tests">Back to tests</a></p></div>`;
    return;
  }
  if (!t.questions.length) {
    el.innerHTML = `<nav class="crumbs"><a href="#/tests/${id}">← ${esc(t.title)}</a></nav><h1>${esc(t.title)}</h1>
      ${emptyState('This test has no questions yet.', `<a class="btn btn-primary" href="#/tests/${id}/edit">Add questions</a>`)}`;
    return;
  }
  if (!session || session.testId !== id) session = { testId: id, phase: 'start', responses: {}, marks: {} };
  if (session.phase === 'start') return renderStart(el, t);
  if (session.phase === 'answer') return renderAnswer(el, t);
  return renderMark(el, t);
}

function renderStart(el, t) {
  el.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/tests/${t.id}">← ${esc(t.title)}</a></nav>
    <h1>${esc(t.title)}</h1>
    <section class="card">
      <p>${t.questions.length} questions · ${totalMarks(t)} marks</p>
      <form data-form="start">
        <fieldset class="field"><legend>Mode</legend>
          <label class="inline" style="display:flex;margin:.35rem 0"><input type="radio" name="mode" value="untimed" checked> Untimed (a stopwatch still records your time)</label>
          <label class="inline" style="display:flex;margin:.35rem 0"><input type="radio" name="mode" value="timed"> Timed:
            <input type="number" name="mins" min="1" value="${t.timeLimitMin || 30}" style="width:5.5rem" aria-label="Minutes"> minutes</label>
        </fieldset>
        <button class="btn btn-primary" type="submit">Start test</button>
      </form>
    </section>`;
  el.querySelector('[data-form=start]').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const timed = f.elements.mode.value === 'timed';
    Object.assign(session, { phase: 'answer', mode: timed ? 'timed' : 'untimed', limitSec: timed ? Math.max(1, +f.elements.mins.value) * 60 : null, start: Date.now(), responses: {}, marks: {} });
    render(el, { id: t.id });
  });
}

function elapsed() {
  return Math.round(((session.end || Date.now()) - session.start) / 1000);
}

function renderAnswer(el, t) {
  const r = session.responses;
  el.innerHTML = `
    <h1>${esc(t.title)}</h1>
    <div class="timer" role="timer" aria-live="off"><span class="small muted">${session.mode === 'timed' ? 'Time left' : 'Time'}</span><span class="t" data-t></span>
      <button class="btn btn-small" data-act="quit">Quit</button></div>
    <form class="card" data-form="answers">
      ${t.questions.map((q, i) => `<div class="q">
        <div class="q-head"><strong>Question ${i + 1}</strong><span class="small muted">${kindLabel(q.kind)} · ${q.marks} mark${q.marks === 1 ? '' : 's'}</span></div>
        <div class="q-prompt" id="qp-${q.id}">${esc(q.prompt)}</div>
        ${q.kind === 'mcq' ? `<div role="radiogroup" aria-labelledby="qp-${q.id}">${q.options.map((o, j) => `<label class="opt"><input type="radio" name="${q.id}" value="${j}" ${String(r[q.id]) === String(j) ? 'checked' : ''}> <span>${String.fromCharCode(65 + j)}. ${esc(o)}</span></label>`).join('')}</div>`
        : q.kind === 'numerical' ? `<label class="inline">Answer <input type="text" inputmode="decimal" name="${q.id}" value="${esc(r[q.id] ?? '')}" style="width:10rem" aria-labelledby="qp-${q.id}"> ${esc(q.unit || '')}</label>`
        : q.kind === 'short' ? `<input type="text" name="${q.id}" value="${esc(r[q.id] ?? '')}" aria-labelledby="qp-${q.id}" autocomplete="off">`
        : `<textarea name="${q.id}" rows="6" aria-labelledby="qp-${q.id}">${esc(r[q.id] ?? '')}</textarea>`}
      </div>`).join('')}
      <div class="row-wrap mt"><button class="btn btn-primary" type="submit">Finish & mark</button></div>
    </form>`;

  const form = el.querySelector('[data-form=answers]');
  form.addEventListener('input', (e) => {
    if (e.target.name) r[e.target.name] = e.target.value;
  });
  form.addEventListener('change', (e) => {
    if (e.target.name) r[e.target.name] = e.target.value;
  });
  const finish = () => {
    clearInterval(ticker);
    session.end = Date.now();
    session.phase = 'mark';
    for (const q of t.questions) {
      const m = autoMark(q, r[q.id]);
      session.marks[q.id] = m.awarded;
    }
    render(el, { id: t.id });
  };
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const blank = t.questions.filter((q) => r[q.id] == null || String(r[q.id]).trim() === '').length;
    if (blank && !(await confirmDialog(`${blank} question${blank === 1 ? ' is' : 's are'} unanswered. Finish anyway?`, { ok: 'Finish', danger: false, title: 'Finish test?' }))) return;
    finish();
  });
  const tEl = el.querySelector('[data-t]');
  const tick = () => {
    if (!document.body.contains(tEl)) return clearInterval(ticker);
    const s = elapsed();
    if (session.limitSec) {
      const left = session.limitSec - s;
      tEl.textContent = fmtDuration(left);
      tEl.parentElement.classList.toggle('low', left <= 60);
      if (left <= 0) finish();
    } else tEl.textContent = fmtDuration(s);
  };
  tick();
  ticker = setInterval(tick, 1000);
  bind(el.querySelector('.timer'), {
    quit: async () => {
      if (await confirmDialog('Quit this attempt? Your answers will not be saved.', { ok: 'Quit' })) {
        clearInterval(ticker);
        session = null;
        go(`#/tests/${t.id}`);
      }
    },
  });
}

function renderMark(el, t) {
  const r = session.responses;
  el.innerHTML = `
    <h1>Mark your answers</h1>
    <p class="muted">Multiple choice and numerical questions are marked automatically. For written answers, compare with the model answer and give yourself marks.</p>
    <form class="card" data-form="mark">
      ${t.questions.map((q, i) => {
        const resp = r[q.id];
        const auto = q.kind === 'mcq' || q.kind === 'numerical';
        const got = session.marks[q.id] || 0;
        return `<div class="q">
          <div class="q-head"><strong>Question ${i + 1}</strong><span class="small muted">${kindLabel(q.kind)}</span></div>
          <div class="q-prompt">${esc(q.prompt)}</div>
          ${q.kind === 'mcq' ? q.options.map((o, j) => `<div class="opt ${j === q.correctIndex ? 'correct' : String(resp) === String(j) ? 'wrong' : ''}">${String(resp) === String(j) ? '●' : '○'} ${String.fromCharCode(65 + j)}. ${esc(o)}${j === q.correctIndex ? ' ✓' : ''}</div>`).join('')
            : `<p class="small muted" style="margin:0">Your answer</p><div class="model">${resp ? esc(resp) : '<em>No answer</em>'}${q.kind === 'numerical' && resp ? ' ' + esc(q.unit || '') : ''}</div>`}
          ${q.kind === 'numerical' ? `<p class="small">Correct: <strong>${esc(q.answer)} ${esc(q.unit || '')}</strong>${q.tolerance ? ` (± ${esc(q.tolerance)})` : ''}</p>` : ''}
          ${q.modelAnswer && q.kind !== 'mcq' ? `<p class="small muted" style="margin:0">Model answer</p><div class="model">${esc(q.modelAnswer)}</div>` : ''}
          ${auto ? `<p><span class="urg urg-${got ? 'green' : 'red'}">${got ? 'Correct' : 'Incorrect'}</span> ${got}/${q.marks}</p>`
            : `<label class="inline">Marks <input type="number" min="0" max="${q.marks}" step="0.5" name="${q.id}" value="${got}" style="width:5.5rem"> / ${q.marks}</label>`}
        </div>`;
      }).join('')}
      <div class="row-wrap mt"><button class="btn btn-primary" type="submit">Save attempt</button><button class="btn" type="button" data-act="discard">Discard</button></div>
    </form>`;
  const form = el.querySelector('[data-form=mark]');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    for (const q of t.questions) {
      const inp = form.elements[q.id];
      if (inp && inp.tagName === 'INPUT') session.marks[q.id] = Math.max(0, Math.min(q.marks, Number(inp.value) || 0));
    }
    const answers = t.questions.map((q) => ({ qId: q.id, response: r[q.id] ?? null, awarded: session.marks[q.id] || 0, max: q.marks }));
    const score = answers.reduce((s, a) => s + a.awarded, 0);
    const max = answers.reduce((s, a) => s + a.max, 0);
    const { byExam, byTopic } = aggregate(t, answers);
    const rec = await db.put('attempts', {
      testId: t.id, date: today(), finishedAt: new Date().toISOString(), mode: session.mode, timeLimitSec: session.limitSec,
      durationSec: elapsed(), answers, score, max, pct: max ? (score / max) * 100 : 0, byExam, byTopic,
      // Snapshot so the attempt still makes sense if the test is edited later.
      questions: t.questions,
    });
    session = null;
    go(`#/attempts/${rec.id}`);
  });
  bind(el, {
    discard: async () => {
      if (await confirmDialog('Discard this attempt without saving?', { ok: 'Discard' })) {
        session = null;
        go(`#/tests/${t.id}`);
      }
    },
  });
}
