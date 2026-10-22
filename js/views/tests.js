import * as db from '../db.js';
import { loadAll } from '../model.js';
import { esc, fmtDate, fmtBytes, fmtDuration } from '../util.js';
import { bind, emptyState, pageHead, formModal, confirmDialog, pickFiles, toast, openDialog } from '../ui.js';
import { rerender, go, query } from '../router.js';
import { storeFiles, openFile, reextract, dropZone } from '../files.js';
import { ACCEPT } from '../extract.js';
import { totalMarks } from '../questions.js';
import { chartFigure, lineChart } from '../charts.js';

export async function testFields(exams) {
  return [
    { name: 'title', label: 'Test title', required: true },
    { name: 'examId', label: 'Exam', type: 'select', options: [{ value: '', label: 'No exam' }, ...exams.map((e) => ({ value: e.id, label: e.title }))] },
    { name: 'timeLimitMin', label: 'Time limit for timed mode (minutes)', type: 'number', min: 1 },
    { name: 'description', label: 'Notes', type: 'textarea' },
  ];
}

/** Create a new test (optionally for an exam). Returns the record or null. */
export async function newTestFor(examId = '') {
  const exams = await db.getAll('exams');
  const exam = exams.find((e) => e.id === examId);
  const v = await formModal({
    title: 'New practice test',
    fields: await testFields(exams),
    values: { examId, title: exam ? `${exam.title} – practice ${new Date().toLocaleDateString()}` : '', timeLimitMin: 30 },
    ai: { about: 'a practice test' },
  });
  if (!v) return null;
  return db.put('tests', { ...v, examId: v.examId || null, questions: [] });
}

