#!/usr/bin/env python3
"""Aprueba – Textos (project document, Markdown) -> textos.json for the prototype.

Usage: python3 build_textos.py "Aprueba – Textos.md" textos.json

Every text is checked. If anything is wrong, the script lists the problems,
writes nothing and exits with an error, so the app never gets a broken file.
"""
import json
import re
import sys

# Keys the app needs, with the placeholders each one may use.
FIXED = {
    "marca": [], "cargando": [], "errorCarga": [], "errorConexion": [],
    "puntosTotales": ["n"], "sonidoActivar": [], "sonidoSilenciar": [],
    "volver": [], "inicio": [],
    # Login and sign-up (v0.2, 30 Oct 2026)
    "loginTitulo": [], "tabEntrar": [], "tabCrear": [], "correo": [], "contrasena": [],
    "entrarBoton": [], "olvideContrasena": [], "crearTitulo": [], "crearNota": [],
    "crearAdulto": [], "crearBoton": [], "errorDatos": [], "errorExiste": [],
    "errorContrasenaCorta": ["n"], "errorAdulto": [],
    # Nickname and Configuración (v0.2)
    "apodoEtiqueta": [], "apodoAyuda": [], "apodoBoton": [], "apodoOcupado": [],
    "configuracion": [], "guardar": [], "guardado": [], "sonido": [], "cuenta": [], "cerrarSesion": [],
    "hola": ["nombre"], "tipoGrado": ["grado"],
    "miProgreso": [], "opinion": [],
    "materiaSub": [], "todosLosTemas": ["materia"],
    "temaN": ["n"], "proximamente": [],
    "introGrado": ["grado"], "introGradoSub": [], "introMateria": ["materia"],
    "introMateriaSub": ["materia"], "introTema": ["tema"], "introTemaSub": ["materia", "n"],
    "introDatos": ["n", "p"], "empezar": [],
    "preguntaDe": ["i", "n"], "esperaRespuesta": [], "correcto": [], "incorrecto": [],
    "masPuntos": ["p"], "explicacion": [], "siguiente": [], "verResultado": [],
    "votoArriba": [], "votoAbajo": [], "salir": [], "salirPregunta": [],
    "salirSi": [], "salirNo": [],
    "resultadoTitulo": [], "resultadoCorrectas": ["c", "n"], "resultadoCorrectasSub": [],
    "resultadoPuntos": ["p"], "resumenTitulo": [],
    "otraPrueba": [], "verRespuestas": [], "ocultarRespuestas": [], "tusRespuestas": [],
    "mapaTodoTab": ["grado"], "mapaTodoTitulo": ["grado"], "mapaTitulo": ["materia"],
    "progresoPuntos": ["n"], "mapaInactivos": [],
    "profe.nombre": [], "profe.login": [], "profe.inicio": [], "profe.apodo": [], "profe.nivel5": ["tema"],
    "profe.mapa": [], "profe.mapaVacio": [],
}
# Rotating groups: allowed moods and maximum length (characters).
ROTATING = {
    "profe.intro": ({"neutral", "reto"}, 90),
    "profe.final.feliz": ({"feliz"}, 90),
    "profe.final.alto": ({"neutral"}, 90),
    "profe.final.medio": ({"neutral"}, 90),
    "profe.final.bajo": ({"reto"}, 90),
    "profe.pregunta.correcta": ({"feliz"}, 40),
    "profe.pregunta.incorrecta": ({"neutral"}, 40),
    # «Tu resumen» at the end of a Prueba: the app's voice (no mood), by score band
    "resumen.feliz": (None, 250),
    "resumen.alto": (None, 250),
    "resumen.medio": (None, 250),
    "resumen.bajo": (None, 250),
}
MOODS = {"neutral", "reto", "feliz"}


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse(md):
    fixed, groups, errors = {}, {}, []
    current = None  # rotating group being read
    for raw in md.splitlines():
        line = raw.strip()
        m = re.match(r"^#{2,3} .*\(`([\w.]+)`\)\s*$", line)
        if m:
            current = m.group(1)
            groups.setdefault(current, [])
            continue
        if line.startswith("#"):
            current = None
            continue
        if not line.startswith("|") or re.match(r"^\|[\s:|-]+\|$", line):
            continue
        c = cells(line)
        if current and len(c) == 3 and c[0] != "#":            # | # | Mood | Text |
            groups[current].append({"animo": c[1].lower(), "texto": c[2]})
        elif current and len(c) == 2 and c[0] != "#":          # | # | Text | (no mood: app's voice)
            groups[current].append({"texto": c[1]})
        elif not current and len(c) >= 2 and c[0].startswith("`"):  # | `key` | Text | Where |
            key = c[0].strip("`")
            if key in fixed:
                errors.append(f"La clave {key} aparece dos veces.")
            fixed[key] = c[1]
    return fixed, groups, errors


