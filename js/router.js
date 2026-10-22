// Hash router: #/path/:param. Works on GitHub Pages because the server only ever sees index.html.

const routes = [];
let outlet;
let current = null;

export function route(pattern, load) {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '/?$');
  routes.push({ re, keys, load, pattern });
}

function match(path) {
  for (const r of routes) {
    const m = path.match(r.re);
    if (m) return { r, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return null;
}

export const currentPath = () => (location.hash.replace(/^#/, '') || '/').split('?')[0];

export const query = () => new URLSearchParams(location.hash.split('?')[1] || '');

async function render({ keepScroll = false } = {}) {
  const path = currentPath();
  const hit = match(path) || match('/404');
  const y = window.scrollY;
  current = hit;
  const under = (p) => (p === '/' ? path === '/' : path === p || path.startsWith(p + '/'));
  document.querySelectorAll('[data-nav], .more-btn').forEach((a) => {
    const base = a.getAttribute('href')?.slice(1);
    const also = (a.dataset.also || '').split(' ').filter(Boolean);
    if ((base && under(base)) || also.some(under)) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  window.dispatchEvent(new CustomEvent('tracker:route', { detail: { path } }));
  try {
    const mod = await hit.r.load();
    if (current !== hit) return; // a newer navigation won
    outlet.onclick = outlet.onchange = outlet.oninput = null;
    await mod.render(outlet, hit.params);
    if (keepScroll) window.scrollTo(0, y);
    else {
      window.scrollTo(0, 0);
      const h1 = outlet.querySelector('h1');
      if (h1) {
        h1.tabIndex = -1;
        h1.focus({ preventScroll: true });
      }
    }
    document.title = (outlet.querySelector('h1')?.textContent?.trim() || 'Tracker') + ' · Tracker';
  } catch (err) {
    console.error(err);
    outlet.innerHTML = `<div class="card"><h1>Something went wrong</h1><p>${String(err.message).replace(/</g, '&lt;')}</p><p><a href="#/">Back to dashboard</a></p></div>`;
  }
}

/** Re-render the current page in place (after a change). */
export const rerender = () => render({ keepScroll: true });
export const go = (hash) => {
  if (location.hash === hash) rerender();
  else location.hash = hash;
};

export function start(el) {
  outlet = el;
  window.addEventListener('hashchange', () => render());
  render();
}
