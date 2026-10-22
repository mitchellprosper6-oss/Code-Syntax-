// AI helpers. Two ways to use Claude, both ending in JSON the site validates:
//  1. Copy/paste (default, no key): build a prompt, copy it into Claude, paste the JSON reply back.
//  2. Direct API (optional, off by default): the user's own key, stored only in this browser.
// AI output never saves itself: it fills forms or offers suggestions for the user to accept.

import { esc, today } from './util.js';
import { getSetting } from './db.js';
import { openDialog, toast } from './ui.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.129.0/+esm';
export const AI_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5 (default, best quality)' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5 (faster, cheaper)' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5 (fastest, cheapest)' },
];

export const apiEnabled = () => !!(getSetting('aiApiEnabled', false) && getSetting('apiKey', ''));

// ---------- JSON helpers ----------
/** Pull the first JSON object/array out of a reply (tolerates code fences and stray prose). */
export function extractJson(text) {
  if (!text || !text.trim()) throw new Error('The reply is empty.');
  let t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {}
  const starts = [t.indexOf('{'), t.indexOf('[')].filter((i) => i >= 0);
  if (!starts.length) throw new Error('No JSON found in the reply.');
  const s = Math.min(...starts);
  const e = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  try {
    return JSON.parse(t.slice(s, e + 1));
  } catch (err) {
    throw new Error('The reply is not valid JSON: ' + err.message);
  }
}

const nullable = (type, extra = {}) => ({ type: [type, 'null'], ...extra });

