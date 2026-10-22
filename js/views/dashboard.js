import * as db from '../db.js';
import {
  loadAll, upcoming, projectProgress, readiness, topicCounts, focusItems, effectiveLevel, landmarksThisMonth,
  activityByDate, streak, skillMinutesOn, skillStreak,
} from '../model.js';
import { esc, countdown, urgency, fmtDate, whenText, statusLabel, isClosed, daysUntil, today, weekStart, fmtMinutes, LEVELS, uid, parseDate, isoDate } from '../util.js';
import { bind, catTag, ring, toneFor, readinessMeter, categoryFilter, emptyState, download, toast } from '../ui.js';
import { rerender, go } from '../router.js';
import { editProject, quickAddWithAI } from '../forms.js';
import { exportAll } from '../backup.js';
import { icon } from '../icons.js';
import { studyQueue, reviewsOn, isNew } from '../srs.js';
import { KIND_LABEL } from '../planner.js';
import { openTimer } from '../timer.js';
import { setAssistant } from '../assistant.js';
import { apiEnabled } from '../ai.js';

export async function render(el) {
  const data = await loadAll();
  const t = today();
  const filter = db.getSetting('categoryFilter', 'all');
  const inCat = (x) => filter === 'all' || x.category === filter;
  const projects = data.projects.filter(inCat);
  const exams = data.exams.filter(inCat);
  const { dated, tbc } = upcoming(projects, exams);
  const lastExport = await db.getMeta('lastExport');
  const exportDays = lastExport ? -daysUntil(lastExport.slice(0, 10)) : null;
  const examById = Object.fromEntries(data.exams.map((e) => [e.id, e]));
  const testById = Object.fromEntries(data.tests.map((x) => [x.id, x]));

  // activity
  const activity = activityByDate(data);
  const streakDays = streak(activity);
  const week = weekStart(t);
  const weekMinutes = [...activity].filter(([d]) => d >= week).reduce((s, [, v]) => s + v.minutes, 0);
  const newToday = data.cards.filter((c) => (c.history || [])[0]?.date === t).length;
  const dueCards = studyQueue(data.cards, newToday);
  const reviewedToday = reviewsOn(data.cards, t);

  // today's agenda
  const agenda = [];
  for (const p of data.projects) {
    if (isClosed(p)) continue;
    for (const task of p.tasks) {
      if (!task.done && task.due && task.due <= t) agenda.push({ kind: 'task', p, task, overdue: task.due < t });
    }
  }
  const recent = isoDate(new Date(parseDate(t).getTime() - 3 * 86400000));
  for (const plan of data.plans) {
    const exam = examById[plan.id];
    if (!exam) continue;
    for (const it of plan.items) if (!it.done && it.date <= t && it.date >= recent) agenda.push({ kind: 'plan', exam, it, overdue: it.date < t });
  }
  const habits = data.skills.filter((s) => s.dailyTargetMin > 0);
  const soon = dated.filter((i) => i.days >= 0 && i.days <= 3 && i.kind !== 'Task');

  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Up late' : hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const tasksThisWeek = dated.filter((i) => i.days >= 0 && i.days <= 7).length;

  const steps = [
    { ok: data.skills.length && data.skills.every((s) => s.levelSet), label: 'Set your real level on each skill', href: '#/skills' },
    { ok: data.exams.some((e) => e.topics.length), label: 'Add topics to an exam', href: '#/exams' },
    { ok: data.cards.length > 0, label: 'Make your first flashcards', href: '#/study' },
    { ok: data.plans.length > 0, label: 'Build a revision plan for an exam', href: '#/study' },
    { ok: !!lastExport, label: 'Export a backup', href: '#/settings' },
    { ok: apiEnabled(), label: 'Optional: connect Claude for one-click AI', href: '#/settings' },
  ];
  const showSteps = !db.getSetting('hideGettingStarted', false) && steps.some((s) => !s.ok);

  el.innerHTML = `
    <section class="hero">
      <h1>${greet}</h1>
      <p>${esc(fmtDate(t, { weekday: true, long: true }))}${dueCards.length || agenda.length ? ` · ${agenda.length + (dueCards.length ? 1 : 0)} thing${agenda.length + (dueCards.length ? 1 : 0) === 1 ? '' : 's'} on today` : ' · nothing urgent today'}</p>
      <div class="hero-stats">
        <div class="hero-stat"><b>${icon('flame', 18)} ${streakDays}</b><span>day streak</span></div>
        <a class="hero-stat" href="#/study/review"><b>${dueCards.length}</b><span>cards to review</span></a>
        <div class="hero-stat"><b>${tasksThisWeek}</b><span>due in 7 days</span></div>
        <div class="hero-stat"><b>${weekMinutes ? fmtMinutes(weekMinutes) : '0'}</b><span>studied this week</span></div>
      </div>
      <div class="hero-actions">
        <button class="btn btn-small" data-act="timer">${icon('timer', 16)} Focus</button>
        <button class="btn btn-small" data-act="quick-ai">${icon('sparkles', 16)} Quick add</button>
      </div>
    </section>

    ${!lastExport
      ? `<div class="banner banner-warn"><p><strong>No backup yet.</strong> Your data lives only in this browser. Export it to keep it safe and to move it to your other devices.</p><button class="btn btn-primary" data-act="export">${icon('download', 16)} Export all data</button></div>`
      : exportDays > 14
        ? `<div class="banner banner-warn"><p><strong>Backup reminder:</strong> last export was ${exportDays} days ago (${fmtDate(lastExport.slice(0, 10))}).</p><button class="btn btn-primary" data-act="export">${icon('download', 16)} Export now</button></div>`
        : ''}

    <div class="spread" style="margin-bottom:1rem; flex-wrap:wrap">${categoryFilter(filter)}
      <span class="small muted">${lastExport ? `Last export ${fmtDate(lastExport.slice(0, 10))}` : 'Never exported'}</span></div>

    <div class="grid-main">
      <div class="stack">
        <section class="card" aria-labelledby="h-today">
          <div class="card-head"><h2 id="h-today">${icon('target', 20)} Today</h2><span class="small muted">${reviewedToday ? `${reviewedToday} cards reviewed` : ''}</span></div>
          <ul class="list agenda">
            ${dueCards.length ? `<li><span class="list-icon">${icon('cards', 18)}</span><div class="grow"><span class="title">Review ${dueCards.length} flashcard${dueCards.length === 1 ? '' : 's'}</span><br><span class="small muted">${dueCards.filter((c) => !isNew(c)).length} due · ${dueCards.filter(isNew).length} new · about ${Math.max(1, Math.round(dueCards.length * 0.25))} min</span></div><a class="btn btn-small btn-primary" href="#/study/review">Start</a></li>` : ''}
            ${agenda.map((a) => a.kind === 'task'
              ? `<li><input type="checkbox" class="check" data-act="task-done" data-p="${a.p.id}" data-t="${a.task.id}" aria-label="Done: ${esc(a.task.name)}">
                  <div class="grow"><a class="title list-link" href="#/projects/${a.p.id}">${esc(a.task.name)}</a><br><span class="small muted">${esc(a.p.title)} · ${a.overdue ? `<span class="urg urg-red">overdue ${countdown(daysUntil(a.task.due))}</span>` : 'due today'}</span></div></li>`
              : (() => {
                  const topic = a.exam.topics.find((x) => x.id === a.it.topicId);
                  return `<li><input type="checkbox" class="check" data-act="plan-done" data-plan="${a.exam.id}" data-item="${a.it.id}" aria-label="Done: ${esc(KIND_LABEL[a.it.kind])} ${esc(topic?.name || a.exam.title)}">
                    <div class="grow"><span class="kind kind-${a.it.kind}">${KIND_LABEL[a.it.kind]}</span> <a class="title list-link" style="display:inline" href="${topic ? `#/exams/${a.exam.id}/topics/${topic.id}` : `#/exams/${a.exam.id}`}">${esc(topic?.name || a.exam.title)}</a><br>
                    <span class="small muted">${esc(a.exam.title)} · ${a.it.minutes} min${a.overdue ? ' · from ' + fmtDate(a.it.date) : ''}</span></div>
                    <button class="btn btn-small" data-act="focus-topic" data-exam="${a.exam.id}" data-topic="${topic?.id || ''}" data-label="${esc(topic ? topic.name + ' (' + a.exam.title + ')' : a.exam.title)}" data-min="${a.it.minutes}">${icon('play', 14)} Start</button></li>`;
                })()).join('')}
            ${habits.map((s) => {
              const m = skillMinutesOn(s, t);
              const pct = (m / s.dailyTargetMin) * 100;
              const st = skillStreak(s);
              return `<li>${ring(pct, { size: 40, stroke: 5, tone: pct >= 100 ? 'green' : 'accent', text: pct >= 100 ? '✓' : '', label: s.name + ' today' })}
                <div class="grow"><a class="title list-link" href="#/skills/${s.id}">${esc(s.name)}</a><br><span class="small muted">${fmtMinutes(m)} / ${fmtMinutes(s.dailyTargetMin)} today${st ? ` · <span class="streak">${icon('flame', 13)} ${st}</span>` : ''}</span></div>
                ${pct < 100 ? `<button class="btn btn-small" data-act="quick-log" data-id="${s.id}">+ ${fmtMinutes(s.quickLog.minutes)}</button>` : ''}</li>`;
            }).join('')}
            ${soon.map((i) => `<li><span class="list-icon red">${icon(i.kind === 'Project' ? 'folder' : 'cap', 18)}</span><div class="grow"><a class="title list-link" href="${i.href}">${esc(i.title)}</a><br><span class="small muted">${esc(i.kind)} ${countdown(i.days)}</span></div></li>`).join('')}
          </ul>
          ${!dueCards.length && !agenda.length && !habits.length && !soon.length ? emptyState('Nothing scheduled for today.', `<a class="btn" href="#/study">${icon('route', 16)} Make a revision plan</a>`) : ''}
        </section>

        <section class="card" aria-labelledby="h-up">
          <div class="card-head"><h2 id="h-up">${icon('calendar', 20)} Upcoming</h2><a class="small" href="#/calendar">Calendar</a></div>
          ${dated.filter((i) => i.days >= 0).length ? `<ul class="list">${dated.filter((i) => i.days >= 0).slice(0, 10).map(upRow).join('')}</ul>` : emptyState('Nothing dated coming up.', `<button class="btn" data-act="add-project">Add a project</button>`)}
          ${tbc.length ? `<h3 class="eyebrow">Date TBC</h3><ul class="list">${tbc.map((i) => `<li><a class="list-link grow" href="${i.href}"><span class="title">${esc(i.title)}</span><br><span class="small muted">${esc(i.kind)} · ${esc(whenText(i.when))}</span></a>${catTag(i.category)}</li>`).join('')}</ul>` : ''}
        </section>

        <section class="card" aria-labelledby="h-proj">
          <div class="card-head"><h2 id="h-proj">${icon('folder', 20)} Projects</h2><a href="#/projects" class="small">All projects</a></div>
          ${projects.length ? `<ul class="list">${projects.map((p) => {
            const pct = projectProgress(p);
            const d = p.deadline?.date && !p.deadline.tbc ? daysUntil(p.deadline.date) : null;
            return `<li>${ring(pct, { size: 46, stroke: 5, tone: isClosed(p) ? 'green' : 'accent', label: p.title })}<a class="list-link grow" href="#/projects/${p.id}"><span class="title">${esc(p.title)}</span><br>
              <span class="small muted">${esc(statusLabel(p.status))} · ${esc(whenText(p.deadline))}</span></a>${d != null && !isClosed(p) ? `<span class="urg urg-${urgency(d)}">${countdown(d)}</span>` : ''}</li>`;
          }).join('')}</ul>` : emptyState('No projects yet.', `<button class="btn" data-act="add-project">Add your first project</button>`)}
        </section>
      </div>

      <div class="stack">
        ${showSteps ? `<section class="card" aria-labelledby="h-steps">
          <div class="card-head"><h2 id="h-steps">${icon('check', 20)} Getting started</h2><button class="btn btn-small btn-ghost" data-act="hide-steps">Hide</button></div>
          <ul class="steps-list">${steps.map((s) => `<li class="${s.ok ? 'ok' : ''}"><span class="tick">${s.ok ? icon('check', 13) : ''}</span><a href="${s.href}" class="grow">${esc(s.label)}</a></li>`).join('')}</ul>
        </section>` : ''}

        <section class="card" aria-labelledby="h-exam">
          <div class="card-head"><h2 id="h-exam">${icon('cap', 20)} Exam readiness</h2><a href="#/subjects" class="small">Subjects</a></div>
          ${exams.length ? `<ul class="list">${exams.map((e) => {
            const r = readiness(e);
            const d = e.date?.date && !e.date.tbc ? daysUntil(e.date.date) : null;
            return `<li>${ring(r, { size: 46, stroke: 5, tone: toneFor(r), label: e.title + ' readiness' })}<a class="list-link grow" href="#/exams/${e.id}"><span class="title">${esc(e.title)}</span><br>
              <span class="small muted">${e.topics.length ? `${topicCounts(e.topics).confident}/${e.topics.length} topics confident` : 'No topics yet'}</span></a>${d != null && d >= 0 ? `<span class="urg urg-${urgency(d)}">${countdown(d)}</span>` : ''}</li>`;
          }).join('')}</ul>` : emptyState('No exams yet.')}
        </section>

        <section class="card" aria-labelledby="h-act">
          <div class="card-head"><h2 id="h-act">${icon('flame', 20)} Activity</h2><span class="small muted">${streakDays} day streak</span></div>
          ${heatmap(activity)}
          <p class="small muted" style="margin:.5rem 0 0">Study time, practice, flashcards and tests over the last 16 weeks.</p>
        </section>

        ${(() => {
          const focus = projects.filter((p) => !isClosed(p)).flatMap((p) => focusItems(p).map((f) => ({ ...f, project: p })));
          return focus.length ? `<section class="card focus-box" aria-labelledby="h-focus"><div class="card-head"><h2 id="h-focus">${icon('flag', 20)} Needs focus</h2></div>
            <ul class="list">${focus.map((f) => `<li><a class="list-link grow" href="#/projects/${f.project.id}"><span class="title">${esc(f.name)}</span><br><span class="small muted">${esc(f.kind)} · ${esc(f.project.title)}${f.note ? ' — ' + esc(f.note) : ''}</span></a></li>`).join('')}</ul></section>` : '';
        })()}

        <section class="card" aria-labelledby="h-tests">
          <div class="card-head"><h2 id="h-tests">${icon('test', 20)} Latest scores</h2><a href="#/tests" class="small">Practice tests</a></div>
          ${(() => {
            const at = data.attempts.filter((a) => testById[a.testId] && (filter === 'all' || examById[testById[a.testId].examId]?.category === filter)).slice(-5).reverse();
            return at.length ? `<ul class="list">${at.map((a) => `<li><a class="list-link grow" href="#/attempts/${a.id}"><span class="title">${esc(testById[a.testId].title)}</span><br><span class="small muted">${fmtDate(a.date)}</span></a><span class="urg urg-${a.pct >= 70 ? 'green' : a.pct >= 50 ? 'amber' : 'red'}">${Math.round(a.pct)}%</span></li>`).join('')}</ul>`
              : `<p class="muted small">No attempts yet. Build a practice test from your notes.</p>`;
          })()}
        </section>

        <section class="card" aria-labelledby="h-skills">
          <div class="card-head"><h2 id="h-skills">${icon('zap', 20)} Skills</h2><a href="#/skills" class="small">All skills</a></div>
          <ul class="list">${data.sections.map((sec) => {
            const sk = data.skills.filter((s) => s.sectionId === sec.id);
            const avg = sk.length ? sk.reduce((n, s) => n + effectiveLevel(s), 0) / sk.length : 0;
            const lm = sk.reduce((n, s) => n + landmarksThisMonth(s), 0);
            return `<li>${ring((avg / 5) * 100, { size: 42, stroke: 5, text: sk.length ? avg.toFixed(1) : '–', label: sec.name + ' average level' })}<a class="list-link grow" href="#/skills?tab=${sec.id}"><span class="title">${esc(sec.name)}</span><br>
              <span class="small muted">${sk.length} skills${sk.length ? ` · avg ${LEVELS[Math.round(avg) - 1] || ''}` : ''}${lm ? ` · ${lm} landmark${lm === 1 ? '' : 's'} this month` : ''}</span></a></li>`;
          }).join('')}</ul>
        </section>
      </div>
    </div>`;

  setAssistant({
    key: 'home',
    title: 'Today',
    questions: ['What should I focus on today?', 'Plan my next 3 days around my deadlines', 'Which exam am I least ready for, and what should I do about it?'],
  });

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
    'quick-ai': quickAddWithAI,
    timer: () => openTimer(),
    'hide-steps': () => {
      db.setSetting('hideGettingStarted', true);
      rerender();
    },
    'task-done': async (c) => {
      await db.update('projects', c.dataset.p, (p) => {
        const task = p.tasks.find((x) => x.id === c.dataset.t);
        task.done = true;
        task.doneAt = today();
      });
      toast('Task done.');
      rerender();
    },
    'plan-done': async (c) => {
      await db.update('plans', c.dataset.plan, (p) => {
        const it = p.items.find((x) => x.id === c.dataset.item);
        it.done = true;
        it.doneAt = today();
      });
      toast('Session done.');
      rerender();
    },
    'focus-topic': (b) => openTimer(b.dataset.topic ? { type: 'topic', id: b.dataset.topic, examId: b.dataset.exam, label: b.dataset.label } : null),
    'quick-log': async (b) => {
      const s = data.skills.find((x) => x.id === b.dataset.id);
      await db.update('skills', s.id, (r) => { r.practice.push({ id: uid(), date: today(), minutes: s.quickLog.minutes, note: s.quickLog.note }); });
      toast(`Logged ${fmtMinutes(s.quickLog.minutes)} of ${s.name}.`);
      rerender();
    },
  });
}

