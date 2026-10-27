// Servidor de Masterfutbol: sirve la web de public/ y hace de intermediario con
// TheSportsDB para que la clave de la API nunca llegue al navegador.
// Sin dependencias: Node 22+ (fetch nativo). Uso: node --env-file=.env server.js
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { CLAVES_ODDS, crearCuotas, emparejar } from "./cuotas.js";
import { crearEstadisticas } from "./estadisticas.js";
import { crearStatsPartidos } from "./partidos_stats.js";
import { crearPredicciones } from "./predicciones.js";
import { crearApuestas } from "./apuestas.js";
import { calcularMercados, GRUPOS } from "./mercados.js";
import { evaluarCupon } from "./cupon.js";
import { golesEsperados, MIN_PJ } from "./predicciones.js";

const RAIZ = fileURLToPath(new URL(".", import.meta.url));
const PUERTO = Number(process.env.PORT || 3000);
// En local solo escucha en 127.0.0.1; en Docker (Easypanel) el Dockerfile pone HOST=0.0.0.0.
const HOST = process.env.HOST || "127.0.0.1";
// Cachés e historial (predicciones, apuestas) que el servidor escribe. En Easypanel DATA_DIR apunta a un
// volumen para que sobrevivan a cada despliegue; data/ligas.json viene del repositorio y no se mueve.
const DATOS = process.env.DATA_DIR || join(RAIZ, "data");
await mkdir(DATOS, { recursive: true });
const CLAVE = process.env.THESPORTSDB_API_KEY;
if (!CLAVE) {
  console.error("Falta THESPORTSDB_API_KEY. Arranca con: node --env-file=.env server.js");
  process.exit(1);
}
const V1 = `https://www.thesportsdb.com/api/v1/json/${CLAVE}`;
const V2 = "https://www.thesportsdb.com/api/v2/json";
const cuotas = crearCuotas({
  clave: process.env.ODDS_API_KEY,
  archivoCache: join(DATOS, "cache_cuotas.json"),
  ttlHoras: Number(process.env.ODDS_TTL_HORAS || 12),
  minRestantes: Number(process.env.ODDS_MIN_RESTANTES || 10),
});

const catalogo = JSON.parse(await readFile(join(RAIZ, "data", "ligas.json"), "utf-8"));

// Nombres para mostrar: TheSportsDB antepone el gentilicio ("Spanish La Liga");
// el país ya aparece en la cabecera y en las migas de pan, así que se quita.
const NOMBRES = {
  4328: "Premier League", 4335: "LaLiga", 4331: "Bundesliga", 4332: "Serie A", 4334: "Ligue 1",
  4358: "Eliteserien", 4483: "Copa del Rey", 4511: "Supercopa de España", 4485: "DFB-Pokal",
  4903: "Supercopa de Alemania", 4570: "Copa de la Liga (EFL Cup)", 4482: "FA Cup",
};
// Restos en inglés de los nombres de TheSportsDB.
const espanol = (n) => n.replace(/\bDivision\b/g, "División").replace(/^Women (.+)$/, "$1 Femenina").replace(/^(.+) Women$/, "$1 Femenina")
  .replace(/\bGroup (\w+)$/, "Grupo $1").replace(/\bCampeon\b/, "Campeón");
const GENTILICIOS = /^(English|Spanish|German|Germany|Italian|Italy|French|France|Norwegian|Norway|Argentinian|Argentina|Brazilian|Brazil|Chilean|Chile|American|Danish|Denmark|Dutch|Portuguese|Portugal|Scottish|Belgian|Swiss|Austrian|Turkish|Greek|Swedish|Polish|Czech|Croatian|Serbian|Romanian|Hungarian|Finnish|Japanese|Colombian|Peruvian|Uruguayan|Paraguayan|Ecuadorian|Venezuelan|Bolivian|Mexican|Welsh|Irish|Bulgarian|Slovak|Slovenian|Estonian|Georgian|Cypriot|Maltese|Azerbaijani|Bosnian|Egyptian|Ghanaian|Ethiopian|Indian|Indonesian|Iraqi|Iranian|Emirati|UAE|Hong Kong|Costa-Rica|Costa Rica|Honduran|Guatemalan|Salvadoran|Panamanian|Jamaican|Nicaraguan|Dominican|Surinamese|Slovakian|Slovenia|Macedonian|Japan|Hong-Kong|Egypt|Indonesia|Iran|Serbia|Romania|Czech)\s+/i;
for (const p of catalogo.paises)
  for (const l of p.ligas) l.nombre_es = NOMBRES[l.id] || espanol(l.nombre.replace(GENTILICIOS, ""));

// "orden" sigue el catálogo: internacionales, luego países en el orden del menú y,
// dentro de cada país, primera división masculina antes que el resto.
const ligasPorId = new Map();
for (const l of catalogo.internacionales) ligasPorId.set(l.id, { ...l, pais_es: "Internacional", orden: ligasPorId.size });
for (const p of catalogo.paises)
  for (const l of p.ligas) ligasPorId.set(l.id, { ...l, pais_es: p.nombre_es, region: p.region, orden: ligasPorId.size });

// --- Caché en memoria con caducidad -------------------------------------------
const cache = new Map();
async function conCache(clave, ttlMs, fn) {
  const hit = cache.get(clave);
  if (hit && hit.expira > Date.now()) return hit.valor;
  const promesa = fn();
  cache.set(clave, { valor: promesa, expira: Date.now() + ttlMs });
  try {
    return await promesa;
  } catch (e) {
    cache.delete(clave);
    throw e;
  }
}