/** JSON Schema for a list of form field definitions (see ui.formModal). */
export function schemaFromFields(fields) {
  const properties = {};
  for (const f of fields) {
    const d = f.label + (f.help ? ` (${f.help})` : '');
    switch (f.type) {
      case 'number':
        properties[f.name] = nullable('number', { description: d + (f.min != null ? `; min ${f.min}` : '') + (f.max != null ? `; max ${f.max}` : '') });
        break;
      case 'checkbox':
        properties[f.name] = nullable('boolean', { description: d });
        break;
      case 'date':
        properties[f.name] = nullable('string', { description: d + '; format YYYY-MM-DD' });
        break;
      case 'month':
        properties[f.name] = nullable('string', { description: d + '; format YYYY-MM' });
        break;
      case 'select': {
        const opts = f.options.flatMap((o) => (o.group ? o.options : [o]));
        properties[f.name] = nullable('string', {
          enum: [...opts.map((o) => String(o.value)), null],
          description: d + '. Allowed: ' + opts.map((o) => `"${o.value}" = ${o.label}`).join('; '),
        });
        break;
      }
      case 'when':
        properties[f.name] = {
          type: ['object', 'null'],
          description: d + '. Set tbc true when there is no exact date yet; approxMonth is YYYY-MM.',
          properties: {
            date: nullable('string', { description: 'YYYY-MM-DD' }),
            tbc: nullable('boolean'),
            approxMonth: nullable('string', { description: 'YYYY-MM' }),
          },
          required: ['date', 'tbc', 'approxMonth'],
          additionalProperties: false,
        };
        break;
      default:
        properties[f.name] = nullable('string', { description: d });
    }
  }
  return { type: 'object', properties, required: fields.map((f) => f.name), additionalProperties: false };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

/** Keep only values that are valid for their field; drop the rest. */
export function cleanFieldValues(fields, obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Expected a JSON object.');
  const out = {};
  for (const f of fields) {
    const v = obj[f.name];
    if (v == null || v === '') continue;
    switch (f.type) {
      case 'number': {
        const n = Number(v);
        if (Number.isFinite(n)) out[f.name] = f.max != null ? Math.min(f.max, f.min != null ? Math.max(f.min, n) : n) : n;
        break;
      }
      case 'checkbox':
        out[f.name] = !!v;
        break;
      case 'date':
        if (DATE_RE.test(v)) out[f.name] = v;
        break;
      case 'month':
        if (MONTH_RE.test(v)) out[f.name] = v;
        break;
      case 'select': {
        const opts = f.options.flatMap((o) => (o.group ? o.options : [o]));
        const hit = opts.find((o) => String(o.value) === String(v) || o.label.toLowerCase() === String(v).toLowerCase());
        if (hit) out[f.name] = String(hit.value);
        break;
      }
      case 'when':
        if (typeof v === 'object') {
          const date = DATE_RE.test(v.date || '') ? v.date : null;
          out[f.name] = { date, tbc: date ? !!v.tbc : true, approxMonth: MONTH_RE.test(v.approxMonth || '') ? v.approxMonth : null };
        }
        break;
      default:
        out[f.name] = String(v);
    }
  }
  return out;
}

export function buildPrompt({ about, instructions = '', context, request, schema }) {
  return [
    'You are helping me fill in my personal tracker for uni projects, exams, practice tests and skills.',
    `Task: ${about}`,
    `Today's date is ${today()}.`,
    instructions,
    context ? `Current values and context (JSON):\n${JSON.stringify(context, null, 2)}` : '',
    request ? `My description / request:\n"""\n${request}\n"""` : 'I have not added a description; use the context above and sensible defaults.',
    'Reply with ONLY one JSON object (no prose, no code fences) that matches this JSON Schema. Use null for anything you cannot reasonably work out. Dates are YYYY-MM-DD.',
    JSON.stringify(schema, null, 2),
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ---------- direct API ----------
export async function callClaude(prompt, schema) {
  const apiKey = getSetting('apiKey', '');
  if (!apiKey) throw new Error('No API key set. Add one in Settings, or use the copy/paste option.');
  const { default: Anthropic } = await import(SDK_URL);
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const model = getSetting('aiModel', 'claude-opus-5-5');
  const base = { model, max_tokens: 16000, messages: [{ role: 'user', content: prompt }] };
  const send = (withFormat) => {
    const params = { ...base, output_config: { effort: 'medium', ...(withFormat ? { format: { type: 'json_schema', schema } } : {}) } };
    // Server-side fallback re-runs a declined request on another model (not offered for Haiku).
    if (model === 'claude-haiku-5-5') return client.messages.create(params);
    return client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
  };
  let res;
  try {
    res = await send(true);
  } catch (err) {
    // If the schema is rejected by structured outputs, the prompt still carries it: retry without.
    if (err instanceof Anthropic.BadRequestError && /schema|format/i.test(err.message)) res = await send(false);
    else throw explainApiError(err, Anthropic);
  }
  if (res.stop_reason === 'refusal') throw new Error('Claude declined this request. Try rewording it, or use the copy/paste option.');
  if (res.stop_reason === 'max_tokens') throw new Error('The reply was cut off (too long). Ask for fewer items.');
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

function explainApiError(err, Anthropic) {
  if (err instanceof Anthropic.AuthenticationError) return new Error('The API key was rejected. Check it in Settings.');
  if (err instanceof Anthropic.RateLimitError) return new Error('Rate limited by the API. Wait a moment and try again.');
  if (err instanceof Anthropic.APIConnectionError) return new Error('Could not reach the API. Check your connection.');
  if (err instanceof Anthropic.APIError) return new Error(`API error ${err.status ?? ''}: ${err.message}`);
  return err;
}

// ---------- the AI dialog ----------
/*
 aiDialog({title, about, instructions, context, schema, parse, request, extraHtml})
 parse(json) -> value (throw to reject). Resolves to the parsed value or null.
*/
export function aiDialog({ title, about, instructions = '', context, schema, parse, request = '', placeholder = '' }) {
  const api = apiEnabled();
  const { dlg, close, done } = openDialog(
    `<div class="modal-body">
      <div class="modal-head"><h2 class="modal-title">✨ ${esc(title)}</h2></div>
      <div class="field">
        <label for="ai-req">Describe what you want (optional but helps)</label>
        <textarea id="ai-req" rows="3" placeholder="${esc(placeholder || 'e.g. 3000-word report on a footbridge design, due 15 Dec, worth 40%')}">${esc(request)}</textarea>
      </div>
      ${api ? `<div class="ai-box">
        <button type="button" class="btn btn-ai" data-gen>Generate with Claude</button>
        <span class="small muted" data-status aria-live="polite">Uses your API key (Settings).</span>
      </div><p class="small muted">Or use copy/paste:</p>` : ''}
      <ol class="ai-steps">
        <li><button type="button" class="btn" data-copy>Copy prompt</button>
          <a class="btn btn-link" href="https://claude.ai/new" target="_blank" rel="noopener">Open Claude ↗</a>
          <details><summary class="small">Show prompt</summary><textarea class="mono" rows="8" readonly data-prompt></textarea><small class="muted" data-len></small></details></li>
        <li><label for="ai-reply">Paste Claude's JSON reply</label>
          <textarea id="ai-reply" class="mono" rows="6" placeholder='{ ... }'></textarea></li>
      </ol>
      <p class="form-error" role="alert" hidden></p>
      <div class="modal-actions">
        <button type="button" class="btn" data-close>Cancel</button>
        <button type="button" class="btn btn-primary" data-use>Use reply</button>
      </div>
    </div>`,
    { wide: true, label: title }
  );
  const errEl = dlg.querySelector('.form-error');
  const showErr = (m) => {
    errEl.textContent = m;
    errEl.hidden = !m;
  };
  const prompt = () => buildPrompt({ about, instructions, context, request: dlg.querySelector('#ai-req').value.trim(), schema });
  const refreshPrompt = () => {
    const p = prompt();
    dlg.querySelector('[data-prompt]').value = p;
    dlg.querySelector('[data-len]').textContent = `${p.length.toLocaleString()} characters` + (p.length > 400000 ? ' — very long; Claude may not accept it all. Select fewer files.' : '');
    return p;
  };
  refreshPrompt();
  dlg.querySelector('#ai-req').addEventListener('input', refreshPrompt);
  dlg.querySelector('[data-copy]').addEventListener('click', async (e) => {
    const p = refreshPrompt();
    try {
      await navigator.clipboard.writeText(p);
      e.target.textContent = 'Copied ✓';
    } catch {
      const ta = dlg.querySelector('[data-prompt]');
      ta.closest('details').open = true;
      ta.select();
      e.target.textContent = 'Select & copy below';
    }
  });
  const accept = (text) => {
    try {
      const value = parse(extractJson(text));
      close({ value });
    } catch (err) {
      showErr(err.message);
    }
  };
  dlg.querySelector('[data-use]').addEventListener('click', () => accept(dlg.querySelector('#ai-reply').value));
  if (api) {
    dlg.querySelector('[data-gen]').addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const status = dlg.querySelector('[data-status]');
      btn.disabled = true;
      showErr('');
      status.textContent = 'Asking Claude… this can take a little while.';
      try {
        const text = await callClaude(prompt(), schema);
        dlg.querySelector('#ai-reply').value = text;
        status.textContent = 'Done.';
        accept(text);
      } catch (err) {
        status.textContent = '';
        showErr(err.message);
      } finally {
        btn.disabled = false;
      }
    });
  }
  return done.then((r) => (r ? r.value : null));
}

/** Fill a form's fields with AI. Returns cleaned values or null. */
export function aiFillFields({ title, fields, current, about, context }) {
  const schema = schemaFromFields(fields);
  return aiDialog({
    title: `Fill “${title}” with AI`,
    about: `Fill in the fields of a form: ${about}. Keep my existing values unless my description changes them; improve empty ones.`,
    context: { currentValues: current, ...(context || {}) },
    schema,
    parse: (json) => {
      const v = cleanFieldValues(fields, json);
      if (!Object.keys(v).length) throw new Error('The reply had no usable values for this form.');
      return v;
    },
  });
}

/**
 Suggest new list items (tasks, landmarks, topics…). itemFields are form-style field defs.
 Shows a preview where the user ticks which to add. Resolves to the chosen items or [].
*/
export async function aiSuggestList({ title, about, itemFields, context, instructions = '', placeholder }) {
  const itemSchema = schemaFromFields(itemFields);
  const schema = { type: 'object', properties: { items: { type: 'array', items: itemSchema } }, required: ['items'], additionalProperties: false };
  const items = await aiDialog({
    title,
    about,
    instructions,
    context,
    schema,
    placeholder,
    parse: (json) => {
      const arr = Array.isArray(json) ? json : json.items;
      if (!Array.isArray(arr)) throw new Error('Expected {"items": [...]}.');
      const clean = arr.map((x) => cleanFieldValues(itemFields, x)).filter((x) => Object.keys(x).length);
      if (!clean.length) throw new Error('No usable items in the reply.');
      return clean;
    },
  });
  if (!items) return [];
  return pickSuggestions(items, itemFields);
}

function pickSuggestions(items, itemFields) {
  const main = itemFields[0].name;
  const { dlg, close, done } = openDialog(
    `<div class="modal-body">
      <h2 class="modal-title">Choose what to add</h2>
      <p class="muted small">Untick anything you don't want. You can edit items after adding them.</p>
      <ul class="suggest-list">${items
        .map((it, i) => {
          const rest = itemFields.slice(1).filter((f) => it[f.name] != null && it[f.name] !== '').map((f) => `${f.label}: ${typeof it[f.name] === 'object' ? JSON.stringify(it[f.name]) : it[f.name]}`);
          return `<li><label><input type="checkbox" checked data-i="${i}"> <strong>${esc(it[main] ?? '(untitled)')}</strong>${rest.length ? `<br><span class="small muted">${esc(rest.join(' · '))}</span>` : ''}</label></li>`;
        })
        .join('')}</ul>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-add>Add selected</button></div>
    </div>`,
    { wide: true, label: 'Choose suggestions' }
  );
  dlg.querySelector('[data-add]').addEventListener('click', () => {
    const chosen = [...dlg.querySelectorAll('input[data-i]:checked')].map((c) => items[+c.dataset.i]);
    close(chosen);
  });
  return done.then((r) => {
    if (r?.length) toast(`Added ${r.length} item${r.length === 1 ? '' : 's'}.`);
    return r || [];
  });
}
