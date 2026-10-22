import * as db from '../db.js';
import { skillMinutesOn, skillStreak } from '../model.js';
import { ring } from '../ui.js';
import { icon } from '../icons.js';
import { setAssistant } from '../assistant.js';
import { loadAll, effectiveLevel, landmarkPct, nextLandmark, landmarksThisMonth, linkedItems, projectProgress, readiness, topicCounts } from '../model.js';
import { esc, LEVELS, phaseLabel, today, weekStart, fmtMinutes, uid, move } from '../util.js';
import { bind, progressBar, emptyState, pageHead, openDialog, toast, confirmDialog, readinessMeter } from '../ui.js';
import { rerender, go, query } from '../router.js';
import { editSkill } from '../forms.js';

export async function render(el) {
  const data = await loadAll();
  const { sections, skills } = data;
  const tab = query().get('tab') || db.getSetting('skillsTab') || sections[0]?.id;
  const sec = sections.find((s) => s.id === tab) || sections[0];
  if (sec) db.setSetting('skillsTab', sec.id);
  const list = sec ? skills.filter((s) => s.sectionId === sec.id) : [];
  const week = weekStart(today());

  const avg = list.length ? list.reduce((n, s) => n + effectiveLevel(s), 0) / list.length : 0;
  const lmMonth = list.reduce((n, s) => n + landmarksThisMonth(s), 0);
  const weekMins = list.reduce((n, s) => n + s.practice.filter((p) => p.date >= week).reduce((m, p) => m + (p.minutes || 0), 0), 0);
  const unset = list.filter((s) => !s.levelSet);

  // group by sub-group, in the section's sub-group order
  const order = [...(sec?.subgroups || [])];
  for (const s of list) if (s.subgroup && !order.includes(s.subgroup)) order.push(s.subgroup);
  const groups = [['', list.filter((s) => !s.subgroup)], ...order.map((g) => [g, list.filter((s) => s.subgroup === g)])].filter(([, arr]) => arr.length);

  el.innerHTML = `
    ${pageHead('Skills', `<button class="btn" data-act="sections">Manage sections</button><button class="btn btn-primary" data-act="add">+ Add skill</button>`)}
    <div class="tabs" role="tablist" aria-label="Skill sections">${sections.map((s) => `<a class="tab" role="tab" href="#/skills?tab=${s.id}" aria-selected="${s.id === sec?.id}">${esc(s.name)}</a>`).join('')}</div>
    ${sec ? `
    <div class="stat-row">
      <div class="stat"><div class="label">Skills</div><div class="value">${list.length}</div></div>
      <div class="stat"><div class="label">Average level</div><div class="value">${list.length ? avg.toFixed(1) : '–'}</div></div>
      <div class="stat"><div class="label">Landmarks this month</div><div class="value">${lmMonth}</div></div>
      <div class="stat"><div class="label">Practice this week</div><div class="value">${weekMins ? fmtMinutes(weekMins) : '–'}</div></div>
    </div>
    ${unset.length ? `<div class="banner banner-info mt"><p>${unset.length} skill${unset.length === 1 ? '' : 's'} here still at the starting level. Tap a level on each card to set your real one.</p></div>` : ''}
    ${groups.length ? groups.map(([g, arr]) => `${g ? `<h2 class="subgroup-title">${esc(g)}</h2>` : '<div class="mt"></div>'}<div class="grid">${arr.map((s) => card(s, data, week)).join('')}</div>`).join('')
      : `<div class="mt">${emptyState(`No skills in ${sec.name} yet.`, `<button class="btn btn-primary" data-act="add">+ Add your first skill</button>`)}</div>`}`
    : emptyState('Add a section to start tracking skills.', `<button class="btn" data-act="sections">Manage sections</button>`)}`;

  setAssistant({
    key: 'skills',
    title: sec ? `${sec.name} skills` : 'Skills',
    data: { section: sec?.name, skills: list.map((s) => ({ name: s.name, level: effectiveLevel(s), target: s.targetLevel, next: nextLandmark(s)?.text || null })) },
    questions: ['Which skill should I prioritise this month?', 'Build me a weekly practice routine for these skills'],
  });

  bind(el, {
    add: async () => {
      const s = await editSkill(null, { sectionId: sec?.id });
      if (s) go(`#/skills/${s.id}`);
    },
    quick: async (b) => {
      const s = skills.find((x) => x.id === b.dataset.id);
      const entry = { id: uid(), date: today(), minutes: s.quickLog.minutes, note: s.quickLog.note };
      await db.update('skills', s.id, (r) => { r.practice.push(entry); });
      toast(`Logged ${fmtMinutes(entry.minutes)} of ${s.name}.`, {
        action: 'Undo',
        onAction: async () => {
          await db.update('skills', s.id, (r) => { r.practice = r.practice.filter((p) => p.id !== entry.id); });
          rerender();
        },
      });
      rerender();
    },
    level: async (b) => {
      await db.update('skills', b.dataset.id, (r) => { r.levelOverride = Number(b.dataset.l); r.levelSet = true; });
      rerender();
    },
    sections: () => manageSections(sections, skills),
  });
}

