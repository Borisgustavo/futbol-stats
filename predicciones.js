// Sección "Predicciones" (modelada sobre footystats.org/es/predictions). En FootyStats las
// publican sus usuarios; aquí las genera un modelo de Poisson con los goles de la
// temporada de cada equipo como local y como visitante (lo que FootyStats llama
// "predicciones matemáticas"). Cada predicción se guarda en disco y, cuando el partido
// termina, se marca como acertada o fallada para medir el acierto real del modelo.
import { readFile, writeFile } from "node:fs/promises";

const MAX_GOLES = 10;
// Partidos "promedio de la liga" que se suman a cada equipo para evitar extremos con pocos
// datos, y peso de los partidos de local (o de visitante) frente a toda la campaña.
// Calibrado el 2026-10-24 contra las cuotas 1X2 del mercado: solo con los partidos de un
// lado y SUAVIZADO 3 el error medio era 0,109; con estos valores, unos 0,07.
const SUAVIZADO = 10;
const PESO_LADO = 0.25;
// Calibración del 2026-10-25 (analisis/calibracion_2026-10-25.md, prueba retrospectiva sin
// mirar el futuro con 9.521 partidos): en 1X2 el modelo mejora a la media de la liga, pero en
// los mercados de goles es algo peor que ella. Por eso los mercados de goles mezclan un 40% del
// modelo con un 60% de la media de la liga, y solo hay pick cuando la probabilidad supera en
// 5 puntos o más a la media de la liga en ese mercado (ventaja real medida: +15 pts frente a +4).
const PESO_MODELO_GOLES = 0.4;
const VENTAJA_MINIMA = 0.05;
const MERCADOS_GOLES = ["aem_si", "aem_no", "mas15", "mas25", "menos25", "menos35"];
export const VERSION_MODELO = "2026-10-25";
export const MIN_PJ = 4; // partidos jugados en la liga para predecir
const DIAS = 3; // horizonte de predicciones
const CONGELAR_MS = 3_600_000; // una hora antes del inicio la predicción ya no cambia
const CICLO_MS = 30 * 60_000;
const DIA = 86_400_000;

export const MERCADOS = {
  local: "Victoria local",
  visita: "Victoria visitante",
  empate: "Empate",
  aem_si: "Ambos marcan: sí",
  aem_no: "Ambos marcan: no",
  mas15: "Más de 1,5 goles",
  mas25: "Más de 2,5 goles",
  menos25: "Menos de 2,5 goles",
  menos35: "Menos de 3,5 goles",
};
// Mercados entre los que el modelo elige su predicción principal (el empate casi nunca es el más probable).
const CANDIDATOS = ["local", "visita", "aem_si", "aem_no", "mas15", "mas25", "menos25", "menos35"];

export function acierto(mercado, gl, gv) {
  const t = gl + gv;
  return {
    local: gl > gv, visita: gv > gl, empate: gl === gv,
    aem_si: gl > 0 && gv > 0, aem_no: gl === 0 || gv === 0,
    mas15: t > 1.5, mas25: t > 2.5, menos25: t < 2.5, menos35: t < 3.5,
  }[mercado];
}

const poisson = (l, k) => {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
};

export function probabilidades(lh, la) {
  const ph = Array.from({ length: MAX_GOLES + 1 }, (_, k) => poisson(lh, k));
  const pa = Array.from({ length: MAX_GOLES + 1 }, (_, k) => poisson(la, k));
  let local = 0, empate = 0, visita = 0, aem = 0, masa = 0;
  const porTotal = new Array(2 * MAX_GOLES + 1).fill(0);
  const marcadores = [];
  for (let i = 0; i <= MAX_GOLES; i++)
    for (let j = 0; j <= MAX_GOLES; j++) {
      const p = ph[i] * pa[j];
      masa += p;
      if (i > j) local += p; else if (i === j) empate += p; else visita += p;
      if (i > 0 && j > 0) aem += p;
      porTotal[i + j] += p;
      if (i <= 5 && j <= 5) marcadores.push([`${i}-${j}`, p]);
    }
  const hasta = (n) => porTotal.slice(0, n + 1).reduce((a, b) => a + b, 0) / masa;
  marcadores.sort((a, b) => b[1] - a[1]);
  return {
    local: local / masa, empate: empate / masa, visita: visita / masa,
    aem_si: aem / masa, aem_no: 1 - aem / masa,
    mas15: 1 - hasta(1), mas25: 1 - hasta(2), menos25: hasta(2), menos35: hasta(3),
    marcadores: marcadores.slice(0, 5).map(([m, p]) => ({ marcador: m, prob: p / masa })),
  };
}

