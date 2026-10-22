// AI helpers. Two ways to use Claude, both validated by the site:
//  1. Claude.ai (default, no key): "Open in Claude" opens claude.ai with the prompt filled in (and copied),
//     then "Paste reply" reads the answer back and applies it.
//  2. Direct API (optional): the user's own key, stored only in this browser. One click.
// AI output never saves itself: it fills forms or offers suggestions for the user to accept.

import { esc, today } from './util.js';
import { getSetting } from './db.js';
import { openDialog, toast } from './ui.js';
import { icon } from './icons.js';

const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.129.0/+esm';
const CLAUDE_URL = 'https://claude.ai/new';
const MAX_URL_PROMPT = 6000; // longer prompts are copied instead of put in the link

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
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  try {
    return JSON.parse(t);
  } catch {}
  const starts = [t.indexOf('{'), t.indexOf('[')].filter((i) => i >= 0);
  if (!starts.length) throw new Error('No JSON found in the reply. Copy Claude’s whole answer (there is a copy button under it).');
  const s = Math.min(...starts);
  const e = Math.max(t.lastIndexOf('}'), t.lastIndexOf(']'));
  try {
    return JSON.parse(t.slice(s, e + 1));
  } catch (err) {
    throw new Error('The reply is not complete JSON (' + err.message + '). Copy Claude’s whole answer and try again.');
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
        if (Number.isFinite(n)) out[f.name] = f.max != null ? Math.min(f.max, f.min != null ? Math.max(f.min, n) : n) : f.min != null ? Math.max(f.min, n) : n;
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

const INTRO = 'You are helping me (a UK engineering student) with my personal tracker for uni projects, exams, practice tests and skills.';

export function buildPrompt({ about, instructions = '', context, request, schema, mode = 'json' }) {
  return [
    INTRO,
    `Task: ${about}`,
    `Today's date is ${today()}.`,
    instructions,
    context ? `Context (JSON):\n${JSON.stringify(context, null, 2)}` : '',
    request ? `My request:\n"""\n${request}\n"""` : '',
    mode === 'json'
      ? 'Reply with ONLY one JSON object (no prose, no code fences) that matches this JSON Schema. Use null for anything you cannot reasonably work out. Dates are YYYY-MM-DD.\n' + JSON.stringify(schema, null, 2)
      : 'Reply in Markdown (headings, bullet points, **bold** key terms). Be accurate and concrete. No preamble.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

// ---------- direct API ----------
async function client() {
  const apiKey = getSetting('apiKey', '');
  if (!apiKey) throw new Error('No API key set. Add one in Settings, or use “Open in Claude”.');
  const { default: Anthropic } = await import(SDK_URL);
  return { Anthropic, c: new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) };
}

function send(c, params) {
  const model = getSetting('aiModel', 'claude-opus-5-5');
  const p = { model, max_tokens: 16000, ...params };
  // Server-side fallback re-runs a declined request on another model (not offered for Haiku).
  if (model === 'claude-haiku-5-5') return c.messages.create(p);
  return c.beta.messages.create({ ...p, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
}

function textOf(res) {
  if (res.stop_reason === 'refusal') throw new Error('Claude declined this request. Try rewording it.');
  if (res.stop_reason === 'max_tokens') throw new Error('The reply was cut off (too long). Ask for less.');
  return res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
}

function explainApiError(err, Anthropic) {
  if (err instanceof Anthropic.AuthenticationError) return new Error('The API key was rejected. Check it in Settings.');
  if (err instanceof Anthropic.PermissionDeniedError) return new Error('This key is not allowed to use that model. Pick another model in Settings.');
  if (err instanceof Anthropic.RateLimitError) return new Error('Rate limited by the API. Wait a moment and try again.');
  if (err instanceof Anthropic.APIConnectionError) return new Error('Could not reach the API. Check your connection.');
  if (err instanceof Anthropic.APIError) return new Error(`API error ${err.status ?? ''}: ${err.message}`);
  return err;
}

/** One-shot call. mode 'json' asks for structured output matching schema. Returns text. */
export async function callClaude(prompt, schema, mode = 'json') {
  const { Anthropic, c } = await client();
  const go = (withFormat) =>
    send(c, {
      messages: [{ role: 'user', content: prompt }],
      output_config: { effort: 'medium', ...(withFormat ? { format: { type: 'json_schema', schema } } : {}) },
    });
  try {
    return textOf(await go(mode === 'json' && !!schema));
  } catch (err) {
    // If structured outputs rejects the schema, the prompt still carries it: retry without.
    if (mode === 'json' && err instanceof Anthropic.BadRequestError && /schema|format/i.test(err.message)) {
      try {
        return textOf(await go(false));
      } catch (e2) {
        throw explainApiError(e2, Anthropic);
      }
    }
    throw explainApiError(err, Anthropic);
  }
}

/** Multi-turn chat for the assistant. messages: [{role, content}] */
export async function chatClaude(messages, system) {
  const { Anthropic, c } = await client();
  try {
    return textOf(await send(c, { system, messages, output_config: { effort: 'low' } }));
  } catch (err) {
    throw explainApiError(err, Anthropic);
  }
}

export async function testConnection() {
  const text = await callClaude('Reply with exactly: OK', null, 'text');
  return text.trim();
}

// ---------- Claude.ai hand-off ----------
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Open claude.ai with the prompt filled in (short prompts) and copied (always). */
export async function openInClaude(prompt) {
  const copied = await copy(prompt);
  const url = prompt.length <= MAX_URL_PROMPT ? `${CLAUDE_URL}?q=${encodeURIComponent(prompt)}` : CLAUDE_URL;
  window.open(url, '_blank', 'noopener');
  return { copied, inUrl: prompt.length <= MAX_URL_PROMPT };
}

// ---------- the AI dialog ----------
/*
 aiDialog({title, about, instructions, context, schema, parse, request, placeholder, quick, mode})
 mode 'json' (default): parse(json) -> value; 'text': parse(markdown) -> value.
 Resolves to the parsed value, or null if cancelled.
*/
export function aiDialog({ title, about, instructions = '', context, schema, parse = (x) => x, request = '', placeholder = '', quick = [], mode = 'json' }) {
  const api = apiEnabled();
  const { dlg, close, done } = openDialog(
    `<div class="modal-body ai-dialog">
      <div class="modal-head"><h2 class="modal-title"><span class="ai-badge">${icon('sparkles', 18)}</span> ${esc(title)}</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <div class="field">
        <label for="ai-req">What do you want? <span class="muted small">(optional)</span></label>
        <textarea id="ai-req" rows="3" placeholder="${esc(placeholder || 'Describe it in your own words…')}">${esc(request)}</textarea>
        ${quick.length ? `<div class="chips quick-chips">${quick.map((q) => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>` : ''}
      </div>
      ${api ? `
        <button type="button" class="btn btn-ai btn-block btn-lg" data-gen>${icon('sparkles', 18)} Generate</button>
        <p class="small muted center" data-status aria-live="polite">Uses your API key · ⌘/Ctrl + Enter</p>
        <details class="ai-manual"><summary class="small">Use Claude.ai instead</summary>` : ''}
      <div class="ai-steps2">
        <div class="ai-step"><span class="step-n">1</span><div class="grow">
          <button type="button" class="btn btn-ai btn-block" data-open>${icon('external', 16)} Open in Claude</button>
          <p class="small muted" data-open-note>Opens Claude with your request filled in. Send it, then copy Claude’s reply.</p></div></div>
        <div class="ai-step"><span class="step-n">2</span><div class="grow">
          <button type="button" class="btn btn-primary btn-block" data-paste>${icon('paste', 16)} Paste reply</button>
          <textarea id="ai-reply" class="mono" rows="3" placeholder="…or paste Claude’s reply here" aria-label="Claude's reply"></textarea></div></div>
        <details><summary class="small muted">Show / copy the prompt</summary>
          <textarea class="mono" rows="7" readonly data-prompt></textarea>
          <div class="row-wrap"><button type="button" class="btn btn-small" data-copy>${icon('copy', 14)} Copy prompt</button><small class="muted" data-len></small></div></details>
        ${api ? '' : `<p class="small muted ai-tip">${icon('key', 14)} Tip: connect your own API key in <a href="#/settings" data-close>Settings</a> to skip copy/paste.</p>`}
      </div>
      ${api ? '</details>' : ''}
      <p class="form-error" role="alert" hidden></p>
    </div>`,
    { wide: true, label: title }
  );
  const $ = (s) => dlg.querySelector(s);
  const showErr = (m) => {
    const e = $('.form-error');
    e.textContent = m || '';
    e.hidden = !m;
  };
  const prompt = () => buildPrompt({ about, instructions, context, request: $('#ai-req').value.trim(), schema, mode });
  const refresh = () => {
    const p = prompt();
    $('[data-prompt]').value = p;
    $('[data-len]').textContent = `${p.length.toLocaleString()} characters` + (p.length > 400000 ? ' — very long; select fewer files.' : '');
    return p;
  };
  refresh();
  $('#ai-req').addEventListener('input', refresh);
  dlg.querySelectorAll('[data-q]').forEach((b) =>
    b.addEventListener('click', () => {
      $('#ai-req').value = b.dataset.q;
      refresh();
      $('#ai-req').focus();
    })
  );

  const accept = (text) => {
    try {
      const value = mode === 'json' ? parse(extractJson(text)) : parse(cleanText(text));
      close({ value });
      return true;
    } catch (err) {
      showErr(err.message);
      return false;
    }
  };

  $('[data-open]').addEventListener('click', async () => {
    showErr('');
    const { copied, inUrl } = await openInClaude(refresh());
    $('[data-open-note]').innerHTML = inUrl
      ? `Opened Claude${copied ? ' (prompt also copied, in case it isn’t filled in)' : ''}. Send it, copy the reply, come back and tap <strong>Paste reply</strong>.`
      : copied
        ? 'Prompt copied (too long to fill in automatically). <strong>Paste it into Claude</strong>, send, copy the reply, then tap Paste reply.'
        : 'Copy the prompt from “Show / copy the prompt” below and paste it into Claude.';
  });
  $('[data-paste]').addEventListener('click', async () => {
    showErr('');
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) throw new Error('empty');
      $('#ai-reply').value = text;
      accept(text);
    } catch {
      $('#ai-reply').focus();
      showErr('Couldn’t read the clipboard. Long-press (or Ctrl/⌘+V) in the box to paste.');
    }
  });
  $('#ai-reply').addEventListener('paste', () => setTimeout(() => accept($('#ai-reply').value), 0));
  $('#ai-reply').addEventListener('change', () => $('#ai-reply').value.trim() && accept($('#ai-reply').value));
  $('[data-copy]').addEventListener('click', async (e) => {
    const ok = await copy(refresh());
    if (!ok) $('[data-prompt]').select();
    e.currentTarget.lastChild.textContent = ok ? ' Copied ✓' : ' Select & copy';
  });

  if (api) {
    const gen = async () => {
      const btn = $('[data-gen]');
      const status = $('[data-status]');
      btn.disabled = true;
      showErr('');
      btn.classList.add('loading');
      status.textContent = 'Claude is working on it…';
      try {
        const text = await callClaude(prompt(), schema, mode);
        $('#ai-reply').value = text;
        status.textContent = 'Done.';
        accept(text);
      } catch (err) {
        status.textContent = '';
        showErr(err.message);
      } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    };
    $('[data-gen]').addEventListener('click', gen);
    $('#ai-req').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) gen();
    });
  }
  return done.then((r) => (r ? r.value : null));
}

const cleanText = (t) => {
  const s = String(t || '').trim();
  if (!s) throw new Error('The reply is empty.');
  return s.replace(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n```$/i, '$1');
};

/** Fill a form's fields with AI. Returns cleaned values or null. */
export function aiFillFields({ title, fields, current, about, context, quick }) {
  const schema = schemaFromFields(fields);
  return aiDialog({
    title: `Fill “${title}” with AI`,
    about: `Fill in the fields of a form: ${about}. Keep my existing values unless my request changes them; fill in empty ones sensibly.`,
    context: { currentValues: current, ...(context || {}) },
    schema,
    quick,
    parse: (json) => {
      const v = cleanFieldValues(fields, json);
      if (!Object.keys(v).length) throw new Error('The reply had no usable values for this form.');
      return v;
    },
  });
}

/** Free text (Markdown) from Claude: study guides, explanations. */
export function aiText({ title, about, context, instructions, request, quick, placeholder }) {
  return aiDialog({ title, about, context, instructions, request, quick, placeholder, mode: 'text' });
}

/**
 Suggest new list items (tasks, landmarks, topics…). itemFields are form-style field defs.
 Shows a preview where the user ticks which to add. Resolves to the chosen items or [].
*/
export async function aiSuggestList({ title, about, itemFields, context, instructions = '', placeholder, quick }) {
  const itemSchema = schemaFromFields(itemFields);
  const schema = { type: 'object', properties: { items: { type: 'array', items: itemSchema } }, required: ['items'], additionalProperties: false };
  const items = await aiDialog({
    title,
    about,
    instructions,
    context,
    schema,
    placeholder,
    quick,
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

export function pickSuggestions(items, itemFields, { title = 'Choose what to add', describe } = {}) {
  const main = itemFields[0].name;
  const { dlg, close, done } = openDialog(
    `<div class="modal-body">
      <h2 class="modal-title">${esc(title)}</h2>
      <p class="muted small">Untick anything you don't want. You can edit items after adding them.</p>
      <div class="row-wrap small"><button type="button" class="btn btn-small btn-ghost" data-all>Select all</button><button type="button" class="btn btn-small btn-ghost" data-none>Select none</button></div>
      <ul class="suggest-list">${items
        .map((it, i) => {
          const rest = describe ? describe(it) : itemFields.slice(1).filter((f) => it[f.name] != null && it[f.name] !== '').map((f) => `${f.label}: ${typeof it[f.name] === 'object' ? JSON.stringify(it[f.name]) : it[f.name]}`).join(' · ');
          return `<li><label><input type="checkbox" checked data-i="${i}"> <span><strong>${esc(it[main] ?? '(untitled)')}</strong>${rest ? `<br><span class="small muted">${esc(rest)}</span>` : ''}</span></label></li>`;
        })
        .join('')}</ul>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-add>Add selected</button></div>
    </div>`,
    { wide: true, label: title }
  );
  const boxes = () => dlg.querySelectorAll('input[data-i]');
  dlg.querySelector('[data-all]').addEventListener('click', () => boxes().forEach((b) => (b.checked = true)));
  dlg.querySelector('[data-none]').addEventListener('click', () => boxes().forEach((b) => (b.checked = false)));
  dlg.querySelector('[data-add]').addEventListener('click', () => {
    close([...dlg.querySelectorAll('input[data-i]:checked')].map((c) => items[+c.dataset.i]));
  });
  return done.then((r) => {
    if (r?.length) toast(`Added ${r.length} item${r.length === 1 ? '' : 's'}.`);
    return r || [];
  });
}