function upRow(i) {
  const u = urgency(i.days);
  return `<li><a class="list-link grow" href="${i.href}"><span class="title">${esc(i.title)}</span><br>
    <span class="small muted">${esc(i.kind)}${i.sub ? ' · ' + esc(i.sub) : ''} · ${fmtDate(i.date)}</span></a>
    ${catTag(i.category)}<span class="urg urg-${u}" title="${u === 'red' ? 'Under 7 days' : u === 'amber' ? 'Under 21 days' : '21 days or more'}">${esc(countdown(i.days))}</span></li>`;
}

/** GitHub-style activity grid for the last 16 weeks. */
export function heatmap(activity, weeks = 16) {
  const t = today();
  const start = parseDate(weekStart(t));
  start.setDate(start.getDate() - (weeks - 1) * 7);
  const cells = [];
  const d = new Date(start);
  for (let i = 0; i < weeks * 7; i++) {
    const key = isoDate(d);
    const a = activity.get(key);
    const v = a ? a.minutes + a.actions * 2 : 0;
    const lvl = !a ? 0 : v < 15 ? 1 : v < 45 ? 2 : v < 120 ? 3 : 4;
    const future = key > t;
    cells.push(`<span class="heat ${future ? '' : 'l' + lvl} ${key === t ? 'today' : ''}" ${future ? 'style="visibility:hidden"' : ''} title="${fmtDate(key)}: ${a ? `${Math.round(a.minutes)} min, ${a.actions} activities` : 'nothing logged'}"></span>`);
    d.setDate(d.getDate() + 1);
  }
  return `<div class="heatmap" role="img" aria-label="Activity over the last ${weeks} weeks">${cells.join('')}</div>
    <div class="heat-legend small muted">Less <span class="heat"></span><span class="heat l1"></span><span class="heat l2"></span><span class="heat l3"></span><span class="heat l4"></span> More</div>`;
}
