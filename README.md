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

The JSON files are generated from the project documents; do not edit them by hand.

## Data

No student data is stored in this repository. In this version, progress, sound and reviewer ratings are saved only in the browser of each device. Accounts and online storage (Supabase) come with v0.2.

## History

- v0.1 (October 2026): built and published on claude.ai, published version 23. Moved here unchanged on 30 October 2026.
