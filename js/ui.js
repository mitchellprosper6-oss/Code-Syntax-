// UI helpers: dialogs, form modals (with AI fill), confirm, toast, small components.

import { esc, CATEGORIES, catLabel, ratingInfo, clamp } from './util.js';

// ---------- dialogs ----------
let dialogCount = 0;

/** Open a <dialog> with given inner HTML. Returns {dlg, close(result), done: Promise}. */
export function openDialog(html, { wide = false, label = 'Dialog' } = {}) {
  const dlg = document.createElement('dialog');
  dlg.className = 'modal' + (wide ? ' modal-wide' : '');
  dlg.setAttribute('aria-label', label);
  dlg.innerHTML = html;
  document.body.appendChild(dlg);
  dialogCount++;
  let resolveFn;
  const done = new Promise((r) => (resolveFn = r));
  let result = null;
  const close = (r = null) => {
    result = r;
    if (dlg.open) dlg.close();
  };
  dlg.addEventListener('close', () => {
    dialogCount--;
    dlg.remove();
    resolveFn(result);
  });
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) close(null);
  });
  dlg.showModal();
  const first = dlg.querySelector('[autofocus], input:not([type=hidden]):not([type=checkbox]), textarea, select');
  if (first) first.focus();
  return { dlg, close, done };
}
export const dialogOpen = () => dialogCount > 0;

export function confirmDialog(message, { ok = 'Delete', danger = true, title = 'Are you sure?' } = {}) {
  const { dlg, close, done } = openDialog(
    `<form method="dialog" class="modal-body">
      <h2 class="modal-title">${esc(title)}</h2>
      <p>${esc(message)}</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="button" class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok autofocus>${esc(ok)}</button>
      </div>
    </form>`,
    { label: title }
  );
  dlg.querySelector('[data-ok]').addEventListener('click', () => close(true));
  return done.then((r) => r === true);
}

export function alertDialog(message, title = 'Notice') {
  const { done } = openDialog(
    `<div class="modal-body"><h2 class="modal-title">${esc(title)}</h2><p class="pre">${esc(message)}</p>
     <div class="modal-actions"><button class="btn btn-primary" data-close autofocus>OK</button></div></div>`,
    { label: title }
  );
  return done;
}

