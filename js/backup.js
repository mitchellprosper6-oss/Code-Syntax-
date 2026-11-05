// Seed loading, export and import. Uses only the db.js data layer.

import * as db from './db.js';
import { uid, today } from './util.js';
import { newProject, newExam, newSkill, newLandmark } from './model.js';
import { SKILL_PACKS, normName } from './skill-packs.js';

export async function seedIfFirstRun() {
  if (await db.getMeta('seeded', false)) return false;
  const res = await fetch('seed.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error('Could not load seed.json');
  await applySeed(await res.json());
  return true;
}

export async function applySeed(seed) {
  const now = new Date().toISOString();
  const stamp = (r) => ({ id: uid(), createdAt: now, updatedAt: now, ...r });

  const sections = seed.sections.map((s, i) => stamp({ key: s.key, name: s.name, order: i, subgroups: s.subgroups || [] }));
  const secId = Object.fromEntries(sections.map((s) => [s.key, s.id]));
  await db.putMany('sections', sections);
  await db.putMany('projects', seed.projects.map((p) => stamp(newProject(p))));
  await db.putMany('exams', seed.exams.map((e) => stamp(newExam(e))));
  await db.putMany('skills', seed.skills.map((s, i) => stamp(expandSkill(s, secId[s.section], i))));
  await db.setMeta('lists', seed.lists);
  await db.setMeta('schemaVersion', db.SCHEMA_VERSION);
  await db.setMeta('seeded', today());
  // seed.json already contains every skill pack.
  await db.setMeta('skillPacks', SKILL_PACKS.map((p) => p.id));
}

/** Compact seed/pack skill → full skill record (without id/timestamps). */
function expandSkill(s, sectionId, order) {
  const { section, aliases, landmarks, quickLogMinutes, quickLogNote, dailyTargetMin, resources, ...rest } = s;
  return newSkill({
    ...rest,
    order,
    sectionId,
    landmarks: landmarks.map(newLandmark),
    resources: (resources || []).map((r) => ({ id: uid(), notes: '', ...r })),
    quickLog: { minutes: quickLogMinutes || 30, note: quickLogNote || 'Practice session' },
    dailyTargetMin: dailyTargetMin || 0,
  });
}

/**
 * Add skill packs that haven't run in this browser yet. Only adds what's missing (matched by name
 * or alias across all sections), so existing skills and their progress are left exactly as they are.
 */
export async function applySkillPacks() {
  const done = (await db.getMeta('skillPacks', [])) || [];
  const todo = SKILL_PACKS.filter((p) => !done.includes(p.id));
  if (!todo.length) return [];
  const sections = await db.getAll('sections');
  const skills = await db.getAll('skills');
  const added = [];
  // A tracker with nothing in it (e.g. after "Delete all data") stays empty.
  if (sections.length || skills.length) {
    for (const pack of todo) {
      // 1. Sections and sub-groups.
      const secId = {};
      for (const want of pack.sections) {
        let sec = sections.find((x) => x.key === want.key) || sections.find((x) => normName(x.name) === normName(want.name));
        if (!sec) {
          sec = await db.put('sections', { key: want.key, name: want.name, order: sections.length, subgroups: [] });
          sections.push(sec);
        }
        let subs = [...(sec.subgroups || [])];
        for (const [key, from, to] of pack.renameSubgroups || []) {
          if (key !== want.key || !subs.includes(from)) continue;
          subs = subs.includes(to) ? subs.filter((g) => g !== from) : subs.map((g) => (g === from ? to : g));
          for (const k of skills.filter((k) => k.sectionId === sec.id && k.subgroup === from)) {
            k.subgroup = to;
            await db.put('skills', k);
          }
        }
        for (const g of want.subgroups) if (!subs.includes(g)) subs.push(g);
        if (subs.join('\n') !== (sec.subgroups || []).join('\n')) {
          sec.subgroups = subs;
          Object.assign(sec, await db.put('sections', sec));
        }
        secId[want.key] = sec.id;
      }
      // 2. Skills that don't exist yet, in any section.
      const have = new Set(skills.map((k) => normName(k.name)));
      let order = Math.max(0, ...skills.map((k) => k.order ?? 0)) + 1;
      for (const def of pack.skills) {
        const names = [def.name, ...(def.aliases || [])].map(normName);
        if (names.some((n) => have.has(n))) continue;
        const rec = await db.put('skills', expandSkill(def, secId[def.section], order++));
        skills.push(rec);
        names.forEach((n) => have.add(n));
        added.push(rec.name);
      }
    }
  }
  await db.setMeta('skillPacks', [...done, ...todo.map((p) => p.id)]);
  return added;
}

/** Upgrade data saved by older versions of the site. */
export async function migrate() {
  const v = (await db.getMeta('schemaVersion', 1)) || 1;
  if (v < 2) {
    // v2: daily practice targets (drawing skills default to 2 hours a day).
    for (const s of await db.getAll('skills')) {
      if (s.dailyTargetMin == null) await db.put('skills', { ...s, dailyTargetMin: s.quickLog?.minutes >= 120 ? s.quickLog.minutes : 0 });
    }
  }
  if (v < db.SCHEMA_VERSION) await db.setMeta('schemaVersion', db.SCHEMA_VERSION);
  await applySkillPacks();
}

// ---------- export ----------
const blobToDataUrl = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

async function dataUrlToBlob(url) {
  const res = await fetch(url);
  return res.blob();
}

export async function buildExport() {
  const stores = {};
  for (const s of db.STORES) {
    const rows = await db.getAll(s);
    if (s === 'files') {
      stores[s] = await Promise.all(rows.map(async (f) => ({ ...f, blob: f.blob ? await blobToDataUrl(f.blob) : null })));
    } else stores[s] = s === 'meta' ? rows.filter((m) => m.key !== 'lastExport') : rows;
  }
  return { app: 'tracker', schemaVersion: db.SCHEMA_VERSION, exportedAt: new Date().toISOString(), stores };
}

export async function exportAll() {
  const data = await buildExport();
  const text = JSON.stringify(data);
  await db.setMeta('lastExport', data.exportedAt);
  return { filename: `tracker-backup-${today()}.json`, text };
}

export function validateBackup(data) {
  if (!data || data.app !== 'tracker' || typeof data.stores !== 'object') throw new Error('This is not a tracker backup file.');
  if ((data.schemaVersion || 0) > db.SCHEMA_VERSION) throw new Error('This backup comes from a newer version of the site. Reload the page and try again.');
  for (const s of Object.keys(data.stores)) if (!db.STORES.includes(s)) throw new Error(`Unknown section in backup: ${s}`);
  return true;
}

/** Replace all data with a backup. */
export async function importAll(data) {
  validateBackup(data);
  const lastExport = await db.getMeta('lastExport');
  await db.clearAll();
  for (const s of db.STORES) {
    let rows = data.stores[s] || [];
    if (s === 'files') rows = await Promise.all(rows.map(async (f) => ({ ...f, blob: f.blob ? await dataUrlToBlob(f.blob) : null })));
    await db.putMany(s, rows);
  }
  await db.setMeta('schemaVersion', data.schemaVersion || 1);
  await migrate();
  await db.setMeta('seeded', (await db.getMeta('seeded')) || today());
  // The backup was made at exportedAt, so that is effectively the latest export on this device too.
  await db.setMeta('lastExport', data.exportedAt || lastExport);
}
