"""Export approved questions from the master workbook to questions.json for the aPrueba prototype.

Usage: python3 export_questions.py <master.xlsx> [output.json]
For Option order = Fixed, options are stored already sorted by value (TST-03, MET-08).
Each option carries its code from the master workbook (v0.2, 30 Oct 2026): K = Correct answer,
D1, D2, D3 = Distractor 1, 2, 3. The app saves the code of the option chosen, so the record does not
depend on the order on screen or on the wording (Aprueba – Data Structure, section 8).
"""
import json, re, sys
import pandas as pd

CODES = {'Ciencias': 'CIE', 'Lengua': 'LEN', 'Matemáticas': 'MAT', 'Sociales': 'SOC'}
WORDS = {'uno': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5, 'seis': 6, 'siete': 7,
         'ocho': 8, 'nueve': 9, 'diez': 10, 'once': 11, 'doce': 12}
MULT = {'mil': 1e3, 'millones': 1e6, 'millón': 1e6, 'millardos': 1e9, 'millardo': 1e9,
        'billones': 1e12, 'billón': 1e12}


def value(text):
    """Numeric value of an option written in Venezuelan notation (7.503,6071; 50 billones; 7:12; 25/9)."""
    t = text.strip().lower()
    m = re.fullmatch(r'(\d+):(\d{2})', t)
    if m:
        return int(m[1]) * 60 + int(m[2])
    m = re.fullmatch(r'(\d+)/(\d+)', t)
    if m:
        return int(m[1]) / int(m[2])
    first = t.split()[0]
    if first in WORDS:
        return WORDS[first]
    m = re.match(r'([\d.]+(?:,\d+)?)\s*(\S+)?', t)
    if not m:
        raise ValueError(text)
    n = float(m[1].replace('.', '').replace(',', '.'))
    return n * MULT.get(m[2] or '', 1)


def clean(v):
    return None if pd.isna(v) else str(v).strip()


def main(src, out='questions.json'):
    q = pd.read_excel(src, 'Questions')
    t = pd.read_excel(src, 'Taxonomy')
    q = q[q['Status'] == 'approved']
    questions = []
    for _, r in q.iterrows():
        qid = r['ID']
        _, tema, sub, _ = qid.split('-')
        pairs = [('K', clean(r['Correct answer']))] + [(f'D{i}', clean(r[f'Distractor {i}'])) for i in (1, 2, 3)]
        order = clean(r['Option order']) or 'Random'
        if order == 'Fixed':
            pairs.sort(key=lambda p: value(p[1]))
        codes = [c for c, _ in pairs]
        options = [o for _, o in pairs]
        questions.append(dict(
            id=qid, materia=CODES[r['Materia']], tema=tema, subtema=f'{tema}-{sub}',
            stem=clean(r['Stem']), options=options, codes=codes, correct=codes.index('K'),
            feedback=clean(r['Feedback']), cluster=clean(r['Cluster ID']), order=order))
    tx = t[t['Tema ID'].isin(sorted(q['ID'].str.split('-').str[1].unique()))]
    materias = []
    for name, code in CODES.items():
        temas = []
        for tid, g in tx[tx['Materia'] == name].groupby('Tema ID', sort=True):
            temas.append(dict(id=tid, name=g['Tema display name'].iloc[0],
                              subtemas=[dict(id=s['Subtema ID'], name=s['Subtema display name'])
                                        for _, s in g.iterrows()]))
        materias.append(dict(id=code, name=name, temas=temas))
    known = {s['id'] for m in materias for tm in m['temas'] for s in tm['subtemas']}
    ids = [x['id'] for x in questions]
    assert len(ids) == len(set(ids)), 'duplicate question IDs'
    for x in questions:
        assert x['stem'] and x['feedback'] and all(x['options']), x['id']
        assert sorted(x['codes']) == ['D1', 'D2', 'D3', 'K'], x['id']
        assert len(set(x['options'])) == 4, f"{x['id']}: two options have the same text"
        assert x['subtema'] in known, x['id']
    with open(out, 'w', encoding='utf-8') as f:
        json.dump(dict(source=src.split('/')[-1], materias=materias, questions=questions),
                  f, ensure_ascii=False)
    print(f'{len(questions)} questions written to {out}')


if __name__ == '__main__':
    main(*sys.argv[1:])