function card(s, data, week) {
  const lvl = effectiveLevel(s);
  const pct = landmarkPct(s);
  const next = nextLandmark(s);
  const done = s.landmarks.filter((l) => l.done).length;
  const mins = s.practice.filter((p) => p.date >= week).reduce((m, p) => m + (p.minutes || 0), 0);
  const linked = linkedItems(s, data.projects, data.exams);
  return `<article class="card">
    <div class="spread"><span class="tag">${esc(phaseLabel(s.phase))}</span>${!s.levelSet ? '<span class="tag tag-amber">Set your level</span>' : ''}</div>
    <h3 style="margin:.4rem 0 .2rem"><a href="#/skills/${s.id}">${esc(s.name)}</a></h3>
    <p class="small muted" style="margin-bottom:.4rem">Level ${lvl} · ${LEVELS[lvl - 1]} → target ${s.targetLevel} · ${LEVELS[s.targetLevel - 1] || ''}</p>
    <div class="seg level-pick" role="group" aria-label="Current level for ${esc(s.name)}">${LEVELS.map((name, i) => `<button type="button" class="r-accent" data-act="level" data-id="${s.id}" data-l="${i + 1}" aria-pressed="${lvl === i + 1}" title="${name}" aria-label="${i + 1} ${name}">${i + 1}</button>`).join('')}</div>
    <div class="spread small muted" style="margin:.6rem 0 .25rem"><span>${done}/${s.landmarks.length} landmarks</span><span>${Math.round(pct)}%</span></div>
    ${progressBar(pct, { small: true, label: s.name + ' landmarks' })}
    ${s.dailyTargetMin ? (() => {
      const m = skillMinutesOn(s);
      const p = (m / s.dailyTargetMin) * 100;
      const st = skillStreak(s);
      return `<div class="habit">${ring(p, { size: 40, stroke: 5, tone: p >= 100 ? 'green' : 'accent', text: p >= 100 ? '✓' : '', label: 'Today' })}
        <div class="grow small"><strong>${fmtMinutes(m)} / ${fmtMinutes(s.dailyTargetMin)}</strong> today${st ? `<br><span class="streak">${icon('flame', 13)} ${st} day streak</span>` : ''}</div></div>`;
    })() : ''}
    <p class="small" style="margin:.5rem 0">${next ? `<strong>Next:</strong> ${esc(next.text)}` : s.landmarks.length ? '🎉 All landmarks reached' : '<span class="muted">No landmarks yet</span>'}</p>
    ${linked.projects.length || linked.exams.length ? `<div class="small" style="margin-bottom:.5rem">
      ${linked.projects.map((p) => `<div class="spread"><a href="#/projects/${p.id}">${esc(p.title)}</a><span>${Math.round(projectProgress(p))}%</span></div>`).join('')}
      ${linked.exams.map((e) => `<div><div class="spread"><a href="#/exams/${e.id}">${esc(e.title)}</a><span>${readiness(e) == null ? 'no topics' : Math.round(readiness(e)) + '% ready'}</span></div>${e.topics.length ? readinessMeter(topicCounts(e.topics), { showLegend: false }) : ''}</div>`).join('')}
    </div>` : ''}
    <div class="spread"><span class="small muted">${mins ? fmtMinutes(mins) + ' this week' : 'No practice this week'}</span>
      <button class="btn btn-small" data-act="quick" data-id="${s.id}" title="Log ${esc(s.quickLog.note)} today">+ ${fmtMinutes(s.quickLog.minutes)} ${esc(s.quickLog.note.toLowerCase())}</button></div>
  </article>`;
}

