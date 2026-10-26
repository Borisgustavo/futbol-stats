"""Informe de las apuestas diarias de Masterfutbol (Doble y Riesgo).

Lee data/apuestas.json y data/predicciones.json directamente (no necesita el servidor) y
aplica las mismas reglas que apuestas.js: una selección anulada cuenta como cuota 1, una
combinada se pierde con un solo fallo y se gana solo si aciertan todas las válidas.

Uso:
  python estado_apuestas.py                 # hoy, mañana y los últimos 3 días, en Markdown
  python estado_apuestas.py --dias 7        # historial más largo
  python estado_apuestas.py --fecha 2026-10-25
  python estado_apuestas.py --json          # salida para procesar
  python estado_apuestas.py --raiz "G:/Mi unidad/futbol-stats"
"""
import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

MERCADOS = {
    "local": "Victoria local", "visita": "Victoria visitante", "empate": "Empate",
    "aem_si": "Ambos marcan", "aem_no": "No marcan ambos", "mas15": "Más de 1,5 goles",
    "mas25": "Más de 2,5 goles", "menos25": "Menos de 2,5 goles", "menos35": "Menos de 3,5 goles",
}
NOMBRES = {"doble": "Doble", "riesgo": "Riesgo"}


def raiz_por_defecto():
    # La carpeta actual si tiene los datos (p. ej. al ejecutarlo desde la raíz del proyecto o
    # en una copia de prueba); si no, la raíz del proyecto que contiene este skill:
    # .../futbol-stats/.claude/skills/apuesta-diaria/scripts/estado_apuestas.py
    if (Path.cwd() / "data" / "apuestas.json").exists():
        return Path.cwd()
    return Path(__file__).resolve().parents[4]


def cargar(raiz):
    def leer(nombre, clave):
        ruta = raiz / "data" / nombre
        if not ruta.exists():
            return {}
        return json.loads(ruta.read_text(encoding="utf-8")).get(clave, {})
    return leer("apuestas.json", "dias"), leer("predicciones.json", "predicciones")


def con_estado(c, registro):
    if not c:
        return None
    sels = []
    for s in c["selecciones"]:
        r = (registro.get(s["id"]) or {}).get("resultado")
        estado = "pendiente" if not r else "anulada" if r.get("anulada") else "ganada" if r.get("acierto") else "perdida"
        sels.append({**s, "estado": estado, "goles_local": (r or {}).get("goles_local"), "goles_visita": (r or {}).get("goles_visita")})
    validas = [s for s in sels if s["estado"] != "anulada"]
    if any(s["estado"] == "perdida" for s in validas):
        estado = "perdida"
    elif not validas:
        estado = "anulada"
    elif all(s["estado"] == "ganada" for s in validas):
        estado = "ganada"
    else:
        estado = "pendiente"
    cuota = 1.0
    for s in validas:
        cuota *= s["cuota"]
    return {**c, "selecciones": sels, "estado": estado, "cuota_final": round(cuota, 2)}


def rendimiento(dias, registro):
    """Balance por tipo, acierto por mercado y calibración (probabilidad media frente a acierto real)."""
    tipos, mercados = {}, {}
    calib = {"n": 0, "prob": 0.0, "aciertos": 0}
    for f in sorted(dias):
        for tipo in NOMBRES:
            c = con_estado(dias[f].get(tipo), registro)
            if not c:
                continue
            t = tipos.setdefault(tipo, {"cerradas": 0, "ganadas": 0, "pendientes": 0, "unidades": 0.0})
            if c["estado"] in ("ganada", "perdida"):
                t["cerradas"] += 1
                t["unidades"] += (c["cuota_final"] - 1) if c["estado"] == "ganada" else -1
                t["ganadas"] += c["estado"] == "ganada"
            elif c["estado"] == "pendiente":
                t["pendientes"] += 1
            for s in c["selecciones"]:
                if s["estado"] not in ("ganada", "perdida"):
                    continue
                m = mercados.setdefault(s["mercado"], {"n": 0, "ok": 0})
                m["n"] += 1
                m["ok"] += s["estado"] == "ganada"
                calib["n"] += 1
                calib["prob"] += s["prob"]
                calib["aciertos"] += s["estado"] == "ganada"
    for t in tipos.values():
        t["unidades"] = round(t["unidades"], 2)
    if calib["n"]:
        calib = {"selecciones": calib["n"], "prob_media": round(calib["prob"] / calib["n"], 3), "acierto_real": round(calib["aciertos"] / calib["n"], 3)}
    else:
        calib = {"selecciones": 0}
    return {"por_tipo": tipos, "por_mercado": mercados, "calibracion": calib}


VENTAJA_MINIMA_PTS = 3  # por debajo, la selección no se aparta de lo normal en su liga
MUESTRA_MINIMA_PJ = 6  # partidos de local (o visitante) para fiarse de los números


