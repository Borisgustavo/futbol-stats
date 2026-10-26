// Apuestas diarias (modelo: betmines.com/es/apuestas-diarias-futbol). Cada día el modelo
// arma dos combinadas con sus propias predicciones:
//   - Doble: 2 selecciones probables (68%+) con cuota total de al menos 1,80: de los pares
//     que llegan a esa cuota se elige el más probable (queda cerca de 1,8-2).
//   - Riesgo: 3 selecciones de probabilidad media (cuota total ~3-4).
// Una vez creadas se congelan: nunca se rehacen, para que el historial sea honesto. Su
// resultado sale de las predicciones evaluadas (predicciones.js marca acierto/fallo).
import { readFile, writeFile } from "node:fs/promises";

// cuotaMin (opcional): cuota total mínima de la combinada. Sin ella se toman las selecciones
// más probables; con ella, la combinación más probable que llegue a esa cuota.
export const TIPOS_APUESTA = {
  doble: { nombre: "Doble", selecciones: 2, probMin: 0.68, probMax: 1, cuotaMin: 1.8 },
  riesgo: { nombre: "Riesgo", selecciones: 3, probMin: 0.55, probMax: 0.72 },
};
const MAX_BUSQUEDA = 40; // candidatas (las mejores) que se combinan al buscar la cuota mínima
const MIN_CANDIDATAS = 5; // predicciones del día necesarias para armar las combinadas
const ANTELACION_MS = 3_600_000; // solo partidos que empiezan dentro de más de 1 hora
const DIAS_HISTORIAL = 3; // lo que muestra la página
const DIAS_GUARDADOS = 30; // lo que se conserva en disco
const CICLO_MS = 30 * 60_000;
const DIA = 86_400_000;

// Fecha en la zona horaria del servidor (la misma que la del usuario en local).
export const fechaLocal = (d) => new Date(d).toLocaleDateString("sv-SE");

function seleccion(p) {
  const deMercado = ["local", "visita", "empate"].includes(p.mercado) && p.cuotas_1x2;
  return {
    id: p.id, liga: p.liga, inicio: p.inicio, local: p.local, visita: p.visita,
    mercado: p.mercado, prob: p.prob,
    cuota: deMercado ? p.cuotas_1x2[p.mercado] : p.cuota_justa,
    cuota_tipo: deMercado ? "mercado" : "justa",
  };
}

function combinada(tipo, sel) {
  const cuota = sel.reduce((t, s) => t * s.cuota, 1);
  const prob = sel.reduce((t, s) => t * s.prob, 1);
  return { tipo, selecciones: sel, cuota_total: +cuota.toFixed(2), prob_total: +prob.toFixed(3) };
}

