// Domain logic shared by views: record factories, calculations, lookups.

import * as db from './db.js';
import { uid, today, daysUntil, hasDate, isClosed, LEVELS, clamp } from './util.js';

// ---------- factories ----------
export const newProject = (v = {}) => ({
  title: '', module: '', category: 'uni', type: 'Coursework',
  deadline: { date: null, tbc: true, approxMonth: null },
  description: '', status: 'not-started',
  criteria: [], tasks: [], progressOverride: null, log: [], fileIds: [],
  ...v,
});

export const newExam = (v = {}) => ({
  title: '', module: '', category: 'uni', type: 'Exam',
  date: { date: null, tbc: true, approxMonth: null },
  formatNotes: '', syllabus: '', topics: [],
  ...v,
});

export const newTopic = (name, rating = 'unknown') => ({ id: uid(), name, rating, history: [{ date: today(), rating }] });
export const newTask = (v) => ({ id: uid(), name: '', weight: null, due: null, done: false, doneAt: null, focus: { flag: false, note: '' }, ...v });
export const newCriterion = (v) => ({ id: uid(), name: '', weight: null, selfRating: null, notes: '', focus: { flag: false, note: '' }, ...v });
export const newLandmark = (text) => ({ id: uid(), text, done: false, doneAt: null });

export function defaultLevelDescriptions(landmarks) {
  const n = landmarks.length;
  return LEVELS.map((name, i) => {
    if (!n) return name;
    if (i === 0) return `Starting out: working on “${landmarks[0].text}”.`;
    const idx = clamp(Math.ceil((i / 4) * n) - 1, 0, n - 1);
    return `Can do: “${landmarks[idx].text}”.`;
  });
}

export const newSkill = (v = {}) => {
  const s = {
    name: '', sectionId: null, subgroup: '', phase: 'unset',
    levelOverride: null, levelSet: false, targetLevel: 3, levelDescriptions: null,
    landmarks: [], actionNotes: '', goals: '', resources: [], practice: [],
    quickLog: { minutes: 30, note: 'Practice session' }, evidence: [], module: '',
    ...v,
  };
  if (!s.levelDescriptions) s.levelDescriptions = defaultLevelDescriptions(s.landmarks);
  return s;
};

// ---------- projects ----------
export function taskProgress(tasks) {
  if (!tasks.length) return null;
  let total = 0, done = 0;
  for (const t of tasks) {
    const w = t.weight > 0 ? Number(t.weight) : 1;
    total += w;
    if (t.done) done += w;
  }
  return total ? (done / total) * 100 : 0;
}

export function projectProgress(p) {
  if (p.progressOverride != null && p.progressOverride !== '') return Number(p.progressOverride);
  const t = taskProgress(p.tasks || []);
  if (t != null) return t;
  return p.status === 'done' || p.status === 'submitted' ? 100 : 0;
}

export function focusItems(p) {
  const out = [];
  for (const t of p.tasks || []) if (t.focus?.flag) out.push({ kind: 'Task', name: t.name, note: t.focus.note, id: t.id });
  for (const c of p.criteria || []) if (c.focus?.flag) out.push({ kind: 'Criterion', name: c.name, note: c.focus.note, id: c.id });
  return out;
}

/** Estimated mark from criteria weights and 1–5 self-ratings. */
export function estimatedMark(criteria) {
  const rated = criteria.filter((c) => c.weight > 0 && c.selfRating);
  const w = rated.reduce((s, c) => s + Number(c.weight), 0);
  if (!w) return null;
  return rated.reduce((s, c) => s + (Number(c.weight) * c.selfRating) / 5, 0) / w * 100;
}

// ---------- exams ----------
export function topicCounts(topics) {
  const c = { confident: 0, practice: 0, unknown: 0 };
  for (const t of topics || []) c[t.rating] = (c[t.rating] || 0) + 1;
  return c;
}
export function readiness(exam) {
  const c = topicCounts(exam.topics);
  const n = c.confident + c.practice + c.unknown;
  return n ? (c.confident / n) * 100 : null;
}

export function setTopicRating(topic, rating) {
  if (topic.rating === rating) return topic;
  topic.rating = rating;
  topic.history = [...(topic.history || []), { date: today(), at: new Date().toISOString(), rating }];
  return topic;
}

// ---------- skills ----------
export function landmarkPct(s) {
  const n = s.landmarks.length;
  return n ? (s.landmarks.filter((l) => l.done).length / n) * 100 : 0;
}
export function suggestedLevel(s) {
  const n = s.landmarks.length;
  if (!n) return 1;
  return 1 + Math.round((4 * s.landmarks.filter((l) => l.done).length) / n);
}
export const effectiveLevel = (s) => s.levelOverride ?? suggestedLevel(s);
export const nextLandmark = (s) => s.landmarks.find((l) => !l.done) || null;
export const landmarksThisMonth = (s, ym = today().slice(0, 7)) => s.landmarks.filter((l) => l.done && (l.doneAt || '').startsWith(ym)).length;

export function linkedItems(skill, projects, exams) {
  const m = (skill.module || '').trim().toLowerCase();
  if (!m) return { projects: [], exams: [] };
  return {
    projects: projects.filter((p) => (p.module || '').trim().toLowerCase() === m),
    exams: exams.filter((e) => (e.module || '').trim().toLowerCase() === m),
  };
}

// ---------- dashboard ----------
export function upcoming(projects, exams) {
  const dated = [], tbc = [];
  for (const p of projects) {
    if (isClosed(p)) continue;
    const item = { kind: 'Project', title: p.title, href: `#/projects/${p.id}`, category: p.category, when: p.deadline, sub: p.module };
    hasDate(p.deadline) ? dated.push({ ...item, days: daysUntil(p.deadline.date), date: p.deadline.date }) : tbc.push(item);
    for (const t of p.tasks || []) {
      if (!t.done && t.due) dated.push({ kind: 'Task', title: t.name, href: `#/projects/${p.id}`, category: p.category, sub: p.title, days: daysUntil(t.due), date: t.due });
    }
  }
  for (const e of exams) {
    const item = { kind: e.type || 'Exam', title: e.title, href: `#/exams/${e.id}`, category: e.category, when: e.date, sub: e.module };
    if (hasDate(e.date)) {
      const d = daysUntil(e.date.date);
      if (d >= 0) dated.push({ ...item, days: d, date: e.date.date });
    } else tbc.push(item);
  }
  dated.sort((a, b) => a.date.localeCompare(b.date));
  tbc.sort((a, b) => (a.when?.approxMonth || '9999').localeCompare(b.when?.approxMonth || '9999'));
  return { dated, tbc };
}

export async function loadAll() {
  const [projects, exams, tests, attempts, skills, sections, files] = await Promise.all(
    ['projects', 'exams', 'tests', 'attempts', 'skills', 'sections', 'files'].map((s) => db.getAll(s))
  );
  sections.sort((a, b) => a.order - b.order);
  attempts.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  const byTitle = (a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || '');
  projects.sort(byTitle);
  exams.sort(byTitle);
  skills.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  return { projects, exams, tests, attempts, skills, sections, files };
}

/** Exam id + topic id → names. */
export function topicName(exams, examId, topicId) {
  const e = exams.find((x) => x.id === examId);
  return e?.topics.find((t) => t.id === topicId)?.name || null;
}

export async function getLists() {
  return db.getMeta('lists', { projectTypes: ['Coursework', 'Project report', 'Personal project'], examTypes: ['In-person quiz', 'Test', 'Exam'] });
}
