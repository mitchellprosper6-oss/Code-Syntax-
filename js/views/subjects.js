import * as db from '../db.js';
import { loadAll, setTopicRating } from '../model.js';
import { esc, RATINGS } from '../util.js';
import { bind, categoryFilter, pageHead, emptyState } from '../ui.js';
import { rerender } from '../router.js';

export async function render(el) {
  const { exams } = await loadAll();
  const filter = db.getSetting('categoryFilter', 'all');
  const list = exams.filter((e) => filter === 'all' || e.category === filter);
  const all = list.flatMap((e) => e.topics.map((t) => ({ t, e })));

  el.innerHTML = `
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/exams">← Exams</a></nav>
    ${pageHead('Subjects overview', '', 'Every topic from every exam, grouped by how well you know it.')}
    <div style="margin-bottom:1rem">${categoryFilter(filter)}</div>
    ${all.length ? `<div class="grid-3">${RATINGS.map((r) => {
      const items = all.filter((x) => x.t.rating === r.id);
      return `<section class="card" aria-labelledby="col-${r.id}">
        <div class="card-head"><h2 id="col-${r.id}"><i class="dot dot-${r.color}"></i>${r.short}</h2><span class="tag tag-${r.color}">${items.length}</span></div>
        ${items.length ? `<ul class="list">${items.map(({ t, e }) => `<li><div class="grow"><span class="title">${esc(t.name)}</span><br><a class="small" href="#/exams/${e.id}">${esc(e.title)}</a></div>
          <label class="sr-only" for="r-${t.id}">Rating for ${esc(t.name)}</label>
          <select id="r-${t.id}" data-act="rate" data-exam="${e.id}" data-topic="${t.id}" style="width:auto;min-height:34px;font-size:.85rem">${RATINGS.map((o) => `<option value="${o.id}" ${o.id === t.rating ? 'selected' : ''}>${o.short}</option>`).join('')}</select></li>`).join('')}</ul>`
        : `<p class="muted small">Nothing here.</p>`}</section>`;
    }).join('')}</div>`
    : emptyState('No topics yet. Open an exam and add your first topic.', `<a class="btn" href="#/exams">Go to exams</a>`)}`;

  bind(el, {
    filter: (b) => {
      db.setSetting('categoryFilter', b.dataset.cat);
      rerender();
    },
    rate: async (s) => {
      await db.update('exams', s.dataset.exam, (e) => {
        setTopicRating(e.topics.find((t) => t.id === s.dataset.topic), s.value);
      });
      rerender();
    },
  });
}
