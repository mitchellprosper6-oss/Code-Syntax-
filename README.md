# Syntax Register

A syntax reference and memorisation companion for **Python, C++ and C** — a
reference manual, not a course. Single self-contained HTML file, no build
step, no backend, no tracking.

**Companion app:** [`foundry.html`](foundry.html) — Code Foundry, the full
gated learning curriculum (25 lessons, quizzes, projects) that pairs with
this reference. Same deployment, lives at `/foundry.html`.

## What's inside

| Page | Contents |
| --- | --- |
| Python / C++ / C syntax | 93 reference entries: signature, explanation, highlighted example, notes, common-mistake flags |
| Code structure | 8 whole-program templates side by side (hello world → header/source layout) |
| Compare | 26 constructs in three-column Python / C++ / C tables |
| Mistakes | 33 wrong→right pairs with the *why* and a memory hook |
| Flashcards | 65 cards across 18 topic groups — flip, shuffle, filter |
| Quizzes | 18 MCQs per language, scored on submit, nothing saved |
| Recall | 30 write-it-from-memory prompts with reveal-to-compare |

Plus **AI generation buttons** on Flashcards, Quizzes and Recall that ask
Claude for new items not already in the banks (see below).

## Run it

Three ways, zero build steps:

1. **GitHub Pages** (this repo): push to `main`, then in the repo go to
   **Settings → Pages → Source → GitHub Actions**. The included workflow
   deploys automatically on every push. Your app appears at
   `https://<username>.github.io/<repo>/`.
2. **Locally**: double-click `index.html`. Everything except the AI buttons
   works fully offline.
3. **Any static host**: it's one HTML file — Netlify, Cloudflare Pages,
   a USB stick, anything.

## The AI generate buttons

The ✚ buttons on Flashcards / Quizzes / Recall call Claude
(`claude-sonnet-4-6`) to generate new items, validated and de-duplicated
against the existing banks. Additions are session-only by design — reload
and you're back to the built-ins.

- **Inside Claude** (as an artifact): works with no setup.
- **On GitHub Pages / locally**: click **AI KEY** in the top bar and paste
  your own Anthropic API key (`sk-ant-…`). It's stored only in your
  browser's localStorage and sent only to `api.anthropic.com`, using
  Anthropic's CORS browser-access header. Clear it any time via the same
  button. Don't set your key on a shared machine.

## Design notes

- One file on purpose: works offline, deploys anywhere, nothing to build.
- The only persistent state is your theme choice and (optionally) your API
  key. No accounts, no analytics, no cookies.
- Blueprint aesthetic: drafting grid, blue hairlines, ochre stamps — dark
  and light ("vellum") themes.

## License

MIT — see [LICENSE](LICENSE).
