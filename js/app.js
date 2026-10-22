// Entry point: layout (nav, top bar), theme, first-run seed, migrations, routes.

import { route, start, rerender } from './router.js';
import { seedIfFirstRun, migrate } from './backup.js';
import { getSetting, setSetting, requestPersist } from './db.js';
import { icon } from './icons.js';
import { mountTimer } from './timer.js';
import { openPalette } from './palette.js';
import { openAssistant } from './assistant.js';
import { dialogOpen } from './ui.js';

export const NAV = [
  { href: '#/', label: 'Today', icon: 'home' },
  { href: '#/calendar', label: 'Calendar', icon: 'calendar' },
  { href: '#/projects', label: 'Projects', icon: 'folder' },
  { href: '#/exams', label: 'Exams', icon: 'cap', also: '/subjects' },
  { href: '#/study', label: 'Study', icon: 'cards' },
  { href: '#/tests', label: 'Practice Tests', icon: 'test', also: '/attempts' },
  { href: '#/skills', label: 'Skills', icon: 'zap' },
  { href: '#/settings', label: 'Settings', icon: 'settings' },
];
const BOTTOM = ['#/', '#/projects', '#/exams', '#/study', '#/skills'];

export function applyTheme(t = getSetting('theme', 'system')) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const b = document.getElementById('theme-btn');
  if (b) {
    b.innerHTML = icon(dark ? 'sun' : 'moon');
    b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

function buildLayout() {
  const link = (n) => `<a data-nav href="${n.href}" ${n.also ? `data-also="${n.also}"` : ''}>${icon(n.icon, 20)}<span>${n.label}</span></a>`;
  document.getElementById('side-nav').innerHTML = NAV.map((n) => `<li>${link(n)}</li>`).join('');
  document.getElementById('side-foot').innerHTML = `<button class="side-ai" type="button" data-ai>${icon('sparkles', 18)}<span>Ask AI</span><kbd>A</kbd></button>`;
  const more = NAV.filter((n) => !BOTTOM.includes(n.href));
  document.getElementById('bottombar').innerHTML =
    NAV.filter((n) => BOTTOM.includes(n.href)).map(link).join('') +
    `<button type="button" class="more-btn" data-also="${more.map((m) => m.href.slice(1)).join(' ')}" aria-haspopup="menu" aria-expanded="false">${icon('more', 20)}<span>More</span></button>
     <div class="more-menu" role="menu" hidden>${more.map((n) => `<a role="menuitem" href="${n.href}">${icon(n.icon, 18)} ${n.label}</a>`).join('')}
       <button role="menuitem" type="button" data-search>${icon('search', 18)} Search</button></div>`;
  const search = document.getElementById('search-btn');
  const mac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  search.innerHTML = `${icon('search', 16)}<span>Search or jump to…</span><kbd>${mac ? '⌘' : 'Ctrl'} K</kbd>`;
  search.addEventListener('click', openPalette);

  const fab = document.getElementById('fab-ai');
  fab.innerHTML = `${icon('sparkles', 22)}<span>Ask AI</span>`;
  fab.addEventListener('click', openAssistant);
  document.querySelector('[data-ai]').addEventListener('click', openAssistant);

  const moreBtn = document.querySelector('.more-btn');
  const menu = document.querySelector('.more-menu');
  const setMenu = (open) => {
    menu.hidden = !open;
    moreBtn.setAttribute('aria-expanded', String(open));
  };
  moreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setMenu(menu.hidden);
  });
  menu.addEventListener('click', (e) => {
    if (e.target.closest('[data-search]')) openPalette();
    setMenu(false);
  });
  document.addEventListener('click', () => setMenu(false));

  document.getElementById('theme-btn').addEventListener('click', () => {
    const cur = getSetting('theme', 'system');
    const dark = cur === 'dark' || (cur === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
    setSetting('theme', dark ? 'light' : 'dark');
    applyTheme();
    window.dispatchEvent(new Event('tracker:theme'));
  });
  mountTimer(document.getElementById('timer-chip'));

  document.addEventListener('keydown', (e) => {
    const typing = e.target.closest('input, textarea, select, [contenteditable]');
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (!dialogOpen()) openPalette();
    } else if (!typing && !dialogOpen() && !e.metaKey && !e.ctrlKey && !e.altKey) {
      if (e.key === '/') {
        e.preventDefault();
        openPalette();
      } else if (e.key.toLowerCase() === 'a' && !location.hash.includes('/review') && !location.hash.includes('/take')) {
        e.preventDefault();
        openAssistant();
      }
    }
  });
  // Data changed outside the current view (timer logged time, etc.): refresh it.
  window.addEventListener('tracker:data', () => !dialogOpen() && rerender());
  window.addEventListener('tracker:theme', () => !dialogOpen() && rerender());
}

route('/', () => import('./views/dashboard.js'));
route('/calendar', () => import('./views/calendar.js'));
route('/projects', () => import('./views/projects.js'));
route('/projects/:id', () => import('./views/project-detail.js'));
route('/exams', () => import('./views/exams.js'));
route('/exams/:id', () => import('./views/exam-detail.js'));
route('/exams/:id/topics/:topicId', () => import('./views/topic.js'));
route('/subjects', () => import('./views/subjects.js'));
route('/study', () => import('./views/study.js'));
route('/study/review', () => import('./views/review.js'));
route('/tests', () => import('./views/tests.js'));
route('/tests/:id', () => import('./views/test-detail.js'));
route('/tests/:id/edit', () => import('./views/test-builder.js'));
route('/tests/:id/take', () => import('./views/test-take.js'));
route('/tests/:id/print/:sheet', () => import('./views/test-print.js'));
route('/attempts/:id', () => import('./views/attempt.js'));
route('/skills', () => import('./views/skills.js'));
route('/skills/:id', () => import('./views/skill-detail.js'));
route('/settings', () => import('./views/settings.js'));
route('/404', () => import('./views/notfound.js'));

async function main() {
  buildLayout();
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
  const app = document.getElementById('app');
  try {
    await seedIfFirstRun();
    await migrate();
  } catch (err) {
    console.error(err);
    app.innerHTML = `<div class="card"><h1>Could not start</h1><p>${String(err.message).replace(/</g, '&lt;')}</p>
      <p class="muted">If you are in a private window, browser storage may be disabled.</p></div>`;
    return;
  }
  requestPersist();
  start(app);
}

main();
