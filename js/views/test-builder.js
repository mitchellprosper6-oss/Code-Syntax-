import * as db from '../db.js';
import { newTopic } from '../model.js';
import { esc, move, kindLabel, QUESTION_KINDS, uid } from '../util.js';
import { bind, emptyState, formModal, confirmDialog, toast, openDialog, alertDialog } from '../ui.js';
import { rerender, go, query } from '../router.js';
import { testFields } from './tests.js';
import { totalMarks, importQuestions, QUESTION_JSON_SCHEMA, questionInstructions } from '../questions.js';
import { aiDialog } from '../ai.js';

function topicOptions(exams) {
  return [
    { value: '', label: 'No topic' },
    ...exams.filter((e) => e.topics.length).map((e) => ({ group: e.title, options: e.topics.map((t) => ({ value: `${e.id}|${t.id}`, label: t.name })) })),
  ];
}

function questionFields(kind, exams, files) {
  const common = [
    { name: 'prompt', label: 'Question', type: 'textarea', rows: 4, required: true },
  ];
  const specific = {
    mcq: [
      { name: 'options', label: 'Options (one per line)', type: 'textarea', rows: 4, required: true },
      { name: 'correct', label: 'Correct option number (1 = first line)', type: 'number', min: 1, required: true },
    ],
    short: [{ name: 'answer', label: 'Accepted answer', help: 'Separate alternatives with |, e.g. Young’s modulus|E. Used to suggest a mark; you confirm it.' }],
    numerical: [
      { name: 'answer', label: 'Correct value', type: 'number', step: 'any', required: true },
      { name: 'tolerance', label: 'Tolerance (±)', type: 'number', step: 'any', min: 0 },
      { name: 'unit', label: 'Unit (optional)' },
    ],
    long: [],
  }[kind];
  return [
    ...common,
    ...specific,
    { name: 'modelAnswer', label: 'Model answer / marking points', type: 'textarea', rows: 4, required: kind === 'long' },
    { name: 'marks', label: 'Marks', type: 'number', min: 1 },
    { name: 'topic', label: 'Exam & topic', type: 'select', options: topicOptions(exams) },
    { name: 'newTopic', label: 'Or create a new topic (in this test’s exam)', placeholder: 'New topic name' },
    { name: 'sourceFileId', label: 'Source file', type: 'select', options: [{ value: '', label: 'None' }, ...files.map((f) => ({ value: f.id, label: f.name }))] },
  ];
}

const toValues = (q) => ({
  ...q,
  options: (q.options || []).join('\n'),
  correct: q.correctIndex != null ? q.correctIndex + 1 : '',
  topic: q.examId && q.topicId ? `${q.examId}|${q.topicId}` : '',
});

