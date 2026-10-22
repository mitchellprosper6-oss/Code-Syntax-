// Add/edit forms shared across pages. Every form has a "Fill with AI" button (see ui.formModal).

import * as db from './db.js';
import { formModal, toast } from './ui.js';
import { CATEGORIES, PROJECT_STATUSES, PHASES, LEVELS, RESOURCE_KINDS, today } from './util.js';
import { newProject, newExam, newSkill, getLists, defaultLevelDescriptions, newTask, newCriterion, newLandmark } from './model.js';
import { aiSuggestList } from './ai.js';

const opts = (arr) => arr.map((x) => (typeof x === 'string' ? { value: x, label: x } : { value: x.id, label: x.label }));
const withCurrent = (list, v) => (v && !list.includes(v) ? [...list, v] : list);

// ---------- projects ----------
export async function projectFields(current = {}) {
  const lists = await getLists();
  return [
    { name: 'title', label: 'Title', required: true },
    { name: 'module', label: 'Module / subject' },
    { name: 'category', label: 'Category', type: 'select', options: opts(CATEGORIES) },
    { name: 'type', label: 'Type', type: 'select', options: opts(withCurrent(lists.projectTypes, current.type)), help: 'Edit this list in Settings' },
    { name: 'deadline', label: 'Deadline', type: 'when', help: 'Pick a date, or tick TBC and add an approximate month' },
    { name: 'status', label: 'Status', type: 'select', options: opts(PROJECT_STATUSES) },
    { name: 'description', label: 'Description', type: 'textarea', rows: 4 },
  ];
}

export async function editProject(existing = null, prefill = {}) {
  const base = existing || newProject(prefill);
  const fields = await projectFields(base);
  const v = await formModal({
    title: existing ? 'Edit project' : 'Add project',
    fields,
    values: { ...base, ...prefill },
    ai: { about: 'a uni/work/personal project or coursework with a deadline' },
  });
  if (!v) return null;
  const saved = await db.put('projects', { ...base, ...v });
  toast(existing ? 'Project saved.' : 'Project added.');
  return saved;
}

// ---------- exams ----------
export async function examFields(current = {}) {
  const lists = await getLists();
  return [
    { name: 'title', label: 'Title', required: true },
    { name: 'module', label: 'Module' },
    { name: 'category', label: 'Category', type: 'select', options: opts(CATEGORIES) },
    { name: 'type', label: 'Type', type: 'select', options: opts(withCurrent(lists.examTypes, current.type)) },
    { name: 'date', label: 'Date', type: 'when' },
    { name: 'formatNotes', label: 'Format notes', type: 'textarea', help: 'Length, sections, calculator allowed, etc.' },
    { name: 'syllabus', label: 'Syllabus / criteria', type: 'textarea', rows: 5 },
  ];
}

export async function editExam(existing = null, prefill = {}) {
  const base = existing || newExam(prefill);
  const fields = await examFields(base);
  const v = await formModal({
    title: existing ? 'Edit exam' : 'Add exam',
    fields,
    values: { ...base, ...prefill },
    ai: { about: 'an exam, test or quiz' },
  });
  if (!v) return null;
  const saved = await db.put('exams', { ...base, ...v });
  toast(existing ? 'Exam saved.' : 'Exam added.');
  return saved;
}

// ---------- skills ----------
export async function skillFields() {
  const sections = (await db.getAll('sections')).sort((a, b) => a.order - b.order);
  const subgroups = [...new Set(sections.flatMap((s) => s.subgroups || []))];
  return [
    { name: 'name', label: 'Skill name', required: true },
    { name: 'sectionId', label: 'Section', type: 'select', options: sections.map((s) => ({ value: s.id, label: s.name })) },
    { name: 'subgroup', label: 'Sub-group (optional)', help: subgroups.length ? `e.g. ${subgroups.join(', ')}` : 'e.g. Drawing' },
    { name: 'phase', label: 'Phase', type: 'select', options: opts(PHASES) },
    { name: 'level', label: 'Current level', type: 'select', options: [{ value: '', label: 'Suggest from landmarks' }, ...LEVELS.map((l, i) => ({ value: String(i + 1), label: `${i + 1} · ${l}` }))] },
    { name: 'targetLevel', label: 'Target level', type: 'select', options: LEVELS.map((l, i) => ({ value: String(i + 1), label: `${i + 1} · ${l}` })) },
    { name: 'goals', label: 'Future goals', type: 'textarea', help: 'Where you want this skill to be, and by when' },
    { name: 'actionNotes', label: 'What to do next (action notes)', type: 'textarea' },
    { name: 'module', label: 'Linked uni module (optional)', help: 'Exact module name, to link its projects and exams' },
    { name: 'quickMinutes', label: 'One-tap log: minutes', type: 'number', min: 1, max: 600 },
    { name: 'quickNote', label: 'One-tap log: note', placeholder: 'Practice session' },
  ];
}