// TheSportsDB limita las peticiones por minuto (429). Todas pasan por esta cola,
// espaciadas para no superar ~90/min; si aun así llega un 429, se pausa la cola.
// Las peticiones "baja" (el cálculo de estadísticas en segundo plano) solo salen
// cuando no hay ninguna "alta" (las de quien está navegando) esperando.
const ESPACIO_MS = 660;
const cola = { alta: [], baja: [] };
let bombeando = false;
let pausaHasta = 0;
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));
function turno(prioridad = "alta") {
  return new Promise((ok) => {
    cola[prioridad].push(ok);
    bombear();
  });
}
async function bombear() {
  if (bombeando) return;
  bombeando = true;
  while (cola.alta.length || cola.baja.length) {
    const espera = pausaHasta - Date.now();
    if (espera > 0) await dormir(espera);
    (cola.alta.shift() || cola.baja.shift())();
    await dormir(ESPACIO_MS);
  }
  bombeando = false;
}

async function pedir(url, cabeceras = {}, prioridad = "alta") {
  for (let intento = 0; intento < 4; intento++) {
    await turno(prioridad);
    const r = await fetch(url, { headers: cabeceras }).catch(() => null);
    if (r && r.ok) {
      const texto = await r.text();
      return texto ? JSON.parse(texto) : {};
    }
    if (r && r.status === 429) {
      pausaHasta = Math.max(pausaHasta, Date.now() + 15_000);
      continue;
    }
    if (r && r.status < 500) throw new Error(`TheSportsDB respondió ${r.status}`);
    await new Promise((ok) => setTimeout(ok, 1500 * (intento + 1)));
  }
  throw new Error("TheSportsDB no responde (límite de peticiones); reintenta en un minuto");
}
const v1 = (ruta, prioridad) => pedir(`${V1}/${ruta}`, {}, prioridad);
const v2 = (ruta) => pedir(`${V2}/${ruta}`, { "X-API-KEY": CLAVE });

const MIN = 60_000;

// --- Normalización de partidos -----------------------------------------------
const TERMINADO = new Set(["FT", "AET", "PEN", "Match Finished", "AWD", "WO"]);
const SIN_EMPEZAR = new Set(["NS", "Not Started", "TBD", ""]);
const SUSPENDIDO = new Set(["PST", "CANC", "ABD", "SUSP", "INT", "Postponed", "Cancelled", "Match Postponed"]);

function estadoDe(e) {
  const s = e.strStatus || "";
  if (SUSPENDIDO.has(s)) return "suspendido";
  if (TERMINADO.has(s)) return "terminado";
  if (SIN_EMPEZAR.has(s) && e.intHomeScore == null) return "programado";
  if (e.intHomeScore != null && !s) return "terminado";
  return SIN_EMPEZAR.has(s) ? "programado" : "en_vivo";
}

function partido(e) {
  const ts = e.strTimestamp ? `${e.strTimestamp.replace(/Z$/, "")}Z` : `${e.dateEvent}T${e.strTime || "00:00:00"}Z`;
  return {
    id: e.idEvent,
    inicio: ts,
    liga: e.idLeague,
    nombre_liga: e.strLeague,
    temporada: e.strSeason,
    jornada: e.intRound,
    local: { id: e.idHomeTeam, nombre: e.strHomeTeam, escudo: e.strHomeTeamBadge },
    visita: { id: e.idAwayTeam, nombre: e.strAwayTeam, escudo: e.strAwayTeamBadge },
    goles_local: e.intHomeScore == null ? null : Number(e.intHomeScore),
    goles_visita: e.intAwayScore == null ? null : Number(e.intAwayScore),
    estado: estadoDe(e),
    estado_texto: e.strStatus || "",
    progreso: e.strProgress || "",
    estadio: e.strVenue || "",
    ciudad: e.strCity || "",
    arbitro: e.strOfficial || "",
    espectadores: e.intSpectators,
    imagen: e.strThumb || "",
    video: e.strVideo || "",
  };
}

async function eventosDelDiaUTC(fecha) {
  const hoy = new Date().toISOString().slice(0, 10);
  const ttl = fecha < hoy ? 60 * MIN : fecha === hoy ? 2 * MIN : 20 * MIN;
  return conCache(`dia:${fecha}`, ttl, async () => (await v1(`eventsday.php?d=${fecha}&s=Soccer`)).events || []);
}

async function enVivo() {
  return conCache("vivo", 30_000, async () => {
    const d = await v2("livescore/soccer").catch(() => ({}));
    return new Map((d.livescore || []).map((l) => [String(l.idEvent), l]));
  });
}

function aplicarVivo(p, vivo) {
  const l = vivo.get(String(p.id));
  if (!l) return p;
  return {
    ...p,
    goles_local: l.intHomeScore == null ? p.goles_local : Number(l.intHomeScore),
    goles_visita: l.intAwayScore == null ? p.goles_visita : Number(l.intAwayScore),
    estado: TERMINADO.has(l.strStatus) ? "terminado" : SIN_EMPEZAR.has(l.strStatus) ? "programado" : "en_vivo",
    estado_texto: l.strStatus || p.estado_texto,
    progreso: l.strProgress || p.progreso,
  };
}

// Partidos entre dos instantes (el navegador manda el día en su zona horaria).
async function partidosEntre(desde, hasta) {
  const fechas = new Set();
  for (let t = new Date(desde); t <= new Date(hasta); t = new Date(t.getTime() + 86_400_000))
    fechas.add(t.toISOString().slice(0, 10));
  fechas.add(new Date(hasta).toISOString().slice(0, 10));
  const listas = await Promise.all([...fechas].map(eventosDelDiaUTC));
  const vivo = await enVivo();
  const vistos = new Set();
  const grupos = new Map();
  for (const e of listas.flat()) {
    if (!ligasPorId.has(e.idLeague) || vistos.has(e.idEvent)) continue;
    const p = aplicarVivo(partido(e), vivo);
    if (p.inicio < desde || p.inicio > hasta) continue;
    vistos.add(e.idEvent);
    if (!grupos.has(e.idLeague)) {
      const l = ligasPorId.get(e.idLeague);
      grupos.set(e.idLeague, { liga: { id: l.id, nombre: l.nombre_es || l.nombre, pais: l.pais_es, escudo: l.escudo, division: l.division }, partidos: [] });
    }
    grupos.get(e.idLeague).partidos.push(p);
  }
  const lista = [...grupos.values()];
  for (const g of lista) g.partidos.sort((a, b) => a.inicio.localeCompare(b.inicio));
  lista.sort((a, b) => ligasPorId.get(a.liga.id).orden - ligasPorId.get(b.liga.id).orden);
  return { total: vistos.size, ligas: lista };
}