export async function render(el, { id }) {
  const t = await db.get('tests', id);
  if (!t) {
    el.innerHTML = `<div class="card"><h1>Test not found</h1><p><a href="#/tests">Back to tests</a></p></div>`;
    return;
  }
  const [exams, files] = await Promise.all([db.getAll('exams'), db.getAll('files')]);
  const exam = exams.find((e) => e.id === t.examId);
  const topicName = (q) => exams.find((e) => e.id === q.examId)?.topics.find((x) => x.id === q.topicId)?.name;
  const fileName = (fid) => files.find((f) => f.id === fid)?.name;

  el.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/tests/${id}">← ${esc(t.title)}</a></nav>
    <header class="page-head"><div><h1>Edit test</h1><p class="muted">${esc(t.title)}${exam ? ' · ' + esc(exam.title) : ''} · ${t.questions.length} questions · ${totalMarks(t)} marks</p></div>
      <div class="page-actions"><button class="btn" data-act="details">Test details</button><a class="btn btn-primary" href="#/tests/${id}/take">Take test</a></div></header>

    <section class="card" aria-labelledby="h-add">
      <h2 id="h-add">Add questions</h2>
      <div class="row-wrap">
        ${QUESTION_KINDS.map((k) => `<button class="btn" data-act="add" data-kind="${k.id}">+ ${k.label}</button>`).join('')}
      </div>
      <div class="row-wrap mt">
        <button class="btn btn-ai" data-act="generate">✨ Generate questions from my files</button>
        <span class="small muted">Builds a prompt from your file text; paste Claude's JSON reply back. <a href="https://github.com/mitchellprosper6-oss/Code-Syntax-/blob/main/docs/QUESTION_SCHEMA.md" target="_blank" rel="noopener">Schema</a></span>
      </div>
    </section>

    <section class="card mt" aria-labelledby="h-qs">
      <h2 id="h-qs">Questions</h2>
      ${t.questions.length ? `<ol class="list">${t.questions.map((q, i) => `<li>
        <div class="grow"><div class="tags"><span class="tag">${i + 1}</span><span class="tag">${kindLabel(q.kind)}</span><span class="tag">${q.marks} mark${q.marks === 1 ? '' : 's'}</span>${topicName(q) ? `<span class="tag tag-uni">${esc(topicName(q))}</span>` : ''}</div>
          <div class="title pre" style="margin-top:.3rem">${esc(q.prompt.length > 220 ? q.prompt.slice(0, 220) + '…' : q.prompt)}</div>
          ${q.sourceFileId && fileName(q.sourceFileId) ? `<span class="small muted">Source: ${esc(fileName(q.sourceFileId))}</span>` : ''}</div>
        <div class="actions">
          <button class="icon-btn" data-act="up" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" data-act="down" data-i="${i}" aria-label="Move down" ${i === t.questions.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="icon-btn" data-act="edit" data-id="${q.id}" aria-label="Edit question ${i + 1}">✎</button>
          <button class="icon-btn danger" data-act="del" data-id="${q.id}" aria-label="Delete question ${i + 1}">✕</button></div></li>`).join('')}</ol>`
      : emptyState('No questions yet. Write one above, or generate some from your files.')}
    </section>`;

  const save = async (fn) => {
    await db.update('tests', id, fn);
    rerender();
  };

  /** Turn form values into a question; creates a new topic in the exam if asked. */
  async function fromValues(kind, v, base = {}) {
    let examId = null, topicId = null;
    if (v.topic) [examId, topicId] = v.topic.split('|');
    if (v.newTopic && t.examId) {
      const tp = newTopic(v.newTopic);
      await db.update('exams', t.examId, (e) => { e.topics.push(tp); });
      examId = t.examId;
      topicId = tp.id;
    }
    const q = {
      id: base.id || uid(), kind, prompt: v.prompt,
      options: [], correctIndex: null, answer: '', tolerance: 0, unit: '',
      modelAnswer: v.modelAnswer || '', marks: Math.max(1, Math.round(v.marks || 1)),
      examId: examId || t.examId || null, topicId, sourceFileId: v.sourceFileId || null,
    };
    if (kind === 'mcq') {
      q.options = v.options.split('\n').map((s) => s.trim()).filter(Boolean);
      if (q.options.length < 2) throw new Error('Multiple choice needs at least 2 options.');
      q.correctIndex = Math.min(q.options.length, Math.max(1, Math.round(v.correct || 1))) - 1;
      if (!q.modelAnswer) q.modelAnswer = q.options[q.correctIndex];
    } else if (kind === 'numerical') {
      q.answer = String(v.answer);
      q.tolerance = Math.abs(v.tolerance || 0);
      q.unit = v.unit || '';
    } else if (kind === 'short') q.answer = v.answer || '';
    return q;
  }

  async function questionForm(kind, q = null) {
    const freshExams = await db.getAll('exams');
    const v = await formModal({
      title: `${q ? 'Edit' : 'Add'} ${kindLabel(kind).toLowerCase()} question`,
      fields: questionFields(kind, freshExams, files),
      values: q ? toValues(q) : { marks: 1, topic: '' },
      ai: { about: `one ${kindLabel(kind)} practice question with a model answer`, context: { exam: exam ? { title: exam.title, module: exam.module, topics: exam.topics.map((x) => x.name) } : null } },
    });
    if (!v) return;
    try {
      const nq = await fromValues(kind, v, q || {});
      save((r) => {
        if (q) r.questions = r.questions.map((x) => (x.id === q.id ? nq : x));
        else r.questions.push(nq);
      });
    } catch (err) {
      alertDialog(err.message, 'Check the question');
    }
  }

  bind(el, {
    add: (b) => questionForm(b.dataset.kind),
    edit: (b) => {
      const q = t.questions.find((x) => x.id === b.dataset.id);
      questionForm(q.kind, q);
    },
    del: async (b) => {
      if (await confirmDialog('Delete this question? Past attempts keep their scores.')) save((r) => { r.questions = r.questions.filter((x) => x.id !== b.dataset.id); });
    },
    up: (b) => save((r) => { r.questions = move(r.questions, +b.dataset.i, -1); }),
    down: (b) => save((r) => { r.questions = move(r.questions, +b.dataset.i, 1); }),
    details: async () => {
      const v = await formModal({ title: 'Test details', fields: await testFields(exams), values: t, ai: { about: 'a practice test' } });
      if (v) save((r) => Object.assign(r, v, { examId: v.examId || null }));
    },
    generate: () => generate(t, exam, files),
  });

  // Opened from a topic page with ?generate=1: jump straight into question generation.
  const q = query();
  if (q.get('generate')) {
    history.replaceState(null, '', `#/tests/${id}/edit`);
    generate(t, exam, files, q.get('topic') || '');
  }
}

