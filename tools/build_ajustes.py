"""Convert the settings document (Aprueba – Ajustes, the source of truth) into ajustes.json, checking every value.
An Excel copy (.xlsx with the same columns) is also accepted.

Usage: python3 build_ajustes.py <Aprueba – Ajustes.md> <questions.json> [ajustes.json]
Stops with a clear message if any value is not allowed; nothing is written in that case.
"""
import json, re, sys


def whole(lo, hi):
    def check(v):
        if isinstance(v, str) and v.strip().lstrip('-').isdigit():
            v = int(v.strip())
        if isinstance(v, bool) or not isinstance(v, (int, float)) or int(v) != v or not lo <= v <= hi:
            raise ValueError(f'must be a whole number from {lo} to {hi}')
        return int(v)
    return check


def share(lo, hi):
    def check(v):
        if isinstance(v, str):
            v = float(v.strip().rstrip('%').replace(',', '.')) / 100
        if isinstance(v, bool) or not isinstance(v, (int, float)) or not lo <= v <= hi:
            raise ValueError(f'must be a percentage from {lo:.0%} to {hi:.0%}')
        return round(float(v), 4)
    return check


def text(maxlen):
    def check(v):
        v = str(v if v is not None else '').strip()
        if not 1 <= len(v) <= maxlen:
            raise ValueError(f'must be text of 1 to {maxlen} characters')
        return v
    return check


def colour(v):
    v = str(v or '').strip()
    if not re.fullmatch(r'#[0-9A-Fa-f]{6}', v):
        raise ValueError('must be a colour code like #3FAE66')
    return v.upper()


def which(v):
    v = str(v or '').strip().lower().replace('ú', 'u')
    if v not in ('ultima', 'mejor'):
        raise ValueError('must be Última or Mejor')
    return v


def onoff(v):
    v = str(v or '').strip().lower()
    if v not in ('activado', 'desactivado'):
        raise ValueError('must be Activado or Desactivado')
    return v


def link(v):
    """An https link, or "Ninguno" to hide it (added 30 October 2026 for the testers' feedback form)."""
    v = str(v or '').strip().strip('<>')
    if v.lower() in ('ninguno', 'none', ''):
        return ''
    if not re.fullmatch(r'https://[^\s"\'<>]+', v):
        raise ValueError('must be a link starting with https:// or "Ninguno"')
    return v


def weekday(v):
    """Day a new week starts, for the leaderboard and «Tu progreso» (added 4 November 2026)."""
    v = str(v or '').strip().lower()
    if v not in ('lunes', 'domingo'):
        raise ValueError('must be Lunes or Domingo')
    return v


def timezone(v):
    """An IANA time zone name, such as America/Caracas (added 4 November 2026)."""
    v = str(v or '').strip()
    try:
        from zoneinfo import ZoneInfo
        ZoneInfo(v)
    except Exception:
        raise ValueError('must be an IANA time zone name, such as America/Caracas')
    return v


GRADES = ('4to', '5to', '6to')   # a logo exists for each (img/aprueba-<grado>.svg)


def grade(v):
    v = str(v or '').strip()
    if v not in GRADES:
        raise ValueError('must be one of ' + ', '.join(GRADES) + ' (a logo exists for each)')
    return v


RULES = {
    'preguntasPorPrueba': whole(1, 30),
    'puntosPorCorrecta': whole(1, 100),
    'puntosPorIncorrecta': whole(0, 100),
    'mensajeAltoDesde': share(0.01, 1),
    'mensajeMedioDesde': share(0, 0.99),
    'mascotaFelizDesde': share(0.01, 1),
    'sonidoInicial': onoff,
    'volumenSonido': share(0.05, 1),
    'respuestaQueCuenta': which,
    'nivel1Desde': share(0, 0),
    **{f'nivel{i}Desde': share(0.01, 0.99) for i in (2, 3, 4, 5)},
    **{f'nivel{i}Color': colour for i in (1, 2, 3, 4, 5)},
    'temasIncluidos': text(200),
    'temasPorMateria': whole(1, 20),
    'grado': grade,
    'enlaceOpinion': link,
    # Leaderboard, Tabla de posiciones (4 November 2026)
    'tablaTop': whole(3, 50),
    'progresoSemanas': whole(2, 26),
    'inicioSemana': weekday,
    'zonaHoraria': timezone,
}


def temas(spec, known):
    spec = spec.upper().replace('–', '-').replace(' ', '')
    out = []
    for part in filter(None, spec.split(',')):
        m = re.fullmatch(r'T(\d{2})(?:-T(\d{2}))?', part)
        if not m:
            raise ValueError(f'"{part}" is not a Tema ID like T01 or a range like T01-T05')
        a, b = int(m[1]), int(m[2] or m[1])
        out += [f'T{n:02d}' for n in range(a, b + 1)]
    missing = [x for x in out if x not in known]
    if missing:
        raise ValueError(f'these Temas have no questions in the question file: {", ".join(missing)}')
    return sorted(set(out))


def rows(src):
    """(parameter, key, value) for every settings row, from the .md document or an .xlsx copy."""
    if src.lower().endswith('.xlsx'):
        from openpyxl import load_workbook
        for r in load_workbook(src, data_only=True)['Ajustes'].iter_rows(min_row=5, values_only=True):
            yield r[0], r[1], r[2]
        return
    for line in open(src, encoding='utf-8'):
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) >= 3 and cells[1].startswith('`'):
            yield cells[0], cells[1].strip('`'), cells[2]


def main(src, questions, out='ajustes.json'):
    found, errors, seen = {}, [], set()
    for name, key, value in rows(src):
        if key in RULES:
            seen.add(key)
            try:
                found[key] = RULES[key](value)
            except (ValueError, TypeError) as e:
                errors.append(f'{name}: {e} (found: {value!r})')
    errors += [f'Missing row for key {k}' for k in RULES if k not in seen]
    if 'temasIncluidos' in found:
        known = {q['tema'] for q in json.load(open(questions, encoding='utf-8'))['questions']}
        try:
            found['temasIncluidos'] = temas(found['temasIncluidos'], known)
        except ValueError as e:
            errors.append(f'Temas included: {e}')
    if isinstance(found.get('temasIncluidos'), list) and 'temasPorMateria' in found:
        top = max(int(t[1:]) for t in found['temasIncluidos'])
        if found['temasPorMateria'] < top:
            errors.append(f'Temas per Materia ({found["temasPorMateria"]}) must not be lower than the highest Tema included (T{top:02d})')
    if found.get('mensajeAltoDesde', 1) <= found.get('mensajeMedioDesde', 0):
        errors.append('End message "high" must start above "medium"')
    if found.get('mascotaFelizDesde', 1) < found.get('mensajeAltoDesde', 0):
        errors.append('Profe Ariel happy from must not be lower than End message "high"')
    limits = [found.get(f'nivel{i}Desde') for i in range(1, 6)]
    if None not in limits and any(b <= a for a, b in zip(limits, limits[1:])):
        errors.append('Level limits must go up: level 1 < level 2 < level 3 < level 4 < level 5')
    if errors:
        print('Settings NOT updated:\n- ' + '\n- '.join(errors))
        sys.exit(1)
    result = {k: v for k, v in found.items() if not k.startswith('nivel')}
    result['niveles'] = [{'desde': found[f'nivel{i}Desde'], 'color': found[f'nivel{i}Color']} for i in range(1, 6)]
    json.dump(result, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'{out} written:', json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main(*sys.argv[1:])