// --- Tablas y forma ------------------------------------------------------------
async function tabla(idLiga, temporada) {
  const t = temporada || ligasPorId.get(idLiga)?.temporada || "";
  return conCache(`tabla:${idLiga}:${t}`, 30 * MIN, async () => {
    const d = await v1(`lookuptable.php?l=${idLiga}&s=${encodeURIComponent(t)}`);
    return (d.table || []).map((f) => {
      // TheSportsDB da la forma del más reciente al más antiguo; aquí se invierte para que vaya
      // del más antiguo al más reciente, como la que se calcula de la temporada.
      const forma = [...(f.strForm || "").slice(0, 5)].reverse().join("");
      const pts = [...forma].reduce((s, c) => s + (c === "W" ? 3 : c === "D" ? 1 : 0), 0);
      return {
        pos: Number(f.intRank),
        equipo: { id: f.idTeam, nombre: f.strTeam, escudo: (f.strBadge || "").replace(/\/tiny$/, "") },
        grupo: f.strGroup || "",
        pj: Number(f.intPlayed), g: Number(f.intWin), e: Number(f.intDraw), p: Number(f.intLoss),
        gf: Number(f.intGoalsFor), gc: Number(f.intGoalsAgainst), dg: Number(f.intGoalDifference),
        pts: Number(f.intPoints),
        forma,
        ppg_forma: forma.length ? +(pts / forma.length).toFixed(2) : null,
        ppg: Number(f.intPlayed) ? +(Number(f.intPoints) / Number(f.intPlayed)).toFixed(2) : null,
        descripcion: f.strDescription || "",
      };
    });
  });
}

// Estadísticas de toda la temporada de una liga, calculadas a partir de sus partidos
// (una sola petición): general, local y visitante por equipo, como en las fichas de
// FootyStats. Pa0 = portería a cero, AEM = ambos equipos marcan, PSM = partido sin marcar.
function bloqueVacio() {
  return { pj: 0, v: 0, e: 0, d: 0, gf: 0, gc: 0, pa0: 0, aem: 0, aem_v: 0, psm: 0, mas05: 0, mas15: 0, mas25: 0, mas35: 0, mas45: 0, goles: 0, resultados: "" };
}
function sumarPartido(s, gf, gc) {
  const r = gf > gc ? "V" : gf === gc ? "E" : "D";
  s.pj++; s.gf += gf; s.gc += gc; s.goles += gf + gc;
  s[r.toLowerCase()]++;
  if (gc === 0) s.pa0++;
  if (gf > 0 && gc > 0) s.aem++;
  if (gf > 0 && gc > 0 && gf > gc) s.aem_v++;
  if (gf === 0) s.psm++;
  if (gf + gc > 0.5) s.mas05++;
  if (gf + gc > 1.5) s.mas15++;
  if (gf + gc > 2.5) s.mas25++;
  if (gf + gc > 3.5) s.mas35++;
  if (gf + gc > 4.5) s.mas45++;
  s.resultados += r;
}
function cerrarBloque(s) {
  const pts = (txt) => [...txt].reduce((t, c) => t + (c === "V" ? 3 : c === "E" ? 1 : 0), 0);
  const ultimos5 = s.resultados.slice(-5);
  return {
    ...s,
    pts: s.v * 3 + s.e,
    ppp: s.pj ? +((s.v * 3 + s.e) / s.pj).toFixed(2) : null,
    ultimos5,
    ppp5: ultimos5.length ? +(pts(ultimos5) / ultimos5.length).toFixed(2) : null,
    mg: s.pj ? +(s.goles / s.pj).toFixed(2) : null,
  };
}

async function temporada(idLiga, temporadaTxt, prioridad = "alta") {
  const t = temporadaTxt || ligasPorId.get(idLiga)?.temporada || "";
  return conCache(`temp:${idLiga}:${t}`, 10 * MIN, async () => {
    const eventos = ((await v1(`eventsseason.php?id=${idLiga}&s=${encodeURIComponent(t)}`, prioridad)).events || []).map(partido);
    eventos.sort((a, b) => a.inicio.localeCompare(b.inicio));
    const equipos = new Map();
    const equipo = (e) => {
      if (!equipos.has(e.id)) equipos.set(e.id, { id: e.id, nombre: e.nombre, escudo: e.escudo, general: bloqueVacio(), local: bloqueVacio(), visitante: bloqueVacio() });
      return equipos.get(e.id);
    };
    const jugados = [];
    const marcadores = {};
    for (const p of eventos) {
      const l = equipo(p.local);
      const v = equipo(p.visita);
      if (p.estado !== "terminado" || p.goles_local == null) continue;
      jugados.push(p);
      const m = `${p.goles_local}-${p.goles_visita}`;
      marcadores[m] = (marcadores[m] || 0) + 1;
      sumarPartido(l.general, p.goles_local, p.goles_visita);
      sumarPartido(l.local, p.goles_local, p.goles_visita);
      sumarPartido(v.general, p.goles_visita, p.goles_local);
      sumarPartido(v.visitante, p.goles_visita, p.goles_local);
    }
    const haceTresHoras = new Date(Date.now() - 3 * 3_600_000).toISOString();
    return {
      liga: idLiga,
      temporada: t,
      total: eventos.length,
      jugados: jugados.length,
      equipos: [...equipos.values()].map((e) => ({ ...e, general: cerrarBloque(e.general), local: cerrarBloque(e.local), visitante: cerrarBloque(e.visitante) })),
      proximos: eventos.filter((p) => p.estado !== "terminado" && p.estado !== "suspendido" && p.inicio >= haceTresHoras),
      partidos: jugados,
      marcadores,
    };
  });
}