def detalle(s, registro):
    """Por qué el modelo eligió la selección: goles esperados, números de cada equipo y ventaja
    frente a la media de la liga en ese mismo mercado (la señal de si es valor o un pick fácil)."""
    p = registro.get(s["id"]) or {}
    d = p.get("datos") or {}
    base = (p.get("base") or {}).get(s["mercado"])
    ventaja = round((s["prob"] - base) * 100, 1) if base is not None else None
    pj = [x for x in (d.get("local_pj"), d.get("visita_pj")) if x is not None]
    avisos = []
    if ventaja is not None and ventaja < VENTAJA_MINIMA_PTS:
        avisos.append("sin ventaja")
    if pj and min(pj) < MUESTRA_MINIMA_PJ:
        avisos.append("muestra corta")
    return {
        "goles_esperados": [round(p["lh"], 2), round(p["la"], 2)] if "lh" in p else None,
        "local_casa": {"gf": d.get("local_gf"), "gc": d.get("local_gc"), "pj": d.get("local_pj")},
        "visita_fuera": {"gf": d.get("visita_gf"), "gc": d.get("visita_gc"), "pj": d.get("visita_pj")},
        "prob_liga_media": base,
        "ventaja_pts": ventaja,
        "avisos": avisos,
    }


def hora_local(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).astimezone().strftime("%d/%m %H:%M")


def fmt_pct(x):
    return "–" if x is None else f"{round(x * 100)}%"


def markdown(informe):
    out = []
    for dia in informe["dias"]:
        out.append(f"## {dia['etiqueta']} · {dia['fecha']}")
        if not dia.get("existe"):
            out.append("Sin combinadas guardadas para esta fecha.\n")
            continue
        for tipo in NOMBRES:
            c = dia.get(tipo)
            if not c:
                out.append(f"**{NOMBRES[tipo]}**: no se armó (faltaron candidatas en el rango de probabilidad).")
                continue
            out.append(f"**{NOMBRES[tipo]}** — {c['estado']} · cuota total {c['cuota_final']} · probabilidad del modelo {fmt_pct(c['prob_total'])}")
            for s in c["selecciones"]:
                res = f" → {s['goles_local']}-{s['goles_visita']} ({s['estado']})" if s["goles_local"] is not None else f" ({s['estado']})"
                det = s.get("detalle") or {}
                ge = det.get("goles_esperados")
                extra = f"; goles esperados {ge[0]}-{ge[1]}" if ge else ""
                base = det.get("prob_liga_media")
                if base is not None:
                    extra += f"; media de la liga {fmt_pct(base)} (ventaja {det['ventaja_pts']:+} pts)"
                lc, vf = det.get("local_casa") or {}, det.get("visita_fuera") or {}
                if lc.get("pj") is not None:
                    extra += f"; local en casa {lc['pj']} PJ, visitante fuera {vf.get('pj')} PJ"
                if det.get("avisos"):
                    extra += f" [{', '.join(det['avisos']).upper()}]"
                out.append(f"- {hora_local(s['inicio'])} · {s['liga']['pais']} - {s['liga']['nombre']} · {s['local']['nombre']} vs {s['visita']['nombre']} · "
                           f"{MERCADOS.get(s['mercado'], s['mercado'])} {fmt_pct(s['prob'])} · cuota {s['cuota']} ({s['cuota_tipo']}){res}{extra}")
        out.append("")
    r = informe["rendimiento"]
    out.append("## Rendimiento (todo lo guardado)")
    for tipo, t in r["por_tipo"].items():
        out.append(f"- {NOMBRES[tipo]}: {t['ganadas']}/{t['cerradas']} ganadas, {t['pendientes']} pendientes, {t['unidades']:+} unidades")
    if not r["por_tipo"]:
        out.append("- Todavía no hay combinadas guardadas.")
    for m, x in sorted(r["por_mercado"].items(), key=lambda kv: -kv[1]["n"]):
        out.append(f"- Selecciones {MERCADOS.get(m, m)}: {x['ok']}/{x['n']}")
    c = r["calibracion"]
    if c.get("selecciones"):
        out.append(f"- Calibración: probabilidad media {fmt_pct(c['prob_media'])} frente a acierto real {fmt_pct(c['acierto_real'])} en {c['selecciones']} selecciones")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--raiz", type=Path, default=raiz_por_defecto())
    ap.add_argument("--dias", type=int, default=3, help="días de historial (por defecto 3)")
    ap.add_argument("--fecha", help="una sola fecha AAAA-MM-DD")
    ap.add_argument("--json", action="store_true")
    a = ap.parse_args()

    dias, registro = cargar(a.raiz)
    hoy = date.today()
    if a.fecha:
        fechas = [(a.fecha, a.fecha)]
    else:
        fechas = [("Hoy", hoy.isoformat()), ("Mañana", (hoy + timedelta(days=1)).isoformat())]
        fechas += [(f"Hace {i} día{'s' if i > 1 else ''}", (hoy - timedelta(days=i)).isoformat()) for i in range(1, a.dias + 1)]
    lista = []
    for etiqueta, f in fechas:
        d = dias.get(f)
        item = {"etiqueta": etiqueta, "fecha": f, "existe": bool(d)}
        if d:
            for tipo in NOMBRES:
                c = con_estado(d.get(tipo), registro)
                if c:
                    for s in c["selecciones"]:
                        s["detalle"] = detalle(s, registro)
                item[tipo] = c
        lista.append(item)
    informe = {"dias": lista, "rendimiento": rendimiento(dias, registro)}
    if a.json:
        json.dump(informe, sys.stdout, ensure_ascii=False, indent=1)
    else:
        sys.stdout.reconfigure(encoding="utf-8")
        print(markdown(informe))


if __name__ == "__main__":
    main()
