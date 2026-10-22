import * as db from '../db.js';
import { effectiveLevel, suggestedLevel, landmarkPct, nextLandmark, linkedItems, projectProgress, readiness, topicCounts, newLandmark, defaultLevelDescriptions } from '../model.js';
import { esc, LEVELS, phaseLabel, today, weekStart, fmtDate, fmtMinutes, uid, move, parseDate, isoDate, ratingInfo } from '../util.js';
import { bind, progressBar, emptyState, formModal, confirmDialog, toast, readinessMeter } from '../ui.js';
import { rerender, go } from '../router.js';
import { editSkill, resourceFields, practiceFields, suggestLandmarks, suggestResources, slimSkill } from '../forms.js';
import { chartFigure, barChart } from '../charts.js';
import { icon } from '../icons.js';
import { setAssistant } from '../assistant.js';
import { skillMinutesOn, skillStreak } from '../model.js';
import { ring } from '../ui.js';
import { cardListHtml, cardHandlers, addCard, generateCards, cardStats } from '../study-ui.js';
import { studyQueue } from '../srs.js';
import { openTimer } from '../timer.js';

export async function render(el, { id }) {
  const s = await db.get('skills', id);
  if (!s) {
    el.innerHTML = `<div class="card"><h1>Skill not found</h1><p><a href="#/skills">Back to skills</a></p></div>`;
    return;
  }
  const [sections, projects, exams, files, allCards] = await Promise.all(['sections', 'projects', 'exams', 'files', 'cards'].map((x) => db.getAll(x)));
  const cards = allCards.filter((c) => c.skillId === id);
  const cs = cardStats(cards);
  const section = sections.find((x) => x.id === s.sectionId);
  const lvl = effectiveLevel(s);
  const sug = suggestedLevel(s);
  const pct = landmarkPct(s);
  const next = nextLandmark(s);
  const linked = linkedItems(s, projects, exams);

  // weekly practice totals, last 8 weeks
  const weeks = [];
  const start = parseDate(weekStart(today()));
  for (let i = 7; i >= 0; i--) {
    const d = new Date(start);
    d.setDate(d.getDate() - i * 7);
    weeks.push(isoDate(d));
  }
  const weekTotals = weeks.map((w, i) => {
    const end = weeks[i + 1] || '9999';
    return s.practice.filter((p) => p.date >= w && p.date < end).reduce((m, p) => m + (p.minutes || 0), 0);
  });
  const weekLabels = weeks.map((w) => fmtDate(w).replace(/ \d{4}$/, ''));
  const practice = [...s.practice].sort((a, b) => b.date.localeCompare(a.date));

  const evidenceLabel = (e) => {
    if (e.kind === 'project') {
      const p = projects.find((x) => x.id === e.refId);
      return p ? `<a href="#/projects/${p.id}">${esc(p.title)}</a>` : '<span class="muted">(deleted project)</span>';
    }
    if (e.kind === 'file') {
      const f = files.find((x) => x.id === e.refId);
      return f ? `<button class="btn btn-link btn-small" style="padding:0" data-act="open-file" data-id="${f.id}">${esc(f.name)}</button>` : '<span class="muted">(deleted file)</span>';
    }
    return `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.url)}</a>`;
  };

  el.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/skills?tab=${s.sectionId}">← ${esc(section?.name || 'Skills')}</a></nav>
    <header class="page-head"><div>
        <div class="tags"><span class="tag">${esc(phaseLabel(s.phase))}</span>${s.subgroup ? `<span class="tag">${esc(s.subgroup)}</span>` : ''}</div>
        <h1 style="margin-top:.35rem">${esc(s.name)}</h1></div>
      <div class="page-actions"><button class="btn" data-act="practise">${icon('timer', 16)} Practise now</button><button class="btn" data-act="edit">Edit</button><button class="btn btn-danger" data-act="delete">Delete</button></div></header>
    ${s.dailyTargetMin ? (() => {
      const m = skillMinutesOn(s);
      const p = (m / s.dailyTargetMin) * 100;
      const st = skillStreak(s);
      return `<div class="habit" style="margin-bottom:1rem">${ring(p, { size: 52, stroke: 6, tone: p >= 100 ? 'green' : 'accent', label: 'Today' })}
        <div class="grow"><strong>${fmtMinutes(m)} of ${fmtMinutes(s.dailyTargetMin)} today</strong>${st ? ` · <span class="streak">${icon('flame', 14)} ${st} day streak</span>` : ''}<br><span class="small muted">Daily target. Change it with Edit.</span></div>
        ${p < 100 ? `<button class="btn btn-primary btn-small" data-act="quick">+ ${fmtMinutes(s.quickLog.minutes)}</button>` : ''}</div>`;
    })() : ''}

    <div class="grid-2">
      <section class="card" aria-labelledby="h-level">
        <div class="card-head"><h2 id="h-level">Level</h2><span class="big-num">${lvl}<span class="small muted"> / 5</span></span></div>
        ${!s.levelSet ? `<p class="banner banner-info" style="margin-bottom:.6rem">Starting level. Tap your real level below.</p>` : ''}
        <div class="seg level-pick" role="group" aria-label="Current level">${LEVELS.map((n, i) => `<button type="button" class="r-accent" data-act="level" data-l="${i + 1}" aria-pressed="${lvl === i + 1}" aria-label="${i + 1} ${n}">${i + 1}<span class="lvl-name"> ${n}</span></button>`).join('')}</div>
        <p class="small muted mt">${s.levelOverride != null ? `Set by you. Landmarks suggest level ${sug} (${LEVELS[sug - 1]}).` : `Suggested from landmarks.`}
          ${s.levelOverride != null && s.levelOverride !== sug ? `<button class="btn btn-small" data-act="use-suggested">Use suggested</button>` : ''}</p>
        <label class="inline">Target level <select data-act="target" style="width:auto">${LEVELS.map((n, i) => `<option value="${i + 1}" ${s.targetLevel === i + 1 ? 'selected' : ''}>${i + 1} · ${n}</option>`).join('')}</select></label>
        <div class="card-head mt"><h3 style="margin:0">What each level means</h3><button class="btn btn-small" data-act="edit-desc">Edit</button></div>
        <ol class="list level-desc">${LEVELS.map((n, i) => `<li class="${lvl === i + 1 ? 'current' : ''}"><div><strong>${i + 1} · ${n}</strong>${s.targetLevel === i + 1 ? ' <span class="tag tag-green">target</span>' : ''}<br><span class="small">${esc(s.levelDescriptions?.[i] || '')}</span></div></li>`).join('')}</ol>
      </section>

      <section class="card" aria-labelledby="h-next">
        <div class="card-head"><h2 id="h-next">What to do next</h2><button class="btn btn-small" data-act="edit-plan">Edit plan</button></div>
        ${next ? `<p><strong>Next landmark:</strong> ${esc(next.text)}</p><button class="btn btn-small btn-primary" data-act="tick-next">✓ Mark as reached</button>` : s.landmarks.length ? '<p>🎉 Every landmark reached. Add more or raise your target.</p>' : '<p class="muted">No landmarks yet.</p>'}
        <h3 class="mt">Action notes</h3>
        ${s.actionNotes ? `<p class="pre">${esc(s.actionNotes)}</p>` : '<p class="muted small">No notes yet. Use “Edit plan” (you can ask AI to fill it in).</p>'}
        <h3>Future goals</h3>
        ${s.goals ? `<p class="pre">${esc(s.goals)}</p>` : '<p class="muted small">No goals yet.</p>'}
      </section>
    </div>

    <section class="card mt" aria-labelledby="h-lm">
      <div class="card-head"><h2 id="h-lm">Landmarks</h2>
        <div class="row-wrap"><button class="btn btn-ai btn-small" data-act="ai-lm">✨ Suggest with AI</button><button class="btn btn-small btn-primary" data-act="add-lm">+ Add landmark</button></div></div>
      <div class="spread small muted"><span>${s.landmarks.filter((l) => l.done).length}/${s.landmarks.length} reached</span><span>${Math.round(pct)}%</span></div>
      ${progressBar(pct, { label: 'Landmarks reached' })}
      ${s.landmarks.length ? `<ol class="list mt">${s.landmarks.map((l, i) => `<li class="${l.done ? 'done' : ''}">
        <input type="checkbox" class="check" data-act="tick" data-id="${l.id}" ${l.done ? 'checked' : ''} aria-label="Reached: ${esc(l.text)}">
        <div class="grow"><span class="title">${esc(l.text)}</span>${l.done && l.doneAt ? `<br><span class="small muted">Reached ${fmtDate(l.doneAt)}</span>` : ''}</div>
        <div class="actions">
          <button class="icon-btn" data-act="lm-up" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="icon-btn" data-act="lm-down" data-i="${i}" aria-label="Move down" ${i === s.landmarks.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="icon-btn" data-act="lm-edit" data-id="${l.id}" aria-label="Edit landmark">✎</button>
          <button class="icon-btn danger" data-act="lm-del" data-id="${l.id}" aria-label="Delete landmark">✕</button></div></li>`).join('')}</ol>`
      : emptyState('Add your first landmark.')}
    </section>

    <section class="card mt" aria-labelledby="h-cards">
      <div class="card-head"><h2 id="h-cards">${icon('cards', 20)} Flashcards</h2>
        <div class="row-wrap">${cs.total ? `<a class="btn btn-small btn-primary" href="#/study/review?skill=${id}">${studyQueue(cards).length ? `Review (${studyQueue(cards).length})` : 'Practise'}</a>` : ''}
          <button class="btn btn-small" data-act="add-card">${icon('plus', 14)} Add</button><button class="btn btn-small btn-ai" data-act="gen-cards">${icon('sparkles', 14)} Generate</button></div></div>
      ${cs.total ? `<details><summary class="small">${cs.total} cards · ${cs.mastered} mastered</summary>${cardListHtml(cards)}</details>` : '<p class="muted small">Useful for shortcuts, commands, syntax, standards (e.g. BS 8888 conventions) and theory.</p>'}
    </section>

    ${linked.projects.length || linked.exams.length ? `<section class="card mt" aria-labelledby="h-linked">
      <h2 id="h-linked">Linked uni work · ${esc(s.module)}</h2>
      <ul class="list">
        ${linked.projects.map((p) => `<li><div class="grow"><a href="#/projects/${p.id}" class="title">${esc(p.title)}</a>${progressBar(projectProgress(p), { small: true, label: p.title })}</div><span class="small">${Math.round(projectProgress(p))}%</span></li>`).join('')}
        ${linked.exams.map((e) => `<li><div class="grow"><a href="#/exams/${e.id}" class="title">${esc(e.title)}</a>${readinessMeter(topicCounts(e.topics))}
          ${e.topics.length ? `<div class="tags" style="margin-top:.3rem">${e.topics.map((t) => `<span class="tag tag-${ratingInfo(t.rating).color}">${esc(t.name)}</span>`).join('')}</div>` : ''}</div>
          <span class="small">${readiness(e) == null ? '–' : Math.round(readiness(e)) + '%'}</span></li>`).join('')}
      </ul></section>` : ''}

    <div class="grid-2 mt">
      <section class="card" aria-labelledby="h-prac">
        <div class="card-head"><h2 id="h-prac">Practice log</h2>
          <div class="row-wrap"><button class="btn btn-small btn-primary" data-act="quick">+ ${fmtMinutes(s.quickLog.minutes)} ${esc(s.quickLog.note.toLowerCase())}</button><button class="btn btn-small" data-act="add-prac">Custom entry</button></div></div>
        ${chartFigure('c-week', 'Minutes per week', ['Week of', 'Minutes'], weeks.map((w, i) => [fmtDate(w), weekTotals[i]]))}
        ${practice.length ? `<ul class="list mt">${practice.slice(0, 15).map((p) => `<li><div class="grow"><span class="small muted">${fmtDate(p.date)} · ${fmtMinutes(p.minutes)}</span>${p.note ? `<br>${esc(p.note)}` : ''}</div>
          <div class="actions"><button class="icon-btn danger" data-act="del-prac" data-id="${p.id}" aria-label="Delete entry">✕</button></div></li>`).join('')}</ul>
          ${practice.length > 15 ? `<p class="small muted">Showing the latest 15 of ${practice.length} entries.</p>` : ''}` : ''}
      </section>
      <div class="stack">
        <section class="card" aria-labelledby="h-res">
          <div class="card-head"><h2 id="h-res">Resources</h2>
            <div class="row-wrap"><button class="btn btn-ai btn-small" data-act="ai-res">✨ Suggest</button><button class="btn btn-small btn-primary" data-act="add-res">+ Add</button></div></div>
          ${s.resources.length ? `<ul class="list">${s.resources.map((r) => `<li><div class="grow"><span class="tag">${esc(r.kind)}</span> ${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>` : `<span class="title">${esc(r.title)}</span>`}${r.notes ? `<br><span class="small muted">${esc(r.notes)}</span>` : ''}</div>
            <div class="actions"><button class="icon-btn" data-act="edit-res" data-id="${r.id}" aria-label="Edit resource">✎</button><button class="icon-btn danger" data-act="del-res" data-id="${r.id}" aria-label="Delete resource">✕</button></div></li>`).join('')}</ul>`
          : `<p class="muted small">Courses, books, videos, links and software tutorials.</p>`}
        </section>
        <section class="card" aria-labelledby="h-ev">
          <div class="card-head"><h2 id="h-ev">Evidence</h2><button class="btn btn-small btn-primary" data-act="add-ev">+ Add</button></div>
          ${s.evidence.length ? `<ul class="list">${s.evidence.map((e) => `<li><div class="grow"><span class="tag">${esc(e.kind)}</span> ${evidenceLabel(e)}${e.note ? `<br><span class="small muted">${esc(e.note)}</span>` : ''}</div>
            <div class="actions"><button class="icon-btn danger" data-act="del-ev" data-id="${e.id}" aria-label="Remove evidence">✕</button></div></li>`).join('')}</ul>`
          : `<p class="muted small">Link a project, file or URL that shows this skill.</p>`}
        </section>
      </div>
    </div>`;

  barChart('c-week', weekLabels, weekTotals, { label: 'Minutes', suffix: ' min' });

  const save = async (fn) => {
    await db.update('skills', id, fn);
    rerender();
  };
  const lmById = (lid) => s.landmarks.find((l) => l.id === lid);
  const tick = (lid, done) => save((r) => {
    const l = r.landmarks.find((x) => x.id === lid);
    l.done = done;
    l.doneAt = done ? today() : null;
  });

  setAssistant({
    key: `skill:${id}`,
    title: s.name,
    data: { skill: slimSkill(s), practiceLast14Days: s.practice.filter((p) => p.date >= weeks[6]).map((p) => ({ date: p.date, minutes: p.minutes, note: p.note })) },
    questions: ['What should I practise this week?', 'Give me a 30-minute practice exercise', 'How do I get from my level to my target?'],
    actions: [
      { label: 'Suggest landmarks', icon: 'target', run: () => el.querySelector('[data-act=ai-lm]')?.click() },
      { label: 'Suggest resources', icon: 'book', run: () => el.querySelector('[data-act=ai-res]')?.click() },
      { label: 'Plan next steps', icon: 'route', run: () => el.querySelector('[data-act=edit-plan]')?.click() },
      { label: 'Make flashcards', icon: 'cards', run: () => el.querySelector('[data-act=gen-cards]')?.click() },
    ],
    onSave: { label: 'Add to action notes', run: async (text) => { await db.update('skills', id, (r) => { r.actionNotes = r.actionNotes ? `${r.actionNotes}\n\n${text}` : text; }); rerender(); } },
  });

  bind(el, {
    practise: () => openTimer({ type: 'skill', id, label: s.name }),
    'add-card': async () => (await addCard({ skillId: id, context: { skill: s.name } })) && rerender(),
    'gen-cards': async () => (await generateCards({ skill: s })) && rerender(),
    ...cardHandlers(cards, rerender),
    edit: async () => (await editSkill(s)) && rerender(),
    delete: async () => {
      if (!(await confirmDialog(`Delete “${s.name}” with its landmarks, practice log, resources and evidence?`))) return;
      await db.del('skills', id);
      toast('Skill deleted.');
      go(`#/skills?tab=${s.sectionId}`);
    },
    level: (b) => save((r) => { r.levelOverride = Number(b.dataset.l); r.levelSet = true; }),
    'use-suggested': () => save((r) => { r.levelOverride = null; r.levelSet = true; }),
    target: (sel) => save((r) => { r.targetLevel = Number(sel.value); }),
    'edit-desc': async () => {
      const fields = LEVELS.map((n, i) => ({ name: `d${i}`, label: `${i + 1} · ${n}`, type: 'textarea', rows: 2 }));
      const values = Object.fromEntries(LEVELS.map((_, i) => [`d${i}`, s.levelDescriptions?.[i] || '']));
      const v = await formModal({ title: 'What each level means', fields, values, ai: { about: `what each level 1–5 means for the skill “${s.name}”, concrete and specific`, context: { skill: slimSkill(s) } } });
      if (v) save((r) => { r.levelDescriptions = LEVELS.map((_, i) => v[`d${i}`]); });
    },
    'edit-plan': async () => {
      const fields = [
        { name: 'actionNotes', label: 'What to do next (action notes)', type: 'textarea', rows: 5 },
        { name: 'goals', label: 'Future goals', type: 'textarea', rows: 4 },
      ];
      const v = await formModal({ title: `Plan for ${s.name}`, fields, values: s, ai: { about: 'a practical plan: concrete next actions for this week and longer-term goals for this skill', context: { skill: slimSkill(s) } } });
      if (v) save((r) => Object.assign(r, v));
    },
    'tick-next': () => tick(next.id, true),
    tick: (c) => tick(c.dataset.id, c.checked),
    'add-lm': async () => {
      const v = await formModal({ title: 'Add landmark', fields: [{ name: 'text', label: 'Landmark', required: true }], ai: { about: 'the next landmark for this skill', context: { skill: slimSkill(s) } } });
      if (v) save((r) => { r.landmarks.push(newLandmark(v.text)); });
    },
    'lm-edit': async (b) => {
      const l = lmById(b.dataset.id);
      const v = await formModal({ title: 'Edit landmark', fields: [{ name: 'text', label: 'Landmark', required: true }, { name: 'doneAt', label: 'Date reached (if reached)', type: 'date' }], values: l, ai: false });
      if (v) save((r) => Object.assign(r.landmarks.find((x) => x.id === l.id), { text: v.text, doneAt: v.doneAt || null, done: l.done || !!v.doneAt }));
    },
    'lm-del': async (b) => {
      const l = lmById(b.dataset.id);
      if (await confirmDialog(`Delete landmark “${l.text}”?`)) save((r) => { r.landmarks = r.landmarks.filter((x) => x.id !== l.id); });
    },
    'lm-up': (b) => save((r) => { r.landmarks = move(r.landmarks, +b.dataset.i, -1); }),
    'lm-down': (b) => save((r) => { r.landmarks = move(r.landmarks, +b.dataset.i, 1); }),
    'ai-lm': async () => {
      const items = await suggestLandmarks(s);
      if (items.length) save((r) => {
        r.landmarks.push(...items);
        if (!r.levelDescriptions?.some(Boolean)) r.levelDescriptions = defaultLevelDescriptions(r.landmarks);
      });
    },

    quick: () => save((r) => { r.practice.push({ id: uid(), date: today(), minutes: s.quickLog.minutes, note: s.quickLog.note }); }).then(() => toast(`Logged ${fmtMinutes(s.quickLog.minutes)}.`)),
    'add-prac': async () => {
      const v = await formModal({ title: 'Log practice', fields: practiceFields(), values: { date: today(), minutes: s.quickLog.minutes }, ai: { about: 'a practice log entry for this skill', context: { skill: s.name } } });
      if (v) save((r) => { r.practice.push({ id: uid(), date: v.date, minutes: v.minutes, note: v.note }); });
    },
    'del-prac': async (b) => {
      if (await confirmDialog('Delete this practice entry?')) save((r) => { r.practice = r.practice.filter((p) => p.id !== b.dataset.id); });
    },

    'add-res': async () => {
      const v = await formModal({ title: 'Add resource', fields: resourceFields(), values: { kind: 'Course' }, ai: { about: 'one learning resource for this skill (real, well-known; no made-up links)', context: { skill: slimSkill(s) } } });
      if (v) save((r) => { r.resources.push({ id: uid(), ...v }); });
    },
    'edit-res': async (b) => {
      const res = s.resources.find((x) => x.id === b.dataset.id);
      const v = await formModal({ title: 'Edit resource', fields: resourceFields(), values: res, ai: { about: 'one learning resource', context: { skill: s.name } } });
      if (v) save((r) => { r.resources = r.resources.map((x) => (x.id === res.id ? { ...x, ...v } : x)); });
    },
    'del-res': async (b) => {
      if (await confirmDialog('Delete this resource?')) save((r) => { r.resources = r.resources.filter((x) => x.id !== b.dataset.id); });
    },
    'ai-res': async () => {
      const items = await suggestResources(s);
      if (items.length) save((r) => { r.resources.push(...items.map((x) => ({ id: uid(), kind: 'Other', ...x }))); });
    },

    'add-ev': async () => {
      const v = await formModal({
        title: 'Add evidence',
        fields: [
          { name: 'kind', label: 'Type', type: 'select', options: [{ value: 'project', label: 'Project' }, { value: 'file', label: 'File' }, { value: 'link', label: 'Link' }] },
          { name: 'project', label: 'Project (if type is Project)', type: 'select', options: [{ value: '', label: '—' }, ...projects.map((p) => ({ value: p.id, label: p.title }))] },
          { name: 'file', label: 'File (if type is File)', type: 'select', options: [{ value: '', label: '—' }, ...files.map((f) => ({ value: f.id, label: f.name }))], help: 'Upload files on Practice Tests → Files' },
          { name: 'url', label: 'URL (if type is Link)', type: 'url', placeholder: 'https://' },
          { name: 'note', label: 'Note' },
        ],
        ai: false,
      });
      if (!v) return;
      const refId = v.kind === 'project' ? v.project : v.kind === 'file' ? v.file : null;
      if ((v.kind !== 'link' && !refId) || (v.kind === 'link' && !v.url)) return toast('Choose a project, a file or enter a URL.');
      save((r) => { r.evidence.push({ id: uid(), kind: v.kind, refId, url: v.kind === 'link' ? v.url : null, note: v.note }); });
    },
    'del-ev': async (b) => {
      if (await confirmDialog('Remove this evidence?', { ok: 'Remove' })) save((r) => { r.evidence = r.evidence.filter((x) => x.id !== b.dataset.id); });
    },
    'open-file': async (b) => (await import('../files.js')).openFile(b.dataset.id),
  });
}
