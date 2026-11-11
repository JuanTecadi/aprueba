# aPrueba 5to

Tablet-first practice game for 5to grado students in Venezuela. This repository holds the web prototype, served with GitHub Pages.

## Files

| File | What it holds | Source of truth |
|---|---|---|
| `index.html` | Layout, styles and logic. No student text in the code. | This repository |
| `textos.json` | Every text the student reads (Spanish, Venezuelan usage) | Project document *Aprueba – Textos* |
| `ajustes.json` | Settings | Project document *Aprueba – Ajustes* |
| `questions.json` | Approved questions, Temas and Subtemas | Master workbook `Aprueba_5to_Phase1_T01-T12.xlsx` |
| `img/` | Logo version 2 (badge monogram; grade logos on light and dark, app icon) and the mascot version 3, the chivo in a vinotinto shirt (three poses; since 11 November 2026) | Project folders `claude/images/logo/v2/` and `claude/images/mascot/v3/` |
| `img/app/`, `manifest.webmanifest` | App icon for the home screen (iPad/iPhone, Android) and install on Windows/Mac (10 November 2026): PNG icons built from `img/aprueba-icon.svg` by `tools/make_appicons.py`; opens full screen | This repository |
| `supabase/schema.sql` | Database: tables, access rules, save function, leaderboard function `tabla_posiciones`, backstage views | This repository (matches the live Supabase database) |
| `tools/build_textos.py` | *Aprueba – Textos* → `textos.json`, with checks | This repository |
| `tools/build_ajustes.py` | *Aprueba – Ajustes* → `ajustes.json`, with checks (moved here 4 November 2026) | This repository |
| `tools/export_questions.py` | Master workbook → `questions.json`, with option codes K, D1, D2, D3 | This repository |
| `tools/make_appicons.py` | `img/aprueba-icon.svg` → the app icons in `img/app/` (needs `rsvg-convert`) | This repository |
| `docs/code-notes.md` | How `index.html` and the tests are built now (structure, tokens, views, helpers, the database in short); read before changing the app (11 November 2026) | This repository |
| `tests/` | Local browser tests (Playwright) with a stand-in for Supabase (`mock-supabase.js`) and a helper that measures touch areas and contrast (`sweep.js`) | This repository |

The JSON files are generated from the project documents; do not edit them by hand.

## Data

No student data is stored in this repository. Accounts are in Supabase since v0.2 step 3; Pruebas, answers (with the option code K, D1, D2 or D3) and thumbs since step 4. Only the sound on/off choice, and a Prueba that could not be sent yet, stay on the device.

## Tests

From the repository folder: `python3 -m http.server 8765 &` then run each file with `node tests/<file>`: `test-accounts.js` (67 checks), `test-save.js` (19), `test-temas12.js` (45), `test-step2.js` (72), `test-step3.js` (197), `test-step4.js` (160) and `test-step5.js` (34); 594 checks in all, at 1180 × 820, 820 × 1180 and 390 × 844. Most take a folder for screenshots as an optional argument.

## History

- v0.1 (October 2026): built and published on claude.ai, published version 23. Moved here unchanged on 30 October 2026.
- v0.2 step 3 (30 October 2026): accounts: sign-up by the parent, login, nickname at the first login, Configuración.
- v0.2 step 4 (30 October 2026): Pruebas, answers and thumbs saved in Supabase; option codes in questions.json.
- Content export (2 November 2026): Ciencias Temas 1 to 12 (722 questions).
- Content export (2 November 2026): Lengua Temas 6 to 12 added; 928 questions (Ciencias 328, Lengua 326, Matemáticas 159, Sociales 115).
- Content export (3 November 2026): Sociales Temas 6 to 11 added (all 11 Sociales Temas); 1.095 questions (Ciencias 328, Lengua 326, Matemáticas 159, Sociales 282). Source: Aprueba_5to_Phase1_T01-T05_plus_CIE_LEN_SOC_T06-T12.xlsx.
- Content export (3 November 2026): Matemáticas Temas 6 to 12 added (all four materias complete); 1.343 questions (Ciencias 328, Lengua 326, Matemáticas 407, Sociales 282). Source: Aprueba_5to_Phase1_T01-T12.xlsx. `tests/test-temas12.js`: 45 checks, including a Prueba in every new Matemáticas Tema and Todo Matemáticas.
- v0.2 step 5 (4 November 2026): result page with the launch tile and collapsible answer rows; points in the top bar grow as soon as an answer is correct (an abandoned Prueba returns to the saved total); the map shows no points; *Tabla de posiciones* (opt-in, points, this week / this month / always, whole grade or one Materia, top 8 plus own row) and «Tu progreso»; main page with seven tiles (*Todo 5to* double width); *Configuración* opens from the name and gear in the top bar and holds the leaderboard switch. `tests/test-step5.js`: 65 checks.
- v0.3 (8 November 2026, interface revamp, built on the branch `v03` and merged here at release): navigation rail (Pruebas, Progreso, Tabla, Ayuda, Configuración; a bottom bar on phones, hidden during a Prueba) and an information area with sound and the points chip; deep grade and Materia backgrounds, no notebook grid, no dark mode; logo v2 and the chivo (decorative, no lines; Profe Ariel retired); login as a split screen; nickname screen with the board switch on by default (`tablaPorDefecto`); main page with four Materia tiles and *Todo 5to*; *Ayuda*; Materia screen with Tema icons (Ciencias); Prueba intro and result as the two sides of a game card; question with the feedback below the options; «Mis respuestas» as its own screen; maps in the Materia colour scale (Todo 5to with all 48 Temas named; one Materia with a bar and percentage per Tema); *Tabla* with «Posiciones» (medals) and «Mi práctica». Subtemas are no longer shown to students (still recorded). No database change. Tests rewritten for the new screens: 570 checks, including touch areas of 56 px and WCAG contrast on every screen.
