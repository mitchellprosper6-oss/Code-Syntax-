import * as db from '../db.js';
import { projectProgress, taskProgress, focusItems, estimatedMark } from '../model.js';
import { esc, countdown, urgency, daysUntil, hasDate, whenText, statusLabel, isClosed, fmtDate, fmtMinutes, fmtBytes, today, move, PROJECT_STATUSES, uid } from '../util.js';
import { bind, catTag, progressBar, emptyState, formModal, confirmDialog, pickFiles, toast } from '../ui.js';
import { rerender, go } from '../router.js';
import {
  editProject, taskFields, taskToValues, valuesToTask, criterionFields, criterionToValues, valuesToCriterion,
  logFields, suggestTasks, suggestCriteria,
} from '../forms.js';
import { storeFiles, openFile, dropZone } from '../files.js';
import { ACCEPT } from '../extract.js';
import { setAssistant } from '../assistant.js';
import { slimProject } from '../forms.js';
import { openTimer } from '../timer.js';

export async function render(el, { id }) {
  const p = await db.get('projects', id);
  if (!p) {
    el.innerHTML = `<div class="card"><h1>Project not found</h1><p><a href="#/projects">Back to projects</a></p></div>`;
    return;
  }
  const files = (await Promise.all(p.fileIds.map((fid) => db.get('files', fid)))).filter(Boolean);
  const pct = Math.round(projectProgress(p));
  const calc = taskProgress(p.tasks);
  const d = hasDate(p.deadline) ? daysUntil(p.deadline.date) : null;
  const focus = focusItems(p);
  const weightSum = p.criteria.reduce((s, c) => s + (Number(c.weight) || 0), 0);
  const est = estimatedMark(p.criteria);

  el.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/projects">← Projects</a></nav>
    <header class="page-head">
      <div>
        <div class="tags">${catTag(p.category)}<span class="tag">${esc(p.type)}</span></div>
        <h1 style="margin-top:.35rem">${esc(p.title)}</h1>
        <p class="muted">${esc(p.module || '')}${p.module ? ' · ' : ''}Due ${esc(whenText(p.deadline))}
          ${d != null && !isClosed(p) ? `<span class="urg urg-${urgency(d)}">${countdown(d)}</span>` : ''}</p>
      </div>
      <div class="page-actions">
        <label class="inline"><span class="sr-only">Status</span>
          <select data-act="status" aria-label="Status">${PROJECT_STATUSES.map((s) => `<option value="${s.id}" ${s.id === p.status ? 'selected' : ''}>${s.label}</option>`).join('')}</select></label>
        <button class="btn" data-act="edit">Edit</button>
        <button class="btn btn-danger" data-act="delete">Delete</button>
      </div>
    </header>

    ${focus.length ? `<section class="card focus-box" aria-labelledby="h-focus"><h2 id="h-focus">🚩 Focus areas</h2>
      <ul class="list">${focus.map((f) => `<li><div class="grow"><span class="title">${esc(f.name)}</span> <span class="tag">${f.kind}</span>${f.note ? `<br><span class="small muted">${esc(f.note)}</span>` : ''}</div></li>`).join('')}</ul></section>` : ''}

    <div class="grid-2 mt">
      <section class="card" aria-labelledby="h-prog">
        <div class="card-head"><h2 id="h-prog">Progress</h2><span class="big-num">${pct}%</span></div>
        ${progressBar(pct, { label: 'Project completion' })}
        <p class="small muted mt">${p.progressOverride != null ? `Manual override. Calculated from tasks: ${calc == null ? 'no tasks' : Math.round(calc) + '%'}.` : calc == null ? 'Add tasks to calculate completion, or set it manually.' : 'Calculated from weighted tasks.'}</p>
        <div class="inline-form">
          <label class="inline">Manual % <input type="number" min="0" max="100" style="width:6rem" value="${p.progressOverride ?? ''}" data-act="override" aria-label="Manual completion percent"></label>
          ${p.progressOverride != null ? `<button class="btn btn-small" data-act="clear-override">Use calculated</button>` : ''}
        </div>
      </section>
      <section class="card" aria-labelledby="h-desc">
        <div class="card-head"><h2 id="h-desc">Description</h2><button class="btn btn-small" data-act="edit">Edit</button></div>
        ${p.description ? `<p class="pre">${esc(p.description)}</p>` : `<p class="muted">No description yet.</p>`}
      </section>
    </div>

    <section class="card mt" aria-labelledby="h-tasks">
      <div class="card-head"><h2 id="h-tasks">Tasks & milestones</h2>
        <div class="row-wrap"><button class="btn btn-ai btn-small" data-act="ai-tasks">✨ Suggest with AI</button><button class="btn btn-small btn-primary" data-act="add-task">+ Add task</button></div></div>
      ${p.tasks.length ? `<ul class="list">${p.tasks.map((t, i) => `
        <li class="${t.done ? 'done' : ''}">
          <input type="checkbox" class="check" data-act="toggle-task" data-id="${t.id}" ${t.done ? 'checked' : ''} aria-label="Done: ${esc(t.name)}">
          <div class="grow"><span class="title">${esc(t.name)}</span>
            <div class="small muted">${[t.weight ? `weight ${t.weight}` : '', t.due ? `due ${fmtDate(t.due)}${!t.done ? ` (${countdown(daysUntil(t.due))})` : ''}` : '', t.done && t.doneAt ? `done ${fmtDate(t.doneAt)}` : ''].filter(Boolean).join(' · ')}</div>
            ${t.focus?.flag ? `<div class="small" style="color:var(--red)">🚩 ${esc(t.focus.note || 'Needs focus')}</div>` : ''}</div>
          <div class="actions">
            <button class="icon-btn" data-act="focus-task" data-id="${t.id}" aria-pressed="${!!t.focus?.flag}" title="Needs focus" aria-label="Toggle needs focus">🚩</button>
            <button class="icon-btn" data-act="up-task" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="icon-btn" data-act="edit-task" data-id="${t.id}" aria-label="Edit task">✎</button>
            <button class="icon-btn danger" data-act="del-task" data-id="${t.id}" aria-label="Delete task">✕</button>
          </div></li>`).join('')}</ul>`
        : emptyState('Add your first task or milestone.', `<button class="btn" data-act="add-task">+ Add task</button>`)}
    </section>

    <section class="card mt" aria-labelledby="h-crit">
      <div class="card-head"><h2 id="h-crit">Marking criteria</h2>
        <div class="row-wrap"><button class="btn btn-ai btn-small" data-act="ai-crit">✨ Add from marking scheme</button><button class="btn btn-small btn-primary" data-act="add-crit">+ Add criterion</button></div></div>
      ${p.criteria.length ? `<div class="table-wrap"><table>
        <thead><tr><th>Criterion</th><th class="num">Weight</th><th>Self-rating</th><th>Notes</th><th><span class="sr-only">Actions</span></th></tr></thead>
        <tbody>${p.criteria.map((c) => `<tr>
          <td><strong>${esc(c.name)}</strong>${c.focus?.flag ? `<br><span class="small" style="color:var(--red)">🚩 ${esc(c.focus.note || 'Needs focus')}</span>` : ''}</td>
          <td class="num">${c.weight != null ? esc(c.weight) + '%' : '–'}</td>
          <td><select data-act="rate-crit" data-id="${c.id}" aria-label="Self-rating for ${esc(c.name)}" style="min-width:6.5rem"><option value="">Not rated</option>${[1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${c.selfRating === n ? 'selected' : ''}>${n} / 5</option>`).join('')}</select></td>
          <td class="small">${esc(c.notes || '')}</td>
          <td><div class="actions row">
            <button class="icon-btn" data-act="focus-crit" data-id="${c.id}" aria-pressed="${!!c.focus?.flag}" aria-label="Toggle needs focus">🚩</button>
            <button class="icon-btn" data-act="edit-crit" data-id="${c.id}" aria-label="Edit criterion">✎</button>
            <button class="icon-btn danger" data-act="del-crit" data-id="${c.id}" aria-label="Delete criterion">✕</button></div></td></tr>`).join('')}</tbody></table></div>
        <p class="small muted mt">Weights total ${weightSum}%${weightSum !== 100 && weightSum ? ' (not 100%)' : ''}.${est != null ? ` Self-assessed estimate: <strong>${Math.round(est)}%</strong>.` : ''}</p>`
        : emptyState('No criteria yet. Add them when you have the marking scheme.', `<button class="btn" data-act="add-crit">+ Add criterion</button>`)}
    </section>

    <div class="grid-2 mt">
      <section class="card" aria-labelledby="h-log">
        <div class="card-head"><h2 id="h-log">Progress log</h2><button class="btn btn-small btn-primary" data-act="add-log">+ Log work</button></div>
        ${p.log.length ? `<ul class="list">${[...p.log].sort((a, b) => b.date.localeCompare(a.date)).map((l) => `<li><div class="grow"><span class="small muted">${fmtDate(l.date)}${l.minutes ? ' · ' + fmtMinutes(l.minutes) : ''}</span><br>${esc(l.text)}</div>
          <div class="actions"><button class="icon-btn danger" data-act="del-log" data-id="${l.id}" aria-label="Delete log entry">✕</button></div></li>`).join('')}</ul>
          <p class="small muted">Total logged: ${fmtMinutes(p.log.reduce((s, l) => s + (l.minutes || 0), 0))}</p>`
        : `<p class="muted small">Log what you did, e.g. “2h on literature review”.</p>`}
      </section>
      <section class="card" aria-labelledby="h-files">
        <div class="card-head"><h2 id="h-files">Attachments</h2><button class="btn btn-small" data-act="attach">+ Attach files</button></div>
        <div class="drop" id="drop">Drop files here, or use “Attach files”.</div>
        ${files.length ? `<ul class="list mt">${files.map((f) => `<li><div class="grow"><button class="btn-link btn btn-small" style="padding:0" data-act="open-file" data-id="${f.id}">${esc(f.name)}</button><br><span class="small muted">${fmtBytes(f.size)} · ${fmtDate(f.uploadedAt.slice(0, 10))}</span></div>
          <div class="actions"><button class="icon-btn danger" data-act="del-file" data-id="${f.id}" aria-label="Remove ${esc(f.name)}">✕</button></div></li>`).join('')}</ul>` : ''}
      </section>
    </div>`;

  const save = async (fn) => {
    await db.update('projects', id, fn);
    rerender();
  };
  const findTask = (tid) => p.tasks.find((t) => t.id === tid);
  const findCrit = (cid) => p.criteria.find((c) => c.id === cid);
  const attach = async (list) => {
    if (!list.length) return;
    const recs = await storeFiles(list);
    await save((r) => { r.fileIds = [...r.fileIds, ...recs.map((x) => x.id)]; });
    toast(`Attached ${recs.length} file${recs.length === 1 ? '' : 's'}.`);
  };
  dropZone(el.querySelector('#drop'), attach);

  setAssistant({
    key: `project:${id}`,
    title: p.title,
    data: { project: slimProject(p), progressPct: pct, focusAreas: focus, logged: p.log.slice(-10) },
    questions: ['What should I work on next?', 'Am I on track for the deadline?', 'Help me structure the report'],
    actions: [
      { label: 'Break into tasks', icon: 'check', run: () => el.querySelector('[data-act=ai-tasks]')?.click() },
      { label: 'Add marking criteria', icon: 'target', run: () => el.querySelector('[data-act=ai-crit]')?.click() },
      { label: 'Work on this now', icon: 'timer', run: () => openTimer({ type: 'project', id, label: p.title }) },
    ],
  });

  bind(el, {
    edit: async () => (await editProject(p)) && rerender(),
    delete: async () => {
      if (!(await confirmDialog(`Delete “${p.title}” and all its tasks, criteria and log? Attached files stay in your file library.`))) return;
      await db.del('projects', id);
      toast('Project deleted.');
      go('#/projects');
    },
    status: (s) => save((r) => { r.status = s.value; }),
    override: (inp) => save((r) => { r.progressOverride = inp.value === '' ? null : Math.max(0, Math.min(100, Number(inp.value))); }),
    'clear-override': () => save((r) => { r.progressOverride = null; }),

    'add-task': async () => {
      const v = await formModal({ title: 'Add task', fields: taskFields(), ai: { about: 'one task/milestone for this project', context: { project: p.title, deadline: p.deadline } } });
      if (v) save((r) => { r.tasks.push(valuesToTask(v)); });
    },
    'edit-task': async (b) => {
      const t = findTask(b.dataset.id);
      const v = await formModal({ title: 'Edit task', fields: taskFields(), values: taskToValues(t), ai: { about: 'one task/milestone for this project', context: { project: p.title } } });
      if (v) save((r) => { r.tasks = r.tasks.map((x) => (x.id === t.id ? valuesToTask(v, x) : x)); });
    },
    'toggle-task': (c) => save((r) => {
      const t = r.tasks.find((x) => x.id === c.dataset.id);
      t.done = c.checked;
      t.doneAt = c.checked ? today() : null;
    }),
    'focus-task': async (b) => {
      const t = findTask(b.dataset.id);
      const note = t.focus?.flag ? '' : await focusNote(t.name);
      if (note === null) return;
      save((r) => { r.tasks.find((x) => x.id === t.id).focus = { flag: !t.focus?.flag, note }; });
    },
    'up-task': (b) => save((r) => { r.tasks = move(r.tasks, +b.dataset.i, -1); }),
    'del-task': async (b) => {
      const t = findTask(b.dataset.id);
      if (await confirmDialog(`Delete task “${t.name}”?`)) save((r) => { r.tasks = r.tasks.filter((x) => x.id !== t.id); });
    },
    'ai-tasks': async () => {
      const items = await suggestTasks(p);
      if (items.length) save((r) => { r.tasks.push(...items); });
    },

    'add-crit': async () => {
      const v = await formModal({ title: 'Add criterion', fields: criterionFields(), ai: { about: 'one marking criterion', context: { project: p.title } } });
      if (v) save((r) => { r.criteria.push(valuesToCriterion(v)); });
    },
    'edit-crit': async (b) => {
      const c = findCrit(b.dataset.id);
      const v = await formModal({ title: 'Edit criterion', fields: criterionFields(), values: criterionToValues(c), ai: { about: 'one marking criterion', context: { project: p.title } } });
      if (v) save((r) => { r.criteria = r.criteria.map((x) => (x.id === c.id ? valuesToCriterion(v, x) : x)); });
    },
    'rate-crit': (s) => save((r) => { r.criteria.find((x) => x.id === s.dataset.id).selfRating = s.value ? Number(s.value) : null; }),
    'focus-crit': async (b) => {
      const c = findCrit(b.dataset.id);
      const note = c.focus?.flag ? '' : await focusNote(c.name);
      if (note === null) return;
      save((r) => { r.criteria.find((x) => x.id === c.id).focus = { flag: !c.focus?.flag, note }; });
    },
    'del-crit': async (b) => {
      const c = findCrit(b.dataset.id);
      if (await confirmDialog(`Delete criterion “${c.name}”?`)) save((r) => { r.criteria = r.criteria.filter((x) => x.id !== c.id); });
    },
    'ai-crit': async () => {
      const items = await suggestCriteria(p);
      if (items.length) save((r) => { r.criteria.push(...items); });
    },

    'add-log': async () => {
      const v = await formModal({ title: 'Log work', fields: logFields(), values: { date: today() }, ai: { about: 'a progress log entry for this project', context: { project: p.title } } });
      if (v) save((r) => { r.log.push({ id: uid(), date: v.date, minutes: v.minutes, text: v.text }); });
    },
    'del-log': async (b) => {
      if (await confirmDialog('Delete this log entry?')) save((r) => { r.log = r.log.filter((x) => x.id !== b.dataset.id); });
    },

    attach: async () => attach(await pickFiles({ accept: ACCEPT })),
    'open-file': (b) => openFile(b.dataset.id),
    'del-file': async (b) => {
      if (await confirmDialog('Remove this attachment from the project? The file stays in your file library (Practice Tests → Files).', { ok: 'Remove' }))
        save((r) => { r.fileIds = r.fileIds.filter((x) => x !== b.dataset.id); });
    },
  });
}

async function focusNote(name) {
  const v = await formModal({
    title: `Needs focus: ${name}`,
    fields: [{ name: 'note', label: 'Why does this need focus? (optional)', type: 'textarea' }],
    submitLabel: 'Flag it',
    ai: false,
  });
  return v ? v.note : null;
}
