// Tiny, safe Markdown renderer for study notes and AI answers.
// Escapes all HTML first, then supports: # headings, lists, **bold**, *italic*, `code`,
// ``` code blocks, > quotes, [links](https://…), --- rules, tables are shown as preformatted text.

import { esc } from './util.js';

function inline(s) {
  return s
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
    .replace(/\[\[([^\]]+)\]\]/g, '<span class="wikilink">$1</span>');
}

export function md(src) {
  const lines = esc(String(src || '').replace(/\r/g, '')).split('\n');
  const out = [];
  let list = null; // 'ul' | 'ol'
  let para = [];
  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const closeList = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flushPara(); closeList();
      const buf = [];
      while (++i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i]);
      out.push(`<pre><code>${buf.join('\n')}</code></pre>`);
      continue;
    }
    if (/^\|.*\|\s*$/.test(line)) {
      flushPara(); closeList();
      const buf = [line];
      while (i + 1 < lines.length && /^\|.*\|\s*$/.test(lines[i + 1])) buf.push(lines[++i]);
      const rows = buf.filter((r) => !/^\|[\s:-|]+\|$/.test(r)).map((r) => r.slice(1, -1).split('|').map((c) => inline(c.trim())));
      out.push(`<div class="table-wrap"><table>${rows.map((r, j) => `<tr>${r.map((c) => (j ? `<td>${c}</td>` : `<th>${c}</th>`)).join('')}</tr>`).join('')}</table></div>`);
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)/))) {
      flushPara(); closeList();
      const lvl = Math.min(4, m[1].length + 1);
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)/))) {
      flushPara();
      if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; }
      out.push(`<li>${inline(m[1].replace(/^\[ \]\s*/, '☐ ').replace(/^\[x\]\s*/i, '☑ '))}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) {
      flushPara();
      if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^&gt;\s?(.*)/))) {
      flushPara(); closeList();
      out.push(`<blockquote>${inline(m[1])}</blockquote>`);
    } else if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) {
      flushPara(); closeList();
      out.push('<hr>');
    } else if (!line.trim()) {
      flushPara(); closeList();
    } else {
      closeList();
      para.push(line.trim());
    }
  }
  flushPara(); closeList();
  return `<div class="prose">${out.join('\n')}</div>`;
}
