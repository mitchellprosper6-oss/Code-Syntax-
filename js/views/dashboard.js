import * as db from '../db.js';
import { loadAll, upcoming, projectProgress, readiness, topicCounts, focusItems, effectiveLevel, landmarksThisMonth } from '../model.js';
import { esc, countdown, urgency, fmtDate, whenText, statusLabel, isClosed, daysUntil, today, weekStart, fmtMinutes, LEVELS } from '../util.js';
import { bind, catTag, progressBar, readinessMeter, categoryFilter, emptyState, pageHead, openDialog, download, toast } from '../ui.js';
import { rerender, go } from '../router.js';
import { editProject, editExam, editSkill, projectFields, examFields, skillFields } from '../forms.js';
import { exportAll } from '../backup.js';

export async function render(el) {
  const data = await loadAll();
  const filter = db.getSetting('categoryFilter', 'all');
  const inCat = (x) => filter === 'all' || x.category === filter;
  const projects = data.projects.filter(inCat);
  const exams = data.exams.filter(inCat);
  const { dated, tbc } = upcoming(projects, exams);
  const lastExport = await db.getMeta('lastExport');
  const exportDays = lastExport ? -daysUntil(lastExport.slice(0, 10)) : null;
  const unsetLevels = data.skills.filter((s) => !s.levelSet).length;

  const backup = !lastExport
    ? `<div class="banner banner-warn"><p><strong>No backup yet.</strong> Your data lives only in this browser. Export it to keep it safe and to move it to your other devices.</p><button class="btn btn-primary" data-act="export">Export all data</button></div>`
    : exportDays > 14
      ? `<div class="banner banner-warn"><p><strong>Backup reminder:</strong> last export was ${exportDays} days ago (${fmtDate(lastExport.slice(0, 10))}).</p><button class="btn btn-primary" data-act="export">Export now</button></div>`
      : '';

  const focus = projects.filter((p) => !isClosed(p)).flatMap((p) => focusItems(p).map((f) => ({ ...f, project: p })));

  // latest attempts (filtered by the test's exam category)
  const examById = Object.fromEntries(data.exams.map((e) => [e.id, e]));
  const testById = Object.fromEntries(data.tests.map((t) => [t.id, t]));
  const attempts = data.attempts
    .filter((a) => {
      const t = testById[a.testId];
      if (!t) return false;
      return filter === 'all' || examById[t.examId]?.category === filter;
    })
    .slice(-5)
    .reverse();

  const week = weekStart(today());
  el.innerHTML = `
    ${pageHead('Dashboard', `<button class="btn btn-ai" data-act="quick-ai">✨ Quick add with AI</button>`, esc(fmtDate(today(), { weekday: true, long: true })))}
    ${backup}
    ${unsetLevels ? `<div class="banner banner-info"><p>${unsetLevels} skill${unsetLevels === 1 ? '' : 's'} still at the starting level. Set your real level so progress is accurate.</p><a class="btn" href="#/skills">Go to Skills</a></div>` : ''}
    <div class="spread" style="margin-bottom:1rem; flex-wrap:wrap">${categoryFilter(filter)}
      <span class="small muted">${lastExport ? `Last export: ${fmtDate(lastExport.slice(0, 10))}` : 'Never exported'}</span></div>

    <div class="grid-2">
      <section class="card" aria-labelledby="h-up">
        <div class="card-head"><h2 id="h-up">Upcoming</h2><span class="small muted">Deadlines, tasks and exams</span></div>
        ${dated.length ? `<ul class="list">${dated.slice(0, 12).map(upRow).join('')}</ul>` : emptyState('Nothing dated coming up.', `<button class="btn" data-act="add-project">Add a project</button>`)}
      </section>
      <div class="stack">
        <section class="card" aria-labelledby="h-tbc">
          <div class="card-head"><h2 id="h-tbc">Date TBC</h2></div>
          ${tbc.length ? `<ul class="list">${tbc.map((i) => `<li><a class="list-link grow" href="${i.href}"><span class="title">${esc(i.title)}</span><br><span class="small muted">${esc(i.kind)} · ${esc(whenText(i.when))}</span></a>${catTag(i.category)}</li>`).join('')}</ul>` : `<p class="muted small">No items without a date.</p>`}
        </section>
        <section class="card focus-box" aria-labelledby="h-focus">
          <div class="card-head"><h2 id="h-focus">Needs focus</h2></div>
          ${focus.length ? `<ul class="list">${focus.map((f) => `<li><a class="list-link grow" href="#/projects/${f.project.id}"><span class="title">🚩 ${esc(f.name)}</span><br><span class="small muted">${esc(f.kind)} · ${esc(f.project.title)}${f.note ? ' — ' + esc(f.note) : ''}</span></a></li>`).join('')}</ul>` : `<p class="muted small">No focus flags. Flag a task or criterion with 🚩 on a project page.</p>`}
        </section>
      </div>
    </div>

    <div class="grid-2 mt">
      <section class="card" aria-labelledby="h-proj">
        <div class="card-head"><h2 id="h-proj">Projects</h2><a href="#/projects" class="small">All projects</a></div>
        ${projects.length ? `<ul class="list">${projects.map((p) => {
          const pct = Math.round(projectProgress(p));
          return `<li><a class="list-link grow" href="#/projects/${p.id}"><div class="spread"><span class="title">${esc(p.title)}</span><span class="small muted">${pct}%</span></div>
            ${progressBar(pct, { small: true, label: p.title + ' progress' })}<span class="small muted">${esc(statusLabel(p.status))} · ${esc(whenText(p.deadline))}</span></a></li>`;
        }).join('')}</ul>` : emptyState('No projects yet.', `<button class="btn" data-act="add-project">Add your first project</button>`)}
      </section>
      <section class="card" aria-labelledby="h-exam">
        <div class="card-head"><h2 id="h-exam">Exam readiness</h2><a href="#/subjects" class="small">Subjects overview</a></div>
        ${exams.length ? `<ul class="list">${exams.map((e) => {
          const r = readiness(e);
          return `<li><a class="list-link grow" href="#/exams/${e.id}"><div class="spread"><span class="title">${esc(e.title)}</span><span class="small muted">${r == null ? 'No topics' : Math.round(r) + '% confident'}</span></div>
            ${readinessMeter(topicCounts(e.topics), { showLegend: false })}</a></li>`;
        }).join('')}</ul>` : emptyState('No exams yet.', `<button class="btn" data-act="add-exam">Add an exam</button>`)}
      </section>
    </div>

    <div class="grid-2 mt">
      <section class="card" aria-labelledby="h-tests">
        <div class="card-head"><h2 id="h-tests">Latest practice scores</h2><a href="#/tests" class="small">Practice tests</a></div>
        ${attempts.length ? `<ul class="list">${attempts.map((a) => {
          const t = testById[a.testId];
          const u = a.pct >= 70 ? 'green' : a.pct >= 50 ? 'amber' : 'red';
          return `<li><a class="list-link grow" href="#/attempts/${a.id}"><span class="title">${esc(t.title)}</span><br><span class="small muted">${fmtDate(a.date)}</span></a><span class="urg urg-${u}">${Math.round(a.pct)}%</span></li>`;
        }).join('')}</ul>` : `<p class="muted small">No attempts yet. Build a practice test from your notes on the Practice Tests page.</p>`}
      </section>
      <section class="card" aria-labelledby="h-skills">
        <div class="card-head"><h2 id="h-skills">Skills snapshot</h2><a href="#/skills" class="small">All skills</a></div>
        <div class="table-wrap"><table>
          <thead><tr><th>Section</th><th class="num">Skills</th><th class="num">Avg level</th><th class="num">Landmarks this month</th><th class="num">Practice this week</th></tr></thead>
          <tbody>${data.sections.map((sec) => {
            const sk = data.skills.filter((s) => s.sectionId === sec.id);
            const avg = sk.length ? sk.reduce((n, s) => n + effectiveLevel(s), 0) / sk.length : 0;
            const lm = sk.reduce((n, s) => n + landmarksThisMonth(s), 0);
            const mins = sk.reduce((n, s) => n + s.practice.filter((p) => p.date >= week).reduce((m, p) => m + (p.minutes || 0), 0), 0);
            return `<tr><td><a href="#/skills?tab=${sec.id}">${esc(sec.name)}</a></td><td class="num">${sk.length}</td><td class="num">${sk.length ? avg.toFixed(1) : '–'}${sk.length ? ` <span class="small muted">${LEVELS[Math.round(avg) - 1] || ''}</span>` : ''}</td><td class="num">${lm}</td><td class="num">${mins ? fmtMinutes(mins) : '–'}</td></tr>`;
          }).join('')}</tbody></table></div>
      </section>
    </div>`;

  bind(el, {
    filter: (b) => {
      db.setSetting('categoryFilter', b.dataset.cat);
      rerender();
    },
    export: async () => {
      const { filename, text } = await exportAll();
      download(filename, text);
      toast('Backup downloaded.');
      rerender();
    },
    'add-project': async () => {
      const p = await editProject();
      if (p) go(`#/projects/${p.id}`);
    },
    'add-exam': async () => {
      const e = await editExam();
      if (e) go(`#/exams/${e.id}`);
    },
    'quick-ai': quickAdd,
  });
}

