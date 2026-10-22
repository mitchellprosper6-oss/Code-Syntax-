// Storing uploaded files (originals in IndexedDB + extracted text).

import * as db from './db.js';
import { extractText, fileKind } from './extract.js';
import { toast } from './ui.js';

export async function storeFiles(list, { onProgress } = {}) {
  const saved = [];
  for (const f of list) {
    onProgress?.(`Reading ${f.name}…`);
    let text = '', note = '';
    try {
      ({ text, note } = await extractText(f, f.name));
    } catch (err) {
      note = 'Text extraction failed: ' + err.message;
    }
    const rec = await db.put('files', {
      name: f.name,
      mime: f.type || '',
      kind: fileKind(f.name, f.type),
      size: f.size,
      blob: f,
      extractedText: text,
      extractNote: note,
      uploadedAt: new Date().toISOString(),
    });
    saved.push(rec);
    if (note) toast(`${f.name}: ${note}`);
  }
  return saved;
}

export async function reextract(id) {
  const f = await db.get('files', id);
  const { text, note } = await extractText(f.blob, f.name);
  return db.put('files', { ...f, extractedText: text, extractNote: note });
}

export async function openFile(id) {
  const f = await db.get('files', id);
  if (!f?.blob) return toast('File not found.');
  const url = URL.createObjectURL(f.blob);
  const w = window.open(url, '_blank');
  if (!w) {
    const a = document.createElement('a');
    a.href = url;
    a.download = f.name;
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/** Make an element a drag-and-drop target. onFiles(fileArray). */
export function dropZone(el, onFiles) {
  if (!el) return;
  el.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.classList.add('drag');
  });
  el.addEventListener('dragleave', () => el.classList.remove('drag'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag');
    const files = [...(e.dataTransfer?.files || [])];
    if (files.length) onFiles(files);
  });
}
