import * as db from '../db.js';
import { loadAll, readiness, topicCounts } from '../model.js';
import { esc, countdown, urgency, daysUntil, hasDate, whenText } from '../util.js';
import { bind, catTag, readinessMeter, categoryFilter, emptyState, pageHead } from '../ui.js';
import { rerender, go } from '../router.js';
import { editExam } from '../forms.js';

export async function render(el) {
  const { exams, tests } = await loadAll();
  const filter = db.getSetting('categoryFilter', 'all');
  const list = exams.filter((e) => filter === 'all' || e.category === filter);
  list.sort((a, b) => (hasDate(a.date) ? a.date.date : a.date?.approxMonth || '9999').localeCompare(hasDate(b.date) ? b.date.date : b.date?.approxMonth || '9999'));

  el.innerHTML = `
    ${pageHead('Exams', `<a class="btn" href="#/subjects">Subjects overview</a><button class="btn btn-primary" data-act="add">+ Add exam</button>`)}
    <div style="margin-bottom:1rem">${categoryFilter(filter)}</div>
    ${list.length ? `<div class="grid">${list.map((e) => {
      const d = hasDate(e.date) ? daysUntil(e.date.date) : null;
      const r = readiness(e);
      const nTests = tests.filter((t) => t.examId === e.id).length;
      return `<a class="card item-card" href="#/exams/${e.id}">
        <div class="tags">${catTag(e.category)}<span class="tag">${esc(e.type)}</span></div>
        <h3>${esc(e.title)}</h3>
        <p class="small muted">${esc(e.module || '')}</p>
        <div class="spread small"><span>${esc(whenText(e.date))}</span>${d != null ? (d >= 0 ? `<span class="urg urg-${urgency(d)}">${countdown(d)}</span>` : `<span class="tag">Past</span>`) : ''}</div>
        <div class="spread small muted" style="margin:.5rem 0 .3rem"><span>${e.topics.length} topics · ${nTests} practice test${nTests === 1 ? '' : 's'}</span><span>${r == null ? '' : Math.round(r) + '% ready'}</span></div>
        ${readinessMeter(topicCounts(e.topics), { showLegend: false })}
      </a>`;
    }).join('')}</div>`
    : emptyState(exams.length ? 'No exams in this category.' : 'Add your first exam.', `<button class="btn btn-primary" data-act="add">+ Add exam</button>`)}`;

  bind(el, {
    filter: (b) => {
      db.setSetting('categoryFilter', b.dataset.cat);
      rerender();
    },
    add: async () => {
      const e = await editExam();
      if (e) go(`#/exams/${e.id}`);
    },
  });
}