/** Add, rename, reorder sections and edit their sub-groups. */
function manageSections(sections, skills) {
  let rows = sections.map((s) => ({ ...s }));
  const { dlg, close, done } = openDialog(`<div class="modal-body"><h2 class="modal-title">Manage sections</h2><div data-rows></div>
    <button class="btn btn-small" data-add>+ Add section</button>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-save>Save</button></div></div>`, { wide: true, label: 'Manage sections' });
  const host = dlg.querySelector('[data-rows]');
  const draw = () => {
    host.innerHTML = rows.map((s, i) => `<fieldset class="card" style="margin-bottom:.6rem"><legend class="sr-only">Section ${i + 1}</legend>
      <div class="row-wrap">
        <label class="grow">Name <input data-f="name" data-i="${i}" value="${esc(s.name)}"></label>
        <button class="icon-btn" data-mv="-1" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-btn" data-mv="1" data-i="${i}" aria-label="Move down" ${i === rows.length - 1 ? 'disabled' : ''}>↓</button>
        <button class="icon-btn danger" data-del="${i}" aria-label="Delete section">✕</button>
      </div>
      <label class="small">Sub-groups (comma separated) <input data-f="subgroups" data-i="${i}" value="${esc((s.subgroups || []).join(', '))}"></label>
    </fieldset>`).join('');
  };
  draw();
  host.addEventListener('input', (e) => {
    const i = e.target.dataset.i;
    if (e.target.dataset.f === 'name') rows[i].name = e.target.value;
    if (e.target.dataset.f === 'subgroups') rows[i].subgroups = e.target.value.split(',').map((x) => x.trim()).filter(Boolean);
  });
  host.addEventListener('click', async (e) => {
    const mv = e.target.closest('[data-mv]');
    const del = e.target.closest('[data-del]');
    if (mv) {
      rows = move(rows, +mv.dataset.i, +mv.dataset.mv);
      draw();
    }
    if (del) {
      const s = rows[+del.dataset.del];
      const n = skills.filter((k) => k.sectionId === s.id).length;
      if (n) return toast(`Move or delete the ${n} skill${n === 1 ? '' : 's'} in “${s.name}” first.`);
      if (!(await confirmDialog(`Delete the section “${s.name}”?`))) return;
      rows.splice(+del.dataset.del, 1);
      draw();
    }
  });
  dlg.querySelector('[data-add]').addEventListener('click', () => {
    rows.push({ id: uid(), name: 'New section', subgroups: [] });
    draw();
    host.querySelector(`[data-i="${rows.length - 1}"][data-f=name]`).select();
  });
  dlg.querySelector('[data-save]').addEventListener('click', () => close(true));
  done.then(async (ok) => {
    if (!ok) return;
    const keep = new Set(rows.map((r) => r.id));
    for (const s of sections) if (!keep.has(s.id)) await db.del('sections', s.id);
    for (const [i, r] of rows.entries()) await db.put('sections', { ...r, name: r.name.trim() || 'Untitled', order: i });
    toast('Sections saved.');
    rerender();
  });
}
