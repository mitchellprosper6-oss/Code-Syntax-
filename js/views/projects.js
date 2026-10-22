import * as db from '../db.js';
import { loadAll, projectProgress, focusItems } from '../model.js';
import { esc, countdown, urgency, daysUntil, hasDate, whenText, statusLabel, isClosed, PROJECT_STATUSES } from '../util.js';
import { bind, catTag, progressBar, categoryFilter, emptyState, pageHead } from '../ui.js';
import { rerender, go } from '../router.js';
import { editProject } from '../forms.js';

export async function render(el) {
  const { projects } = await loadAll();
  const filter = db.getSetting('categoryFilter', 'all');
  const list = projects.filter((p) => filter === 'all' || p.category === filter);
  const order = (p) => (isClosed(p) ? 1 : 0);
  list.sort((a, b) => order(a) - order(b) || (a.deadline?.date || '9999').localeCompare(b.deadline?.date || '9999'));

  el.innerHTML = `
    ${pageHead('Projects', `<button class="btn btn-primary" data-act="add">+ Add project</button>`)}
    <div style="margin-bottom:1rem">${categoryFilter(filter)}</div>
    ${list.length ? `<div class="grid">${list.map(card).join('')}</div>`
      : emptyState(projects.length ? 'No projects in this category.' : 'Add your first project.', `<button class="btn btn-primary" data-act="add">+ Add project</button>`)}`;

  bind(el, {
    filter: (b) => {
      db.setSetting('categoryFilter', b.dataset.cat);
      rerender();
    },
    add: async () => {
      const p = await editProject();
      if (p) go(`#/projects/${p.id}`);
    },
  });
}

function card(p) {
  const pct = Math.round(projectProgress(p));
  const d = hasDate(p.deadline) ? daysUntil(p.deadline.date) : null;
  const flags = focusItems(p).length;
  const tasks = p.tasks.length ? `${p.tasks.filter((t) => t.done).length}/${p.tasks.length} tasks` : 'No tasks yet';
  return `<a class="card item-card" href="#/projects/${p.id}">
    <div class="tags">${catTag(p.category)}<span class="tag">${esc(p.type)}</span><span class="tag">${esc(statusLabel(p.status))}</span>
      ${flags ? `<span class="tag tag-red">🚩 ${flags} focus</span>` : ''}</div>
    <h3>${esc(p.title)}</h3>
    <p class="small muted">${esc(p.module || '')}</p>
    <div class="spread small"><span>${esc(whenText(p.deadline))}</span>${d != null && !isClosed(p) ? `<span class="urg urg-${urgency(d)}">${countdown(d)}</span>` : ''}</div>
    <div class="spread small muted" style="margin:.5rem 0 .25rem"><span>${tasks}</span><span>${pct}%</span></div>
    ${progressBar(pct, { label: p.title + ' progress' })}
  </a>`;
}
