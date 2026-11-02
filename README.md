# aPrueba 5to

Tablet-first practice game for 5to grado students in Venezuela. This repository holds the web prototype, served with GitHub Pages.

## Files

| File | What it holds | Source of truth |
|---|---|---|
| `index.html` | Layout, styles and logic. No student text in the code. | This repository |
| `textos.json` | Every text the student reads (Spanish, Venezuelan usage) | Project document *Aprueba – Textos* |
| `ajustes.json` | Settings | Project document *Aprueba – Ajustes* |
| `questions.json` | Approved questions, Temas and Subtemas | Master workbook `Aprueba_5to_Phase1_T01-T05_plus_CIE_LEN_T06-T12.xlsx` |
| `img/` | Logo and Profe Ariel (version 1) | Project folders `claude/images/logo/v1/` and `claude/images/mascot/v1/` |
| `supabase/schema.sql` | Database: tables, access rules, save function, backstage views | This repository (matches the live Supabase database) |
| `tools/build_textos.py` | *Aprueba – Textos* → `textos.json`, with checks | This repository |
| `tools/export_questions.py` | Master workbook → `questions.json`, with option codes K, D1, D2, D3 | This repository |
| `tests/` | Local browser tests (Playwright) with a stand-in for Supabase | This repository |

The JSON files are generated from the project documents; do not edit them by hand.

## Data

No student data is stored in this repository. Accounts are in Supabase since v0.2 step 3; Pruebas, answers (with the option code K, D1, D2 or D3) and thumbs since step 4. Only the sound on/off choice, and a Prueba that could not be sent yet, stay on the device.

## Tests

From the repository folder: `python3 -m http.server 8765 &` then `node tests/test-accounts.js`, `node tests/test-save.js` and `node tests/test-temas12.js`.

## History

- v0.1 (October 2026): built and published on claude.ai, published version 23. Moved here unchanged on 30 October 2026.
- v0.2 step 3 (30 October 2026): accounts: sign-up by the parent, login, nickname at the first login, Configuración.
- v0.2 step 4 (30 October 2026): Pruebas, answers and thumbs saved in Supabase; option codes in questions.json.
- Content export (2 November 2026): Ciencias Temas 1 to 12 (722 questions).
- Content export (2 November 2026): Lengua Temas 6 to 12 added; 928 questions (Ciencias 328, Lengua 326, Matemáticas 159, Sociales 115).