// ---------- toast ----------
export function toast(msg, { action, onAction, ms = 4000 } = {}) {
  let host = document.getElementById('toasts');
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.innerHTML = `<span>${esc(msg)}</span>${action ? `<button class="btn btn-small">${esc(action)}</button>` : ''}`;
  if (action) t.querySelector('button').onclick = () => { onAction?.(); t.remove(); };
  host.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

// ---------- form modal ----------
/*
 Field types: text, textarea, number, date, month, select, checkbox, when, url.
 'when' = {date, tbc, approxMonth} deadline/date object.
 opts.ai: false to hide the AI button, or {about: 'what this form describes', context: {...}}
*/
export function fieldHtml(f, v) {
  const id = `f-${f.name}`;
  const req = f.required ? 'required' : '';
  const help = f.help ? `<small class="help" id="${id}-help">${esc(f.help)}</small>` : '';
  const desc = f.help ? `aria-describedby="${id}-help"` : '';
  const label = `<label for="${id}">${esc(f.label)}${f.required ? ' <span aria-hidden="true">*</span>' : ''}</label>`;
  switch (f.type) {
    case 'textarea':
      return `<div class="field">${label}<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}" ${req} ${desc} placeholder="${esc(f.placeholder || '')}">${esc(v ?? '')}</textarea>${help}</div>`;
    case 'select':
      return `<div class="field">${label}<select id="${id}" name="${f.name}" ${req} ${desc}>${f.options
        .map((o) => {
          if (o.group) return `<optgroup label="${esc(o.group)}">${o.options.map((oo) => `<option value="${esc(oo.value)}" ${String(oo.value) === String(v ?? '') ? 'selected' : ''}>${esc(oo.label)}</option>`).join('')}</optgroup>`;
          return `<option value="${esc(o.value)}" ${String(o.value) === String(v ?? '') ? 'selected' : ''}>${esc(o.label)}</option>`;
        })
        .join('')}</select>${help}</div>`;
    case 'checkbox':
      return `<div class="field field-check"><input type="checkbox" id="${id}" name="${f.name}" ${v ? 'checked' : ''} ${desc}><label for="${id}">${esc(f.label)}</label>${help}</div>`;
    case 'when': {
      const w = v || {};
      return `<fieldset class="field when-field" data-when="${f.name}"><legend>${esc(f.label)}</legend>
        <div class="row-wrap">
          <label class="inline">Date <input type="date" name="${f.name}.date" value="${esc(w.date || '')}"></label>
          <label class="inline"><input type="checkbox" name="${f.name}.tbc" ${w.tbc && w.date ? 'checked' : ''}> Date TBC</label>
          <label class="inline">Approx. month <input type="month" name="${f.name}.approxMonth" value="${esc(w.approxMonth || '')}"></label>
        </div>${help}</fieldset>`;
    }
    default: {
      const extra = [f.min != null ? `min="${f.min}"` : '', f.max != null ? `max="${f.max}"` : '', f.step != null ? `step="${f.step}"` : ''].join(' ');
      return `<div class="field">${label}<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(v ?? '')}" ${extra} ${req} ${desc} placeholder="${esc(f.placeholder || '')}">${help}</div>`;
    }
  }
}

export function readFields(form, fields) {
  const out = {};
  for (const f of fields) {
    if (f.type === 'when') {
      const date = form.elements[`${f.name}.date`].value || null;
      // No date means TBC; a date plus the TBC tick means "tentative date".
      const tbc = !date || form.elements[`${f.name}.tbc`].checked;
      out[f.name] = { date, tbc, approxMonth: form.elements[`${f.name}.approxMonth`].value || null };
      continue;
    }
    const el = form.elements[f.name];
    if (!el) continue;
    if (f.type === 'checkbox') out[f.name] = el.checked;
    else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
    else out[f.name] = el.value.trim();
  }
  return out;
}

export function writeFields(form, fields, values) {
  for (const f of fields) {
    if (!(f.name in values) || values[f.name] == null) continue;
    const v = values[f.name];
    if (f.type === 'when') {
      if (typeof v !== 'object') continue;
      if (v.date !== undefined) form.elements[`${f.name}.date`].value = v.date || '';
      if (v.tbc != null) form.elements[`${f.name}.tbc`].checked = !!v.tbc;
      if (v.approxMonth !== undefined) form.elements[`${f.name}.approxMonth`].value = v.approxMonth || '';
      continue;
    }
    const el = form.elements[f.name];
    if (!el) continue;
    if (f.type === 'checkbox') el.checked = !!v;
    else if (f.type === 'select') {
      if ([...el.options].some((o) => o.value === String(v))) el.value = String(v);
    } else el.value = v;
    el.classList.add('ai-filled');
  }
}

export function formModal({ title, fields, values = {}, submitLabel = 'Save', ai = {}, wide = false, intro = '' }) {
  const { dlg, close, done } = openDialog(
    `<form class="modal-body" novalidate>
      <div class="modal-head"><h2 class="modal-title">${esc(title)}</h2>
        ${ai ? `<button type="button" class="btn btn-ai btn-small" data-ai>✨ Fill with AI</button>` : ''}</div>
      ${intro ? `<p class="muted">${esc(intro)}</p>` : ''}
      ${fields.map((f) => fieldHtml(f, values[f.name])).join('')}
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="submit" class="btn btn-primary">${esc(submitLabel)}</button>
      </div>
    </form>`,
    { wide: wide || fields.length > 6, label: title }
  );
  const form = dlg.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const missing = fields.filter((f) => f.required && !form.elements[f.name]?.value.trim());
    const err = form.querySelector('.form-error');
    if (missing.length) {
      err.textContent = `Please fill in: ${missing.map((f) => f.label).join(', ')}`;
      err.hidden = false;
      form.elements[missing[0].name].focus();
      return;
    }
    close(readFields(form, fields));
  });
  if (ai) {
    dlg.querySelector('[data-ai]').addEventListener('click', async () => {
      const { aiFillFields } = await import('./ai.js');
      const current = readFields(form, fields);
      const res = await aiFillFields({ title, fields, current, about: ai.about || title, context: ai.context });
      if (res) {
        writeFields(form, fields, res);
        toast('AI suggestions filled in. Check them, then Save.');
      }
    });
  }
  return done;
}

