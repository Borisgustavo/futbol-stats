// Estadísticas partido a partido (córners y tarjetas) de TheSportsDB.
//
// La lista de la temporada (eventsseason.php) solo trae el marcador; los córners están en el detalle
// de cada partido (lookupeventstats.php), una petición por partido y solo en algunas ligas. Por eso:
// - Cada liga se sondea con sus últimos partidos jugados: si ninguno trae córners, no tiene
//   cobertura y se vuelve a probar al cabo de una semana.
// - En las ligas con cobertura se descargan, con prioridad baja en la cola, los partidos jugados que
//   aún no estén guardados. Un partido terminado no cambia, así que se guarda en disco para siempre.
import { readFile, writeFile } from "node:fs/promises";

const REFRESCO_MS = 3 * 3_600_000;
const REPROBAR_MS = 7 * 86_400_000;
const PARTIDOS_SONDEO = 3;
const ESPERA_DATOS_MS = 2 * 86_400_000; // si a los 2 días un partido sigue sin datos, ya no los tendrá
const GUARDAR_CADA = 50;

// "Corner Kicks" → [local, visita]; null si el partido no trae ese dato.
function par(stats, tipo) {
  const s = stats.find((x) => x.strStat === tipo);
  if (!s || s.intHome == null || s.intAway == null) return null;
  const l = Number(s.intHome), v = Number(s.intAway);
  return Number.isFinite(l) && Number.isFinite(v) ? [l, v] : null;
}

export function crearStatsPartidos({ ligasAmbito, temporada, statsDePartido, archivo }) {
  // eventos[id] = { l: liga, h: local, a: visita, c: [córners L, V] | null, t: [amarillas+rojas L, V] | null }
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
  const guardar = () => writeFile(archivo, JSON.stringify({ ligas, eventos }), "utf-8").catch((e) => console.error("córners: no se pudo guardar", e.message));

  async function descargarPartido(p) {
    const stats = await statsDePartido(p.id, "baja");
    const c = par(stats, "Corner Kicks");
    const am = par(stats, "Yellow Cards"), ro = par(stats, "Red Cards");
    const t = am ? [am[0] + (ro?.[0] || 0), am[1] + (ro?.[1] || 0)] : null;
    const viejo = Date.now() - new Date(p.inicio).getTime() > ESPERA_DATOS_MS;
    // Sin datos y reciente: no se guarda, para volver a intentarlo en la próxima pasada.
    if (!c && !viejo) return false;
    eventos[p.id] = { l: p.liga, h: p.local.id, a: p.visita.id, c, t };
    return true;
  }

  async function sondear(idLiga, jugados) {
    const ultimos = jugados.slice(-PARTIDOS_SONDEO);
    let cobertura = false;
    for (const p of ultimos) {
      if (eventos[p.id]?.c) { cobertura = true; break; }
      try {
        await descargarPartido(p);
        if (eventos[p.id]?.c) { cobertura = true; break; }
      } catch { /* se reintenta en la próxima pasada */ }
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
        const faltan = t.partidos.filter((p) => !eventos[p.id]);
        estado.pendientes += faltan.length;
        for (const p of faltan) {
          try {
            if (await descargarPartido(p)) estado.nuevos++;
          } catch { /* se reintenta en la próxima pasada */ }
          estado.pendientes--;
          if (estado.nuevos && estado.nuevos % GUARDAR_CADA === 0) await guardar();
        }
      }
    } finally {
      Object.assign(estado, { descargando: false, liga: null });
      await guardar();
      const con = Object.values(ligas).filter((l) => l.cobertura).length;
      console.log(`córners: ${estado.nuevos} partidos nuevos; ${con} ligas con cobertura; ${Object.keys(eventos).length} partidos guardados`);
    }
  }

  async function iniciar() {
    await cargado;
    setTimeout(actualizar, 60_000); // después de que arranquen estadísticas y predicciones
    setInterval(actualizar, REFRESCO_MS);
  }

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

  const resumen = async () => {
    await cargado;
    const con = Object.entries(ligas).filter(([, l]) => l.cobertura).map(([id]) => id);
    return {
      ligas_con_cobertura: con.length,
      ligas_sondeadas: Object.keys(ligas).length,
      partidos: Object.values(eventos).filter((e) => e.c).length,
      descarga: { ...estado },
    };
  };

  return { iniciar, cornersLiga, resumen };
}