/** Pick files + options, then run the AI dialog and import the questions. */
async function generate(test, exam, files, focusTopic = '') {
  const withText = files.filter((f) => f.extractedText);
  if (!withText.length && !focusTopic) {
    if (await confirmDialog('You have no files with text yet. Upload notes on Practice Tests → Files first.', { ok: 'Go to Files', danger: false, title: 'No files' })) go('#/tests?tab=files');
    return;
  }
  const { dlg, close, done } = openDialog(
    `<form class="modal-body"><h2 class="modal-title">Generate questions</h2>
      <div class="field"><label for="g-focus">Focus on topic (optional)</label><input id="g-focus" name="focus" value="${esc(focusTopic)}" placeholder="e.g. Phase diagrams"></div>
      <fieldset class="field"><legend>Files to use <span class="muted small">(optional — without files Claude uses the exam and topic)</span></legend>
        ${withText.length ? '' : '<p class="small muted">No files yet. Upload notes on Practice Tests → Files for questions based on your own material.</p>'}
        ${withText.map((f) => `<label class="inline" style="display:flex;margin:.3rem 0"><input type="checkbox" name="f" value="${f.id}"> ${esc(f.name)} <span class="small muted">(${f.extractedText.length.toLocaleString()} chars)</span></label>`).join('')}
      </fieldset>
      <div class="field"><label for="g-n">How many questions</label><input id="g-n" name="n" type="number" min="1" max="50" value="10"></div>
      <fieldset class="field"><legend>Question kinds</legend>
        ${QUESTION_KINDS.map((k) => `<label class="inline" style="margin-right:1rem"><input type="checkbox" name="k" value="${k.id}" checked> ${k.label}</label>`).join('')}
      </fieldset>
      <label class="inline"><input type="checkbox" name="topics" checked> Create missing topics in ${exam ? esc(exam.title) : 'the exam'}</label>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary" type="submit">Next</button></div></form>`,
    { label: 'Generate questions' }
  );
  dlg.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    const ids = [...f.querySelectorAll('[name=f]:checked')].map((x) => x.value);
    const kinds = [...f.querySelectorAll('[name=k]:checked')].map((x) => x.value);
    const err = f.querySelector('.form-error');
    if (!kinds.length || (!ids.length && !f.elements.focus.value.trim() && !exam)) {
      err.textContent = !kinds.length ? 'Choose at least one question kind.' : 'Choose a file, or give a topic to focus on.';
      err.hidden = false;
      return;
    }
    close({ ids, kinds, n: Math.max(1, Math.min(50, +f.elements.n.value || 10)), createTopics: f.elements.topics.checked, focus: f.elements.focus.value.trim() });
  });
  const opts = await done;
  if (!opts) return;
  const chosen = withText.filter((f) => opts.ids.includes(f.id));
  const result = await aiDialog({
    title: 'Generate questions',
    about: 'Write practice questions for my exam revision.',
    instructions: questionInstructions({ count: opts.n, kinds: opts.kinds, exam, hasSource: chosen.length > 0, focus: opts.focus }) +
      (chosen.length ? '\n\nSOURCE MATERIAL:\n' + chosen.map((f) => `===== FILE: ${f.name} =====\n${f.extractedText}`).join('\n\n') : ''),
    context: exam ? { exam: { title: exam.title, module: exam.module, type: exam.type } } : null,
    schema: QUESTION_JSON_SCHEMA,
    placeholder: 'Optional: difficulty or style (e.g. "exam-style, include unit conversions")',
    quick: ['Exam-style, mixed difficulty', 'Mostly calculations', 'Quick-fire definitions'],
    parse: (json) => importQuestions(json, { exam, files: chosen, createTopics: opts.createTopics }),
  });
  if (!result) return;
  if (result.newTopics.length && exam) await db.update('exams', exam.id, (e) => { e.topics.push(...result.newTopics); });
  await db.update('tests', test.id, (r) => { r.questions.push(...result.questions); });
  toast(`Imported ${result.questions.length} question${result.questions.length === 1 ? '' : 's'}.`);
  if (result.warnings.length) await alertDialog(result.warnings.join('\n'), 'Some items were skipped or need checking');
  rerender();
}
