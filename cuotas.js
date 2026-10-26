// Cuotas 1X2 de The Odds API (https://the-odds-api.com), emparejadas con los partidos
// de TheSportsDB. Cada petición de cuotas de una liga gasta 1 crédito (1 región × 1
// mercado) y el plan gratuito trae 500 al mes, así que las respuestas se guardan en disco
// (ODDS_TTL_HORAS, 12 h por defecto) y se deja de consultar al bajar de ODDS_MIN_RESTANTES.
import { readFile, writeFile } from "node:fs/promises";

// Liga de TheSportsDB (id) → competición de The Odds API (sport key).
// `npm run cuotas:verificar` comprueba que cada clave existe y lista las que faltan.
export const CLAVES_ODDS = {
  4480: "soccer_uefa_champs_league",
  4481: "soccer_uefa_europa_league",
  5071: "soccer_uefa_europa_conference_league",
  4501: "soccer_conmebol_copa_libertadores",
  4724: "soccer_conmebol_copa_sudamericana",
  4627: "soccer_chile_campeonato",
  4406: "soccer_argentina_primera_division",
  4351: "soccer_brazil_campeonato",
  4404: "soccer_brazil_serie_b",
  4396: "soccer_england_league1",
  4397: "soccer_england_league2",
  4639: "soccer_germany_liga3",
  5204: "soccer_germany_bundesliga_women",
  4346: "soccer_usa_mls",
  4328: "soccer_epl",
  4329: "soccer_efl_champ",
  4570: "soccer_england_efl_cup",
  4335: "soccer_spain_la_liga",
  4400: "soccer_spain_segunda_division",
  4483: "soccer_spain_copa_del_rey",
  4332: "soccer_italy_serie_a",
  4394: "soccer_italy_serie_b",
  4506: "soccer_italy_coppa_italia",
  4331: "soccer_germany_bundesliga",
  4399: "soccer_germany_bundesliga2",
  4485: "soccer_germany_dfb_pokal",
  4334: "soccer_france_ligue_one",
  4401: "soccer_france_ligue_two",
  4484: "soccer_france_coupe_de_france",
  4621: "soccer_austria_bundesliga",
  4338: "soccer_belgium_first_div",
  4340: "soccer_denmark_superliga",
  4330: "soccer_spl",
  4336: "soccer_greece_super_league",
  4643: "soccer_league_of_ireland",
  4358: "soccer_norway_eliteserien",
  4337: "soccer_netherlands_eredivisie",
  4422: "soccer_poland_ekstraklasa",
  4344: "soccer_portugal_primeira_liga",
  4347: "soccer_sweden_allsvenskan",
  4403: "soccer_sweden_superettan",
  4675: "soccer_switzerland_superleague",
  4339: "soccer_turkey_super_league",
  4636: "soccer_finland_veikkausliiga",
  4633: "soccer_japan_j_league",
};

// --- Emparejar nombres de equipos entre las dos fuentes ------------------------------
const VACIAS = new Set(["fc", "cf", "afc", "sc", "ac", "club", "de", "del", "la", "el", "the", "fk", "if", "bk", "sk", "cd", "ud", "sd", "ssc", "and"]);
function fichas(nombre) {
  return (nombre || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/ø/g, "o").replace(/æ/g, "ae").replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/).filter((t) => t && !VACIAS.has(t));
}
function trigramas(s) {
  const t = ` ${s} `;
  const r = new Set();
  for (let i = 0; i < t.length - 2; i++) r.add(t.slice(i, i + 3));
  return r;
}
export function parecido(a, b) {
  const A = fichas(a), B = fichas(b);
  if (!A.length || !B.length) return 0;
  const coincide = (x, y) => x === y || (x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x)));
  const iguales = A.filter((x) => B.some((y) => coincide(x, y))).length;
  const porFichas = iguales / Math.max(A.length, B.length);
  const ta = trigramas(A.join(" ")), tb = trigramas(B.join(" "));
  const comunes = [...ta].filter((x) => tb.has(x)).length;
  const dice = (2 * comunes) / (ta.size + tb.size);
  return Math.max(porFichas, dice);
}

const TRES_HORAS = 3 * 3_600_000;
const UMBRAL = 0.45;

// Devuelve Map idEventoTheSportsDB → resumen de cuotas.
export function emparejar(partidos, eventosOdds) {
  const pares = [];
  for (const p of partidos) {
    const t = new Date(p.inicio).getTime();
    for (const e of eventosOdds) {
      if (Math.abs(new Date(e.commence_time).getTime() - t) > TRES_HORAS) continue;
      const nota = (parecido(p.local.nombre, e.home_team) + parecido(p.visita.nombre, e.away_team)) / 2;
      if (nota >= UMBRAL) pares.push({ p, e, nota });
    }
  }
  pares.sort((a, b) => b.nota - a.nota);
  const usadosP = new Set(), usadosE = new Set(), salida = new Map();
  for (const { p, e } of pares) {
    if (usadosP.has(p.id) || usadosE.has(e.id)) continue;
    usadosP.add(p.id);
    usadosE.add(e.id);
    const r = resumir(e);
    if (r) salida.set(p.id, r);
  }
  return salida;
}

