# Tracker

A personal tracker for uni projects, exams, practice tests and skills. It runs entirely in your browser
on GitHub Pages: no server, no account, no build step.

**Live:** https://mitchellprosper6-oss.github.io/Code-Syntax-/

> The old Syntax Register and Code Foundry pages are kept on the
> [`archive/code-syntax-site`](https://github.com/mitchellprosper6-oss/Code-Syntax-/tree/archive/code-syntax-site) branch.

## What's in it

| Page | What it does |
|---|---|
| **Dashboard** | Upcoming deadlines, tasks and exams with countdowns (red under 7 days, amber under 21, green otherwise), a separate *Date TBC* list, project progress, exam readiness, latest practice scores, a skills snapshot and *needs focus* flags. Filter by Uni / Work / Personal. **✨ Quick add with AI** turns a sentence into a filled-in form. |
| **Projects** | Projects with deadlines (or TBC + approximate month), status, weighted tasks/milestones (completion % with manual override), marking criteria with self-ratings, 🚩 focus flags, a dated progress log and file attachments. |
| **Exams** | Exams with topics rated **Confident / Needs practice / Don't know yet** in one tap (every change is dated), a readiness meter, linked practice tests and score charts per exam and per topic. **Subjects overview** gathers every topic into three columns. |
| **Practice Tests** | Upload PDF, Word (.docx), Markdown (Obsidian), text and images. Text is extracted in the browser. Write questions (multiple choice, short, numerical with tolerance, long/worked), or generate them from your files with Claude. Take tests timed or untimed, with auto-marking and self-marking. Attempt history, progress charts, rating suggestions, and print / save as PDF for the test and the answer sheet. |
| **Skills** | Sections (Code · Design · Uni Work · Machine Learning, all editable) with sub-groups. Each skill has a phase, level 1–5 with what each level means, a target, a landmarks checklist (dated), *what to do next*, goals, resources, a practice log with weekly chart (a one-tap button logs a 2-hour drawing session), and evidence. Uni Work skills show their module's project completion and exam topic ratings. |
| **Settings** | Export/import, theme, editable type lists, optional AI key, reset. |

## Using AI (Claude) to fill things in

Every add/edit form has a **✨ Fill with AI** button, and lists (tasks, criteria, topics, landmarks,
resources) have **✨ Suggest** buttons. You can always fill everything in by hand instead.

1. Describe what you want (e.g. *"3000-word report on a footbridge, due 15 Dec, worth 40%"*).
2. **Copy prompt**, then paste it into [Claude](https://claude.ai/new).
3. Paste Claude's JSON reply back and press **Use reply**.

The site checks the reply and fills in the form, or shows suggestions to tick. Nothing is saved until you
press Save.

**Optional direct mode** (off by default): in Settings you can enter your own Anthropic API key so a
**Generate with Claude** button does steps 2–3 for you. The key stays only in this browser's localStorage and
is sent only to `api.anthropic.com`. It is never put in the repo or in exports. All your GitHub Pages sites
share one browser origin, so any script on them could read the key. Use a key with a low spending limit, don't
use it on shared computers, and remove it when you don't need it. Direct mode uses Claude Opus 5.5 by
default (Sonnet 5.5 and Haiku 5.5 are options), with Anthropic's server-side fallback enabled.

Practice-question JSON is documented in [docs/QUESTION_SCHEMA.md](docs/QUESTION_SCHEMA.md).

## Backups and moving between laptop and iPhone

Your data lives **only in the browser you use**. Laptop and iPhone each have their own copy.

- **Settings → Export all data** downloads one JSON file with everything, including uploaded files
  (base64). The dashboard shows the last export date and reminds you after 14 days.
- **Settings → Import data** restores a backup. It **replaces** everything in that browser, after asking.
- To move data: export on one device, open the file on the other (AirDrop, iCloud Drive or email),
  then import it there.
- On iPhone, add the site to your Home Screen (Share → Add to Home Screen) so Safari keeps the data, and still
  export regularly.

## How it's built

- Plain HTML, CSS and JavaScript (ES modules). There is no build step.
- Hash routing (`#/projects`, `#/exams/…`), so refreshing any page works on GitHub Pages.
- IndexedDB (`tracker-db`) holds records and files. localStorage holds small settings (`tracker-*` keys).
  All storage goes through [`js/db.js`](js/db.js). See [docs/DATA_MODEL.md](docs/DATA_MODEL.md).
- Libraries load from jsDelivr only when first needed: Chart.js 4.4.1, pdf.js 3.11.174, mammoth.js 1.6.0,
  and the Anthropic SDK (direct AI mode only).
- `seed.json` holds the starting projects, exams and skills. It is loaded on the first visit only.

```
index.html            app shell + nav
seed.json             starting data
css/                  base.css (tokens, light/dark), components.css
js/app.js             start-up and routes
js/db.js              data layer (only module that touches storage)
js/model.js           calculations (completion %, readiness, levels…)
js/backup.js          seed, export, import
js/ai.js              prompt building, JSON validation, optional API call
js/forms.js           add/edit forms and AI list suggestions
js/questions.js       question schema, import validation, marking
js/extract.js         PDF / Word / Markdown text extraction
js/views/*.js         one module per page
docs/                 DATA_MODEL.md, QUESTION_SCHEMA.md
```

## Deploying

GitHub Pages serves this repo from **Deploy from a branch → `main` / root** (Settings → Pages). Pushing to
`main` redeploys the site, and no workflow is needed. `.nojekyll` makes Pages serve the files exactly as they are.

To run it locally, serve the folder with any static server, e.g. `npx http-server .` or
`python3 -m http.server`, then open the printed address. ES modules don't load from `file://`.

## License

MIT. See [LICENSE](LICENSE).