// Aplica la calibración a las probabilidades del modelo: los mercados de goles se acercan a la
// media de la liga; 1X2 y los marcadores exactos quedan como salen de Poisson.
export function calibrar(probs, base) {
  const c = { ...probs };
  for (const m of MERCADOS_GOLES) c[m] = PESO_MODELO_GOLES * probs[m] + (1 - PESO_MODELO_GOLES) * base[m];
  return c;
}

// Goles esperados: media de la liga (de local o de visitante) × ataque de uno × defensa
// del otro. Ataque y defensa mezclan toda la campaña del equipo con sus partidos de ese
// lado, y ambos se suavizan hacia la media de la liga.
export function golesEsperados(r, l, v) {
  let n = 0, gh = 0, ga = 0;
  for (const e of r.equipos) { n += e.local.pj; gh += e.local.gf; ga += e.local.gc; }
  const mh = gh / n, ma = ga / n, m = (mh + ma) / 2;
  const fuerza = (goles, pj, media) => (goles + SUAVIZADO * media) / (pj + SUAVIZADO) / media;
  const mezcla = (campana, lado) => (1 - PESO_LADO) * campana + PESO_LADO * lado;
  const ataqueL = mezcla(fuerza(l.general.gf, l.general.pj, m), fuerza(l.local.gf, l.local.pj, mh));
  const defensaL = mezcla(fuerza(l.general.gc, l.general.pj, m), fuerza(l.local.gc, l.local.pj, ma));
  const ataqueV = mezcla(fuerza(v.general.gf, v.general.pj, m), fuerza(v.visitante.gf, v.visitante.pj, ma));
  const defensaV = mezcla(fuerza(v.general.gc, v.general.pj, m), fuerza(v.visitante.gc, v.visitante.pj, mh));
  return {
    lh: mh * ataqueL * defensaV, la: ma * ataqueV * defensaL, mh, ma,
    datos: {
      local_gf: l.local.pj ? l.local.gf / l.local.pj : null, local_gc: l.local.pj ? l.local.gc / l.local.pj : null, local_pj: l.local.pj,
      visita_gf: v.visitante.pj ? v.visitante.gf / v.visitante.pj : null, visita_gc: v.visitante.pj ? v.visitante.gc / v.visitante.pj : null, visita_pj: v.visitante.pj,
      local_ppp: l.general.ppp, visita_ppp: v.general.ppp,
    },
  };
}

// Elige la predicción principal: la que más se aparta de lo normal en esa liga, con al menos
// 55% de probabilidad y VENTAJA_MINIMA sobre la media de la liga; salvo que la cuota de mercado
// de 1 o 2 tenga valor (y también esa ventaja mínima). Sin ninguna, el partido no tiene pick.
function elegir(p, base, cuota) {
  const conVentaja = (m) => p[m] - base[m] >= VENTAJA_MINIMA;
  if (cuota) {
    const valor = (m, c) => (p[m] >= 0.4 && conVentaja(m) ? p[m] * c - 1 : -1);
    const mejor = [["local", cuota.local], ["visita", cuota.visita]].map(([m, c]) => ({ m, v: valor(m, c), c })).sort((a, b) => b.v - a.v)[0];
    if (mejor.v > 0.05) return { mercado: mejor.m, cuota_mercado: mejor.c, valor: mejor.v };
  }
  const opciones = CANDIDATOS.filter((m) => p[m] >= 0.55 && conVentaja(m)).map((m) => ({ m, d: p[m] - base[m] }));
  if (!opciones.length) return null;
  const m = opciones.sort((a, b) => b.d - a.d)[0].m;
  const c = cuota && { local: cuota.local, visita: cuota.visita }[m];
  return { mercado: m, cuota_mercado: c || null, valor: c ? p[m] * c - 1 : null };
}

