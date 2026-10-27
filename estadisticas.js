// Sección "Estadísticas" (modelada sobre footystats.org/es/stats): rankings de equipos,
// ligas y próximos partidos por tipo de estadística, calculados con los marcadores
// finales de TheSportsDB. Los córners salen del detalle de cada partido (partidos_stats.js), solo
// en las ligas que los tienen; tarjetas, fueras de juego, penaltis, xG, remates y goles por mitad
// todavía no se calculan.
//
// Para no consultar cientos de ligas en cada visita, un proceso en segundo plano
// resume las ligas principales cada 6 horas (con prioridad baja en la cola de
// TheSportsDB) y guarda el resultado en disco.
import { readFile, writeFile } from "node:fs/promises";

const MIN_PJ = 6; // como en FootyStats: el equipo debe haber jugado al menos 6 partidos
const MIN_PJ_LIGA = 3; // con una liga elegida en el selector
const MIN_PJ_LADO = 3; // partidos de local (o de visitante) para rankings por lado
const REFRESCO_MS = 6 * 3_600_000;
const DIAS_PROXIMOS = 7;
const DIA = 86_400_000;
const FILAS = 50;
export const LINEAS = [0.5, 1.5, 2.5, 3.5, 4.5];
const claveLinea = (l) => `mas${String(l).replace(".", "")}`; // 2.5 → mas25

export const TIPOS = {
  aem: "Ambos Equipos Marcan (AEM)",
  goles: "Más de / Menos de Goles",
  porteria: "Vallas invictas",
  local: "Ventaja Local",
  marcador: "Marcador Exacto",
  resultado: "Resultado Final",
  corners: "Córners",
};
export const LINEAS_CORNERS = [7.5, 8.5, 9.5, 10.5, 11.5];
export const NO_DISPONIBLES = [
  "Tarjetas", "Fueras de juego", "Penaltis", "Goles al descanso y en la 2ª mitad",
  "Marca en ambas mitades", "xG (goles esperados)", "Remates a puerta",
];

// --- Resumen compacto de una liga ------------------------------------------------------
const CAMPOS = ["pj", "v", "e", "d", "gf", "gc", "pa0", "aem", "aem_v", "psm", "mas05", "mas15", "mas25", "mas35", "mas45", "goles", "ppp", "mg"];
const compactar = (b) => Object.fromEntries(CAMPOS.map((k) => [k, b[k]]));
const equipoCorto = (e) => ({ id: e.id, nombre: e.nombre, escudo: e.escudo });

function resumirLiga(meta, t) {
  const limite = new Date(Date.now() + DIAS_PROXIMOS * DIA).toISOString();
  const siguientes = {};
  for (const p of t.proximos) {
    siguientes[p.local.id] ??= { id: p.id, inicio: p.inicio, rival: equipoCorto(p.visita), de_local: true };
    siguientes[p.visita.id] ??= { id: p.id, inicio: p.inicio, rival: equipoCorto(p.local), de_local: false };
  }
  return {
    liga: meta,
    temporada: t.temporada,
    total: t.total,
    jugados: t.jugados,
    ultimo: t.partidos.at(-1)?.inicio || null,
    marcadores: t.marcadores,
    equipos: t.equipos.map((e) => ({ ...equipoCorto(e), general: compactar(e.general), local: compactar(e.local), visitante: compactar(e.visitante) })),
    proximos: t.proximos.filter((p) => p.inicio <= limite).map((p) => ({ id: p.id, inicio: p.inicio, local: equipoCorto(p.local), visita: equipoCorto(p.visita) })),
    siguientes,
  };
}

// Totales de la liga: cada partido aparece una vez en el bloque "local" de su local.
function agregados(r) {
  const s = (k) => r.equipos.reduce((t, e) => t + (e.local[k] || 0), 0);
  const a = { n: s("pj"), goles: s("goles"), aem: s("aem"), vl: s("v"), emp: s("e"), vv: s("d"), gl: s("gf"), gv: s("gc") };
  for (const l of LINEAS) a[claveLinea(l)] = s(claveLinea(l));
  return a;
}