function upRow(i) {
  const u = urgency(i.days);
  return `<li><a class="list-link grow" href="${i.href}"><span class="title">${esc(i.title)}</span><br>
    <span class="small muted">${esc(i.kind)}${i.sub ? ' · ' + esc(i.sub) : ''} · ${fmtDate(i.date)}</span></a>
    ${catTag(i.category)}<span class="urg urg-${u}" title="${u === 'red' ? 'Under 7 days' : u === 'amber' ? 'Under 21 days' : '21 days or more'}">${esc(countdown(i.days))}</span></li>`;
}

/** Pick a type, let Claude fill the form from a description, then open the normal form to review. */
async function quickAdd() {
  const { dlg, close, done } = openDialog(
    `<div class="modal-body"><h2 class="modal-title">✨ Quick add with AI</h2>
      <p class="muted">What do you want to add? Next you describe it in your own words; Claude fills in the form and you check it before saving.</p>
      <div class="row-wrap">
        <button class="btn" data-t="project">Project / deadline</button>
        <button class="btn" data-t="exam">Exam / test</button>
        <button class="btn" data-t="skill">Skill / goal</button>
      </div>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button></div></div>`,
    { label: 'Quick add with AI' }
  );
  dlg.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => close(b.dataset.t)));
  const type = await done;
  if (!type) return;
  const { aiFillFields } = await import('../ai.js');
  const fields = type === 'project' ? await projectFields() : type === 'exam' ? await examFields() : await skillFields();
  const about = { project: 'a new project/coursework/deadline', exam: 'a new exam, test or quiz', skill: 'a new skill with my current level, goals and next steps' }[type];
  const values = await aiFillFields({ title: `New ${type}`, fields, current: {}, about });
  if (!values) return;
  const saved = type === 'project' ? await editProject(null, values) : type === 'exam' ? await editExam(null, values) : await editSkill(null, values);
  if (saved) go(`#/${type === 'skill' ? 'skills' : type + 's'}/${saved.id}`);
}
