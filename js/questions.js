// Practice-test questions: AI schema, validation/import, marking, rating suggestions.
// The schema is documented in docs/QUESTION_SCHEMA.md — keep the two in sync.

import { uid } from './util.js';
import { newTopic } from './model.js';

export const KINDS = ['mcq', 'short', 'numerical', 'long'];

const ns = (description) => ({ type: ['string', 'null'], description });
const nn = (description) => ({ type: ['number', 'null'], description });

export const QUESTION_JSON_SCHEMA = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: KINDS, description: 'mcq = multiple choice, short = short answer, numerical = number with tolerance, long = worked/long answer' },
          prompt: { type: 'string', description: 'The question text' },
          options: { type: ['array', 'null'], items: { type: 'string' }, description: 'mcq only: 2–6 options, without letters' },
          correctIndex: { type: ['integer', 'null'], description: 'mcq only: 0-based index of the correct option' },
          answer: ns('short: accepted answer (use | to separate alternatives); numerical: the number as a string'),
          tolerance: nn('numerical only: absolute tolerance, e.g. 0.01'),
          unit: ns('numerical only: unit, e.g. MPa'),
          modelAnswer: { type: 'string', description: 'Full worked/model answer and marking points' },
          marks: { type: 'integer', description: 'Marks available, at least 1' },
          topic: ns('Topic name (match an existing topic name exactly when one fits)'),
          sourceFile: ns('File name the question is based on'),
        },
        required: ['kind', 'prompt', 'options', 'correctIndex', 'answer', 'tolerance', 'unit', 'modelAnswer', 'marks', 'topic', 'sourceFile'],
        additionalProperties: false,
      },
    },
  },
  required: ['questions'],
  additionalProperties: false,
};

/**
 Validate AI/pasted JSON and turn it into question records.
 exam: the test's exam (topics matched by name; missing ones created if createTopics).
 Returns {questions, newTopics, warnings}. Throws if nothing valid.
*/
export function importQuestions(json, { exam = null, files = [], createTopics = true } = {}) {
  const arr = Array.isArray(json) ? json : json?.questions;
  if (!Array.isArray(arr)) throw new Error('Expected {"questions": [...]}.');
  const warnings = [];
  const questions = [];
  const newTopics = [];
  const topicByName = new Map((exam?.topics || []).map((t) => [t.name.toLowerCase(), t]));

  arr.forEach((q, i) => {
    const n = `Question ${i + 1}`;
    if (!q || typeof q !== 'object') return warnings.push(`${n}: not an object, skipped.`);
    const kind = String(q.kind || '').toLowerCase();
    if (!KINDS.includes(kind)) return warnings.push(`${n}: unknown kind "${q.kind}", skipped.`);
    const prompt = String(q.prompt || '').trim();
    if (!prompt) return warnings.push(`${n}: missing prompt, skipped.`);
    const rec = {
      id: uid(), kind, prompt,
      options: [], correctIndex: null, answer: '', tolerance: 0, unit: '',
      modelAnswer: String(q.modelAnswer || '').trim(),
      marks: Math.max(1, Math.round(Number(q.marks) || 1)),
      examId: exam?.id || null, topicId: null, sourceFileId: null,
    };
    if (kind === 'mcq') {
      const opts = (Array.isArray(q.options) ? q.options : []).map((o) => String(o).trim()).filter(Boolean);
      const ci = Number(q.correctIndex);
      if (opts.length < 2) return warnings.push(`${n}: multiple choice needs at least 2 options, skipped.`);
      if (!Number.isInteger(ci) || ci < 0 || ci >= opts.length) return warnings.push(`${n}: correctIndex out of range, skipped.`);
      rec.options = opts;
      rec.correctIndex = ci;
    } else if (kind === 'numerical') {
      const v = Number(String(q.answer ?? '').replace(/,/g, ''));
      if (!Number.isFinite(v)) return warnings.push(`${n}: numerical answer is not a number, skipped.`);
      rec.answer = String(v);
      rec.tolerance = Math.abs(Number(q.tolerance) || 0);
      rec.unit = String(q.unit || '');
    } else if (kind === 'short') {
      rec.answer = String(q.answer || '').trim();
    }
    if (!rec.modelAnswer) {
      if (kind === 'long') warnings.push(`${n}: no model answer given.`);
      rec.modelAnswer = kind === 'mcq' ? rec.options[rec.correctIndex] : rec.answer;
    }
    const tName = String(q.topic || '').trim();
    if (tName && exam) {
      let t = topicByName.get(tName.toLowerCase());
      if (!t && createTopics) {
        t = newTopic(tName);
        topicByName.set(tName.toLowerCase(), t);
        newTopics.push(t);
      }
      if (t) rec.topicId = t.id;
    }
    const src = String(q.sourceFile || '').trim().toLowerCase();
    if (src) rec.sourceFileId = files.find((f) => f.name.toLowerCase() === src)?.id || null;
    questions.push(rec);
  });
  if (!questions.length) throw new Error('No valid questions found.' + (warnings.length ? '\n' + warnings.join('\n') : ''));
  return { questions, newTopics, warnings };
}