// Sección de estadísticas: ligas principales (1.ª y 2.ª división masculina y copas
// continentales de clubes) resumidas en segundo plano.
const ligasAmbito = () => [...ligasPorId.values()]
  .filter((l) => (l.pais_es === "Internacional" ? !/Recopa|Femenin/i.test(l.nombre) : !l.es_copa && l.genero === "Male" && l.division <= 2))
  .sort((a, b) => a.orden - b.orden)
  .map((l) => l.id);

// Córners y minuto de los goles partido a partido en las mismas ligas, descargados en segundo plano
// y guardados en disco.
const statsPartidos = crearStatsPartidos({
  ligasAmbito,
  temporada,
  statsDePartido: async (id, prioridad) => (await v1(`lookupeventstats.php?id=${id}`, prioridad)).eventstats || [],
  cronologiaDePartido: async (id, prioridad) => (await v1(`lookuptimeline.php?id=${id}`, prioridad)).timeline || [],
  archivo: join(DATOS, "stats_partidos.json"),
});

const estadisticas = crearEstadisticas({
  ligasAmbito,
  temporada,
  cornersLiga: statsPartidos.cornersLiga,
  golesLiga: statsPartidos.golesLiga,
  infoCorners: statsPartidos.resumen,
  metaLiga: (id) => {
    const l = ligasPorId.get(id);
    return { id, nombre: l?.nombre_es || l?.nombre || id, pais: l?.pais_es || "", escudo: l?.escudo || "" };
  },
  archivoCache: join(DATOS, "cache_stats.json"),
});

// Ligas que el carrusel de la portada muestra primero.
const LIGAS_PRINCIPALES = new Set(["4480", "4481", "5071", "4501", "4724", "4328", "4335", "4332", "4331", "4334", "4627", "4406", "4351", "4337", "4344", "4346", "4330"]);

// Predicciones del modelo de Poisson; las cuotas solo se leen de la caché (no gastan créditos).
const predicciones = crearPredicciones({
  ligasActivas: estadisticas.ligasActivas,
  cuotasDeLiga: async (idLiga, proximos) => {
    const eventos = CLAVES_ODDS[idLiga] ? await cuotas.enCache(CLAVES_ODDS[idLiga]) : null;
    return eventos ? emparejar(proximos, eventos) : new Map();
  },
  resultadosDelDia: async (fecha) => (await eventosDelDiaUTC(fecha)).map(partido),
  esPrincipal: (id) => LIGAS_PRINCIPALES.has(id),
  archivo: join(DATOS, "predicciones.json"),
});

// Apuestas diarias (Doble y Riesgo) armadas con las predicciones del modelo.
const apuestas = crearApuestas({
  registroActual: predicciones.registroActual,
  esPrincipal: (id) => LIGAS_PRINCIPALES.has(id),
  archivo: join(DATOS, "apuestas.json"),
});

// --- Simulador de cupones (analisis/cupon_simulador.md, fase 1) --------------------------------
// Entradas del modelo para un partido: goles esperados del local y del visitante y medias de la
// liga. null si los equipos tienen menos de MIN_PJ partidos o no están en el resumen de la liga.
function modeloDe(r, idLocal, idVisita) {
  const l = r?.equipos.find((e) => e.id === idLocal), v = r?.equipos.find((e) => e.id === idVisita);
  if (!l || !v || l.general.pj < MIN_PJ || v.general.pj < MIN_PJ) return null;
  const g = golesEsperados(r, l, v);
  return { lh: g.lh, la: g.la, mh: g.mh, ma: g.ma, pj_min: Math.min(l.local.pj, v.visitante.pj), l, v };
}

const pctTxt = (x) => `${Math.round(x * 100)}%`;
const n2 = (x) => (x == null ? "–" : x.toFixed(2).replace(".", ","));
// Dato estadístico de cada grupo de mercados, como en la ficha de una casa de apuestas.
function datosGrupos(r, p, m) {
  const loc = p.local.nombre, vis = p.visita.nombre, L = m.l, V = m.v;
  const n = r.equipos.reduce((t, e) => t + e.local.pj, 0) || 1;
  const s = (k) => r.equipos.reduce((t, e) => t + (e.local[k] || 0), 0);
  const pf = (b, k) => (b.pj ? b[k] / b.pj : null);
  return {
    resultado: `${loc} suma ${n2(L.general.ppp)} puntos por partido (${n2(L.local.ppp)} de local); ${vis}, ${n2(V.general.ppp)} (${n2(V.visitante.ppp)} de visitante).`,
    doble: `En la liga, el local gana el ${pctTxt(s("v") / n)} de los partidos y hay empate en el ${pctTxt(s("e") / n)}.`,
    totales: `Goles esperados en este partido: ${n2(m.lh + m.la)}. En la liga, el ${pctTxt(s("mas25") / n)} de los partidos tiene más de 2,5 goles.`,
    aem: `Ambos marcan en el ${pctTxt(pf(L.local, "aem") ?? 0)} de los partidos de ${loc} de local y en el ${pctTxt(pf(V.visitante, "aem") ?? 0)} de los de ${vis} de visitante.`,
    goles_local: `${loc} marca ${n2(pf(L.local, "gf"))} goles por partido de local (${L.local.pj} PJ) y no marca en el ${pctTxt(pf(L.local, "psm") ?? 0)} de ellos.`,
    goles_visita: `${vis} marca ${n2(pf(V.visitante, "gf"))} goles por partido de visitante (${V.visitante.pj} PJ) y no marca en el ${pctTxt(pf(V.visitante, "psm") ?? 0)} de ellos.`,
    handicap: `Diferencia de goles esperada: ${m.lh - m.la >= 0 ? "+" : ""}${n2(m.lh - m.la)} a favor de ${m.lh >= m.la ? loc : vis}.`,
    combos: "Probabilidad de que se cumplan las dos cosas a la vez, calculada sobre todos los marcadores posibles.",
    exacto: "Los marcadores más probables según el modelo.",
  };
}

