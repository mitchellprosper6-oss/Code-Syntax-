// The ✨ assistant: a panel on every page with one-tap AI actions for what you're looking at,
// plus "ask anything" (inline chat with an API key, or opens Claude.ai with your question and context).

import { esc, today } from './util.js';
import { openDialog, toast } from './ui.js';
import { icon } from './icons.js';
import { md } from './md.js';
import { apiEnabled, chatClaude, openInClaude } from './ai.js';

let ctx = null;
let thread = { key: null, messages: [] };

/**
 Views describe themselves for the assistant:
 { key, title, data, actions: [{label, icon, run}], questions: [string], onSave: {label, run(text)} }
*/
export function setAssistant(c) {
  ctx = c;
}
window.addEventListener('tracker:route', () => (ctx = null));

async function generalContext() {
  const { loadAll, upcoming, readiness } = await import('./model.js');
  const d = await loadAll();
  const { dated, tbc } = upcoming(d.projects, d.exams);
  return {
    upcoming: dated.slice(0, 10).map((i) => ({ kind: i.kind, title: i.title, date: i.date, daysLeft: i.days })),
    dateTBC: tbc.map((i) => i.title),
    exams: d.exams.map((e) => ({ title: e.title, readinessPct: readiness(e) == null ? null : Math.round(readiness(e)), weakTopics: e.topics.filter((t) => t.rating !== 'confident').map((t) => t.name) })),
    skills: d.skills.map((s) => ({ name: s.name, level: s.levelOverride, target: s.targetLevel })),
  };
}

const SYSTEM = (data) =>
  `You are the study assistant inside my personal tracker (uni projects, exams, practice tests, skills). I'm a UK engineering student. Today is ${today()}.
Use the context below when it helps. Be concise, practical and encouraging; use short Markdown (bullets, **bold** key terms). If you suggest a plan, make it concrete with times or steps.
Context (JSON):
${JSON.stringify(data, null, 2).slice(0, 60000)}`;

const GLOBAL_ACTIONS = [
  { label: 'Quick add with AI', icon: 'plus', run: async () => (await import('./forms.js')).quickAddWithAI() },
  { label: 'Start a focus timer', icon: 'timer', run: async () => (await import('./timer.js')).openTimer() },
  { label: 'Review flashcards', icon: 'cards', run: () => (location.hash = '#/study/review') },
];
const GLOBAL_QUESTIONS = ['What should I focus on today?', 'Make me a study plan for this week', 'Which exam am I least ready for?'];

export async function openAssistant() {
  const c = ctx;
  const key = c?.key || 'general';
  if (thread.key !== key) thread = { key, messages: [] };
  const api = apiEnabled();
  const actions = [...(c?.actions || []), ...GLOBAL_ACTIONS];
  const questions = c?.questions || GLOBAL_QUESTIONS;

  const { dlg, close, done } = openDialog(
    `<div class="modal-body assistant">
      <div class="modal-head"><h2 class="modal-title"><span class="ai-badge">${icon('sparkles', 18)}</span> Assistant</h2>
        <button class="icon-btn" data-close aria-label="Close">${icon('x')}</button></div>
      <p class="small muted">${c?.title ? `Helping with <strong>${esc(c.title)}</strong>` : 'Ask about anything in your tracker.'}</p>
      <h3 class="eyebrow">Do it for me</h3>
      <div class="action-grid">${actions.map((a, i) => `<button type="button" class="action-tile" data-i="${i}">${icon(a.icon || 'sparkles', 18)}<span>${esc(a.label)}</span></button>`).join('')}</div>
      <h3 class="eyebrow">Ask anything</h3>
      <div class="chat" data-chat>${thread.messages.map(bubble).join('')}</div>
      <div class="chips quick-chips">${questions.map((q) => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>
      <form class="chat-form" data-form>
        <label class="sr-only" for="as-q">Your question</label>
        <textarea id="as-q" rows="2" placeholder="${api ? 'Ask Claude…' : 'Ask Claude… (opens claude.ai with your tracker context)'}"></textarea>
        <button class="btn btn-ai" type="submit" aria-label="Send">${icon(api ? 'send' : 'external', 18)}</button>
      </form>
      ${api ? '' : `<p class="small muted">${icon('key', 14)} Without an API key, questions open in Claude.ai with your context filled in. <a href="#/settings" data-close>Connect a key</a> to chat right here.</p>`}
      <p class="form-error" role="alert" hidden></p>
    </div>`,
    { label: 'Assistant', sheet: true }
  );
  const chatEl = dlg.querySelector('[data-chat]');
  const err = dlg.querySelector('.form-error');
  const ta = dlg.querySelector('#as-q');

  dlg.querySelectorAll('[data-i]').forEach((b) =>
    b.addEventListener('click', async () => {
      close();
      await actions[+b.dataset.i].run();
    })
  );
  dlg.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => ask(b.dataset.q)));
  dlg.querySelector('[data-form]').addEventListener('submit', (e) => {
    e.preventDefault();
    ask(ta.value);
  });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      ask(ta.value);
    }
  });
  chatEl.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const text = thread.messages[+b.dataset.m]?.content;
    if (b.dataset.act === 'copy') {
      try {
        await navigator.clipboard.writeText(text);
        toast('Copied.');
      } catch {}
    }
    if (b.dataset.act === 'save' && c?.onSave) {
      await c.onSave.run(text);
      toast('Saved.');
    }
  });

  async function ask(q) {
    q = (q || '').trim();
    if (!q) return;
    err.hidden = true;
    const data = c?.data ?? (await generalContext());
    if (!api) {
      const prompt = `${SYSTEM(data)}\n\nMy question: ${q}`;
      const { inUrl } = await openInClaude(prompt);
      toast(inUrl ? 'Opened Claude with your question.' : 'Question copied. Paste it into Claude.');
      return;
    }
    ta.value = '';
    thread.messages.push({ role: 'user', content: q });
    chatEl.innerHTML = thread.messages.map(bubble).join('') + `<div class="bubble bot typing"><span></span><span></span><span></span></div>`;
    chatEl.lastElementChild.scrollIntoView({ block: 'end' });
    try {
      const answer = await chatClaude(thread.messages, SYSTEM(data));
      thread.messages.push({ role: 'assistant', content: answer });
    } catch (e) {
      thread.messages.pop();
      err.textContent = e.message;
      err.hidden = false;
      ta.value = q;
    }
    chatEl.innerHTML = thread.messages.map(bubble).join('');
    chatEl.lastElementChild?.scrollIntoView({ block: 'end' });
  }

  function bubble(m, i) {
    if (m.role === 'user') return `<div class="bubble me">${esc(m.content)}</div>`;
    return `<div class="bubble bot">${md(m.content)}<div class="bubble-actions">
      <button type="button" class="btn btn-small btn-ghost" data-act="copy" data-m="${i}">${icon('copy', 14)} Copy</button>
      ${c?.onSave ? `<button type="button" class="btn btn-small btn-ghost" data-act="save" data-m="${i}">${icon('check', 14)} ${esc(c.onSave.label)}</button>` : ''}</div></div>`;
  }
  setTimeout(() => ta.focus(), 50);
  return done;
}