def check(fixed, groups, errors):
    for key, allowed in FIXED.items():
        if key not in fixed:
            errors.append(f"Falta el texto fijo `{key}`.")
            continue
        if not fixed[key]:
            errors.append(f"El texto `{key}` está vacío.")
        bad = set(re.findall(r"\{(\w+)\}", fixed[key])) - set(allowed)
        if bad:
            errors.append(f"`{key}` usa {', '.join('{' + b + '}' for b in sorted(bad))}; permitidos: {', '.join('{' + a + '}' for a in allowed) or 'ninguno'}.")
    for key in fixed:
        if key not in FIXED:
            errors.append(f"Clave desconocida `{key}` (la app no la usa).")
    for key, (moods, maxlen) in ROTATING.items():
        lines = groups.get(key)
        if not lines:
            errors.append(f"El grupo `{key}` no tiene ninguna línea.")
            continue
        for i, ln in enumerate(lines, 1):
            where = f"`{key}` línea {i}"
            if moods is None:
                if "animo" in ln:
                    errors.append(f"{where}: este grupo no lleva ánimo (es la voz de la app).")
            elif ln.get("animo") not in MOODS:
                errors.append(f"{where}: ánimo «{ln['animo']}» no existe (Neutral, Reto o Feliz).")
            elif ln.get("animo") not in moods:
                errors.append(f"{where}: ánimo «{ln['animo']}» no permitido aquí ({', '.join(sorted(moods))}).")
            if not ln["texto"]:
                errors.append(f"{where}: texto vacío.")
            if len(ln["texto"]) > maxlen:
                errors.append(f"{where}: {len(ln['texto'])} caracteres, máximo {maxlen}.")
            if re.search(r"\{\w+\}", ln["texto"]):
                errors.append(f"{where}: las líneas que rotan no llevan datos ({{...}}).")
    for key in groups:
        if key not in ROTATING:
            errors.append(f"Grupo desconocido `{key}` (la app no lo usa).")
    return errors


def nest(fixed, groups):
    out = {}
    for key, val in list(fixed.items()) + list(groups.items()):
        node = out
        parts = key.split(".")
        for p in parts[:-1]:
            node = node.setdefault(p, {})
        node[parts[-1]] = val
    return {"textos": out}


def main():
    src, dst = sys.argv[1], sys.argv[2]
    fixed, groups, errors = parse(open(src, encoding="utf-8").read())
    errors = check(fixed, groups, errors)
    if errors:
        print("No se generó textos.json. Problemas:")
        for e in errors:
            print(" -", e)
        sys.exit(1)
    with open(dst, "w", encoding="utf-8") as f:
        json.dump(nest(fixed, groups), f, ensure_ascii=False, indent=2)
        f.write("\n")
    n_rot = sum(len(groups[k]) for k in ROTATING)
    print(f"textos.json generado: {len(fixed)} textos fijos, {len(ROTATING)} grupos que rotan, {n_rot} líneas que rotan.")


if __name__ == "__main__":
    main()