// Cuotas 1X2 de mercado que ya estén en caché (no gasta créditos).
async function cuota1x2EnCache(idLiga, p) {
  const eventos = CLAVES_ODDS[idLiga] ? await cuotas.enCache(CLAVES_ODDS[idLiga]) : null;
  return eventos ? emparejar([p], eventos).get(p.id) || null : null;
}

async function contextoPartido(id) {
  const ev = await conCache(`ev:${id}`, 2 * MIN, async () => ((await v1(`lookupevent.php?id=${id}`)).events || [])[0]);
  if (!ev) return null;
  const p = { ...aplicarVivo(partido(ev), await enVivo()), nombre_liga: ligasPorId.get(ev.idLeague)?.nombre_es || ev.strLeague };
  const r = ligasPorId.has(ev.idLeague) ? await estadisticas.resumenLiga(ev.idLeague).catch(() => null) : null;
  return { partido: p, r, modelo: r ? modeloDe(r, ev.idHomeTeam, ev.idAwayTeam) : null, cuotas_1x2: await cuota1x2EnCache(ev.idLeague, p) };
}

async function simuladorPartido(id) {
  const ctx = await contextoPartido(id);
  if (!ctx) return null;
  const { partido: p, r, modelo: m } = ctx;
  const liga = ligasPorId.get(p.liga);
  const base = { partido: { ...p, pais: liga?.pais_es || "" }, con_modelo: Boolean(m), cuotas_1x2: await cuota1x2EnCache(p.liga, p) };
  if (!m) return { ...base, grupos: [] };
  const { mercados } = calcularMercados({ local: p.local.nombre, visita: p.visita.nombre, ...m });
  const datos = datosGrupos(r, p, m);
  const grupos = Object.entries(GRUPOS).map(([gid, titulo]) => {
    let lista = mercados.filter((x) => x.grupo === gid);
    if (gid === "exacto") lista = lista.sort((a, b) => b.prob - a.prob).slice(0, 12);
    return { id: gid, titulo, dato: datos[gid], confianza: lista[0]?.confianza, mercados: lista };
  });
  return { ...base, muestra_corta: m.pj_min < 6, goles_esperados: [m.lh, m.la], grupos };
}

// Mercados principales de una lista de partidos (para la liga y para "Próximos").
const PRINCIPALES = ["1x2:1", "1x2:X", "1x2:2", "dc:1X", "dc:12", "dc:X2", "tot:mas:2.5", "tot:menos:2.5", "aem:si", "aem:no"];
// Cuotas 1X2 medias del mercado (caché, sin gastar créditos) de varios partidos de una liga.
async function cuotasEnCacheLiga(idLiga, partidos) {
  const eventos = CLAVES_ODDS[idLiga] ? await cuotas.enCache(CLAVES_ODDS[idLiga]) : null;
  return eventos ? emparejar(partidos, eventos) : new Map();
}
function filaSimulador(r, p, ligaInfo, cuotasLigaMapa = new Map()) {
  const m = modeloDe(r, p.local.id, p.visita.id);
  const c = cuotasLigaMapa.get(p.id);
  const media = c && { "1x2:1": c.local, "1x2:X": c.empate, "1x2:2": c.visita };
  const mercados = m ? calcularMercados({ local: p.local.nombre, visita: p.visita.nombre, ...m }).mercados.filter((x) => PRINCIPALES.includes(x.id)).map((x) => (media?.[x.id] ? { ...x, cuota_mercado: media[x.id] } : x)) : [];
  return { id: p.id, inicio: p.inicio, local: p.local, visita: p.visita, liga: ligaInfo, con_modelo: Boolean(m), mercados };
}
async function simuladorLiga(id) {
  const r = await estadisticas.resumenLiga(id).catch(() => null);
  const l = ligasPorId.get(id);
  if (!r || !l) return null;
  const ahora = new Date().toISOString();
  const info = { id, nombre: l.nombre_es || l.nombre, pais: l.pais_es, escudo: l.escudo };
  const proximos = r.proximos.filter((p) => p.inicio > ahora);
  const mapa = await cuotasEnCacheLiga(id, proximos);
  return { liga: info, partidos: proximos.map((p) => filaSimulador(r, p, info, mapa)) };
}
async function simuladorProximos(horas = 48) {
  const ahora = new Date().toISOString(), hasta = new Date(Date.now() + horas * 3_600_000).toISOString();
  const filas = [];
  for (const r of await estadisticas.ligasActivas()) {
    const proximos = r.proximos.filter((p) => p.inicio > ahora && p.inicio <= hasta);
    if (!proximos.length) continue;
    const mapa = await cuotasEnCacheLiga(r.liga.id, proximos);
    for (const p of proximos) filas.push(filaSimulador(r, p, r.liga, mapa));
  }
  return { partidos: filas.filter((f) => f.con_modelo).sort((a, b) => a.inicio.localeCompare(b.inicio) || ligasPorId.get(a.liga.id).orden - ligasPorId.get(b.liga.id).orden).slice(0, 150) };
}

async function leerJson(req, max = 20_000) {
  let cuerpo = "";
  for await (const trozo of req) {
    cuerpo += trozo;
    if (cuerpo.length > max) throw new Error("Petición demasiado grande");
  }
  return JSON.parse(cuerpo || "{}");
}

