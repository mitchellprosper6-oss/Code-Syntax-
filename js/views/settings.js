import * as db from '../db.js';
import { esc, fmtDate, fmtBytes, daysUntil } from '../util.js';
import { bind, pageHead, confirmDialog, toast, pickFiles, download, alertDialog } from '../ui.js';
import { rerender, go } from '../router.js';
import { exportAll, importAll, validateBackup, applySeed } from '../backup.js';
import { getLists } from '../model.js';
import { AI_MODELS, testConnection } from '../ai.js';
import { icon } from '../icons.js';
import { applyTheme } from '../app.js';

export async function render(el) {
  const [lastExport, lists, est, persisted] = await Promise.all([db.getMeta('lastExport'), getLists(), db.storageEstimate(), db.isPersisted()]);
  const theme = db.getSetting('theme', 'system');
  const aiOn = db.getSetting('aiApiEnabled', false);
  const key = db.getSetting('apiKey', '');
  const model = db.getSetting('aiModel', 'claude-opus-5-5');
  const ago = lastExport ? -daysUntil(lastExport.slice(0, 10)) : null;

  el.innerHTML = `
    ${pageHead('Settings')}
    <div class="grid-2">
      <section class="card" aria-labelledby="h-backup">
        <h2 id="h-backup">Backup & sync</h2>
        <p>Your data is stored only in this browser. Export a backup file regularly, and import it on your other device (laptop ↔ iPhone) to move everything across. Uploaded files are included.</p>
        <p class="${ago == null || ago > 14 ? 'banner banner-warn' : 'muted'}">${lastExport ? `Last export: <strong>${fmtDate(lastExport.slice(0, 10))}</strong> (${ago === 0 ? 'today' : ago + ' days ago'}).` : 'You have never exported a backup.'}</p>
        <div class="row-wrap"><button class="btn btn-primary" data-act="export">Export all data</button><button class="btn" data-act="import">Import data…</button></div>
        <p class="small muted mt">Importing <strong>replaces</strong> everything currently in this browser with the backup.</p>
      </section>

      <section class="card" aria-labelledby="h-look">
        <h2 id="h-look">Appearance</h2>
        <div class="field"><label for="theme">Theme</label>
          <select id="theme" data-act="theme">${[['system', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<option value="${v}" ${theme === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <h2 class="mt">Storage</h2>
        <p class="small">${est ? `Using about ${fmtBytes(est.usage || 0)}${est.quota ? ` of ${fmtBytes(est.quota)} available` : ''}.` : 'Storage usage unavailable.'}
          ${persisted ? 'Storage is marked <strong>persistent</strong>, so the browser should not clear it.' : 'Storage is not marked persistent; the browser may clear it if space runs low.'}</p>
        ${persisted ? '' : `<button class="btn btn-small" data-act="persist">Ask to keep data</button>`}
        <p class="small muted mt">On iPhone, add this site to your Home Screen (Share → Add to Home Screen) so Safari keeps its data, and still export regularly.</p>
      </section>
    </div>

    <section class="card mt" aria-labelledby="h-lists">
      <h2 id="h-lists">Editable lists</h2>
      <form data-form="lists" class="grid-2">
        <div class="field"><label for="ptypes">Project types (one per line)</label><textarea id="ptypes" name="projectTypes" rows="5">${esc(lists.projectTypes.join('\n'))}</textarea></div>
        <div class="field"><label for="etypes">Exam types (one per line)</label><textarea id="etypes" name="examTypes" rows="5">${esc(lists.examTypes.join('\n'))}</textarea></div>
        <div><button class="btn btn-primary" type="submit">Save lists</button></div>
      </form>
    </section>

    <section class="card mt" aria-labelledby="h-ai">
      <div class="card-head"><h2 id="h-ai"><span class="ai-badge">${icon('sparkles', 18)}</span> Connect Claude</h2>
        <span class="tag ${aiOn && key ? 'tag-green' : 'tag-none'}">${aiOn && key ? 'Connected: one-click AI' : 'Using Claude.ai (copy/paste)'}</span></div>
      <div class="grid-2">
        <div>
          <h3>Without a key (default)</h3>
          <p class="small muted">Every ✨ button opens Claude.ai with your request filled in. Send it, copy the reply, tap <strong>Paste reply</strong>. Free with your Claude account.</p>
          <h3>With your own API key (one click)</h3>
          <ol class="small muted" style="padding-left:1.1rem">
            <li>Go to <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">console.anthropic.com → API keys</a> and create a key. Set a low monthly spend limit.</li>
            <li>Paste it below, tick “Use my API key”, Save, then <strong>Test connection</strong>.</li>
            <li>Now ✨ buttons generate straight away, and the assistant chats right here.</li>
          </ol>
        </div>
        <form data-form="ai">
          <div class="field field-check"><input type="checkbox" id="ai-on" name="on" ${aiOn ? 'checked' : ''}><label for="ai-on">Use my API key</label></div>
          <div class="field"><label for="ai-key">Anthropic API key</label><input id="ai-key" name="key" type="password" autocomplete="off" placeholder="sk-ant-…" value="${esc(key)}"></div>
          <div class="field"><label for="ai-model">Model</label><select id="ai-model" name="model">${AI_MODELS.map((m) => `<option value="${m.id}" ${model === m.id ? 'selected' : ''}>${m.label}</option>`).join('')}</select></div>
          <div class="row-wrap"><button class="btn btn-primary" type="submit">Save</button><button class="btn" type="button" data-act="test-ai" ${aiOn && key ? '' : 'disabled'}>Test connection</button><button class="btn btn-danger" type="button" data-act="forget-key">Remove key</button></div>
          <p class="small" data-test-result aria-live="polite"></p>
        </form>
      </div>
      <div class="banner banner-danger mt"><p><strong>Security:</strong> the key is stored only in this browser (localStorage) and sent only to api.anthropic.com. All your GitHub Pages sites share one origin, so a script on any of them could read it. Use a low spending limit, don't use it on shared computers, and remove it when you're done. It is never saved to the repo or included in exports.</p></div>
    </section>

    <section class="card mt" aria-labelledby="h-danger">
      <h2 id="h-danger">Reset</h2>
      <p class="small muted">Export first. These cannot be undone.</p>
      <div class="row-wrap"><button class="btn btn-danger" data-act="reseed">Reset to starting data</button><button class="btn btn-danger" data-act="wipe">Delete all data</button></div>
    </section>`;

  el.querySelector('[data-form=lists]').addEventListener('submit', async (e) => {
    e.preventDefault();
    const split = (s) => [...new Set(s.split('\n').map((x) => x.trim()).filter(Boolean))];
    const projectTypes = split(e.target.elements.projectTypes.value);
    const examTypes = split(e.target.elements.examTypes.value);
    if (!projectTypes.length || !examTypes.length) return toast('Each list needs at least one item.');
    await db.setMeta('lists', { projectTypes, examTypes });
    toast('Lists saved.');
  });
  el.querySelector('[data-form=ai]').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const k = f.key.value.trim();
    if (f.on.checked && !k) return toast('Enter a key, or leave direct mode off.');
    db.setSetting('aiApiEnabled', f.on.checked);
    db.setSetting('apiKey', k || null);
    db.setSetting('aiModel', f.model.value);
    toast('AI settings saved.');
    rerender();
  });

  bind(el, {
    theme: (s) => {
      db.setSetting('theme', s.value);
      applyTheme(s.value);
    },
    persist: async () => {
      const ok = await db.requestPersist();
      toast(ok ? 'Storage marked persistent.' : 'The browser declined. Exporting regularly is the safe option.');
      rerender();
    },
    export: async () => {
      const { filename, text } = await exportAll();
      download(filename, text);
      toast('Backup downloaded.');
      rerender();
    },
    import: async () => {
      const [file] = await pickFiles({ accept: '.json,application/json', multiple: false });
      if (!file) return;
      let data;
      try {
        data = JSON.parse(await file.text());
        validateBackup(data);
      } catch (err) {
        return alertDialog(err.message, 'Could not import');
      }
      const n = Object.entries(data.stores).filter(([k]) => k !== 'meta').map(([k, v]) => `${v.length} ${k}`).join(', ');
      if (!(await confirmDialog(`Replace ALL data in this browser with the backup from ${fmtDate((data.exportedAt || '').slice(0, 10)) || 'unknown date'}? (${n})`, { ok: 'Replace my data' }))) return;
      await importAll(data);
      toast('Backup imported.');
      go('#/');
    },
    'test-ai': async (b) => {
      const out = el.querySelector('[data-test-result]');
      b.disabled = true;
      out.textContent = 'Testing…';
      try {
        const r = await testConnection();
        out.innerHTML = `<span class="tag tag-green">Working</span> Claude replied “${esc(r.slice(0, 40))}”.`;
      } catch (err) {
        out.innerHTML = `<span class="tag tag-red">Failed</span> ${esc(err.message)}`;
      } finally {
        b.disabled = false;
      }
    },
    'forget-key': async () => {
      if (!(await confirmDialog('Remove the API key from this browser?', { ok: 'Remove' }))) return;
      db.setSetting('apiKey', null);
      db.setSetting('aiApiEnabled', false);
      toast('Key removed.');
      rerender();
    },
    reseed: async () => {
      if (!(await confirmDialog('Delete everything and load the original starting data?', { ok: 'Reset' }))) return;
      await db.clearAll();
      const res = await fetch('seed.json', { cache: 'no-cache' });
      await applySeed(await res.json());
      toast('Reset to starting data.');
      go('#/');
    },
    wipe: async () => {
      if (!(await confirmDialog('Delete ALL projects, exams, tests, files and skills from this browser?', { ok: 'Delete everything' }))) return;
      await db.clearAll();
      await db.setMeta('seeded', 'wiped');
      toast('All data deleted.');
      go('#/');
    },
  });
}