export function crearApuestas({ registroActual, esPrincipal = () => false, archivo }) {
  let dias = {};
  const cargado = readFile(archivo, "utf-8").then((t) => { dias = JSON.parse(t).dias || {}; }).catch(() => {});
  const guardar = () => writeFile(archivo, JSON.stringify({ dias }), "utf-8").catch((e) => console.error("apuestas: no se pudo guardar", e.message));

  // Arma las combinadas de hoy y de mañana si todavía no existen. Una combinada ya creada
  // no se toca aunque las predicciones cambien después.
  async function generar() {
    await cargado;
    const registro = await registroActual();
    const ahora = Date.now();
    let nuevas = 0;
    for (const fecha of [fechaLocal(ahora), fechaLocal(ahora + DIA)]) {
      if (dias[fecha]) continue;
      const candidatas = Object.values(registro).filter((p) => !p.resultado && fechaLocal(p.inicio) === fecha && new Date(p.inicio).getTime() - ahora > ANTELACION_MS);
      if (candidatas.length < MIN_CANDIDATAS) continue;
      const principales = (sel) => sel.filter((s) => esPrincipal(s.liga.id)).length;
      const elegibles = (cfg, usadas) => candidatas
        .filter((p) => p.prob >= cfg.probMin && p.prob <= cfg.probMax && !usadas.has(p.id))
        .sort((a, b) => Number(esPrincipal(b.liga.id)) - Number(esPrincipal(a.liga.id)) || b.prob - a.prob);
      // Opciones de selecciones para un tipo, de la preferida a la peor (una por liga, como BetMines).
      const opciones = (cfg, usadas) => {
        const lista = elegibles(cfg, usadas);
        if (!cfg.cuotaMin) {
          // Las más probables, primero las ligas principales.
          const ligas = new Set();
          const sel = [];
          for (const p of lista) {
            if (sel.length === cfg.selecciones) break;
            if (ligas.has(p.liga.id)) continue;
            sel.push(seleccion(p));
            ligas.add(p.liga.id);
          }
          return sel.length === cfg.selecciones ? [sel] : [];
        }
        // Con cuota mínima: todas las combinaciones que llegan a ella, primero las que tienen más
        // ligas principales y luego las más probables (la cuota queda lo más cerca posible del mínimo).
        const validas = [];
        const recorrer = (desde, sel) => {
          if (sel.length === cfg.selecciones) {
            if (combinada(null, sel).cuota_total >= cfg.cuotaMin) validas.push(sel);
            return;
          }
          for (let i = desde; i < Math.min(lista.length, MAX_BUSQUEDA); i++) {
            if (sel.some((s) => s.liga.id === lista[i].liga.id)) continue;
            recorrer(i + 1, [...sel, seleccion(lista[i])]);
          }
        };
        recorrer(0, []);
        const prob = (sel) => sel.reduce((t, s) => t * s.prob, 1);
        return validas.sort((a, b) => principales(b) - principales(a) || prob(b) - prob(a));
      };
      const dia = { fecha, creada: new Date().toISOString() };
      const tipos = Object.keys(TIPOS_APUESTA);
      const usadas = new Set();
      tipos.forEach((tipo, i) => {
        const ops = opciones(TIPOS_APUESTA[tipo], usadas);
        // Si se puede, se elige una opción que deje armar también las combinadas siguientes
        // (que la Doble no se lleve las selecciones que necesita la de Riesgo).
        const dejaLasDemas = (sel) => {
          const u = new Set([...usadas, ...sel.map((s) => s.id)]);
          return tipos.slice(i + 1).every((t) => opciones(TIPOS_APUESTA[t], u).length > 0);
        };
        const sel = ops.find(dejaLasDemas) || ops[0];
        if (sel) sel.forEach((s) => usadas.add(s.id));
        dia[tipo] = sel ? combinada(tipo, sel) : null;
      });
      dias[fecha] = dia;
      nuevas++;
    }
    const limite = fechaLocal(ahora - DIAS_GUARDADOS * DIA);
    for (const f of Object.keys(dias)) if (f < limite) delete dias[f];
    if (nuevas) {
      await guardar();
      console.log(`apuestas: ${nuevas} día(s) nuevo(s) con combinadas`);
    }
  }

  // Estado de cada selección y de la combinada, leído de las predicciones evaluadas.
  function conEstado(c, registro) {
    if (!c) return null;
    const selecciones = c.selecciones.map((s) => {
      const r = registro[s.id]?.resultado;
      const estado = !r ? "pendiente" : r.anulada ? "anulada" : r.acierto ? "ganada" : "perdida";
      return { ...s, estado, goles_local: r?.goles_local ?? null, goles_visita: r?.goles_visita ?? null };
    });
    const validas = selecciones.filter((s) => s.estado !== "anulada");
    let estado = "pendiente";
    if (validas.some((s) => s.estado === "perdida")) estado = "perdida";
    else if (!validas.length) estado = "anulada";
    else if (validas.every((s) => s.estado === "ganada")) estado = "ganada";
    // Una selección anulada cuenta como cuota 1, como en las casas de apuestas.
    const cuota_final = +validas.reduce((t, s) => t * s.cuota, 1).toFixed(2);
    return { ...c, selecciones, estado, cuota_final };
  }

  async function consulta() {
    await cargado;
    const registro = await registroActual();
    const ahora = Date.now();
    const dia = (f) => (dias[f] ? { fecha: f, creada: dias[f].creada, doble: conEstado(dias[f].doble, registro), riesgo: conEstado(dias[f].riesgo, registro) } : null);
    const historial = Array.from({ length: DIAS_HISTORIAL }, (_, i) => fechaLocal(ahora - (i + 1) * DIA)).map((f) => dia(f) || { fecha: f, doble: null, riesgo: null, sin_datos: true });
    // Balance de todo lo guardado (hasta 30 días), por tipo.
    const balance = {};
    for (const tipo of Object.keys(TIPOS_APUESTA)) {
      const todas = Object.keys(dias).map((f) => conEstado(dias[f][tipo], registro)).filter(Boolean);
      const cerradas = todas.filter((c) => c.estado === "ganada" || c.estado === "perdida");
      const ganadas = cerradas.filter((c) => c.estado === "ganada");
      // Unidades: apostando 1 a cada combinada cerrada.
      const unidades = ganadas.reduce((t, c) => t + c.cuota_final, 0) - cerradas.length;
      balance[tipo] = { cerradas: cerradas.length, ganadas: ganadas.length, unidades: +unidades.toFixed(2) };
    }
    return { tipos: TIPOS_APUESTA, hoy: dia(fechaLocal(ahora)), manana: dia(fechaLocal(ahora + DIA)), historial, balance };
  }

  function iniciar() {
    setTimeout(generar, 45_000); // después del primer ciclo de predicciones
    setInterval(generar, CICLO_MS);
  }

  return { iniciar, generar, consulta };
}