const activa = (r) => r.jugados >= 10 && ((r.ultimo && Date.now() - new Date(r.ultimo).getTime() < 30 * DIA) || r.proximos.length > 0);
const fr = (b, k) => (b?.pj ? b[k] / b.pj : null);
const media = (...xs) => (xs.some((x) => x == null) ? null : xs.reduce((a, b) => a + b, 0) / xs.length);
const lado = (e, b) => (e[b].pj >= 2 ? e[b] : e.general);
const r2 = (x) => (x == null ? null : +x.toFixed(2));

function ordenar(filas, clave, n = FILAS, asc = false) {
  return filas
    .filter((f) => f[clave] != null && !Number.isNaN(f[clave]))
    .sort((a, b) => (asc ? a[clave] - b[clave] : b[clave] - a[clave]) || (b._pj || 0) - (a._pj || 0))
    .slice(0, n)
    .map(({ _pj, ...f }) => f);
}

// Columnas que el navegador sabe pintar: equipo, liga, partido, pct, num, texto, fecha, siguiente, marcador, progreso.
const COL = {
  equipo: { clave: "equipo", titulo: "Equipo", tipo: "equipo" },
  liga: { clave: "liga", titulo: "Liga", tipo: "liga" },
  partido: { clave: "partido", titulo: "Partido", tipo: "partido" },
  fecha: { clave: "fecha", titulo: "Fecha", tipo: "fecha" },
  siguiente: { clave: "siguiente", titulo: "Siguiente partido", tipo: "siguiente" },
  progreso: { clave: "progreso", titulo: "Progreso de temporada", tipo: "progreso" },
  golesPartido: { clave: "goles", titulo: "Goles / Partido", tipo: "num" },
};
const pctCol = (titulo, clave = "pct") => ({ clave, titulo, tipo: "pct" });
const numCol = (titulo, clave) => ({ clave, titulo, tipo: "num" });
const txtCol = (titulo, clave) => ({ clave, titulo, tipo: "texto" });

