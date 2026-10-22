// Focus timer (Pomodoro). State lives in localStorage so it survives page changes and reloads.
// When a focus block ends, the minutes are logged to what you were working on.

import * as db from './db.js';
import { esc, today, uid, fmtDuration, isClosed } from './util.js';
import { openDialog, toast, confirmDialog } from './ui.js';
import { icon } from './icons.js';

const KEY = 'timer';
let chip = null;
let tickHandle = null;
const listeners = new Set();

const state = () => db.getSetting(KEY, null);
const setState = (s) => {
  db.setSetting(KEY, s);
  render();
  listeners.forEach((fn) => fn(s));
};
export const onTimerChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export function remainingSec(s = state()) {
  if (!s) return 0;
  if (s.paused) return s.remaining;
  return Math.max(0, Math.round((s.endsAt - Date.now()) / 1000));
}

export function start(target, minutes, mode = 'focus') {
  setState({ mode, minutes, target, endsAt: Date.now() + minutes * 60000, startedAt: Date.now(), paused: false, remaining: null });
}
export function pause() {
  const s = state();
  if (s && !s.paused) setState({ ...s, paused: true, remaining: remainingSec(s) });
}
export function resume() {
  const s = state();
  if (s?.paused) setState({ ...s, paused: false, endsAt: Date.now() + s.remaining * 1000 });
}

/** Log minutes of focus to the target. */
export async function logFocus(target, minutes) {
  if (minutes < 1) return;
  const date = today();
  const base = { id: uid(), date, minutes, kind: 'focus', refType: target?.type || 'none', refId: target?.id || null, label: target?.label || 'Focus session' };
  if (target?.type === 'project') {
    await db.update('projects', target.id, (p) => { p.log.push({ id: uid(), date, minutes, text: `Focus session (${minutes} min)` }); });
    await db.put('sessions', { ...base, mirrored: true });
  } else if (target?.type === 'skill') {
    await db.update('skills', target.id, (s) => { s.practice.push({ id: uid(), date, minutes, note: 'Focus session' }); });
    await db.put('sessions', { ...base, mirrored: true });
  } else if (target?.type === 'topic') {
    await db.put('sessions', { ...base, examId: target.examId, topicId: target.id });
  } else {
    await db.put('sessions', base);
  }
}

export async function stop({ log = true } = {}) {
  const s = state();
  if (!s) return;
  setState(null);
  if (log && s.mode === 'focus') {
    const mins = Math.round((s.minutes * 60 - remainingSec(s)) / 60);
    if (mins >= 1) {
      await logFocus(s.target, mins);
      toast(`Logged ${mins} min${s.target ? ' to ' + s.target.label : ''}.`);
      window.dispatchEvent(new Event('tracker:data'));
    }
  }
}

function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.25, 0.5].forEach((t) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.15, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.2);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + t);
      o.stop(ctx.currentTime + t + 0.22);
    });
  } catch {}
}

async function complete(s) {
  setState(null);
  beep();
  if (s.mode === 'focus') {
    await logFocus(s.target, s.minutes);
    window.dispatchEvent(new Event('tracker:data'));
    toast(`Focus block done: ${s.minutes} min logged${s.target ? ' to ' + s.target.label : ''}.`, {
      action: 'Take 5 min break',
      onAction: () => start(null, 5, 'break'),
      ms: 10000,
    });
  } else {
    toast('Break over. Ready for another focus block?', { action: 'Start', onAction: () => openTimer(), ms: 10000 });
  }
  try {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') new Notification(s.mode === 'focus' ? 'Focus block done' : 'Break over');
  } catch {}
}

function render() {
  if (!chip) return;
  const s = state();
  if (!s) {
    chip.innerHTML = `${icon('timer', 16)}<span class="chip-label">Focus</span>`;
    chip.classList.remove('running', 'is-break');
    chip.setAttribute('aria-label', 'Focus timer');
    return;
  }
  const left = remainingSec(s);
  chip.innerHTML = `${icon(s.paused ? 'pause' : 'timer', 16)}<span class="chip-time">${fmtDuration(left)}</span>`;
  chip.classList.add('running');
  chip.classList.toggle('is-break', s.mode === 'break');
  chip.setAttribute('aria-label', `${s.mode === 'break' ? 'Break' : 'Focus'} timer, ${fmtDuration(left)} left${s.paused ? ', paused' : ''}`);
  if (!s.paused && left <= 0) complete(s);
}

