// Estadísticas partido a partido de TheSportsDB: córners, tarjetas y minuto de cada gol.
//
// La lista de la temporada (eventsseason.php) solo trae el marcador; los córners están en el detalle
// de cada partido (lookupeventstats.php) y el minuto de los goles en su cronología
// (lookuptimeline.php): una o dos peticiones por partido y solo en algunas ligas. Por eso:
// - Cada liga se sondea con sus últimos partidos jugados: si ninguno trae córners, no tiene
//   cobertura y se vuelve a probar al cabo de una semana.
// - En las ligas con cobertura se descargan, con prioridad baja en la cola y a la mitad del ritmo
//   permitido (para dejar sitio a quien navega), los partidos jugados que aún no estén guardados.
//   Un partido terminado no cambia, así que se guarda en disco para siempre.
import { readFile, writeFile } from "node:fs/promises";

const REFRESCO_MS = 3 * 3_600_000;
const REPROBAR_MS = 7 * 86_400_000;
const PARTIDOS_SONDEO = 3;
const ESPERA_DATOS_MS = 2 * 86_400_000; // si a los 2 días un partido sigue sin datos, ya no los tendrá
const GUARDAR_CADA = 50;
const PAUSA_MS = 1300; // tras cada partido: la descarga usa ~la mitad de las ~90 peticiones/min
export const TRAMOS = ["1-15", "16-30", "31-45", "46-60", "61-75", "76-90"];
const tramo = (min) => Math.min(5, Math.max(0, Math.ceil(min / 15) - 1));
const dormir = (ms) => new Promise((ok) => setTimeout(ok, ms));

// "Corner Kicks" → [local, visita]; null si el partido no trae ese dato.
function par(stats, tipo) {
  const s = stats.find((x) => x.strStat === tipo);
  if (!s || s.intHome == null || s.intAway == null) return null;
  const l = Number(s.intHome), v = Number(s.intAway);
  return Number.isFinite(l) && Number.isFinite(v) ? [l, v] : null;
}

// Goles de la cronología como [minuto, 0 = local | 1 = visita]. strHome dice a quién se le cuenta el
// gol (también en los autogoles). Si no cuadran con el marcador final, la cronología está incompleta.
function golesDe(timeline, p) {
  const g = timeline
    .filter((t) => /goal/i.test(t.strTimeline || "") && !/missed|cancel/i.test(t.strTimelineDetail || ""))
    .map((t) => [Math.min(90, Math.max(1, Number(t.intTime) || 0)), t.strHome === "Yes" ? 0 : 1])
    .sort((a, b) => a[0] - b[0]);
  const l = g.filter(([, s]) => s === 0).length;
  return l === p.goles_local && g.length - l === p.goles_visita ? g : null;
}

