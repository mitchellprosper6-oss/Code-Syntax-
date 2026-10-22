// Seed loading, export and import. Uses only the db.js data layer.

import * as db from './db.js';
import { uid, today } from './util.js';
import { newProject, newExam, newSkill, newLandmark } from './model.js';

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
  await db.putMany(
    'skills',
    seed.skills.map((s, i) => {
      const { section, landmarks, quickLogMinutes, quickLogNote, ...rest } = s;
      return stamp(
        newSkill({
          ...rest,
          order: i,
          sectionId: secId[section],
          landmarks: landmarks.map(newLandmark),
          quickLog: { minutes: quickLogMinutes || 30, note: quickLogNote || 'Practice session' },
        })
      );
    })
  );
  await db.setMeta('lists', seed.lists);
  await db.setMeta('schemaVersion', db.SCHEMA_VERSION);
  await db.setMeta('seeded', today());
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
  await db.setMeta('seeded', (await db.getMeta('seeded')) || today());
  // The backup was made at exportedAt, so that is effectively the latest export on this device too.
  await db.setMeta('lastExport', data.exportedAt || lastExport);
}
