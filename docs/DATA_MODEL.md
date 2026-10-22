# Data model

Everything is stored in the browser. Nothing is sent to a server, except the optional direct AI mode
(see the README).

- **IndexedDB** database `tracker-db` (version 1) holds all records and uploaded files.
- **localStorage** holds small per-device settings under `tracker-` keys.
- All access goes through [`js/db.js`](../js/db.js). No other module touches browser storage.

All GitHub Pages sites under `mitchellprosper6-oss.github.io` share one browser origin. That is why every
name starts with `tracker-`. The old Syntax Register / Code Foundry keys (`register.*`, `foundry.*`) are
never read.

## Conventions

- Every record has `id` (UUID), `createdAt` and `updatedAt` (ISO timestamps), set by `db.put`.
- Calendar dates are `YYYY-MM-DD` strings in local time. Months are `YYYY-MM`.
- A **When** object is used for deadlines and exam dates:
  `{ date: "2026-12-08" | null, tbc: boolean, approxMonth: "2027-01" | null }`.
  No date always means TBC. A date with `tbc: true` means a tentative date.
- **Category** is `"uni" | "work" | "personal"`.
- A **Focus** object is `{ flag: boolean, note: string }`.

## Object stores

### `projects`
| Field | Type | Notes |
|---|---|---|
| `title`, `module`, `description` | string | |
| `category` | Category | |
| `type` | string | From the editable list in Settings (`meta.lists.projectTypes`). |
| `deadline` | When | |
| `status` | `"not-started" \| "in-progress" \| "submitted" \| "done"` | Submitted/Done projects drop off "Upcoming". |
| `criteria` | `{id, name, weight (% or null), selfRating (1–5 or null), notes, focus: Focus}[]` | Starts empty. |
| `tasks` | `{id, name, weight (number or null), due (date or null), done, doneAt, focus: Focus}[]` | Ordered. |
| `progressOverride` | number 0–100 \| null | Manual completion %. `null` = calculated. |
| `log` | `{id, date, minutes, text}[]` | Progress log. |
| `fileIds` | string[] | References into `files`. |

**Completion %** = done task weight ÷ total task weight × 100, where a task with no weight counts as 1.
`progressOverride` replaces it when set. With no tasks, Submitted/Done counts as 100%, otherwise 0%.
**Self-assessed estimate** = Σ(weight × rating/5) ÷ Σ weight over the rated criteria.

### `exams`
| Field | Type | Notes |
|---|---|---|
| `title`, `module`, `formatNotes`, `syllabus` | string | |
| `category` | Category | |
| `type` | string | From `meta.lists.examTypes`. |
| `date` | When | |
| `topics` | `{id, name, rating, history: {date, at, rating}[]}[]` | `rating` is `"confident" \| "practice" \| "unknown"`. Every change adds a history entry. |

**Readiness** = topics rated Confident ÷ all topics.

### `files`
| Field | Type | Notes |
|---|---|---|
| `name`, `mime`, `size` | | |
| `kind` | `"pdf" \| "docx" \| "md" \| "txt" \| "image" \| "other"` | |
| `blob` | Blob | The original file. |
| `extractedText` | string | From pdf.js / mammoth.js / plain text. Empty for images. |
| `extractNote` | string | For example "No text found — this PDF may be scanned images." |
| `uploadedAt` | ISO timestamp | |

### `tests`
| Field | Type | Notes |
|---|---|---|
| `title`, `description` | string | |
| `examId` | string \| null | |
| `timeLimitMin` | number \| null | Default for timed mode. |
| `questions` | Question[] | Ordered. |

**Question** = `{id, kind: "mcq"|"short"|"numerical"|"long", prompt, options[], correctIndex, answer, tolerance, unit, modelAnswer, marks, examId, topicId, sourceFileId}`.
The import format is described in [QUESTION_SCHEMA.md](QUESTION_SCHEMA.md).

### `attempts`
| Field | Type | Notes |
|---|---|---|
| `testId` | string | |
| `date`, `finishedAt` | date, ISO timestamp | |
| `mode` | `"timed" \| "untimed"` | `timeLimitSec` is set when timed. |
| `durationSec` | number | |
| `answers` | `{qId, response, awarded, max}[]` | |
| `score`, `max`, `pct` | number | |
| `byExam` | `{ [examId]: {got, max} }` | Feeds the per-exam charts. |
| `byTopic` | `{ ["examId:topicId"]: {got, max} }` | Feeds the per-topic charts and rating suggestions. |
| `questions` | Question[] | A snapshot, so old attempts still make sense after the test is edited. |

### `skills`
| Field | Type | Notes |
|---|---|---|
| `name`, `subgroup` | string | `subgroup` is optional, e.g. "Drawing". |
| `sectionId` | string | References `sections`. |
| `order` | number | |
| `phase` | `"p1" \| "p2" \| "ongoing" \| "unset"` | |
| `levelOverride` | 1–5 \| null | Level set by you. `null` = suggested from landmarks. |
| `levelSet` | boolean | `false` until you confirm your real level (drives the "set your level" prompts). |
| `targetLevel` | 1–5 | |
| `levelDescriptions` | string[5] | What each level means for this skill. |
| `landmarks` | `{id, text, done, doneAt}[]` | Ordered checklist. |
| `actionNotes`, `goals` | string | "What to do next" notes and future goals. |
| `resources` | `{id, kind, title, url, notes}[]` | |
| `practice` | `{id, date, minutes, note}[]` | |
| `quickLog` | `{minutes, note}` | The one-tap log button (drawing skills: 120 min). |
| `evidence` | `{id, kind: "project"|"file"|"link", refId, url, note}[]` | |
| `module` | string | Links Uni Work skills to projects/exams with the same module name. |

**Suggested level** = 1 + round(4 × landmarks reached ÷ landmarks). **Effective level** = `levelOverride ?? suggested`.
Levels: 1 Beginner, 2 Developing, 3 Competent, 4 Proficient, 5 Advanced.

### `sections`
`{id, key?, name, order, subgroups: string[]}`. Seeded with Code, Design, Uni Work, Machine Learning.

### `meta` (key/value, keyPath `key`)
| Key | Value |
|---|---|
| `seeded` | Date the seed was loaded (or `"wiped"`). Prevents seeding again. |
| `schemaVersion` | `1` |
| `lastExport` | ISO timestamp of the last export. Drives the 14-day reminder. |
| `lists` | `{ projectTypes: string[], examTypes: string[] }` |

## localStorage (per device, not in backups)
| Key | Value |
|---|---|
| `tracker-theme` | `"system" \| "light" \| "dark"` |
| `tracker-categoryFilter` | `"all" \| "uni" \| "work" \| "personal"` |
| `tracker-skillsTab` | Last selected skills section id. |
| `tracker-aiApiEnabled` | boolean. Off by default. |
| `tracker-apiKey` | Your Anthropic key, only if you enter one. |
| `tracker-aiModel` | Model id for direct mode. |

## Backup file
```json
{ "app": "tracker", "schemaVersion": 1, "exportedAt": "ISO", "stores": { "projects": [], "exams": [], "files": [], "tests": [], "attempts": [], "skills": [], "sections": [], "meta": [] } }
```
In the backup, `files[].blob` is a base64 `data:` URL. Import checks `app`, `schemaVersion` and the store
names, then replaces all data. The API key and other localStorage settings are never exported.

## Seed
`seed.json` is loaded once, on the first visit (when `meta.seeded` is not set). It uses a compact format
(landmarks as plain strings, sections by `key`) that `applySeed` in `js/backup.js` expands into full records.
