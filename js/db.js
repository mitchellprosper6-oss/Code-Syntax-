// The data layer. Every read and write of browser storage goes through this module.
// IndexedDB "tracker-db" holds records and uploaded files; localStorage holds small
// settings under "tracker-" keys. Nothing here reads the old Syntax Register keys.

import { uid } from './util.js';

const DB_NAME = 'tracker-db';
const DB_VERSION = 2;
// v2 added: cards (flashcards), sessions (study/focus time), plans (revision plans, id = examId)
export const STORES = ['projects', 'exams', 'files', 'tests', 'attempts', 'skills', 'sections', 'meta', 'cards', 'sessions', 'plans'];
export const SCHEMA_VERSION = 2;

let dbPromise;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name, { keyPath: name === 'meta' ? 'key' : 'id' });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Storage is blocked by another open tab. Close other tabs of this site and reload.'));
  });
  return dbPromise;
}

function run(store, mode, fn) {
  return open().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(store, mode);
        const os = tx.objectStore(store);
        let result;
        const req = fn(os);
        if (req) req.onsuccess = () => (result = req.result);
        tx.oncomplete = () => resolve(result);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
      })
  );
}

export const getAll = (store) => run(store, 'readonly', (os) => os.getAll()).then((r) => r || []);
export const get = (store, id) => run(store, 'readonly', (os) => os.get(id));

/** Insert or update a record. Fills id/createdAt/updatedAt. Returns the saved record. */
export async function put(store, record) {
  const now = new Date().toISOString();
  const rec = { ...record };
  if (!rec.id) rec.id = uid();
  if (!rec.createdAt) rec.createdAt = now;
  rec.updatedAt = now;
  await run(store, 'readwrite', (os) => os.put(rec));
  return rec;
}

/** Load, change with fn, save. fn may mutate or return a new object. */
export async function update(store, id, fn) {
  const rec = await get(store, id);
  if (!rec) throw new Error(`Not found: ${store}/${id}`);
  const out = fn(rec) || rec;
  return put(store, out);
}

export const del = (store, id) => run(store, 'readwrite', (os) => os.delete(id));

/** Write many records exactly as given (used by seed and import). */
export function putMany(store, records) {
  return run(store, 'readwrite', (os) => {
    for (const r of records) os.put(r);
  });
}

export async function clearAll() {
  for (const s of STORES) await run(s, 'readwrite', (os) => os.clear());
}

// ---- meta (key/value records inside IndexedDB, included in backups) ----
export async function getMeta(key, fallback = null) {
  const r = await get('meta', key);
  return r ? r.value : fallback;
}
export const setMeta = (key, value) => run('meta', 'readwrite', (os) => os.put({ key, value }));

// ---- settings (localStorage, small, per device) ----
const PREFIX = 'tracker-';
export function getSetting(key, fallback = null) {
  try {
    const v = localStorage.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
export function setSetting(key, value) {
  try {
    if (value == null) localStorage.removeItem(PREFIX + key);
    else localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    /* storage unavailable: settings fall back to defaults */
  }
}

/** Ask the browser not to evict our data (important on iPhone Safari). */
export async function requestPersist() {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {}
  return false;
}
export async function storageEstimate() {
  try {
    if (navigator.storage?.estimate) return await navigator.storage.estimate();
  } catch {}
  return null;
}
export async function isPersisted() {
  try {
    return navigator.storage?.persisted ? await navigator.storage.persisted() : false;
  } catch {
    return false;
  }
}