function resumir(e) {
  const casas = [];
  for (const b of e.bookmakers || []) {
    const m = (b.markets || []).find((x) => x.key === "h2h");
    if (!m) continue;
    const precio = (n) => m.outcomes.find((o) => o.name === n)?.price ?? null;
    const c = { casa: b.title, local: precio(e.home_team), empate: precio("Draw"), visita: precio(e.away_team), actualizado: b.last_update };
    if (c.local && c.empate && c.visita) casas.push(c);
  }
  if (!casas.length) return null;
  const media = (k) => +(casas.reduce((s, c) => s + c[k], 0) / casas.length).toFixed(2);
  const mejor = (k) => casas.reduce((m, c) => (c[k] > m.precio ? { precio: c[k], casa: c.casa } : m), { precio: 0, casa: "" });
  return {
    local: media("local"), empate: media("empate"), visita: media("visita"),
    mejor: { local: mejor("local"), empate: mejor("empate"), visita: mejor("visita") },
    n_casas: casas.length,
    casas: casas.sort((a, b) => a.casa.localeCompare(b.casa)),
    nombres_odds: { local: e.home_team, visita: e.away_team },
  };
}

// --- Cliente con caché en disco ----------------------------------------------------------
export function crearCuotas({ clave, archivoCache, ttlHoras = 12, minRestantes = 10, region = "eu" }) {
  let cache = {};
  let restantes = null;
  let usadas = null;
  const cargado = readFile(archivoCache, "utf-8").then((t) => { cache = JSON.parse(t).ligas || {}; restantes = JSON.parse(t).restantes ?? null; }).catch(() => {});
  const enCurso = new Map();

  const guardar = () => writeFile(archivoCache, JSON.stringify({ restantes, usadas, ligas: cache }), "utf-8").catch((e) => console.error("cuotas: no se pudo guardar la caché", e.message));

  async function pedir(sport) {
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds?regions=${region}&markets=h2h&oddsFormat=decimal&dateFormat=iso&apiKey=${encodeURIComponent(clave)}`;
    const r = await fetch(url).catch(() => null);
    if (!r) return { motivo: "error", detalle: "The Odds API no responde" };
    const resto = r.headers.get("x-requests-remaining");
    if (resto != null) restantes = Number(resto);
    usadas = r.headers.get("x-requests-used") ?? usadas;
    if (r.status === 401) return { motivo: "clave_invalida" };
    if (r.status === 429) return { motivo: "limite" };
    if (r.status === 404 || r.status === 422) return { motivo: "liga_sin_cuotas" };
    if (!r.ok) return { motivo: "error", detalle: `The Odds API respondió ${r.status}` };
    const datos = await r.json();
    const eventos = datos.map((e) => ({
      id: e.id, commence_time: e.commence_time, home_team: e.home_team, away_team: e.away_team,
      bookmakers: (e.bookmakers || []).map((b) => ({ title: b.title, last_update: b.last_update, markets: (b.markets || []).filter((m) => m.key === "h2h") })),
    }));
    cache[sport] = { obtenido: Date.now(), eventos };
    await guardar();
    console.log(`cuotas: ${sport} actualizada (${eventos.length} partidos, quedan ${restantes} créditos)`);
    return { eventos };
  }

  return {
    configurada: Boolean(clave),
    estado: () => ({ configurada: Boolean(clave), restantes, usadas }),
    // Lo que ya está guardado, sin pedir nada ni gastar créditos (para las predicciones).
    async enCache(sport) {
      await cargado;
      return cache[sport]?.eventos || null;
    },
    // Como obtener(), pero sin pedir nada nunca: para listas y páginas de liga, que no deben
    // gastar créditos. Las cuotas nuevas solo se piden al abrir la ficha de un partido.
    async soloCache(sport) {
      await cargado;
      const c = cache[sport];
      if (!c) return { disponible: false, motivo: "sin_cache" };
      const antigua = Date.now() - c.obtenido >= ttlHoras * 3_600_000;
      return { disponible: true, eventos: c.eventos, actualizado: new Date(c.obtenido).toISOString(), restantes, ...(antigua ? { antiguo: true } : {}) };
    },
    // { disponible, motivo?, eventos, actualizado, restantes, antiguo? }
    async obtener(sport) {
      await cargado;
      const c = cache[sport];
      const fresca = c && Date.now() - c.obtenido < ttlHoras * 3_600_000;
      const respuesta = (x, extra = {}) => ({ disponible: true, eventos: x.eventos, actualizado: new Date(x.obtenido).toISOString(), restantes, ...extra });
      if (fresca) return respuesta(c);
      if (!clave) return c ? respuesta(c, { antiguo: true }) : { disponible: false, motivo: "sin_clave" };
      if (restantes != null && restantes <= minRestantes)
        return c ? respuesta(c, { antiguo: true }) : { disponible: false, motivo: "sin_creditos", restantes };
      if (!enCurso.has(sport)) enCurso.set(sport, pedir(sport).finally(() => enCurso.delete(sport)));
      const r = await enCurso.get(sport);
      if (r.eventos) return respuesta(cache[sport]);
      return c ? respuesta(c, { antiguo: true, motivo: r.motivo }) : { disponible: false, motivo: r.motivo, detalle: r.detalle, restantes };
    },
  };
}