export async function editSkill(existing = null, prefill = {}) {
  const base = existing || newSkill();
  const fields = await skillFields();
  const values = {
    ...base,
    level: base.levelOverride ? String(base.levelOverride) : '',
    targetLevel: String(base.targetLevel || 3),
    quickMinutes: base.quickLog?.minutes,
    quickNote: base.quickLog?.note,
    ...prefill,
  };
  const v = await formModal({
    title: existing ? 'Edit skill' : 'Add skill',
    fields,
    values,
    ai: {
      about: 'a skill I am learning. Estimate my current level 1–5 only from what I describe.',
      context: { landmarks: base.landmarks.map((l) => ({ text: l.text, done: l.done })) },
    },
  });
  if (!v) return null;
  const { level, quickMinutes, quickNote, targetLevel, ...rest } = v;
  const rec = {
    ...base,
    ...rest,
    targetLevel: Number(targetLevel) || 3,
    quickLog: { minutes: quickMinutes || 30, note: quickNote || 'Practice session' },
  };
  if (level) {
    rec.levelOverride = Number(level);
    rec.levelSet = true;
  } else if (existing && existing.levelOverride != null) {
    rec.levelOverride = null;
    rec.levelSet = true;
  }
  if (!existing) rec.levelDescriptions = defaultLevelDescriptions(rec.landmarks);
  const saved = await db.put('skills', rec);
  toast(existing ? 'Skill saved.' : 'Skill added.');
  return saved;
}

// ---------- list items ----------
export const taskFields = () => [
  { name: 'name', label: 'Task / milestone', required: true },
  { name: 'weight', label: 'Weight (optional)', type: 'number', min: 0, step: 'any', help: 'Bigger tasks count more towards completion %. Blank = 1' },
  { name: 'due', label: 'Due date (optional)', type: 'date' },
  { name: 'focusFlag', label: 'Needs focus', type: 'checkbox' },
  { name: 'focusNote', label: 'Focus note', placeholder: 'Why does this need attention?' },
];
export const taskToValues = (t) => ({ ...t, focusFlag: t.focus?.flag, focusNote: t.focus?.note });
export const valuesToTask = (v, base = newTask()) => ({
  ...base, name: v.name, weight: v.weight ?? null, due: v.due || null, focus: { flag: !!v.focusFlag, note: v.focusNote || '' },
});

