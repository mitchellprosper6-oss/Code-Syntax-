// Command palette (⌘K / Ctrl+K or "/"): jump to any page or record, or run an action.

import { esc } from './util.js';
import { openDialog } from './ui.js';
import { icon } from './icons.js';

async function items() {
  const [{ loadAll }, { NAV }] = await Promise.all([import('./model.js'), import('./app.js')]);
  const d = await loadAll();
  const nav = (h) => () => (location.hash = h);
  return [
    ...NAV.map((n) => ({ group: 'Pages', label: n.label, icon: n.icon, run: nav(n.href) })),
    { group: 'Actions', label: 'Quick add with AI', icon: 'sparkles', run: async () => (await import('./forms.js')).quickAddWithAI() },
    { group: 'Actions', label: 'Add project', icon: 'plus', run: async () => { const p = await (await import('./forms.js')).editProject(); if (p) location.hash = `#/projects/${p.id}`; } },
    { group: 'Actions', label: 'Add exam', icon: 'plus', run: async () => { const e = await (await import('./forms.js')).editExam(); if (e) location.hash = `#/exams/${e.id}`; } },
    { group: 'Actions', label: 'Add skill', icon: 'plus', run: async () => { const s = await (await import('./forms.js')).editSkill(); if (s) location.hash = `#/skills/${s.id}`; } },
    { group: 'Actions', label: 'Start focus timer', icon: 'timer', run: async () => (await import('./timer.js')).openTimer() },
    { group: 'Actions', label: 'Review due flashcards', icon: 'cards', run: nav('#/study/review') },
    { group: 'Actions', label: 'Ask AI assistant', icon: 'sparkles', run: async () => (await import('./assistant.js')).openAssistant() },
    { group: 'Actions', label: 'Export backup', icon: 'download', run: nav('#/settings') },
    { group: 'Actions', label: 'Subjects overview', icon: 'target', run: nav('#/subjects') },
    ...d.projects.map((p) => ({ group: 'Projects', label: p.title, sub: p.module, icon: 'folder', run: nav(`#/projects/${p.id}`) })),
    ...d.exams.map((e) => ({ group: 'Exams', label: e.title, sub: e.module, icon: 'cap', run: nav(`#/exams/${e.id}`) })),
    ...d.exams.flatMap((e) => e.topics.map((t) => ({ group: 'Topics', label: t.name, sub: e.title, icon: 'book', run: nav(`#/exams/${e.id}/topics/${t.id}`) }))),
    ...d.skills.map((s) => ({ group: 'Skills', label: s.name, sub: s.subgroup, icon: 'zap', run: nav(`#/skills/${s.id}`) })),
    ...d.tests.map((t) => ({ group: 'Practice tests', label: t.title, icon: 'test', run: nav(`#/tests/${t.id}`) })),
  ];
}

export async function openPalette() {
  const all = await items();
  const { dlg, close, done } = openDialog(
    `<div class="palette" role="combobox" aria-expanded="true" aria-haspopup="listbox">
      <div class="palette-input">${icon('search', 18)}<input id="pal-q" type="search" placeholder="Search pages, projects, topics, skills… or type an action" aria-label="Search" aria-controls="pal-list" autocomplete="off"><kbd>Esc</kbd></div>
      <ul id="pal-list" class="palette-list" role="listbox"></ul>
    </div>`,
    { label: 'Search', palette: true }
  );
  const input = dlg.querySelector('#pal-q');
  const list = dlg.querySelector('#pal-list');
  let shown = [];
  let sel = 0;
  const draw = () => {
    const tokens = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    shown = all.filter((it) => {
      const hay = `${it.label} ${it.sub || ''} ${it.group}`.toLowerCase();
      return tokens.every((t) => hay.includes(t));
    });
    if (!tokens.length) shown = shown.filter((it) => it.group === 'Pages' || it.group === 'Actions');
    shown = shown.slice(0, 40);
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    let g = '';
    list.innerHTML = shown.length
      ? shown.map((it, i) => {
          const head = it.group !== g ? `<li class="pal-group" role="presentation">${esc((g = it.group))}</li>` : '';
          return `${head}<li role="option" id="pal-${i}" data-i="${i}" aria-selected="${i === sel}" class="pal-item">${icon(it.icon, 16)}<span class="grow">${esc(it.label)}${it.sub ? ` <span class="muted small">${esc(it.sub)}</span>` : ''}</span>${i === sel ? icon('chevron', 14) : ''}</li>`;
        }).join('')
      : `<li class="pal-empty">No matches</li>`;
    input.setAttribute('aria-activedescendant', shown.length ? `pal-${sel}` : '');
    list.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  };
  const run = async (i) => {
    const it = shown[i];
    if (!it) return;
    close();
    await it.run();
  };
  input.addEventListener('input', () => { sel = 0; draw(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); sel = Math.min(shown.length - 1, sel + 1); draw(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); sel = Math.max(0, sel - 1); draw(); }
    else if (e.key === 'Enter') { e.preventDefault(); run(sel); }
  });
  list.addEventListener('click', (e) => {
    const li = e.target.closest('[data-i]');
    if (li) run(+li.dataset.i);
  });
  draw();
  input.focus();
  return done;
}