export const totalMarks = (test) => test.questions.reduce((s, q) => s + (q.marks || 1), 0);

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.。]$/, '');

/** Auto-mark one answer. Returns {awarded, auto} where auto=false means self-mark needed. */
export function autoMark(q, response) {
  const marks = q.marks || 1;
  if (q.kind === 'mcq') return { awarded: Number(response) === q.correctIndex ? marks : 0, auto: true };
  if (q.kind === 'numerical') {
    const v = Number(String(response ?? '').replace(/,/g, '').trim());
    if (String(response ?? '').trim() === '' || !Number.isFinite(v)) return { awarded: 0, auto: true };
    return { awarded: Math.abs(v - Number(q.answer)) <= (q.tolerance || 0) + 1e-12 ? marks : 0, auto: true };
  }
  if (q.kind === 'short') {
    // Suggest full marks on an exact match; the user confirms.
    const ok = q.answer && q.answer.split('|').some((a) => norm(a) && norm(a) === norm(response));
    return { awarded: ok ? marks : 0, auto: false };
  }
  return { awarded: 0, auto: false };
}

/** Aggregate per exam and per exam-topic. */
export function aggregate(test, answers) {
  const byExam = {}, byTopic = {};
  for (const q of test.questions) {
    const a = answers.find((x) => x.qId === q.id);
    if (!a) continue;
    const examId = q.examId || test.examId;
    if (examId) {
      byExam[examId] ??= { got: 0, max: 0 };
      byExam[examId].got += a.awarded;
      byExam[examId].max += a.max;
      if (q.topicId) {
        const k = `${examId}:${q.topicId}`;
        byTopic[k] ??= { got: 0, max: 0 };
        byTopic[k].got += a.awarded;
        byTopic[k].max += a.max;
      }
    }
  }
  return { byExam, byTopic };
}

/** Rating suggestion for a topic score. Returns a rating id or null (no change). */
export function suggestRating(pct, current) {
  if (pct < 50) return current === 'confident' || (current === 'unknown' && pct > 0) ? 'practice' : null;
  if (pct >= 80) return current === 'confident' ? null : 'confident';
  return current === 'unknown' ? 'practice' : null;
}

/** Prompt instructions for generating questions from file text. */
export function questionInstructions({ count, kinds, exam }) {
  return [
    `Write ${count} practice questions based ONLY on the source material below.`,
    `Use these question kinds: ${kinds.join(', ')}.`,
    'Mix difficulty. For numerical questions give a sensible tolerance. Every question needs a full model answer with marking points.',
    exam?.topics?.length ? `Tag each question with one of these topic names where it fits: ${exam.topics.map((t) => `"${t.name}"`).join(', ')}. If none fit, give a short new topic name.` : 'Tag each question with a short topic name.',
    'Set sourceFile to the file name the question came from.',
  ].join('\n');
}