export const criterionFields = () => [
  { name: 'name', label: 'Criterion', required: true },
  { name: 'weight', label: 'Weighting %', type: 'number', min: 0, max: 100, step: 'any' },
  { name: 'selfRating', label: 'Self-rating', type: 'select', options: [{ value: '', label: 'Not rated' }, ...[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} / 5` }))] },
  { name: 'notes', label: 'Notes', type: 'textarea' },
  { name: 'focusFlag', label: 'Needs focus', type: 'checkbox' },
  { name: 'focusNote', label: 'Focus note' },
];
export const criterionToValues = (c) => ({ ...c, selfRating: c.selfRating ? String(c.selfRating) : '', focusFlag: c.focus?.flag, focusNote: c.focus?.note });
export const valuesToCriterion = (v, base = newCriterion()) => ({
  ...base, name: v.name, weight: v.weight ?? null, selfRating: v.selfRating ? Number(v.selfRating) : null, notes: v.notes || '', focus: { flag: !!v.focusFlag, note: v.focusNote || '' },
});

export const resourceFields = () => [
  { name: 'title', label: 'Title', required: true },
  { name: 'kind', label: 'Kind', type: 'select', options: opts(RESOURCE_KINDS) },
  { name: 'url', label: 'Link (optional)', type: 'url', placeholder: 'https://' },
  { name: 'notes', label: 'Notes' },
];

export const logFields = () => [
  { name: 'date', label: 'Date', type: 'date', required: true },
  { name: 'minutes', label: 'Minutes', type: 'number', min: 0 },
  { name: 'text', label: 'What I did', type: 'textarea', required: true, placeholder: 'e.g. 2h on literature review' },
];

export const practiceFields = () => [
  { name: 'date', label: 'Date', type: 'date', required: true },
  { name: 'minutes', label: 'Minutes', type: 'number', min: 1, required: true },
  { name: 'note', label: 'What I did', type: 'textarea' },
];

// ---------- AI list suggestions ----------
export function suggestTasks(project) {
  return aiSuggestList({
    title: 'Suggest tasks and milestones',
    about: 'Break this project into a practical, ordered checklist of tasks/milestones with weights (relative effort) and due dates before the deadline.',
    instructions: 'Do not repeat existing tasks. Typically 5–12 items. Weight = relative effort (1–5). Due dates must be on or before the deadline if there is one.',
    context: { project: slimProject(project) },
    itemFields: taskFields(),
    placeholder: 'e.g. Report needs intro, lit review, method, results, discussion. I want to finish a week early.',
  }).then((items) => items.map((v) => valuesToTask(v)));
}

export function suggestCriteria(project) {
  return aiSuggestList({
    title: 'Add marking criteria',
    about: 'Turn the marking scheme I paste into a list of criteria with weightings (%). If I paste nothing, suggest typical criteria for this kind of work.',
    instructions: 'Weightings should add up to 100 when the scheme gives them. Leave selfRating null.',
    context: { project: slimProject(project) },
    itemFields: criterionFields(),
    placeholder: 'Paste the marking scheme / rubric here',
  }).then((items) => items.map((v) => valuesToCriterion(v)));
}

export function slimProject(p) {
  return {
    title: p.title, module: p.module, type: p.type, deadline: p.deadline, status: p.status, description: p.description,
    tasks: (p.tasks || []).map((t) => ({ name: t.name, done: t.done, due: t.due })),
    criteria: (p.criteria || []).map((c) => ({ name: c.name, weight: c.weight })),
  };
}

export function suggestTopics(exam) {
  return aiSuggestList({
    title: 'Suggest topics',
    about: 'List the revision topics for this exam, one per item, based on the syllabus/notes I paste and the module.',
    instructions: 'Short topic names (2–6 words). Do not repeat existing topics. Leave rating null unless I say how confident I am.',
    context: { exam: { title: exam.title, module: exam.module, type: exam.type, formatNotes: exam.formatNotes, syllabus: exam.syllabus, existingTopics: exam.topics.map((t) => t.name) } },
    itemFields: [
      { name: 'name', label: 'Topic', required: true },
      { name: 'rating', label: 'Rating', type: 'select', options: [{ value: 'confident', label: 'Confident' }, { value: 'practice', label: 'Needs practice' }, { value: 'unknown', label: "Don't know yet" }] },
    ],
    placeholder: 'Paste the syllabus or list of lectures, or describe what is covered',
  });
}

export function suggestLandmarks(skill) {
  return aiSuggestList({
    title: 'Suggest landmarks',
    about: 'Suggest the next milestones (landmarks) for learning this skill, in order from easiest to hardest. Each should be concrete and checkable.',
    instructions: 'Do not repeat existing landmarks. 3–8 items.',
    context: { skill: slimSkill(skill) },
    itemFields: [{ name: 'text', label: 'Landmark', required: true }],
  }).then((items) => items.map((v) => newLandmark(v.text)));
}

export function suggestResources(skill) {
  return aiSuggestList({
    title: 'Suggest resources',
    about: 'Suggest learning resources (courses, books, videos, software tutorials) for this skill at my level.',
    instructions: 'Only well-known, real resources. Put a URL only if you are sure it is correct; otherwise null.',
    context: { skill: slimSkill(skill) },
    itemFields: resourceFields(),
  });
}

export function slimSkill(s) {
  return {
    name: s.name, subgroup: s.subgroup, phase: s.phase, currentLevel: s.levelOverride, targetLevel: s.targetLevel, goals: s.goals, actionNotes: s.actionNotes,
    landmarks: s.landmarks.map((l) => ({ text: l.text, done: l.done })),
  };
}

export const todayValue = () => ({ date: today() });
