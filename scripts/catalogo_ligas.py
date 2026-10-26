"""Construye data/ligas.json: las ligas de fútbol de TheSportsDB para los países
del menú de referencia (capturas del usuario, 2026-10-24).

Uso: python scripts/catalogo_ligas.py
Lee THESPORTSDB_API_KEY de .env. No imprime la clave.
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent

# (nombre en español para el menú, nombre de país en TheSportsDB, región)
PAISES = [
    ("Chile", "Chile", "Sudamérica"),
    ("Argentina", "Argentina", "Sudamérica"),
    ("Brasil", "Brazil", "Sudamérica"),
    ("Colombia", "Colombia", "Sudamérica"),
    ("Ecuador", "Ecuador", "Sudamérica"),
    ("Paraguay", "Paraguay", "Sudamérica"),
    ("Perú", "Peru", "Sudamérica"),
    ("Uruguay", "Uruguay", "Sudamérica"),
    ("Venezuela", "Venezuela", "Sudamérica"),
    ("Surinam", "Suriname", "Sudamérica"),
    ("EE. UU.", "United States", "Norte y Centroamérica"),
    ("México", "Mexico", "Norte y Centroamérica"),
    ("Costa Rica", "Costa Rica", "Norte y Centroamérica"),
    ("El Salvador", "El Salvador", "Norte y Centroamérica"),
    ("Guatemala", "Guatemala", "Norte y Centroamérica"),
    ("Honduras", "Honduras", "Norte y Centroamérica"),
    ("Jamaica", "Jamaica", "Norte y Centroamérica"),
    ("Nicaragua", "Nicaragua", "Norte y Centroamérica"),
    ("Panamá", "Panama", "Norte y Centroamérica"),
    ("Puerto Rico", "Puerto Rico", "Norte y Centroamérica"),
    ("República Dominicana", "Dominican Republic", "Norte y Centroamérica"),
    ("Saint Kitts and Nevis", "Saint Kitts and Nevis", "Norte y Centroamérica"),
    ("Inglaterra", "England", "Europa"),
    ("España", "Spain", "Europa"),
    ("Italia", "Italy", "Europa"),
    ("Alemania", "Germany", "Europa"),
    ("Francia", "France", "Europa"),
    ("Austria", "Austria", "Europa"),
    ("Azerbaiyán", "Azerbaijan", "Europa"),
    ("Bélgica", "Belgium", "Europa"),
    ("Bosnia y Herzegovina", "Bosnia and Herzegovina", "Europa"),
    ("Bulgaria", "Bulgaria", "Europa"),
    ("Chipre", "Cyprus", "Europa"),
    ("Croacia", "Croatia", "Europa"),
    ("Dinamarca", "Denmark", "Europa"),
    ("Escocia", "Scotland", "Europa"),
    ("Eslovaquia", "Slovakia", "Europa"),
    ("Eslovenia", "Slovenia", "Europa"),
    ("Estonia", "Estonia", "Europa"),
    ("Finlandia", "Finland", "Europa"),
    ("Georgia", "Georgia", "Europa"),
    ("Gales", "Wales", "Europa"),
    ("Grecia", "Greece", "Europa"),
    ("Hungría", "Hungary", "Europa"),
    ("Irlanda", "Ireland", "Europa"),
    ("Macedonia del Norte", "Macedonia", "Europa"),
    ("Malta", "Malta", "Europa"),
    ("Noruega", "Norway", "Europa"),
    ("Países Bajos", "The Netherlands", "Europa"),
    ("Polonia", "Poland", "Europa"),
    ("Portugal", "Portugal", "Europa"),
    ("República Checa", "Czechia", "Europa"),
    ("Rumanía", "Romania", "Europa"),
    ("San Marino", "San Marino", "Europa"),
    ("Serbia", "Serbia", "Europa"),
    ("Suecia", "Sweden", "Europa"),
    ("Suiza", "Switzerland", "Europa"),
    ("Turquía", "Turkey", "Europa"),
    ("Egipto", "Egypt", "África"),
    ("Etiopía", "Ethiopia", "África"),
    ("Ghana", "Ghana", "África"),
    ("Emiratos Árabes Unidos", "United Arab Emirates", "Asia y Oceanía"),
    ("Hong Kong", "Hong Kong", "Asia y Oceanía"),
    ("India", "India", "Asia y Oceanía"),
    ("Indonesia", "Indonesia", "Asia y Oceanía"),
    ("Irak", "Iraq", "Asia y Oceanía"),
    ("Irán", "Iran", "Asia y Oceanía"),
    ("Islas Salomón", "Solomon Islands", "Asia y Oceanía"),
    ("Japón", "Japan", "Asia y Oceanía"),
]

# Competencias internacionales: (nombre en español, texto de búsqueda en TheSportsDB)
INTERNACIONALES = [
    ("Copa Libertadores", "Copa Libertadores"),
    ("Copa Sudamericana", "Copa Sudamericana"),
    ("Recopa Sudamericana", "Recopa Sudamericana"),
    ("Libertadores Femenina", "Copa Libertadores Femenina"),
    ("Champions League", "UEFA Champions League"),
    ("UEFA Europa League", "UEFA Europa League"),
    ("UEFA Conference League", "UEFA Conference League"),
]


def leer_clave():
    for linea in (RAIZ / ".env").read_text(encoding="utf-8").splitlines():
        if linea.startswith("THESPORTSDB_API_KEY="):
            return linea.split("=", 1)[1].strip()
    raise SystemExit("Falta THESPORTSDB_API_KEY en .env")


def pedir(url, clave=None):
    req = urllib.request.Request(url, headers={"X-API-KEY": clave} if clave else {})
    for intento in range(3):
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8") or "{}")
        except Exception:
            time.sleep(2 + intento * 3)
    return {}


def resumen(liga):
    return {
        "id": str(liga.get("idLeague")),
        "nombre": liga.get("strLeague"),
        "alternativo": liga.get("strLeagueAlternate") or "",
        "division": int(liga.get("intDivision") or 0),
        "temporada": liga.get("strCurrentSeason") or "",
        "genero": liga.get("strGender") or "",
        "escudo": liga.get("strBadge") or "",
        "es_copa": str(liga.get("idCup") or "0") != "0",
    }


def main():
    clave = leer_clave()
    base_v1 = f"https://www.thesportsdb.com/api/v1/json/{clave}"
    salida = {"generado": time.strftime("%Y-%m-%d"), "internacionales": [], "paises": []}
    faltan = []

    for nombre_es, consulta in INTERNACIONALES:
        q = urllib.parse.quote(consulta.lower().replace(" ", "_"))
        datos = pedir(f"https://www.thesportsdb.com/api/v2/json/search/league/{q}", clave)
        candidatos = [l for l in datos.get("search") or [] if l.get("strSport") == "Soccer"]
        exacta = [l for l in candidatos if (l.get("strLeague") or "").lower() == consulta.lower()]
        elegida = (exacta or candidatos or [None])[0]
        if not elegida:
            faltan.append(nombre_es)
            continue
        item = resumen(elegida)
        item["nombre_es"] = nombre_es
        salida["internacionales"].append(item)

    for nombre_es, pais, region in PAISES:
        url = f"{base_v1}/search_all_leagues.php?c={urllib.parse.quote(pais)}&s=Soccer"
        ligas = pedir(url).get("countries") or []
        ligas = [resumen(l) for l in ligas]
        ligas.sort(key=lambda l: (l["es_copa"], l["genero"] != "Male", l["division"], l["nombre"]))
        if not ligas:
            faltan.append(nombre_es)
        salida["paises"].append({"nombre_es": nombre_es, "pais": pais, "region": region, "ligas": ligas})
        time.sleep(0.4)

    destino = RAIZ / "data" / "ligas.json"
    destino.parent.mkdir(exist_ok=True)
    destino.write_text(json.dumps(salida, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(len(p["ligas"]) for p in salida["paises"]) + len(salida["internacionales"])
    print(f"{total} ligas en {len(salida['paises'])} países + {len(salida['internacionales'])} internacionales")
    print("Sin resultados:", ", ".join(faltan) if faltan else "ninguno")


if __name__ == "__main__":
    main()
