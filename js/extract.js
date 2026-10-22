// In-browser text extraction for uploaded files.

import { loadScript, CDN } from './lib.js';

export const ACCEPT = '.pdf,.docx,.md,.markdown,.txt,.png,.jpg,.jpeg,.gif,.webp,.heic';

export function fileKind(name, mime = '') {
  const ext = name.toLowerCase().split('.').pop();
  if (ext === 'pdf' || mime === 'application/pdf') return 'pdf';
  if (ext === 'docx') return 'docx';
  if (['md', 'markdown'].includes(ext)) return 'md';
  if (ext === 'txt' || mime.startsWith('text/')) return 'txt';
  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'heic'].includes(ext)) return 'image';
  return 'other';
}

async function pdfText(blob) {
  await loadScript(CDN.pdf);
  const lib = window.pdfjsLib;
  lib.GlobalWorkerOptions.workerSrc = CDN.pdfWorker;
  const doc = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const content = await (await doc.getPage(i)).getTextContent();
    let s = '';
    for (const it of content.items) s += it.str + (it.hasEOL ? '\n' : ' ');
    pages.push(`--- Page ${i} ---\n${s.replace(/[ \t]+\n/g, '\n').trim()}`);
  }
  return pages.join('\n\n');
}

async function docxText(blob) {
  await loadScript(CDN.mammoth);
  const res = await window.mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() });
  return res.value.trim();
}

/** Returns {text, note}. Images have no text (no OCR). */
export async function extractText(blob, name) {
  const kind = fileKind(name, blob.type);
  switch (kind) {
    case 'pdf': {
      const text = await pdfText(blob);
      return { text, note: text.replace(/--- Page \d+ ---/g, '').trim() ? '' : 'No text found — this PDF may be scanned images.' };
    }
    case 'docx':
      return { text: await docxText(blob), note: '' };
    case 'md':
    case 'txt':
      return { text: (await blob.text()).trim(), note: '' };
    case 'image':
      return { text: '', note: 'Image stored. No text extraction for images.' };
    default:
      return { text: '', note: 'Unsupported file type for text extraction.' };
  }
}
