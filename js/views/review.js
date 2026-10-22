import * as db from '../db.js';
import { esc, today } from '../util.js';
import { emptyState } from '../ui.js';
import { query } from '../router.js';
import { icon } from '../icons.js';
import { GRADES, grade, previewIntervals, studyQueue } from '../srs.js';

// Flashcard review session. #/study/review?exam=&topic=&skill=
// Due/new cards are scheduled with spaced repetition; if nothing is due in a deck you can
// still practise it ("cram" mode), which doesn't change the schedule.

export async function render(el) {
  const q = query();
  const [allCards, exams, skills] = await Promise.all([db.getAll('cards'), db.getAll('exams'), db.getAll('skills')]);
  const exam = exams.find((e) => e.id === q.get('exam'));
  const topicId = q.get('topic');
  const topic = exam?.topics.find((t) => t.id === topicId);
  const skill = skills.find((s) => s.id === q.get('skill'));
  let deck = allCards;
  if (exam) deck = deck.filter((c) => c.examId === exam.id && (topicId ? (topicId === 'none' ? !c.topicId : c.topicId === topicId) : true));
  if (skill) deck = deck.filter((c) => c.skillId === skill.id);
  const name = topic ? topic.name : exam ? exam.title : skill ? skill.name : 'All decks';
  const back = topic ? `#/exams/${exam.id}/topics/${topic.id}` : exam ? `#/exams/${exam.id}` : skill ? `#/skills/${skill.id}` : '#/study';

  const t = today();
  const newToday = allCards.filter((c) => (c.history || [])[0]?.date === t).length;
  let queue = studyQueue(deck, newToday);
  let cram = false;
  if (!queue.length && deck.length && q.get('cram') === '1') {
    cram = true;
    queue = [...deck].sort(() => Math.random() - 0.5);
  }
  if (!queue.length) {
    el.innerHTML = `<nav class="crumbs"><a href="${back}">${icon('left', 14)} Back</a></nav>
      <h1>${esc(name)}</h1>
      ${emptyState(deck.length ? 'All caught up — nothing due right now. 🎉' : 'No flashcards here yet.',
        deck.length ? `<a class="btn btn-primary" href="${location.hash}${location.hash.includes('?') ? '&' : '?'}cram=1">Practise anyway</a> <a class="btn" href="${back}">Back</a>` : `<a class="btn" href="${back}">Back</a>`)}`;
    return;
  }

  const total = queue.length;
  let done = 0;
  const tally = { 1: 0, 2: 0, 3: 0, 4: 0 };
  const started = Date.now();
  let flipped = false;

  const draw = () => {
    if (!queue.length) return finish();
    const c = queue[0];
    const ivals = previewIntervals(c);
    flipped = false;
    el.innerHTML = `
      <div class="review-wrap">
        <nav class="crumbs"><a href="${back}">${icon('left', 14)} End session</a></nav>
        <div class="spread"><h1 style="margin:0">${esc(name)}</h1><span class="small muted">${done} / ${total}${cram ? ' · practice mode' : ''}</span></div>
        <div class="progress mt" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}" aria-label="Session progress"><div class="progress-fill" style="width:${(done / total) * 100}%"></div></div>
        <div class="flashcard" data-flip tabindex="0" role="button" aria-label="Flashcard. Press space to show the answer.">
          <div class="flashcard-inner">
            <div class="face front"><span class="face-label">Question</span>${esc(c.front)}<span class="small muted" style="font-weight:500">Tap or press space to reveal</span></div>
            <div class="face back"><span class="face-label">Answer</span><span class="face-q">${esc(c.front)}</span>${esc(c.back)}</div>
          </div>
        </div>
        <div data-grades hidden>
          <p class="small muted center" style="margin-bottom:.5rem">How well did you remember it?</p>
          <div class="grade-row">${GRADES.map((g, i) => `<button class="grade-btn ${g.cls}" data-g="${g.g}">${g.label}<small>${cram ? '&nbsp;' : ivals[i]}</small><kbd>${g.key}</kbd></button>`).join('')}</div>
        </div>
        <div class="center" data-show><button class="btn btn-primary btn-lg" data-reveal>${icon('rotate', 18)} Show answer</button></div>
      </div>`;
    const card = el.querySelector('[data-flip]');
    const reveal = () => {
      if (flipped) return;
      flipped = true;
      card.classList.add('flipped');
      card.setAttribute('aria-label', 'Answer shown. Rate how well you remembered it: 1 Again, 2 Hard, 3 Good, 4 Easy.');
      el.querySelector('[data-grades]').hidden = false;
      el.querySelector('[data-show]').hidden = true;
      el.querySelector('.grade-btn[data-g="3"]').focus();
    };
    card.addEventListener('click', reveal);
    el.querySelector('[data-reveal]').addEventListener('click', reveal);
    el.querySelectorAll('[data-g]').forEach((b) => b.addEventListener('click', () => answer(+b.dataset.g)));
    card.focus();
  };

  async function answer(g) {
    const c = queue.shift();
    tally[g]++;
    if (!cram) {
      const updated = grade(c, g);
      await db.put('cards', updated);
      if (g === 1) queue.push(updated); // see it again this session
      else done++;
    } else {
      if (g === 1) queue.push(c);
      else done++;
    }
    draw();
  }

  const onKey = (e) => {
    if (!document.body.contains(el.querySelector('.review-wrap'))) return document.removeEventListener('keydown', onKey);
    if (e.target.closest('input, textarea, select') || document.querySelector('dialog[open]')) return;
    if ((e.key === ' ' || e.key === 'Enter') && !flipped) {
      e.preventDefault();
      el.querySelector('[data-reveal]')?.click();
    } else if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      answer(Number(e.key));
    }
  };
  document.addEventListener('keydown', onKey);

  function finish() {
    document.removeEventListener('keydown', onKey);
    const mins = Math.max(1, Math.round((Date.now() - started) / 60000));
    const reviewed = tally[1] + tally[2] + tally[3] + tally[4];
    el.innerHTML = `<div class="review-wrap center">
      <div class="hero" style="text-align:left"><h1>Session complete 🎉</h1><p>${total} card${total === 1 ? '' : 's'} · ${reviewed} answers · about ${mins} min</p>
        <div class="hero-stats">${GRADES.map((g) => `<div class="hero-stat"><b>${tally[g.g]}</b><span>${g.label}</span></div>`).join('')}</div></div>
      <div class="row-wrap center-row"><a class="btn btn-primary" href="${back}">Done</a><a class="btn" href="#/study">Study hub</a></div></div>`;
  }

  draw();
}

