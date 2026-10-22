import { loadAll } from '../model.js';
import { esc, today, fmtDate, parseDate, isoDate, hasDate, isClosed, countdown, daysUntil } from '../util.js';
import { bind, pageHead, download, toast } from '../ui.js';
import { rerender, query } from '../router.js';
import { icon } from '../icons.js';
import { KIND_LABEL } from '../planner.js';
import { setAssistant } from '../assistant.js';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
let selected = null;

function eventsFrom(data) {
  const ev = [];
  for (const p of data.projects) {
    if (hasDate(p.deadline)) ev.push({ date: p.deadline.date, type: 'project', title: `${p.title} due`, href: `#/projects/${p.id}`, done: isClosed(p) });
    for (const t of p.tasks) if (t.due) ev.push({ date: t.due, type: 'task', title: t.name, sub: p.title, href: `#/projects/${p.id}`, done: t.done });
  }
  for (const e of data.exams) if (hasDate(e.date)) ev.push({ date: e.date.date, type: 'exam', title: e.title, href: `#/exams/${e.id}` });
  for (const plan of data.plans) {
    const exam = data.exams.find((e) => e.id === plan.id);
    if (!exam) continue;
    for (const it of plan.items) {
      const tp = exam.topics.find((t) => t.id === it.topicId);
      ev.push({ date: it.date, type: 'plan', title: `${KIND_LABEL[it.kind]}: ${tp?.name || exam.title}`, sub: exam.title, href: tp ? `#/exams/${exam.id}/topics/${tp.id}` : `#/exams/${exam.id}`, done: it.done, minutes: it.minutes });
    }
  }
  const order = { exam: 0, project: 1, task: 2, plan: 3 };
  return ev.sort((a, b) => a.date.localeCompare(b.date) || order[a.type] - order[b.type]);
}

export async function render(el) {
  const data = await loadAll();
  const events = eventsFrom(data);
  const t = today();
  const ym = query().get('m') || t.slice(0, 7);
  const [y, m] = ym.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startOffset = (first.getDay() + 6) % 7; // Monday first
  const gridStart = new Date(y, m - 1, 1 - startOffset);
  const prev = isoDate(new Date(y, m - 2, 1)).slice(0, 7);
  const next = isoDate(new Date(y, m, 1)).slice(0, 7);
  if (!selected || selected.slice(0, 7) !== ym) selected = ym === t.slice(0, 7) ? t : `${ym}-01`;
  const byDate = new Map();
  for (const e of events) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }

  const cells = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const key = isoDate(d);
    const evs = byDate.get(key) || [];
    cells.push(`<button type="button" class="cal-day ${d.getMonth() !== m - 1 ? 'other' : ''} ${key === t ? 'today' : ''}" data-act="day" data-d="${key}" aria-pressed="${key === selected}" aria-label="${fmtDate(key, { weekday: true })}${evs.length ? `, ${evs.length} item${evs.length === 1 ? '' : 's'}` : ''}">
      <span class="cal-num">${d.getDate()}</span>
      ${evs.slice(0, 3).map((e) => `<span class="cal-ev ev-${e.type}">${esc(e.title)}</span>`).join('')}${evs.length > 3 ? `<span class="small muted">+${evs.length - 3}</span>` : ''}
      <span class="cal-dots">${evs.slice(0, 6).map((e) => `<i class="cal-dot dot-${e.type}"></i>`).join('')}</span></button>`);
  }
  const dayEvents = byDate.get(selected) || [];
  const nextUp = events.filter((e) => e.date >= t && !e.done && e.type !== 'plan').slice(0, 6);

  el.innerHTML = `
    ${pageHead('Calendar', `<button class="btn" data-act="ics">${icon('download', 16)} Add to my calendar (.ics)</button>`, 'Deadlines, tasks, exams and revision sessions.')}
    <div class="grid-main">
      <section class="card">
        <div class="cal-head">
          <a class="icon-btn" href="#/calendar?m=${prev}" aria-label="Previous month">${icon('left')}</a>
          <h2>${MONTHS[m - 1]} ${y}</h2>
          <a class="icon-btn" href="#/calendar?m=${next}" aria-label="Next month">${icon('chevron')}</a>
          ${ym !== t.slice(0, 7) ? `<a class="btn btn-small" href="#/calendar">Today</a>` : ''}
        </div>
        <div class="cal" role="grid">
          ${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="cal-dow" role="columnheader">${d}</div>`).join('')}
          ${cells.join('')}
        </div>
        <div class="row-wrap small muted mt"><span><i class="cal-dot dot-exam" style="display:inline-block"></i> Exam</span><span><i class="cal-dot dot-project" style="display:inline-block"></i> Deadline</span><span><i class="cal-dot dot-task" style="display:inline-block"></i> Task</span><span><i class="cal-dot dot-plan" style="display:inline-block"></i> Revision</span></div>
      </section>
      <div class="stack">
        <section class="card" aria-labelledby="h-day">
          <div class="card-head"><h2 id="h-day">${selected === t ? 'Today' : fmtDate(selected, { weekday: true })}</h2></div>
          ${dayEvents.length ? `<ul class="list">${dayEvents.map(evRow).join('')}</ul>` : `<p class="muted small">Nothing on this day.</p>`}
        </section>
        <section class="card" aria-labelledby="h-next">
          <div class="card-head"><h2 id="h-next">Coming up</h2></div>
          ${nextUp.length ? `<ul class="list">${nextUp.map((e) => evRow(e, true)).join('')}</ul>` : `<p class="muted small">Nothing dated coming up.</p>`}
        </section>
      </div>
    </div>`;

  setAssistant({ key: 'calendar', title: 'Calendar', questions: ['Which week looks busiest, and how should I prepare?', 'Plan my next 7 days around these dates'] });

  bind(el, {
    day: (b) => {
      selected = b.dataset.d;
      rerender();
    },
    ics: () => {
      download(`tracker-${t}.ics`, buildIcs(events.filter((e) => e.type !== 'plan' || !e.done)), 'text/calendar');
      toast('Calendar file downloaded. Open it to add the events to your calendar app.');
    },
  });
}

function evRow(e, showDate = false) {
  const d = daysUntil(e.date);
  return `<li><span class="list-icon ${e.type === 'exam' ? 'red' : ''}">${icon({ exam: 'cap', project: 'folder', task: 'check', plan: 'route' }[e.type], 16)}</span>
    <a class="list-link grow" href="${e.href}"><span class="title" ${e.done ? 'style="text-decoration:line-through;color:var(--text-3)"' : ''}>${esc(e.title)}</span><br>
    <span class="small muted">${e.sub ? esc(e.sub) + ' · ' : ''}${showDate ? `${fmtDate(e.date)} · ${countdown(d)}` : e.minutes ? `${e.minutes} min` : e.type}</span></a></li>`;
}

/** All-day events in iCalendar format. */
function buildIcs(events) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const escIcs = (s) => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
  const next = (d) => {
    const x = parseDate(d);
    x.setDate(x.getDate() + 1);
    return isoDate(x).replace(/-/g, '');
  };
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tracker//EN', 'CALSCALE:GREGORIAN'];
  events.forEach((e, i) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${e.date}-${e.type}-${i}@tracker`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${e.date.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${next(e.date)}`,
      `SUMMARY:${escIcs((e.type === 'exam' ? '📝 ' : e.type === 'project' ? '📌 ' : '') + e.title)}`,
      e.sub ? `DESCRIPTION:${escIcs(e.sub)}` : '',
      'END:VEVENT'
    );
  });
  lines.push('END:VCALENDAR');
  return lines.filter(Boolean).join('\r\n');
}