async function liga(id) {
  const base = ligasPorId.get(id);
  const [info, tablaLiga, stats] = await Promise.all([
    conCache(`liga:${id}`, 360 * MIN, async () => ((await v1(`lookupleague.php?id=${id}`)).leagues || [])[0] || {}),
    tabla(id).catch(() => []),
    temporada(id).catch(() => null),
  ]);
  // Si la temporada no trae partidos (algunas copas), se usan los próximos/últimos de la liga.
  let proximos = stats?.proximos || [];
  let resultados = (stats?.partidos || []).slice(-15).reverse();
  if (!stats?.total) {
    const [prox, past] = await Promise.all([
      conCache(`prox:${id}`, 10 * MIN, async () => (await v1(`eventsnextleague.php?id=${id}`)).events || []),
      conCache(`past:${id}`, 10 * MIN, async () => (await v1(`eventspastleague.php?id=${id}`)).events || []),
    ]);
    proximos = prox.map(partido);
    resultados = past.map(partido).reverse();
  }
  // TheSportsDB a veces tarda en actualizar la clasificación: si la temporada ya tiene más partidos
  // jugados de algún equipo que la tabla (hasta 3, para no confundirlo con fases o torneos
  // partidos), se vuelve a pedir sin caché y, si sigue atrasada, la página lo avisa.
  const porEquipo = new Map((stats?.equipos || []).map((e) => [e.id, e]));
  const faltan = (t) => Math.max(0, ...t.map((f) => (porEquipo.get(f.equipo.id)?.general.pj ?? 0) - f.pj));
  let tablaFinal = tablaLiga;
  if (faltan(tablaFinal) >= 1 && faltan(tablaFinal) <= 3) {
    cache.delete(`tabla:${id}:${base?.temporada || ""}`);
    tablaFinal = await tabla(id).catch(() => tablaLiga);
  }
  const atrasoTabla = faltan(tablaFinal) <= 3 ? faltan(tablaFinal) : 0;
  const vivo = await enVivo();
  return {
    id,
    nombre: base?.nombre_es || info.strLeague || base?.nombre,
    nombre_original: info.strLeague || base?.nombre,
    pais: base?.pais_es || info.strCountry,
    division: base?.division ?? null,
    es_copa: base?.es_copa ?? false,
    internacional: base?.pais_es === "Internacional",
    temporada: stats?.temporada || info.strCurrentSeason || base?.temporada,
    escudo: info.strBadge || base?.escudo,
    descripcion: info.strDescriptionES || info.strDescriptionEN || "",
    fundada: info.intFormedYear || "",
    web: info.strWebsite || "",
    partidos_total: stats?.total || 0,
    partidos_jugados: stats?.jugados || 0,
    equipos: stats?.equipos || [],
    tabla: tablaFinal,
    tabla_atrasada: atrasoTabla,
    proximos: proximos.slice(0, 20).map((p) => aplicarVivo(p, vivo)),
    resultados,
  };
}

// Cuotas 1X2 de los partidos por jugar (o en juego) de una liga, por id de TheSportsDB.
// soloCache: no pide cuotas nuevas (listas y páginas de liga); la ficha del partido sí las pide.
// soloExtra: empareja solo los partidos de `extra` (la ficha), sin leer la temporada de la liga.
async function cuotasLiga(idLiga, extra = [], { soloCache = false, soloExtra = false } = {}) {
  const sport = CLAVES_ODDS[idLiga];
  if (!sport) return { disponible: false, motivo: "liga_sin_cuotas" };
  const r = soloCache ? await cuotas.soloCache(sport) : await cuotas.obtener(sport);
  if (!r.disponible) return r;
  let partidos = soloExtra ? extra : (await temporada(idLiga).catch(() => null))?.proximos || [];
  if (!partidos.length)
    partidos = (await conCache(`prox:${idLiga}`, 10 * MIN, async () => (await v1(`eventsnextleague.php?id=${idLiga}`)).events || [])).map(partido);
  const porId = emparejar([...partidos, ...extra.filter((x) => !partidos.some((p) => p.id === x.id))], r.eventos);
  return { disponible: true, actualizado: r.actualizado, antiguo: Boolean(r.antiguo), restantes: r.restantes, partidos: Object.fromEntries(porId) };
}

// Minuto de los goles de una liga (y de un equipo en ella): tramos de 15 minutos, mitades, los minutos
// sueltos para "antes / después del minuto X" y los últimos partidos del equipo con su línea de tiempo.
async function minutosGoles(idLiga, idEquipo) {
  const cobertura = await statsPartidos.tieneCobertura(idLiga);
  const g = cobertura ? await statsPartidos.golesLiga(idLiga) : null;
  const sinMinutos = ({ min_favor, min_contra, ...b }) => b;
  const res = { cobertura, liga: g?.liga.pj ? { ...sinMinutos(g.liga), minutos: [...g.liga.min_favor, ...g.liga.min_contra] } : null };
  if (!idEquipo) return res;
  const eq = g?.equipos[idEquipo];
  res.equipo = eq?.pj ? eq : null;
  const t = await temporada(idLiga).catch(() => null);
  res.ultimos = (t?.partidos || [])
    .filter((p) => p.local.id === idEquipo || p.visita.id === idEquipo)
    .reverse()
    .slice(0, 10)
    .map((p) => ({
      id: p.id, inicio: p.inicio, local: p.local, visita: p.visita, goles_local: p.goles_local, goles_visita: p.goles_visita,
      de_local: p.local.id === idEquipo, goles: statsPartidos.golesPartido(p.id, idEquipo),
    }));
  return res;
}