export function crearPredicciones({ ligasActivas, cuotasDeLiga, resultadosDelDia, esPrincipal = () => false, archivo }) {
  let registro = {};
  let actualizado = null;
  const cargado = readFile(archivo, "utf-8").then((t) => { registro = JSON.parse(t).predicciones || {}; }).catch(() => {});
  const guardar = () => writeFile(archivo, JSON.stringify({ actualizado, predicciones: registro }), "utf-8").catch((e) => console.error("predicciones: no se pudo guardar", e.message));

  async function generar() {
    const ahora = Date.now();
    const limite = new Date(ahora + DIAS * DIA).toISOString();
    let nuevas = 0;
    for (const r of await ligasActivas()) {
      const equipos = new Map(r.equipos.map((e) => [e.id, e]));
      const proximos = r.proximos.filter((p) => p.inicio <= limite && new Date(p.inicio).getTime() - ahora > CONGELAR_MS);
      if (!proximos.length) continue;
      const cuotas = await cuotasDeLiga(r.liga.id, proximos).catch(() => new Map());
      for (const p of proximos) {
        const l = equipos.get(p.local.id), v = equipos.get(p.visita.id);
        if (!l || !v || l.general.pj < MIN_PJ || v.general.pj < MIN_PJ) continue;
        const g = golesEsperados(r, l, v);
        const base = probabilidades(g.mh, g.ma);
        const probs = calibrar(probabilidades(g.lh, g.la), base);
        const c = cuotas.get(p.id) || null;
        const eleccion = elegir(probs, base, c);
        if (!eleccion) {
          // Sin ventaja suficiente no hay pick. Una predicción anterior de este partido aún no
          // está congelada (faltan más de 1 h), así que se retira en vez de dejarla desfasada.
          if (registro[p.id] && !registro[p.id].resultado) delete registro[p.id];
          continue;
        }
        if (!registro[p.id]) nuevas++;
        registro[p.id] = {
          id: p.id, liga: r.liga, inicio: p.inicio, local: p.local, visita: p.visita,
          creada: registro[p.id]?.creada || new Date().toISOString(), actualizada: new Date().toISOString(),
          ...eleccion, prob: probs[eleccion.mercado], cuota_justa: +(1 / probs[eleccion.mercado]).toFixed(2),
          probs, base: Object.fromEntries(CANDIDATOS.map((m) => [m, base[m]])), lh: g.lh, la: g.la, datos: g.datos,
          ventaja: probs[eleccion.mercado] - base[eleccion.mercado], modelo: VERSION_MODELO,
          cuotas_1x2: c ? { local: c.local, empate: c.empate, visita: c.visita, n_casas: c.n_casas } : null,
          resultado: null,
        };
      }
    }
    return nuevas;
  }

  async function evaluar() {
    const ahora = Date.now();
    const pendientes = Object.values(registro).filter((p) => !p.resultado && new Date(p.inicio).getTime() < ahora - 2.5 * 3_600_000);
    const fechas = [...new Set(pendientes.map((p) => p.inicio.slice(0, 10)))];
    for (const f of fechas) {
      const delDia = new Map((await resultadosDelDia(f).catch(() => [])).map((x) => [x.id, x]));
      for (const p of pendientes.filter((x) => x.inicio.slice(0, 10) === f)) {
        const x = delDia.get(p.id);
        if (x?.estado === "terminado" && x.goles_local != null) {
          p.resultado = { goles_local: x.goles_local, goles_visita: x.goles_visita, acierto: acierto(p.mercado, x.goles_local, x.goles_visita) };
        } else if (x?.estado === "suspendido" || ahora - new Date(p.inicio).getTime() > 3 * DIA) {
          p.resultado = { anulada: true };
        }
      }
    }
  }

  let ciclo = null;
  async function actualizar() {
    if (ciclo) return ciclo;
    ciclo = (async () => {
      await cargado;
      const nuevas = await generar();
      await evaluar();
      actualizado = new Date().toISOString();
      await guardar();
      console.log(`predicciones: ${nuevas} nuevas, ${Object.keys(registro).length} guardadas`);
    })().finally(() => { ciclo = null; });
    return ciclo;
  }

  function iniciar() {
    setTimeout(actualizar, 15_000);
    setInterval(actualizar, CICLO_MS);
  }

  function numeros() {
    const todas = Object.values(registro);
    const hace = (d) => new Date(Date.now() - d * DIA).toISOString();
    const evaluadas = todas.filter((p) => p.resultado && !p.resultado.anulada && p.inicio >= hace(7));
    const porMercado = {};
    for (const p of evaluadas) {
      porMercado[p.mercado] ??= { n: 0, ok: 0 };
      porMercado[p.mercado].n++;
      if (p.resultado.acierto) porMercado[p.mercado].ok++;
    }
    // Desde cuándo hay predicciones guardadas: si son menos de 7 días, la web lo dice.
    const desde = todas.reduce((m, p) => (p.creada && (!m || p.creada < m) ? p.creada : m), null);
    return {
      datos_desde: desde,
      dias_datos: desde ? Math.max(1, Math.ceil((Date.now() - new Date(desde)) / DIA)) : 0,
      ultimas24: todas.filter((p) => p.creada >= hace(1)).length,
      total: todas.length,
      pendientes: todas.filter((p) => !p.resultado).length,
      acierto7: { n: evaluadas.length, ok: evaluadas.filter((p) => p.resultado.acierto).length },
      por_mercado: Object.entries(porMercado).map(([m, x]) => ({ mercado: MERCADOS[m], ...x })).sort((a, b) => b.n - a.n),
    };
  }

  // Vistas del menú (como las de FootyStats).
  const VISTAS = {
    hoy: { titulo: "Predicciones para el día de hoy" },
    manana: { titulo: "Predicciones para mañana" },
    recientes: { titulo: "Predicciones más recientes y sus resultados" },
    matematicas: { titulo: "Predicciones matemáticas" },
    aem: { titulo: "Predicciones de Ambos Equipos Marcan", mercado: "aem_si" },
    local: { titulo: "Predicciones de victorias en casa", mercado: "local" },
    visita: { titulo: "Predicciones de victorias fuera de casa", mercado: "visita" },
    mas15: { titulo: "Predicciones de Más de 1,5 goles", mercado: "mas15" },
    mas25: { titulo: "Predicciones de Más de 2,5 goles", mercado: "mas25" },
    "1x2": { titulo: "Pronósticos 1X2" },
    combinadas: { titulo: "Pronósticos combinados (acumuladores)" },
    exacto: { titulo: "Predicciones de resultado exacto" },
    destacados: { titulo: "Picks destacados" },
  };

  async function consulta(vista, { desde, hasta } = {}) {
    await cargado;
    if (!VISTAS[vista]) return null;
    const ahora = new Date().toISOString();
    const futuras = Object.values(registro).filter((p) => !p.resultado && p.inicio >= new Date(Date.now() - 2 * 3_600_000).toISOString());
    const enRango = (p) => (!desde || p.inicio >= desde) && (!hasta || p.inicio <= hasta);
    const conMercado = (p, m) => ({ ...p, mercado: m, prob: p.probs[m], cuota_justa: +(1 / p.probs[m]).toFixed(2), cuota_mercado: p.cuotas_1x2?.[m] ?? null });
    let filas;
    const v = VISTAS[vista];
    if (vista === "hoy" || vista === "manana" || vista === "matematicas") {
      filas = Object.values(registro).filter(enRango).sort((a, b) => a.inicio.localeCompare(b.inicio) || b.prob - a.prob);
    } else if (vista === "destacados") {
      // Carrusel de la portada: lo más probable de las próximas 36 horas, primero en las
      // ligas principales y como mucho un partido por liga.
      const limite = new Date(Date.now() + 36 * 3_600_000).toISOString();
      const candidatas = futuras.filter((p) => p.inicio > ahora && p.inicio <= limite && p.prob >= 0.55).sort((a, b) => b.prob - a.prob);
      filas = [];
      const ligasUsadas = new Set();
      for (const soloPrincipales of [true, false])
        for (const p of candidatas) {
          if (filas.length >= 6) break;
          if (ligasUsadas.has(p.liga.id) || (soloPrincipales && !esPrincipal(p.liga.id))) continue;
          filas.push(p);
          ligasUsadas.add(p.liga.id);
        }
    } else if (vista === "recientes") {
      filas = Object.values(registro).filter((p) => p.resultado && !p.resultado.anulada).sort((a, b) => b.inicio.localeCompare(a.inicio)).slice(0, 100);
    } else if (v.mercado) {
      filas = futuras.map((p) => conMercado(p, v.mercado)).sort((a, b) => b.prob - a.prob).slice(0, 60);
    } else if (vista === "1x2") {
      filas = futuras.map((p) => conMercado(p, ["local", "empate", "visita"].sort((a, b) => p.probs[b] - p.probs[a])[0])).sort((a, b) => b.prob - a.prob).slice(0, 60);
    } else if (vista === "exacto") {
      filas = futuras.map((p) => ({ ...p, mercado: "exacto", exacto: p.probs.marcadores[0].marcador, prob: p.probs.marcadores[0].prob, cuota_justa: +(1 / p.probs.marcadores[0].prob).toFixed(2), cuota_mercado: null }))
        .sort((a, b) => b.prob - a.prob).slice(0, 60);
    } else if (vista === "combinadas") {
      // Tres combinadas de 3 selecciones, con las predicciones más probables de partidos distintos.
      const orden = futuras.filter((p) => p.prob >= 0.6).sort((a, b) => b.prob - a.prob);
      const combinadas = [];
      for (let i = 0; i + 3 <= Math.min(orden.length, 9); i += 3) {
        const sel = orden.slice(i, i + 3);
        const prob = sel.reduce((t, p) => t * p.prob, 1);
        combinadas.push({ selecciones: sel, prob, cuota_justa: +(1 / prob).toFixed(2) });
      }
      return { vista, titulo: v.titulo, vistas: VISTAS, mercados: MERCADOS, combinadas, filas: [], numeros: numeros(), actualizado };
    }
    return { vista, titulo: v.titulo, vistas: VISTAS, mercados: MERCADOS, filas, numeros: numeros(), actualizado, ahora };
  }

  // Lectura para las apuestas diarias (apuestas.js): las predicciones guardadas, con sus resultados.
  const registroActual = async () => {
    await cargado;
    return registro;
  };

  // La predicción guardada de un partido (para su ficha), o null si el modelo no lo predijo.
  const prediccionDe = async (id) => {
    await cargado;
    return registro[id] || null;
  };

  return { iniciar, actualizar, consulta, registroActual, prediccionDe };
}