export async function render(el) {
  const data = await loadAll();
  const tab = query().get('tab') || 'tests';
  const examById = Object.fromEntries(data.exams.map((e) => [e.id, e]));
  const testById = Object.fromEntries(data.tests.map((t) => [t.id, t]));
  const tabs = [['tests', 'Tests'], ['files', 'Files'], ['history', 'History']];

  let body = '';
  if (tab === 'tests') {
    body = data.tests.length
      ? `<div class="grid">${data.tests.map((t) => {
          const at = data.attempts.filter((a) => a.testId === t.id);
          const last = at[at.length - 1];
          const best = at.length ? Math.max(...at.map((a) => a.pct)) : null;
          return `<div class="card">
            <div class="tags">${t.examId && examById[t.examId] ? `<span class="tag">${esc(examById[t.examId].title)}</span>` : ''}</div>
            <h3 style="margin:.35rem 0"><a href="#/tests/${t.id}">${esc(t.title)}</a></h3>
            <p class="small muted">${t.questions.length} questions · ${totalMarks(t)} marks · ${at.length} attempt${at.length === 1 ? '' : 's'}${last ? ` · last ${Math.round(last.pct)}% · best ${Math.round(best)}%` : ''}</p>
            <div class="row-wrap"><a class="btn btn-small btn-primary" href="#/tests/${t.id}/take" ${t.questions.length ? '' : 'aria-disabled="true"'}>Take test</a><a class="btn btn-small" href="#/tests/${t.id}/edit">Edit questions</a></div>
          </div>`;
        }).join('')}</div>`
      : emptyState('Build your first practice test from your notes.', `<button class="btn btn-primary" data-act="new">+ New practice test</button>`);
  } else if (tab === 'files') {
    const files = data.files.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
    body = `<div class="drop" id="drop"><p><strong>Drop files here</strong> or <button class="btn btn-small" data-act="upload">choose files</button></p>
        <p class="small">PDF, Word (.docx), Markdown (.md, Obsidian notes), text and images. Text is extracted in your browser; nothing is uploaded anywhere.</p>
        <p class="small" data-status aria-live="polite"></p></div>
      ${files.length ? `<div class="card mt"><ul class="list">${files.map((f) => `<li>
        <div class="grow"><span class="title">${esc(f.name)}</span><br><span class="small muted">${esc(f.kind)} · ${fmtBytes(f.size)} · ${fmtDate(f.uploadedAt.slice(0, 10))} · ${f.extractedText ? `${f.extractedText.length.toLocaleString()} characters of text` : esc(f.extractNote || 'no text')}</span></div>
        <div class="actions">
          <button class="btn btn-small" data-act="preview" data-id="${f.id}" ${f.extractedText ? '' : 'disabled'}>View text</button>
          <button class="btn btn-small" data-act="open" data-id="${f.id}">Open</button>
          <button class="icon-btn" data-act="reextract" data-id="${f.id}" aria-label="Extract text again" title="Extract text again">↻</button>
          <button class="icon-btn danger" data-act="del-file" data-id="${f.id}" aria-label="Delete ${esc(f.name)}">✕</button></div></li>`).join('')}</ul></div>` : ''}`;
  } else {
    const at = data.attempts.filter((a) => testById[a.testId]);
    const labels = at.map((a) => fmtDate(a.date));
    body = at.length
      ? `<div class="card">${chartFigure('c-all', 'All attempts: score over time', ['Date', 'Test', 'Score'], at.map((a, i) => [labels[i], testById[a.testId].title, Math.round(a.pct) + '%']))}</div>
        <div class="card mt"><div class="table-wrap"><table><thead><tr><th>Date</th><th>Test</th><th class="num">Score</th><th class="num">%</th><th class="num">Time</th><th>Mode</th></tr></thead>
        <tbody>${at.slice().reverse().map((a) => `<tr><td><a href="#/attempts/${a.id}">${fmtDate(a.date)}</a></td><td>${esc(testById[a.testId].title)}</td><td class="num">${a.score}/${a.max}</td><td class="num">${Math.round(a.pct)}%</td><td class="num">${fmtDuration(a.durationSec)}</td><td>${a.mode}</td></tr>`).join('')}</tbody></table></div></div>`
      : emptyState('No attempts yet.');
    queueMicrotask(() => at.length && lineChart('c-all', labels, [{ label: 'Score', data: at.map((a) => a.pct) }]));
  }

  el.innerHTML = `
    ${pageHead('Practice Tests', `<button class="btn btn-primary" data-act="new">+ New practice test</button>`)}
    <div class="tabs" role="tablist">${tabs.map(([k, l]) => `<a class="tab" role="tab" href="#/tests?tab=${k}" aria-selected="${tab === k}">${l}</a>`).join('')}</div>
    ${body}`;

  const status = el.querySelector('[data-status]');
  const upload = async (list) => {
    if (!list.length) return;
    await storeFiles(list, { onProgress: (m) => status && (status.textContent = m) });
    toast(`Stored ${list.length} file${list.length === 1 ? '' : 's'}.`);
    rerender();
  };
  dropZone(el.querySelector('#drop'), upload);

  bind(el, {
    new: async () => {
      const t = await newTestFor();
      if (t) go(`#/tests/${t.id}/edit`);
    },
    upload: async () => upload(await pickFiles({ accept: ACCEPT })),
    open: (b) => openFile(b.dataset.id),
    preview: async (b) => {
      const f = await db.get('files', b.dataset.id);
      openDialog(`<div class="modal-body"><h2 class="modal-title">${esc(f.name)}</h2><pre class="model mono" style="max-height:60vh;overflow:auto">${esc(f.extractedText)}</pre>
        <div class="modal-actions"><button class="btn btn-primary" data-close>Close</button></div></div>`, { wide: true, label: f.name });
    },
    reextract: async (b) => {
      const f = await reextract(b.dataset.id);
      toast(f.extractedText ? `Extracted ${f.extractedText.length.toLocaleString()} characters.` : f.extractNote || 'No text found.');
      rerender();
    },
    'del-file': async (b) => {
      const f = data.files.find((x) => x.id === b.dataset.id);
      if (!(await confirmDialog(`Delete “${f.name}”? It will be removed from any project or skill it is attached to. Questions made from it are kept.`))) return;
      await db.del('files', f.id);
      for (const p of data.projects.filter((p) => p.fileIds.includes(f.id))) await db.put('projects', { ...p, fileIds: p.fileIds.filter((x) => x !== f.id) });
      for (const s of data.skills.filter((s) => s.evidence.some((e) => e.refId === f.id))) await db.put('skills', { ...s, evidence: s.evidence.filter((e) => e.refId !== f.id) });
      toast('File deleted.');
      rerender();
    },
  });
}