// Ficha de un partido. Cada petición a TheSportsDB espera su turno en la cola (~0,66 s), así que
// solo se pide lo que se va a mostrar: antes del partido no hay estadísticas ni cronología, la
// alineación no se muestra, y los últimos partidos de cada equipo van aparte
// (/api/partido/ID/ultimos) para que la ficha se pinte sin esperarlos.
const eventoPartido = (id) => conCache(`ev:${id}`, 2 * MIN, async () => ((await v1(`lookupevent.php?id=${id}`)).events || [])[0]);
async function detallePartido(id) {
  const ev = await eventoPartido(id);
  if (!ev) return null;
  const base = partido(ev);
  const conEventos = base.estado !== "programado" || new Date(base.inicio) <= new Date();
  const [vivo, stats, cronologia, tablaLiga] = await Promise.all([
    enVivo(),
    conEventos ? conCache(`st:${id}`, 2 * MIN, async () => (await v1(`lookupeventstats.php?id=${id}`)).eventstats || []).catch(() => []) : [],
    conEventos ? conCache(`tl:${id}`, 2 * MIN, async () => (await v1(`lookuptimeline.php?id=${id}`)).timeline || []).catch(() => []) : [],
    tabla(ev.idLeague, ev.strSeason).catch(() => []),
  ]);
  const p = aplicarVivo(base, vivo);
  const fila = (idEq) => tablaLiga.find((f) => f.equipo.id === idEq) || null;
  // Solo hay cuotas antes y durante el partido; uno terminado no gasta créditos.
  let cuotasPartido = { disponible: false, motivo: p.estado === "terminado" ? "terminado" : "liga_sin_cuotas" };
  if (p.estado !== "terminado" && CLAVES_ODDS[ev.idLeague]) {
    const c = await cuotasLiga(ev.idLeague, [p], { soloExtra: true }).catch((e) => ({ disponible: false, motivo: "error", detalle: e.message }));
    cuotasPartido = c.disponible
      ? (c.partidos[id] ? { disponible: true, actualizado: c.actualizado, antiguo: c.antiguo, ...c.partidos[id] } : { disponible: false, motivo: "sin_emparejar" })
      : c;
  }
  const nombreLiga = ligasPorId.get(ev.idLeague)?.nombre_es || ev.strLeague;
  return {
    partido: { ...p, nombre_liga: nombreLiga },
    estadisticas: stats.map((s) => ({ tipo: s.strStat, local: s.intHome, visita: s.intAway })),
    cronologia: cronologia.map((t) => ({
      minuto: t.intTime, tipo: t.strTimeline, detalle: t.strTimelineDetail, local: t.strHome === "Yes",
      jugador: t.strPlayer, asistencia: t.strAssist, comentario: t.strComment,
    })),
    cuotas: cuotasPartido,
    tabla_local: fila(ev.idHomeTeam),
    tabla_visita: fila(ev.idAwayTeam),
  };
}

// Solo los datos del partido (1 petición), para pintar la cabecera de la ficha cuanto antes.
async function basePartido(id) {
  const ev = await eventoPartido(id);
  if (!ev) return null;
  return { partido: { ...partido(ev), nombre_liga: ligasPorId.get(ev.idLeague)?.nombre_es || ev.strLeague } };
}

// Últimos partidos (todas las competiciones) de los dos equipos de un partido.
async function ultimosPartido(id) {
  const ev = await eventoPartido(id);
  if (!ev) return null;
  const [local, visita] = await Promise.all([ultimosEquipo(ev.idHomeTeam), ultimosEquipo(ev.idAwayTeam)]);
  return { ultimos_local: local, ultimos_visita: visita };
}

async function ultimosEquipo(idEquipo) {
  return conCache(`ult:${idEquipo}`, 30 * MIN, async () => {
    const d = await v1(`eventslast.php?id=${idEquipo}`).catch(() => ({}));
    return (d.results || []).map(partido);
  });
}

async function equipo(id) {
  const [info, ultimos, proximos] = await Promise.all([
    conCache(`eq:${id}`, 360 * MIN, async () => ((await v1(`lookupteam.php?id=${id}`)).teams || [])[0] || null),
    ultimosEquipo(id),
    conCache(`eqprox:${id}`, 30 * MIN, async () => ((await v1(`eventsnext.php?id=${id}`)).events || []).map(partido)),
  ]);
  if (!info) return null;
  // Competiciones del equipo: su liga principal y las que aparecen en sus partidos recientes.
  const ids = [info.idLeague, info.idLeague2, info.idLeague3, info.idLeague4, ...ultimos.map((p) => p.liga), ...proximos.map((p) => p.liga)];
  const competiciones = [...new Set(ids.filter((x) => x && ligasPorId.has(x)))].map((x) => {
    const l = ligasPorId.get(x);
    return { id: x, nombre: l.nombre_es || l.nombre, pais: l.pais_es, escudo: l.escudo, es_copa: l.es_copa, temporada: l.temporada };
  });
  competiciones.sort((a, b) => (a.id === info.idLeague ? -1 : b.id === info.idLeague ? 1 : ligasPorId.get(a.id).orden - ligasPorId.get(b.id).orden));
  const idLiga = competiciones[0]?.id || info.idLeague;
  const tablaLiga = idLiga && ligasPorId.has(idLiga) ? await tabla(idLiga).catch(() => []) : [];
  return {
    competiciones,
    id,
    nombre: info.strTeam,
    escudo: info.strBadge,
    pais: info.strCountry,
    fundado: info.intFormedYear,
    estadio: info.strStadium,
    capacidad: info.intStadiumCapacity,
    ciudad: info.strLocation,
    web: info.strWebsite,
    descripcion: info.strDescriptionES || info.strDescriptionEN || "",
    liga: idLiga ? { id: idLiga, nombre: ligasPorId.get(idLiga)?.nombre_es || ligasPorId.get(idLiga)?.nombre || info.strLeague, pais: ligasPorId.get(idLiga)?.pais_es || info.strCountry } : null,
    tabla: tablaLiga.find((f) => f.equipo.id === id) || null,
    ultimos,
    proximos,
  };
}

// --- HTTP ---------------------------------------------------------------------
const TIPOS = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

function json(res, codigo, datos) {
  res.writeHead(codigo, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(datos));
}

const ESQUEMA_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;
const ID = /^\d+$/;

