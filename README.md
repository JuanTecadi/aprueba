# aPrueba 5to

Tablet-first practice game for 5to grado students in Venezuela. This repository holds the web prototype, served with GitHub Pages.

## Files

| File | What it holds | Source of truth |
|---|---|---|
| `index.html` | Layout, styles and logic. No student text in the code. | This repository |
| `textos.json` | Every text the student reads (Spanish, Venezuelan usage) | Project document *Aprueba – Textos* |
| `ajustes.json` | Settings | Project document *Aprueba – Ajustes* |
| `questions.json` | Approved questions, Temas and Subtemas | Master workbook `Aprueba_5to_Phase1_T01-T05.xlsx` |
| `img/` | Logo and Profe Ariel (version 1) | Project folders `claude/images/logo/v1/` and `claude/images/mascot/v1/` |
| `supabase/schema.sql` | Database: tables, access rules, save function, backstage views | This repository (matches the live Supabase database) |
| `tools/build_textos.py` | *Aprueba – Textos* → `textos.json`, with checks | This repository |
| `tests/` | Local browser tests (Playwright) with a stand-in for Supabase | This repository |

The JSON files are generated from the project documents; do not edit them by hand.

## Data

No student data is stored in this repository. Accounts (email and password, nickname) are in Supabase since v0.2 step 3. Until step 4, progress, sound and reviewer ratings are still saved only in the browser of each device, per account.

## Tests

From the repository folder: `python3 -m http.server 8765 &` then `node tests/test-accounts.js`.

## History

- v0.1 (October 2026): built and published on claude.ai, published version 23. Moved here unchanged on 30 October 2026.
- v0.2 step 3 (30 October 2026): accounts: sign-up by the parent, login, nickname at the first login, Configuración.