export function crearEstadisticas({ ligasAmbito, temporada, metaLiga, archivoCache, cornersLiga, infoCorners }) {
  let resumenes = new Map();
  let actualizado = null;
  const estado = { calculando: false, hechas: 0, total: 0 };
  const cargado = readFile(archivoCache, "utf-8")
    .then((t) => {
      const d = JSON.parse(t);
      resumenes = new Map(d.ligas.map((r) => [r.liga.id, r]));
      actualizado = d.actualizado;
    })
    .catch(() => {});

  async function actualizar() {
    if (estado.calculando) return;
    const ids = ligasAmbito();
    Object.assign(estado, { calculando: true, hechas: 0, total: ids.length });
    const nuevos = new Map();
    for (const id of ids) {
      try {
        const t = await temporada(id, undefined, "baja");
        if (t.total) nuevos.set(id, resumirLiga(metaLiga(id), t));
      } catch {
        if (resumenes.has(id)) nuevos.set(id, resumenes.get(id));
      }
      estado.hechas++;
      // Mientras calcula, lo ya resumido se va viendo en la web.
      if (estado.hechas % 20 === 0) resumenes = new Map([...resumenes, ...nuevos]);
    }
    resumenes = nuevos;
    actualizado = new Date().toISOString();
    estado.calculando = false;
    await writeFile(archivoCache, JSON.stringify({ actualizado, ligas: [...resumenes.values()] }), "utf-8").catch((e) => console.error("estadísticas: no se pudo guardar", e.message));
    console.log(`estadísticas: ${resumenes.size} ligas resumidas`);
  }

  async function iniciar() {
    await cargado;
    if (!actualizado || Date.now() - new Date(actualizado).getTime() > REFRESCO_MS) setTimeout(actualizar, 3000);
    setInterval(actualizar, REFRESCO_MS);
  }

  async function fuente(idLiga) {
    await cargado;
    if (!idLiga) return [...resumenes.values()].filter(activa);
    if (resumenes.has(idLiga)) return [resumenes.get(idLiga)];
    const t = await temporada(idLiga);
    return t.total ? [resumirLiga(metaLiga(idLiga), t)] : [];
  }

  // --- Rankings por tipo ---------------------------------------------------------------
  async function consulta(tipo, { liga: idLiga, linea } = {}) {
    if (!TIPOS[tipo]) return null;
    const ligas = await fuente(idLiga);
    const minPj = idLiga ? MIN_PJ_LIGA : MIN_PJ;
    const equipos = ligas.flatMap((r) => r.equipos.filter((e) => e.general.pj >= minPj).map((e) => ({ ...e, liga: r.liga, siguiente: r.siguientes[e.id] || null })));
    const porId = new Map(ligas.flatMap((r) => r.equipos.map((e) => [`${r.liga.id}:${e.id}`, e])));
    const partidos = ligas
      .flatMap((r) => r.proximos.map((p) => ({ ...p, liga: r.liga, l: porId.get(`${r.liga.id}:${p.local.id}`), v: porId.get(`${r.liga.id}:${p.visita.id}`) })))
      .filter((p) => p.l?.general.pj >= MIN_PJ_LIGA && p.v?.general.pj >= MIN_PJ_LIGA);
    const resLigas = ligas.map((r) => ({ r, a: agregados(r) })).filter(({ a }) => a.n >= 5);

    const filaEquipo = (e, cont, bloque = "general", invertir = false) => {
      const b = e[bloque];
      const x = invertir ? b.pj - b[cont] : b[cont];
      return { equipo: equipoCorto(e), liga: e.liga, valor: `${x} / ${b.pj} partidos`, pct: b.pj ? x / b.pj : null, siguiente: e.siguiente, _pj: b.pj };
    };
    const filaPartido = (p, pct, extra = {}) => ({
      partido: { id: p.id, local: p.local, visita: p.visita },
      liga: p.liga, fecha: p.inicio, pct, goles: r2(media(p.l.general.mg, p.v.general.mg)), ...extra,
    });
    const filaLiga = ({ r, a }, extra) => ({ liga: r.liga, goles: r2(a.goles / a.n), progreso: r.total ? r.jugados / r.total : null, _pj: a.n, ...extra });
    const seccion = (id, titulo, descripcion, columnas, filas) => ({ id, titulo, descripcion, columnas, filas });

    const S = [];
    if (tipo === "aem") {
      S.push(seccion("equipos", "Mejores equipos para Ambos Equipos Marcan", "Equipos con más partidos en los que marcaron los dos equipos esta temporada.",
        [COL.equipo, txtCol("AEM", "valor"), pctCol("%"), COL.siguiente], ordenar(equipos.map((e) => filaEquipo(e, "aem")), "pct")));
      S.push(seccion("partidos", "Partidos con alto potencial de AEM", `Próximos ${DIAS_PROXIMOS} días: media del % AEM del local en casa y del visitante fuera.`,
        [COL.partido, COL.golesPartido, pctCol("% AEM"), COL.fecha, pctCol("Más de 2,5", "mas25")],
        ordenar(partidos.map((p) => filaPartido(p, media(fr(lado(p.l, "local"), "aem"), fr(lado(p.v, "visitante"), "aem")), { mas25: media(fr(p.l.general, "mas25"), fr(p.v.general, "mas25")) })), "pct", 30)));
      S.push(seccion("ligas", "Mejores ligas para AEM", "Porcentaje de partidos de la temporada en los que marcaron ambos equipos.",
        [COL.liga, COL.golesPartido, pctCol("% AEM"), COL.progreso], ordenar(resLigas.map((x) => filaLiga(x, { pct: x.a.aem / x.a.n })), "pct")));
      S.push(seccion("combinado", "AEM y Resultado: ambos marcan y gana", "Equipos que más ganan partidos en los que también recibieron gol.",
        [COL.equipo, txtCol("AEM y gana", "valor"), pctCol("%"), COL.siguiente], ordenar(equipos.map((e) => filaEquipo(e, "aem_v")), "pct")));
    }

    if (tipo === "goles") {
      const L = LINEAS.includes(Number(linea)) ? Number(linea) : 2.5;
      const k = claveLinea(L);
      const lt = String(L).replace(".", ",");
      S.push(seccion("equipos", `Mejores equipos para Más de ${lt} goles`, `Equipos con más partidos de ${Math.ceil(L)} goles o más (sumando los dos equipos).`,
        [COL.equipo, txtCol(`Más de ${lt}`, "valor"), pctCol("%"), COL.siguiente], ordenar(equipos.map((e) => filaEquipo(e, k)), "pct")));
      S.push(seccion("partidos", `Partidos con alto potencial de Más de ${lt}`, `Próximos ${DIAS_PROXIMOS} días: media del % del local en casa y del visitante fuera.`,
        [COL.partido, COL.golesPartido, pctCol(`% Más de ${lt}`), COL.fecha, pctCol("AEM", "aem")],
        ordenar(partidos.map((p) => filaPartido(p, media(fr(lado(p.l, "local"), k), fr(lado(p.v, "visitante"), k)), { aem: media(fr(p.l.general, "aem"), fr(p.v.general, "aem")) })), "pct", 30)));
      S.push(seccion("ligas", `Ligas con más partidos de Más de ${lt}`, "Porcentaje de partidos de la temporada por encima de la línea.",
        [COL.liga, COL.golesPartido, pctCol(`% Más de ${lt}`), COL.progreso], ordenar(resLigas.map((x) => filaLiga(x, { pct: x.a[k] / x.a.n })), "pct")));
      S.push(seccion("menos", `Mejores equipos para Menos de ${lt} goles`, `Equipos con más partidos de ${Math.floor(L)} goles o menos.`,
        [COL.equipo, txtCol(`Menos de ${lt}`, "valor"), pctCol("%"), COL.siguiente], ordenar(equipos.map((e) => filaEquipo(e, k, "general", true)), "pct")));
    }

    if (tipo === "porteria") {
      S.push(seccion("equipos", "Equipos con más vallas invictas", "Partidos en los que el equipo no recibió goles.",
        [COL.equipo, txtCol("Vallas invictas", "valor"), pctCol("%"), COL.siguiente], ordenar(equipos.map((e) => filaEquipo(e, "pa0")), "pct")));
      S.push(seccion("partidos", "Partidos con más opciones de valla invicta", `Próximos ${DIAS_PROXIMOS} días: % de vallas invictas del equipo (en su lado) y % de partidos sin marcar del rival.`,
        [COL.partido, txtCol("Equipo", "quien"), pctCol("% Portería a 0"), COL.fecha, COL.golesPartido],
        ordenar(partidos.map((p) => {
          const casa = media(fr(lado(p.l, "local"), "pa0"), fr(lado(p.v, "visitante"), "psm"));
          const fuera = media(fr(lado(p.v, "visitante"), "pa0"), fr(lado(p.l, "local"), "psm"));
          return filaPartido(p, Math.max(casa ?? 0, fuera ?? 0), { quien: (casa ?? 0) >= (fuera ?? 0) ? p.local.nombre : p.visita.nombre });
        }), "pct", 30)));
      S.push(seccion("ligas", "Ligas con más vallas invictas", "Porcentaje de partidos en los que al menos un equipo terminó sin recibir goles.",
        [COL.liga, COL.golesPartido, pctCol("% con valla invicta"), COL.progreso], ordenar(resLigas.map((x) => filaLiga(x, { pct: (x.a.n - x.a.aem) / x.a.n })), "pct")));
      S.push(seccion("combinado", "Equipos que más fallan en marcar", "Partidos en los que el equipo no marcó.",
        [COL.equipo, txtCol("Sin marcar", "valor"), pctCol("%"), COL.siguiente], ordenar(equipos.map((e) => filaEquipo(e, "psm")), "pct")));
    }

    if (tipo === "local") {
      S.push(seccion("ligas", "Ventaja local por liga", "Ventaja = % de victorias locales menos % de victorias visitantes.",
        [COL.liga, pctCol("Gana local", "vl"), pctCol("Empate", "emp"), pctCol("Gana visita", "vv"), numCol("Goles local / PJ", "gl"), numCol("Goles visita / PJ", "gv"), pctCol("Ventaja", "pct")],
        ordenar(resLigas.map(({ r, a }) => ({ liga: r.liga, vl: a.vl / a.n, emp: a.emp / a.n, vv: a.vv / a.n, gl: r2(a.gl / a.n), gv: r2(a.gv / a.n), pct: (a.vl - a.vv) / a.n, _pj: a.n })), "pct")));
      const conLados = equipos.filter((e) => e.local.pj >= MIN_PJ_LADO && e.visitante.pj >= MIN_PJ_LADO);
      S.push(seccion("equipos", "Equipos con mayor ventaja local", "Diferencia entre los puntos por partido de local y de visitante.",
        [COL.equipo, numCol("PPP local", "pl"), numCol("PPP visitante", "pv"), numCol("Diferencia", "dif"), COL.siguiente],
        ordenar(conLados.map((e) => ({ equipo: equipoCorto(e), liga: e.liga, pl: e.local.ppp, pv: e.visitante.ppp, dif: r2(e.local.ppp - e.visitante.ppp), siguiente: e.siguiente, _pj: e.general.pj })), "dif")));
      S.push(seccion("partidos", "Próximos partidos con mayor ventaja local", `Próximos ${DIAS_PROXIMOS} días: PPP del local en casa menos PPP del visitante fuera.`,
        [COL.partido, numCol("PPP local en casa", "pl"), numCol("PPP visita fuera", "pv"), numCol("Diferencia", "dif"), COL.fecha],
        ordenar(partidos.map((p) => { const pl = lado(p.l, "local").ppp, pv = lado(p.v, "visitante").ppp; return filaPartido(p, null, { pl, pv, dif: r2(pl - pv) }); }), "dif", 30)));
      const resumenLado = (b) => `${b.v}V ${b.e}E ${b.d}D`;
      S.push(seccion("mejores_locales", "Mejores locales", "Puntos por partido jugando en casa.",
        [COL.equipo, txtCol("Local", "valor"), numCol("PPP", "ppp"), COL.siguiente],
        ordenar(equipos.filter((e) => e.local.pj >= MIN_PJ_LADO).map((e) => ({ equipo: equipoCorto(e), liga: e.liga, valor: resumenLado(e.local), ppp: e.local.ppp, siguiente: e.siguiente, _pj: e.local.pj })), "ppp")));
      S.push(seccion("mejores_visitantes", "Mejores visitantes", "Puntos por partido jugando fuera.",
        [COL.equipo, txtCol("Visitante", "valor"), numCol("PPP", "ppp"), COL.siguiente],
        ordenar(equipos.filter((e) => e.visitante.pj >= MIN_PJ_LADO).map((e) => ({ equipo: equipoCorto(e), liga: e.liga, valor: resumenLado(e.visitante), ppp: e.visitante.ppp, siguiente: e.siguiente, _pj: e.visitante.pj })), "ppp")));
    }

    if (tipo === "marcador") {
      const total = {};
      let n = 0;
      for (const r of ligas) for (const [m, k] of Object.entries(r.marcadores || {})) { total[m] = (total[m] || 0) + k; n += k; }
      S.push(seccion("marcadores", "Marcadores más comunes", idLiga ? "Resultados finales más repetidos en esta liga." : "Resultados finales más repetidos en todas las ligas activas.",
        [{ clave: "marcador", titulo: "Marcador (local - visita)", tipo: "marcador" }, numCol("Partidos", "partidos"), pctCol("%")],
        Object.entries(total).map(([m, k]) => ({ marcador: m, partidos: k, pct: k / n })).sort((a, b) => b.partidos - a.partidos).slice(0, 20)));
      const porLiga = ligas.map((r) => {
        const ms = Object.entries(r.marcadores || {}).sort((a, b) => b[1] - a[1]);
        const nl = ms.reduce((t, [, k]) => t + k, 0);
        return nl >= 5 ? { liga: r.liga, marcador: ms[0][0], pct: ms[0][1] / nl, segundo: ms[1] ? `${ms[1][0]} (${Math.round((ms[1][1] / nl) * 100)}%)` : "–", partidos: nl, _pj: nl } : null;
      }).filter(Boolean);
      S.push(seccion("ligas", "Marcador más común por liga", "El resultado que más se repite en cada liga y el segundo.",
        [COL.liga, { clave: "marcador", titulo: "Más común", tipo: "marcador" }, pctCol("%"), txtCol("Segundo", "segundo"), numCol("Partidos", "partidos")], ordenar(porLiga, "pct")));
      S.push(seccion("ceros", "Ligas con más 0-0", "Porcentaje de partidos que terminaron sin goles.",
        [COL.liga, COL.golesPartido, pctCol("% 0-0"), COL.progreso],
        ordenar(resLigas.map((x) => filaLiga(x, { pct: (x.r.marcadores?.["0-0"] || 0) / x.a.n })), "pct")));
    }

    if (tipo === "resultado") {
      S.push(seccion("equipos", "Equipos que más ganan", "Porcentaje de victorias en la temporada.",
        [COL.equipo, txtCol("Victorias", "valor"), pctCol("%"), COL.siguiente], ordenar(equipos.map((e) => filaEquipo(e, "v")), "pct")));
      S.push(seccion("partidos", "Próximos partidos con favorito claro", `Próximos ${DIAS_PROXIMOS} días: % de victorias del equipo en su lado y % de derrotas del rival en el suyo.`,
        [COL.partido, txtCol("Favorito", "quien"), pctCol("Probabilidad (por datos)"), COL.fecha, COL.golesPartido],
        ordenar(partidos.map((p) => {
          const casa = media(fr(lado(p.l, "local"), "v"), fr(lado(p.v, "visitante"), "d"));
          const fuera = media(fr(lado(p.v, "visitante"), "v"), fr(lado(p.l, "local"), "d"));
          return filaPartido(p, Math.max(casa ?? 0, fuera ?? 0), { quien: (casa ?? 0) >= (fuera ?? 0) ? p.local.nombre : p.visita.nombre });
        }), "pct", 30)));
      S.push(seccion("ligas", "Resultado final por liga", "Reparto de victorias locales, empates y victorias visitantes.",
        [COL.liga, pctCol("Gana local", "pct"), pctCol("Empate", "emp"), pctCol("Gana visita", "vv"), COL.golesPartido, COL.progreso],
        ordenar(resLigas.map((x) => filaLiga(x, { pct: x.a.vl / x.a.n, emp: x.a.emp / x.a.n, vv: x.a.vv / x.a.n })), "pct")));
      S.push(seccion("empates", "Equipos con más empates", "Porcentaje de partidos empatados.",
        [COL.equipo, txtCol("Empates", "valor"), pctCol("%"), COL.siguiente], ordenar(equipos.map((e) => filaEquipo(e, "e")), "pct")));
      S.push(seccion("derrotas", "Equipos que más pierden", "Porcentaje de derrotas.",
        [COL.equipo, txtCol("Derrotas", "valor"), pctCol("%"), COL.siguiente], ordenar(equipos.map((e) => filaEquipo(e, "d")), "pct")));
    }

    let nota;
    if (tipo === "corners") {
      const L = LINEAS_CORNERS.includes(Number(linea)) ? Number(linea) : 9.5;
      const lt = String(L).replace(".", ",");
      // Córners de cada liga; las que no tienen cobertura en TheSportsDB quedan fuera.
      const conDatos = [];
      for (const r of ligas) {
        const c = await cornersLiga(r.liga.id, LINEAS_CORNERS);
        if (c && c.liga.pj) conDatos.push({ r, c });
      }
      const pct = (b) => (b?.pj ? (b.mas[L] || 0) / b.pj : null);
      const porPj = (b, k) => (b?.pj ? r2(k === "total" ? (b.cf + b.cc) / b.pj : b[k] / b.pj) : null);
      const ladoC = (c, b) => (c[b].pj >= 2 ? c[b] : c.general);
      const eqs = conDatos.flatMap(({ r, c }) => r.equipos
        .filter((e) => c.equipos[e.id]?.general.pj >= minPj)
        .map((e) => ({ e, c: c.equipos[e.id], liga: r.liga, siguiente: r.siguientes[e.id] || null })));
      const filaEq = ({ e, c, liga, siguiente }, extra) => ({
        equipo: equipoCorto(e), liga, valor: `${c.general.pj} partidos`, siguiente, _pj: c.general.pj,
        total: porPj(c.general, "total"), cf: porPj(c.general, "cf"), cc: porPj(c.general, "cc"), pct: pct(c.general), ...extra,
      });
      const colsEq = [COL.equipo, txtCol("Con datos", "valor"), numCol("Córners / PJ", "total"), numCol("A favor / PJ", "cf"), numCol("En contra / PJ", "cc"), pctCol(`% Más de ${lt}`), COL.siguiente];
      S.push(seccion("equipos", "Equipos con más córners por partido", "Media de córners de los dos equipos en los partidos de cada equipo.", colsEq, ordenar(eqs.map((x) => filaEq(x)), "total")));

      const proximos = conDatos.flatMap(({ r, c }) => r.proximos.map((p) => ({ p, liga: r.liga, l: c.equipos[p.local.id], v: c.equipos[p.visita.id] })))
        .filter(({ l, v }) => l?.general.pj >= MIN_PJ_LIGA && v?.general.pj >= MIN_PJ_LIGA);
      S.push(seccion("partidos", `Próximos partidos con más córners`, `Próximos ${DIAS_PROXIMOS} días: media de córners del local en casa y del visitante fuera.`,
        [COL.partido, numCol("Córners esperados", "esp"), pctCol(`% Más de ${lt}`), COL.fecha],
        ordenar(proximos.map(({ p, liga, l, v }) => ({
          partido: { id: p.id, local: p.local, visita: p.visita }, liga, fecha: p.inicio,
          esp: r2(media(porPj(ladoC(l, "local"), "total"), porPj(ladoC(v, "visitante"), "total"))),
          pct: media(pct(ladoC(l, "local")), pct(ladoC(v, "visitante"))),
        })), "esp", 30)));

      S.push(seccion("ligas", "Ligas con más córners", "Media de córners por partido y porcentaje de partidos por encima de la línea.",
        [COL.liga, numCol("Córners / partido", "total"), pctCol(`% Más de ${lt}`), numCol("Partidos con datos", "partidos"), COL.progreso],
        ordenar(conDatos.filter(({ c }) => c.liga.pj >= 5).map(({ r, c }) => ({
          liga: r.liga, total: porPj(c.liga, "total"), pct: pct(c.liga), partidos: c.liga.pj, progreso: r.total ? r.jugados / r.total : null, _pj: c.liga.pj,
        })), "total")));

      S.push(seccion("a_favor", "Equipos con más córners a favor", "Córners que saca el equipo por partido.", colsEq, ordenar(eqs.map((x) => filaEq(x)), "cf")));
      S.push(seccion("en_contra", "Equipos que más córners conceden", "Córners que saca el rival por partido.", colsEq, ordenar(eqs.map((x) => filaEq(x)), "cc")));
      S.push(seccion("menos", `Mejores equipos para Menos de ${lt} córners`, `Partidos del equipo con ${Math.floor(L)} córners o menos en total.`,
        [COL.equipo, txtCol("Con datos", "valor"), numCol("Córners / PJ", "total"), pctCol(`% Menos de ${lt}`), COL.siguiente],
        ordenar(eqs.map((x) => filaEq(x, { pct: x.c.general.pj ? 1 - pct(x.c.general) : null })), "pct")));

      const info = await infoCorners();
      const d = info.descarga;
      nota = idLiga && !conDatos.length
        ? "TheSportsDB no tiene córners de esta liga (o todavía no se han descargado)."
        : `Córners de TheSportsDB partido a partido: ${info.ligas_con_cobertura} ligas con datos de ${info.ligas_sondeadas} revisadas, ${info.partidos} partidos.`
          + (d.descargando ? ` Descargando en segundo plano (${d.nuevos} nuevos en esta pasada).` : "");
    }

    const conLineas = tipo === "goles" ? LINEAS : tipo === "corners" ? LINEAS_CORNERS : undefined;
    const lineaDef = tipo === "corners" ? 9.5 : 2.5;
    return {
      tipo, titulo: TIPOS[tipo], actualizado, calculo: { ...estado }, liga: idLiga ? ligas[0]?.liga || null : null,
      lineas: conLineas, linea: conLineas ? (conLineas.includes(Number(linea)) ? Number(linea) : lineaDef) : undefined,
      min_pj: minPj, secciones: S, nota,
      selector: [...resumenes.values()].filter(activa).map((r) => r.liga),
    };
  }

  // Portada de la sección: los 5 primeros de una sección de cada tipo.
  const TARJETAS = [
    ["aem", "ligas", "Mejores ligas para AEM"], ["goles", "equipos", "Más de 2,5 goles por equipo"], ["porteria", "equipos", "Más vallas invictas"],
    ["local", "ligas", "Mayor ventaja local por liga"], ["marcador", "marcadores", "Marcadores más comunes"], ["resultado", "equipos", "Equipos que más ganan"],
    ["goles", "ligas", "Ligas con más goles"], ["porteria", "combinado", "Equipos que más fallan en marcar"],
    ["corners", "equipos", "Equipos con más córners (% más de 9,5)"],
  ];
  async function portada() {
    await cargado;
    const tarjetas = [];
    const cache = {};
    for (const [tipo, sec, titulo] of TARJETAS) {
      cache[tipo] ??= await consulta(tipo);
      const s = cache[tipo].secciones.find((x) => x.id === sec);
      tarjetas.push({ tipo, titulo, columnas: s.columnas, filas: s.filas.slice(0, 5) });
    }
    const activas = [...resumenes.values()].filter(activa);
    return {
      actualizado, calculo: { ...estado }, ligas_activas: activas.length,
      equipos: activas.reduce((t, r) => t + r.equipos.filter((e) => e.general.pj >= MIN_PJ).length, 0),
      tipos: TIPOS, no_disponibles: NO_DISPONIBLES, tarjetas,
      selector: activas.map((r) => r.liga),
    };
  }

  const ligasActivas = async () => {
    await cargado;
    return [...resumenes.values()].filter(activa);
  };

  // Resumen de una liga (equipos con sus números de local/visitante y próximos partidos), para
  // el Simulador. Si la liga no está entre las resumidas, se calcula al momento.
  const resumenLiga = async (idLiga) => (await fuente(idLiga))[0] || null;

  return { iniciar, consulta, portada, ligasActivas, resumenLiga };
}