async function api(url, res, req) {
  const partes = url.pathname.split("/").filter(Boolean); // ["api", recurso, id?]
  const [, recurso, id] = partes;
  if (recurso === "ligas") return json(res, 200, { ...catalogo, con_cuotas: Object.keys(CLAVES_ODDS) });
  if (recurso === "cuotas-estado") return json(res, 200, cuotas.estado());
  if (recurso === "apuestas") return json(res, 200, await apuestas.consulta());
  if (recurso === "cupon" && id === "evaluar") {
    if (req.method !== "POST") return json(res, 405, { error: "usa POST" });
    const cuerpo = await leerJson(req).catch(() => null);
    if (!cuerpo) return json(res, 400, { error: "cupón no válido" });
    const selecciones = (cuerpo.selecciones || []).map((s) => ({ partido: String(s.partido || ""), mercado: String(s.mercado || ""), cuota: Number(s.cuota) }));
    if (selecciones.some((s) => !ID.test(s.partido))) return json(res, 400, { error: "partido no válido" });
    const r = await evaluarCupon({ selecciones, monto: cuerpo.monto }, contextoPartido);
    return json(res, r.error ? 400 : 200, r);
  }
  if (recurso === "simulador") {
    const [, , , sub, sid] = url.pathname.split("/");
    if (sub === "proximos") return json(res, 200, await simuladorProximos());
    if (!ID.test(sid || "")) return json(res, 404, { error: "no encontrado" });
    const d = sub === "partido" ? await simuladorPartido(sid) : sub === "liga" ? await simuladorLiga(sid) : null;
    return d ? json(res, 200, d) : json(res, 404, { error: "no encontrado" });
  }
  if (recurso === "predicciones") {
    const desde = url.searchParams.get("desde") || undefined;
    const hasta = url.searchParams.get("hasta") || undefined;
    if ((desde && !ESQUEMA_ISO.test(desde)) || (hasta && !ESQUEMA_ISO.test(hasta))) return json(res, 400, { error: "desde/hasta deben ser ISO UTC" });
    const d = await predicciones.consulta(id || "hoy", { desde, hasta });
    if (d && id === "destacados") {
      d.ligas_activas = (await estadisticas.ligasActivas()).length;
      d.ligas_con_cuotas = Object.keys(CLAVES_ODDS).length;
    }
    return d ? json(res, 200, d) : json(res, 404, { error: "vista no encontrada" });
  }
  if (recurso === "stats") {
    if (!id) return json(res, 200, await estadisticas.portada());
    const idLiga = url.searchParams.get("liga") || undefined;
    if (idLiga && !ID.test(idLiga)) return json(res, 400, { error: "liga no válida" });
    const d = await estadisticas.consulta(id, { liga: idLiga, linea: url.searchParams.get("linea") });
    return d ? json(res, 200, d) : json(res, 404, { error: "tipo de estadística no encontrado" });
  }
  if (recurso === "partidos") {
    const desde = url.searchParams.get("desde");
    const hasta = url.searchParams.get("hasta");
    if (!ESQUEMA_ISO.test(desde || "") || !ESQUEMA_ISO.test(hasta || "")) return json(res, 400, { error: "desde/hasta deben ser ISO UTC" });
    if (new Date(hasta) - new Date(desde) > 2 * 86_400_000) return json(res, 400, { error: "rango máximo: 2 días" });
    return json(res, 200, await partidosEntre(desde, hasta));
  }
  if (!ID.test(id || "")) return json(res, 404, { error: "no encontrado" });
  if (recurso === "tabla") return json(res, 200, await tabla(id, url.searchParams.get("temporada") || undefined));
  if (recurso === "minutos") {
    const idEquipo = url.searchParams.get("equipo") || "";
    if (idEquipo && !ID.test(idEquipo)) return json(res, 400, { error: "equipo no válido" });
    return json(res, 200, await minutosGoles(id, idEquipo));
  }
  if (recurso === "prediccion") return json(res, 200, { prediccion: await predicciones.prediccionDe(id) });
  if (recurso === "cuotas") {
    const c = await cuotasLiga(id, [], { soloCache: true });
    // En listados basta la media y la mejor cuota; las casas van en la página del partido.
    if (c.partidos) for (const k of Object.keys(c.partidos)) c.partidos[k] = { ...c.partidos[k], casas: undefined };
    return json(res, 200, c);
  }
  if (recurso === "temporada") return json(res, 200, await temporada(id, url.searchParams.get("temporada") || undefined));
  if (recurso === "liga") return json(res, 200, await liga(id));
  if (recurso === "partido") {
    const sub = url.pathname.split("/")[4];
    const d = sub === "ultimos" ? await ultimosPartido(id) : sub === "base" ? await basePartido(id) : await detallePartido(id);
    return d ? json(res, 200, d) : json(res, 404, { error: "partido no encontrado" });
  }
  if (recurso === "equipo") {
    const d = await equipo(id);
    return d ? json(res, 200, d) : json(res, 404, { error: "equipo no encontrado" });
  }
  return json(res, 404, { error: "no encontrado" });
}

const PUBLICO = join(RAIZ, "public");
async function estatico(url, res) {
  let ruta = normalize(join(PUBLICO, decodeURIComponent(url.pathname)));
  if (!ruta.startsWith(PUBLICO)) return json(res, 403, { error: "prohibido" });
  if (url.pathname === "/" || !extname(ruta)) ruta = join(PUBLICO, "index.html");
  try {
    const cuerpo = await readFile(ruta);
    // no-cache: el navegador revalida en cada carga, así una actualización de app.js o app.css
    // se ve al recargar sin tener que vaciar la caché.
    res.writeHead(200, { "Content-Type": TIPOS[extname(ruta)] || "application/octet-stream", "Cache-Control": "no-cache" });
    res.end(cuerpo);
  } catch {
    json(res, 404, { error: "no encontrado" });
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  try {
    if (url.pathname.startsWith("/api/")) await api(url, res, req);
    else await estatico(url, res);
  } catch (e) {
    console.error(req.url, e.message);
    json(res, 502, { error: e.message.replace(CLAVE, "***") });
  }
}).listen(PUERTO, HOST, () => {
  console.log(`Masterfutbol en http://localhost:${PUERTO}`);
  estadisticas.iniciar();
  statsPartidos.iniciar();
  predicciones.iniciar();
  apuestas.iniciar();
});