export function crearStatsPartidos({ ligasAmbito, temporada, statsDePartido, cronologiaDePartido, archivo }) {
  // eventos[id] = { l: liga, h: local, a: visita, c: [córners L, V] | null, t: [tarjetas L, V] | null,
  //                 g: [[minuto, lado], ...] | null }  (sin "g" = cronología aún no descargada)
  let eventos = {};
  // ligas[id] = { cobertura: bool, probado: ISO }
  let ligas = {};
  const estado = { descargando: false, liga: null, nuevos: 0, pendientes: 0 };
  const cargado = readFile(archivo, "utf-8")
    .then((t) => {
      const d = JSON.parse(t);
      eventos = d.eventos || {};
      ligas = d.ligas || {};
    })
    .catch(() => {});
  const guardar = () => writeFile(archivo, JSON.stringify({ ligas, eventos }), "utf-8").catch((e) => console.error("partidos: no se pudo guardar", e.message));

  // Devuelve true si guardó algo nuevo del partido.
  async function descargarPartido(p) {
    const viejo = Date.now() - new Date(p.inicio).getTime() > ESPERA_DATOS_MS;
    const e = eventos[p.id] || { l: p.liga, h: p.local.id, a: p.visita.id };
    let cambio = false;
    if (!("c" in e)) {
      const stats = await statsDePartido(p.id, "baja");
      const c = par(stats, "Corner Kicks");
      const am = par(stats, "Yellow Cards"), ro = par(stats, "Red Cards");
      // Sin datos y reciente: no se guarda, para volver a intentarlo en la próxima pasada.
      if (c || viejo) {
        Object.assign(e, { c, t: am ? [am[0] + (ro?.[0] || 0), am[1] + (ro?.[1] || 0)] : null });
        cambio = true;
      }
    }
    if (!("g" in e)) {
      // Un 0-0 no necesita cronología.
      const g = p.goles_local + p.goles_visita === 0 ? [] : golesDe(await cronologiaDePartido(p.id, "baja"), p);
      if (g || viejo) { e.g = g; cambio = true; }
    }
    if (cambio) eventos[p.id] = e;
    return cambio;
  }

  async function sondear(idLiga, jugados) {
    let cobertura = false;
    for (const p of jugados.slice(-PARTIDOS_SONDEO)) {
      try {
        if (!eventos[p.id]?.c) await descargarPartido(p);
      } catch { /* se reintenta en la próxima pasada */ }
      if (eventos[p.id]?.c) { cobertura = true; break; }
    }
    ligas[idLiga] = { cobertura, probado: new Date().toISOString() };
    return cobertura;
  }

  async function actualizar() {
    if (estado.descargando) return;
    Object.assign(estado, { descargando: true, nuevos: 0, pendientes: 0 });
    try {
      for (const idLiga of ligasAmbito()) {
        estado.liga = idLiga;
        let t;
        try { t = await temporada(idLiga, undefined, "baja"); } catch { continue; }
        if (!t.partidos.length) continue;
        const info = ligas[idLiga];
        const caducado = !info || (!info.cobertura && Date.now() - new Date(info.probado).getTime() > REPROBAR_MS);
        if (caducado && !(await sondear(idLiga, t.partidos))) continue;
        if (!ligas[idLiga]?.cobertura) continue;
        const faltan = t.partidos.filter((p) => !eventos[p.id] || !("c" in eventos[p.id]) || !("g" in eventos[p.id]));
        estado.pendientes += faltan.length;
        for (const p of faltan) {
          try {
            if (await descargarPartido(p)) estado.nuevos++;
          } catch { /* se reintenta en la próxima pasada */ }
          estado.pendientes--;
          if (estado.nuevos && estado.nuevos % GUARDAR_CADA === 0) await guardar();
          await dormir(PAUSA_MS);
        }
      }
    } finally {
      Object.assign(estado, { descargando: false, liga: null });
      await guardar();
      const con = Object.values(ligas).filter((l) => l.cobertura).length;
      console.log(`partidos: ${estado.nuevos} actualizados; ${con} ligas con cobertura; ${Object.keys(eventos).length} partidos guardados`);
    }
  }

  async function iniciar() {
    await cargado;
    setTimeout(actualizar, 60_000); // después de que arranquen estadísticas y predicciones
    setInterval(actualizar, REFRESCO_MS);
  }

  // --- Córners ------------------------------------------------------------------------
  // Córners de cada equipo de una liga: general, de local y de visitante.
  // cf = córners a favor, cc = en contra; "mas" cuenta los partidos por encima de cada línea (total de los dos).
  function bloque() { return { pj: 0, cf: 0, cc: 0, mas: {} }; }
  function sumar(b, cf, cc, lineas) {
    b.pj++; b.cf += cf; b.cc += cc;
    for (const l of lineas) if (cf + cc > l) b.mas[l] = (b.mas[l] || 0) + 1;
  }
  async function cornersLiga(idLiga, lineas) {
    await cargado;
    if (!ligas[idLiga]?.cobertura) return null;
    const equipos = {};
    const eq = (id) => (equipos[id] ??= { general: bloque(), local: bloque(), visitante: bloque() });
    const liga = bloque();
    for (const e of Object.values(eventos)) {
      if (e.l !== idLiga || !e.c) continue;
      const [l, v] = e.c;
      sumar(eq(e.h).general, l, v, lineas); sumar(eq(e.h).local, l, v, lineas);
      sumar(eq(e.a).general, v, l, lineas); sumar(eq(e.a).visitante, v, l, lineas);
      sumar(liga, l, v, lineas);
    }
    return { liga, equipos };
  }

  // --- Minuto de los goles ------------------------------------------------------------
  // Por equipo: goles marcados y recibidos por tramo de 15 minutos y por mitad, partidos en los que
  // marcó en las dos mitades, y los minutos (para "antes / después del minuto X" en el navegador).
  function bloqueGoles() {
    return { pj: 0, favor: [0, 0, 0, 0, 0, 0], contra: [0, 0, 0, 0, 0, 0], f1: 0, f2: 0, c1: 0, c2: 0, ambas: 0, gol_1t: 0, min_favor: [], min_contra: [] };
  }
  function sumarGoles(b, g, lado) {
    b.pj++;
    let m1 = false, m2 = false, gol1 = false;
    for (const [min, s] of g) {
      const propio = s === lado, t = tramo(min);
      if (min <= 45) gol1 = true;
      if (propio) {
        b.favor[t]++; b.min_favor.push(min);
        if (min <= 45) { b.f1++; m1 = true; } else { b.f2++; m2 = true; }
      } else {
        b.contra[t]++; b.min_contra.push(min);
        if (min <= 45) b.c1++; else b.c2++;
      }
    }
    if (m1 && m2) b.ambas++;
    if (gol1) b.gol_1t++;
  }
  async function golesLiga(idLiga) {
    await cargado;
    if (!ligas[idLiga]?.cobertura) return null;
    const equipos = {};
    const liga = bloqueGoles();
    for (const e of Object.values(eventos)) {
      if (e.l !== idLiga || !Array.isArray(e.g)) continue;
      sumarGoles((equipos[e.h] ??= bloqueGoles()), e.g, 0);
      sumarGoles((equipos[e.a] ??= bloqueGoles()), e.g, 1);
      sumarGoles(liga, e.g, 0); // en la liga, "favor" = goles del local y "contra" = del visitante
    }
    return { liga, equipos };
  }
  // Goles con minuto de un partido, vistos desde un equipo: [{ min, propio }].
  const golesPartido = (id, idEquipo) => {
    const e = eventos[id];
    if (!Array.isArray(e?.g)) return null;
    const lado = e.h === idEquipo ? 0 : 1;
    return e.g.map(([min, s]) => ({ min, propio: s === lado }));
  };

  const resumen = async () => {
    await cargado;
    const con = Object.entries(ligas).filter(([, l]) => l.cobertura).map(([id]) => id);
    const vals = Object.values(eventos);
    return {
      ligas_con_cobertura: con.length,
      ligas_sondeadas: Object.keys(ligas).length,
      partidos: vals.filter((e) => e.c).length,
      partidos_goles: vals.filter((e) => Array.isArray(e.g)).length,
      descarga: { ...estado },
    };
  };
  const tieneCobertura = async (idLiga) => { await cargado; return ligas[idLiga]?.cobertura ?? null; };

  return { iniciar, cornersLiga, golesLiga, golesPartido, resumen, tieneCobertura };
}
