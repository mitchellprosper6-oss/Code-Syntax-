# Tracker

A personal tracker and study hub for uni projects, exams, practice tests and skills. It runs entirely in your browser
on GitHub Pages: no server, no account, no build step.

**Live:** https://mitchellprosper6-oss.github.io/Code-Syntax-/

> The old Syntax Register and Code Foundry pages are kept on the
> [`archive/code-syntax-site`](https://github.com/mitchellprosper6-oss/Code-Syntax-/tree/archive/code-syntax-site) branch.

## What's in it

| Page | What it does |
|---|---|
| **Today** | Your day at a glance: flashcards due, revision sessions, tasks due or overdue, daily practice rings (2 h drawing), deadlines in the next 3 days. Streak, study time this week, an activity heatmap, project rings, exam readiness rings, latest scores, skills summary and a *Getting started* checklist. |
| **Calendar** | Month view of deadlines, tasks, exams and revision sessions (dots on a phone). **Add to my calendar** downloads an `.ics` file for Apple/Google Calendar. |
| **Projects** | Deadlines (or TBC + approximate month), status, weighted tasks/milestones (completion % with manual override), marking criteria with self-ratings, 🚩 focus flags, progress log, file attachments. |
| **Exams** | Topics rated **Confident / Needs practice / Don't know yet** in one tap (dated history), readiness, a **revision plan**, linked practice tests and score charts. **Subjects overview** shows every topic in three columns. |
| **Topic pages** | One page per exam topic for in-depth learning: Markdown **study notes** (paste from Obsidian), an **AI study guide**, *Explain it simply / Worked example / Common mistakes / One-page summary*, flashcards, **Quiz me** from tagged questions, practice-score chart and rating history. |
| **Study** | Flashcards with **spaced repetition** (Again / Hard / Good / Easy, keyboard 1–4), decks per topic and skill, today's revision sessions, all revision plans, recall %, streak and heatmap. |
| **Practice Tests** | Upload PDF, Word, Markdown, text and images (text extracted in the browser). Write or AI-generate questions, take tests timed or untimed, auto and self marking, rating suggestions, history charts, print / save as PDF. |
| **Skills** | Sections and sub-groups, level 1–5 with descriptions and target, landmarks, plan and goals, resources, practice log with weekly chart, **daily target ring and streak**, flashcards, evidence, linked uni work. |
| **Settings** | Export/import, theme, editable lists, **Connect Claude**, reset. |

Everywhere: **⌘K / Ctrl+K** (or `/`) searches pages, projects, topics, skills and actions. The **focus timer** in
the top bar logs time to a project, topic or skill when the block ends, and keeps running across pages and reloads.
The **✨ Ask AI** button (or press `A`) opens the assistant.

## Using AI (Claude)

- **✨ Ask AI** (on every page) offers one-tap actions for what you're looking at (e.g. *Write study guide*,
  *Generate flashcards*, *Break into tasks*, *Build revision plan*) and lets you ask anything about your tracker.
- Every form has **Fill with AI**, and lists have **Suggest** buttons. You can always type everything in yourself instead.

**Without an API key (default, free with your Claude account):**
1. Tap a ✨ button and, optionally, describe what you want or tap a suggestion.
2. **Open in Claude** opens claude.ai with the request already filled in. It is also copied, in case it isn't
   filled in. Send it, then copy Claude's reply.
3. Come back and tap **Paste reply**. It's checked and applied straight away.

**With your own API key (one click):** Settings → *Connect Claude*. Create a key at console.anthropic.com
(set a low spend limit), paste it, Save, then **Test connection**. Every ✨ button becomes a single **Generate**
click, and the assistant chats right inside the site. The key stays only in this browser's localStorage and is
sent only to `api.anthropic.com`. It is never put in the repo or exports. All your GitHub Pages sites share one
browser origin, so a script on any of them could read it. Don't use it on shared computers. Direct mode uses
Claude Opus 5.5 by default (Sonnet 5.5 and Haiku 5.5 are options), with Anthropic's server-side fallback enabled.

AI output never saves itself: it fills a form, or shows suggestions to tick, or offers *Add to notes*.
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
  and the Anthropic SDK 0.129.0 (direct AI mode only). Inter comes from Google Fonts, with a system-font fallback.
- `seed.json` holds the starting projects, exams and skills. It is loaded on the first visit only.

```
index.html            app shell + nav
seed.json             starting data
css/                  base.css (tokens, layout), components.css, study.css
js/app.js             start-up and routes
js/db.js              data layer (only module that touches storage)
js/model.js           calculations (completion %, readiness, levels…)
js/backup.js          seed, export, import
js/ai.js              prompt building, Open-in-Claude / paste flow, JSON validation, optional API call
js/assistant.js       ✨ assistant panel (page-aware actions + chat)
js/palette.js         ⌘K command palette
js/timer.js           focus timer
js/srs.js             spaced repetition (flashcards)
js/planner.js         revision planner
js/study-ui.js        flashcard and plan UI shared by pages
js/md.js              small safe Markdown renderer
js/icons.js           inline SVG icons
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