// ---------- components ----------
export function catTag(cat) {
  if (!cat) return '';
  return `<span class="tag tag-${esc(cat)}">${esc(catLabel(cat))}</span>`;
}

export function progressBar(pct, { label = '', small = false } = {}) {
  const p = clamp(Math.round(pct || 0), 0, 100);
  return `<div class="progress ${small ? 'progress-small' : ''}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${p}" aria-label="${esc(label || 'Progress')}">
    <div class="progress-fill" style="width:${p}%"></div></div>`;
}

/** Stacked readiness meter for {confident, practice, unknown} counts. */
export function readinessMeter(counts, { showLegend = true } = {}) {
  const total = counts.confident + counts.practice + counts.unknown;
  if (!total) return `<p class="muted small">No topics yet</p>`;
  const seg = (k) => {
    const n = counts[k];
    if (!n) return '';
    const r = ratingInfo(k);
    return `<div class="meter-seg meter-${r.color}" style="flex:${n}" title="${esc(r.label)}: ${n}"></div>`;
  };
  return `<div class="meter" role="img" aria-label="Confident ${counts.confident}, needs practice ${counts.practice}, don't know yet ${counts.unknown}">
      ${seg('confident')}${seg('practice')}${seg('unknown')}</div>
    ${showLegend ? `<div class="meter-legend small">
      <span><i class="dot dot-green"></i>Confident ${counts.confident}</span>
      <span><i class="dot dot-amber"></i>Needs practice ${counts.practice}</span>
      <span><i class="dot dot-red"></i>Don't know ${counts.unknown}</span></div>` : ''}`;
}

export function emptyState(text, actionHtml = '') {
  return `<div class="empty"><p>${esc(text)}</p>${actionHtml}</div>`;
}

export function categoryFilter(active) {
  const opts = [{ id: 'all', label: 'All' }, ...CATEGORIES];
  return `<div class="chips" role="group" aria-label="Filter by category">${opts
    .map((c) => `<button class="chip ${c.id !== 'all' ? 'chip-' + c.id : ''}" data-act="filter" data-cat="${c.id}" aria-pressed="${active === c.id}">${c.label}</button>`)
    .join('')}</div>`;
}

export const pageHead = (title, actions = '', sub = '') =>
  `<header class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="muted">${sub}</p>` : ''}</div><div class="page-actions">${actions}</div></header>`;

/** Pick files via a hidden input. Returns FileList (possibly empty). */
export function pickFiles({ accept = '', multiple = true } = {}) {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.multiple = multiple;
    inp.onchange = () => resolve([...inp.files]);
    inp.click();
  });
}

export function download(filename, blobOrText, type = 'application/json') {
  const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1000);
}

/** Bind delegated click/change/input handlers for a view. handlers: {act: fn(el, event)} */
export function bind(root, handlers) {
  const go = (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !root.contains(el)) return;
    const evType = el.dataset.on || (el.matches('input[type=checkbox], select, input[type=radio]') ? 'change' : el.matches('input, textarea') ? 'change' : 'click');
    if (evType !== e.type) return;
    const fn = handlers[el.dataset.act];
    if (fn) {
      if (e.type === 'click' && el.tagName === 'A' && !el.getAttribute('href')?.startsWith('#')) return;
      if (e.type === 'click' && el.tagName !== 'A') e.preventDefault();
      Promise.resolve(fn(el, e)).catch((err) => {
        console.error(err);
        toast('Something went wrong: ' + err.message);
      });
    }
  };
  root.onclick = go;
  root.onchange = go;
  root.oninput = (e) => {
    const el = e.target.closest('[data-act][data-on=input]');
    if (el) go(e);
  };
}
