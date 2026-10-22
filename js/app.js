// Entry point: theme, first-run seed, routes.

import { route, start } from './router.js';
import { seedIfFirstRun } from './backup.js';
import { getSetting, requestPersist } from './db.js';

export function applyTheme(t = getSetting('theme', 'system')) {
  if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

route('/', () => import('./views/dashboard.js'));
route('/projects', () => import('./views/projects.js'));
route('/projects/:id', () => import('./views/project-detail.js'));
route('/exams', () => import('./views/exams.js'));
route('/exams/:id', () => import('./views/exam-detail.js'));
route('/subjects', () => import('./views/subjects.js'));
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
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => applyTheme());
  const app = document.getElementById('app');
  try {
    await seedIfFirstRun();
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