export function mountTimer(el) {
  chip = el;
  chip.addEventListener('click', openTimer);
  render();
  clearInterval(tickHandle);
  tickHandle = setInterval(render, 1000);
}

/** All the things you can focus on, for the target picker. */
async function targets() {
  const [projects, skills, exams] = await Promise.all(['projects', 'skills', 'exams'].map((s) => db.getAll(s)));
  return [
    { group: 'Projects', items: projects.filter((p) => !isClosed(p)).map((p) => ({ type: 'project', id: p.id, label: p.title })) },
    { group: 'Exam topics', items: exams.flatMap((e) => e.topics.map((t) => ({ type: 'topic', id: t.id, examId: e.id, label: `${t.name} (${e.title})` }))) },
    { group: 'Skills', items: skills.map((s) => ({ type: 'skill', id: s.id, label: s.name })) },
  ].filter((g) => g.items.length);
}

/** Open the timer panel. preset: optional target to preselect. */
export async function openTimer(preset = null) {
  const s = state();
  if (s) {
    const left = remainingSec(s);
    const { dlg, close, done } = openDialog(`<div class="modal-body center">
      <h2 class="modal-title">${s.mode === 'break' ? 'Break' : 'Focusing'}${s.target ? ` on ${esc(s.target.label)}` : ''}</h2>
      <div class="timer-big" aria-live="off">${fmtDuration(left)}</div>
      <div class="row-wrap center-row">
        ${s.paused ? `<button class="btn btn-primary" data-a="resume">${icon('play', 16)} Resume</button>` : `<button class="btn" data-a="pause">${icon('pause', 16)} Pause</button>`}
        <button class="btn" data-a="stop">${icon('stop', 16)} Stop${s.mode === 'focus' ? ' & log' : ''}</button>
        <button class="btn btn-ghost" data-a="discard">Discard</button>
      </div>
      <div class="modal-actions"><button class="btn" data-close>Close</button></div></div>`, { label: 'Focus timer' });
    const big = dlg.querySelector('.timer-big');
    const iv = setInterval(() => (big.textContent = fmtDuration(remainingSec())), 1000);
    dlg.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (!a) return;
      if (a === 'pause') pause();
      if (a === 'resume') resume();
      if (a === 'stop') await stop();
      if (a === 'discard' && (await confirmDialog('Stop the timer without logging any time?', { ok: 'Discard' }))) await stop({ log: false });
      close();
    });
    done.then(() => clearInterval(iv));
    return;
  }
  const groups = await targets();
  const presetVal = preset ? JSON.stringify(preset) : '';
  const { dlg, close, done } = openDialog(`<form class="modal-body">
    <h2 class="modal-title">${icon('timer', 20)} Focus timer</h2>
    <p class="muted small">Work in focused blocks. When the block ends, the time is logged to what you picked.</p>
    <div class="field"><label for="tm-target">Working on</label>
      <select id="tm-target" name="target"><option value="">Nothing specific</option>
        ${groups.map((g) => `<optgroup label="${g.group}">${g.items.map((it) => { const v = JSON.stringify(it); return `<option value="${esc(v)}" ${v === presetVal ? 'selected' : ''}>${esc(it.label)}</option>`; }).join('')}</optgroup>`).join('')}
      </select></div>
    <fieldset class="field"><legend>Length</legend>
      <div class="chips">${[25, 50, 90, 120].map((m, i) => `<label class="chip-radio"><input type="radio" name="mins" value="${m}" ${i === 0 ? 'checked' : ''}><span>${m} min</span></label>`).join('')}
      <label class="chip-radio"><input type="radio" name="mins" value="custom"><span>Custom</span></label>
      <input type="number" name="custom" min="1" max="240" placeholder="min" aria-label="Custom minutes" style="width:5.5rem"></div></fieldset>
    <div class="modal-actions"><button type="button" class="btn" data-close>Cancel</button><button class="btn btn-primary" type="submit">${icon('play', 16)} Start</button></div></form>`, { label: 'Focus timer' });
  const form = dlg.querySelector('form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = form.elements;
    let mins = f.mins.value === 'custom' ? Number(f.custom.value) : Number(f.mins.value);
    if (!mins || mins < 1) return toast('Choose how many minutes.');
    const target = f.target.value ? JSON.parse(f.target.value) : null;
    start(target, Math.min(240, mins));
    try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); } catch {}
    close();
  });
  form.elements.custom.addEventListener('focus', () => (form.querySelector('[name=mins][value=custom]').checked = true));
  return done;
}
