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
# v0.3 interface revamp (texts of 8 November 2026): Profe Ariel no longer speaks.
FIXED = {
    "marca": [], "cargando": [], "errorCarga": [], "errorConexion": [],
    # Rail and information area (v0.3)
    "railPruebas": [], "railProgreso": [], "railTabla": [], "railAyuda": [], "railConfiguracion": [],
    "puntosTotales": ["n"], "verTabla": ["p"], "sonidoActivar": [], "sonidoSilenciar": [], "volver": [],
    # Login and sign-up (split screen, v0.3)
    "loginLema": [], "loginApoyo": ["n"], "loginTitulo": [], "correo": [], "contrasena": [],
    "entrarBoton": [], "primeraVez": [], "crearBoton": [], "crearTitulo": [], "crearNota": [],
    "crearAdulto": [], "crearAvisoTabla": [], "entrarDeNuevo": [], "errorDatos": [], "errorExiste": [],
    "errorContrasenaCorta": ["n"], "errorAdulto": [],
    # Nickname (first login)
    "apodoTitulo": [], "apodoEtiqueta": [], "apodoAyuda": [], "apodoTablaNota": [], "apodoBoton": [],
    "apodoOcupado": [],
    # Grade step at sign-up and the grade cards from Configuración (4to and 6to, decided 18 November 2026)
    "gradoTitulo": [], "gradoAyuda": [], "gradoCambioNota": [], "gradoOpcion": ["grado"], "gradoBoton": [],
    # Main page «Pruebas» and Materia screen
    "hola": ["nombre"], "invitacion": ["n"], "tipoGrado": ["grado"], "opinion": [],
    "materiaSub": [], "todosLosTemas": ["materia"], "temaN": ["n"],
    # Prueba intro (game card)
    "introGrado": ["grado"], "introGradoSub": [], "introMateria": ["materia"],
    "introMateriaSub": ["materia"], "introTema": ["tema"], "introTemaSub": ["materia", "n"],
    "introPreguntas": ["n"], "introPuntos": ["p"], "introInstruccion": [], "empezar": [],
    # Question
    "preguntaDe": ["i", "n"], "correcto": [], "incorrecto": [], "explicacion": [],
    "siguiente": [], "verResultado": [], "votoArriba": [], "votoAbajo": [], "salir": [],
    "salirPregunta": [], "salirSi": [], "salirNo": [],
    # End of Prueba (back of the card) and «Mis respuestas»
    "resultadoTitulo": [], "resultadoCorrectas": ["c", "n"], "resultadoCorrectasSub": [],
    "resultadoPuntos": ["p"], "nivel5": ["tema"], "otraPrueba": [], "misRespuestas": [],
    "respuestaCorrecta": [],
    # Progreso (maps)
    "mapaTodoTab": ["grado"], "mapaTodoTitulo": [], "mapaTitulo": ["materia"], "mapaAunNo": [],
    "mapaPorPracticar": [], "mapaDominado": [], "mapaNota": ["p"],
    # Tabla: «Posiciones» and «Mi práctica»
    "tablaTitulo": [], "tablaPosiciones": [], "tablaPractica": [], "tablaSemana": [], "tablaMes": [],
    "tablaSiempre": [], "tablaSwitch": [], "tablaDentroNota": [], "tablaFueraNota": [],
    "tablaTu": ["apodo"], "tablaReinicio": [], "tablaVacia": [],
    "progresoEstaSemana": [], "progresoSemanaPasada": [], "progresoTitulo": [],
    "progresoSemanaActual": [], "progresoPruebas": ["n"], "progresoPrueba": ["n"], "progresoNota": [],
    # Configuración
    "configuracion": [], "guardar": [], "guardado": [], "sonido": [], "tablaConfig": [], "grado": [],
    "gradoCambiar": [], "cuenta": [], "cerrarSesion": [],
    # Ayuda (new in v0.3)
    "ayudaTitulo": [], "ayudaSubtitulo": [], "ayuda1": ["n"], "ayuda2": [], "ayuda3": ["p"],
    "ayuda4": [], "ayuda5": [], "ayuda6": [],
    # Racha, bonus points and points by scope (decided 16 November 2026, texts approved 17 November 2026)
    "rachaDias": ["n"], "resultadoRacha": ["n"], "stickerRacha": ["p", "n"], "resultadoAciertos": ["p"],
    "introTotalTema": ["n"], "introTotalMateria": ["n", "materia"], "introTotalGrado": ["n", "grado"],
    "resultadoTotalTema": ["n"], "resultadoTotalMateria": ["n", "materia"], "resultadoTotalGrado": ["n", "grado"],
    "chipTema": ["p"], "chipMateria": ["p", "materia"], "verTablaMateria": ["p", "materia"],
    "mapaDe": ["materia"],
    # Tabla redesign (decided 12 November 2026)
    "tablaPeriodo": [], "tablaMateria": [], "tablaFiltro": ["periodo", "materia"], "tablaVerTabla": [],
    # Ayuda with videos and the help video on the login (decided 23 November 2026)
    "loginVideo": [], "ayudaVideos": [], "videoVer": ["titulo"], "videoOtros": [], "videoDatos": ["duracion", "mb"],
    "videoCerrar": [], "videoError": [], "videoAyudaTitulo": [], "videoAyudaTexto": [],
    "videoEstudiantesTitulo": [], "videoEstudiantesTexto": [], "videoFamiliasTitulo": [], "videoFamiliasTexto": [],
    "videoDocentesTitulo": [], "videoDocentesTexto": [],
    # «Versión piloto» mark (decided 24 November 2026): the sticker on the login card and the watermark
    "pilotoLinea1": [], "pilotoLinea2": [],
}
# Rotating groups: allowed moods (None = the app's voice, no mood column), maximum length and
# the placeholders the lines may use. v0.3: the end-of-Prueba message, up to 120 characters, no data.
# 17 November 2026: the personal messages of the main page (shown when there is no racha), up to 90
# characters with the longest values filled in (SAMPLE).
ROTATING = {
    "resumen.feliz": (None, 120, []),
    "resumen.alto": (None, 120, []),
    "resumen.medio": (None, 120, []),
    "resumen.bajo": (None, 120, []),
    "mensaje.primera": (None, 90, []),
    "mensaje.pruebas": (None, 90, ["n"]),
    "mensaje.semana": (None, 90, ["n", "m"]),
    "mensaje.regreso": (None, 90, []),
    "mensaje.avance": (None, 90, ["materiaAvance", "materiaDescubrir"]),
}
SAMPLE = {"n": "999", "m": "999", "materiaAvance": "Matemáticas", "materiaDescubrir": "Matemáticas"}
MOODS = {"neutral", "reto", "feliz"}


def cells(line):
    return [c.strip() for c in line.strip().strip("|").split("|")]


def parse(md):
    fixed, groups, errors = {}, {}, []
    current = None  # rotating group being read
    for raw in md.splitlines():
        line = raw.strip()
        if re.match(r"^## Parked", line):   # Profe Ariel's parked lines: not used by the app
            break
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
    for key, (moods, maxlen, allowed) in ROTATING.items():
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
            used = set(re.findall(r"\{(\w+)\}", ln["texto"]))
            if used - set(allowed):
                if allowed:
                    errors.append(f"{where}: usa {', '.join('{' + b + '}' for b in sorted(used - set(allowed)))}; permitidos: {', '.join('{' + a + '}' for a in allowed)}.")
                else:
                    errors.append(f"{where}: las líneas de este grupo no llevan datos ({{...}}).")
            filled = re.sub(r"\{(\w+)\}", lambda m: SAMPLE.get(m.group(1), m.group(0)), ln["texto"])
            if len(filled) > maxlen:
                errors.append(f"{where}: {len(filled)} caracteres, máximo {maxlen}.")
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
