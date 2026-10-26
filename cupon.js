// Evaluador del cupón del Simulador (analisis/cupon_simulador.md, fase 1): calcula con código
// propio la probabilidad, el valor esperado y el riesgo de un cupón cuyas cuotas escribe el
// usuario (las de su casa), y genera el consejo del "analista por reglas". La IA no interviene:
// todos los números salen de aquí.
//
// Probabilidad de cada selección = mezcla del modelo y de lo que dice la cuota (sin el margen de
// la casa), con más peso para el modelo donde está probado:
//   confianza alta 50% modelo · media 25% · baja 15% (grupos en mercados.js).
// Sin datos del modelo (liga no activa o equipos con pocos partidos) solo cuenta la cuota.
//
// La cuota de la casa es opcional: si falta, se usa la cuota media del mercado (1X2 en caché de
// The Odds API) y, si tampoco hay, la selección se evalúa solo por probabilidad. Sin cuota no se
// puede medir el valor, así que el veredicto mira solo el riesgo y se da la cuota mínima a buscar.
import { definiciones, matriz, probabilidadConjunta, calcularMercados } from "./mercados.js";

const MARGEN_CASA = 0.05; // margen típico de una casa en cada selección
const PESO_MODELO = { alta: 0.5, media: 0.25, baja: 0.15 };
const VERDE = 0.03, ROJO = -0.05; // valor esperado por selección
const MAX_SELECCIONES = 10;

const pct = (x) => `${Math.round(x * 1000) / 10}%`.replace(".", ",");
const num = (x) => x.toFixed(2).replace(".", ",");
const dinero = (x) => `$${Math.round(x).toLocaleString("es-CL")}`;

function evaluarCombinada(grupos) {
  const prob = grupos.reduce((t, g) => t * g.prob, 1);
  const sels = grupos.flatMap((g) => g.selecciones);
  const cuota = sels.every((s) => s.cuota) ? sels.reduce((t, s) => t * s.cuota, 1) : null;
  return { prob, cuota, valor: cuota ? prob * cuota - 1 : null };
}

// contexto(idPartido) → { partido, modelo: { lh, la, mh, ma, pj_min } | null, cuotas_1x2 }
export async function evaluarCupon({ selecciones, monto }, contexto) {
  if (!Array.isArray(selecciones) || !selecciones.length) return { error: "El cupón está vacío." };
  if (selecciones.length > MAX_SELECCIONES) return { error: `Máximo ${MAX_SELECCIONES} selecciones por cupón.` };
  const conCuota = (s) => s.cuota != null && s.cuota !== "" && Number(s.cuota) !== 0;
  for (const s of selecciones)
    if (conCuota(s) && !(Number(s.cuota) >= 1.01 && Number(s.cuota) <= 1000)) return { error: "Las cuotas deben estar entre 1,01 y 1000." };
  monto = Math.max(0, Number(monto) || 0);

  // --- Por partido ----------------------------------------------------------------------
  const porPartido = new Map();
  for (const s of selecciones) {
    if (!porPartido.has(s.partido)) porPartido.set(s.partido, []);
    porPartido.get(s.partido).push({ ...s, cuota: conCuota(s) ? Number(s.cuota) : null });
  }
  const grupos = [];
  const avisos = [];
  // Los contextos se piden a la vez (cada uno puede esperar a TheSportsDB).
  const contextos = new Map(await Promise.all([...porPartido.keys()].map(async (id) => [id, await contexto(id)])));
  for (const [idPartido, sels] of porPartido) {
    const ctx = contextos.get(idPartido);
    if (!ctx) return { error: "No se encontró uno de los partidos del cupón." };
    const p = ctx.partido;
    if (p.estado !== "programado" || new Date(p.inicio) <= new Date())
      return { error: `${p.local.nombre} vs ${p.visita.nombre} ya empezó o terminó: quítalo del cupón.` };
    const defs = definiciones(p.local.nombre, p.visita.nombre);
    const m = ctx.modelo;
    const mModelo = m && matriz(m.lh, m.la), mBase = m && matriz(m.mh, m.ma);
    const evaluadas = [];
    for (const s of sels) {
      const d = defs.find((x) => x.id === s.mercado);
      if (!d) return { error: `Mercado desconocido: ${s.mercado}` };
      let cuota = s.cuota, fuente = cuota ? "casa" : null;
      const media = ctx.cuotas_1x2 && { "1x2:1": ctx.cuotas_1x2.local, "1x2:X": ctx.cuotas_1x2.empate, "1x2:2": ctx.cuotas_1x2.visita }[d.id];
      if (!cuota && media) { cuota = media; fuente = "mercado"; }
      if (!cuota && !m) return { error: `${p.local.nombre} vs ${p.visita.nombre} no tiene datos del modelo: escribe la cuota de tu casa para "${d.nombre}".` };
      const pMercado = cuota ? (1 / cuota) * (1 - MARGEN_CASA) : null;
      let pModelo = null, pFinal = pMercado, ventaja = null;
      if (m) {
        const r = probabilidadConjunta([d], mModelo, mBase);
        pModelo = r.prob;
        ventaja = r.prob - r.prob_liga;
        const w = PESO_MODELO[d.confianza];
        pFinal = pMercado == null ? pModelo : w * pModelo + (1 - w) * pMercado;
      }
      const valor = cuota ? pFinal * cuota - 1 : null;
      evaluadas.push({
        partido: { id: p.id, local: p.local, visita: p.visita, inicio: p.inicio, liga: p.nombre_liga },
        mercado: d.id, nombre: d.nombre, confianza: m ? d.confianza : "sin datos", cuota, fuente_cuota: fuente,
        prob: pFinal, prob_modelo: pModelo, prob_cuota: pMercado, ventaja_liga: ventaja,
        cuota_justa: +(1 / pFinal).toFixed(2), valor,
        semaforo: !m ? "gris" : valor == null ? "sin_cuota" : valor >= VERDE ? "verde" : valor >= ROJO ? "amarillo" : "rojo",
        muestra_corta: Boolean(m && m.pj_min < 6), _def: d,
      });
    }
    // Varias selecciones del mismo partido: probabilidad conjunta real, no el producto.
    let prob = evaluadas.reduce((t, e) => t * e.prob, 1);
    if (evaluadas.length > 1) {
      if (m) {
        const conj = probabilidadConjunta(evaluadas.map((e) => e._def), mModelo, mBase).prob;
        if (conj < 1e-6) return { error: `En ${p.local.nombre} vs ${p.visita.nombre} hay selecciones incompatibles (no pueden cumplirse a la vez).` };
        const ajuste = evaluadas.reduce((t, e) => t * (e.prob / e.prob_modelo), 1);
        prob = Math.min(conj * ajuste, ...evaluadas.map((e) => e.prob));
      }
      avisos.push(`Tienes ${evaluadas.length} selecciones de ${p.local.nombre} vs ${p.visita.nombre}. Muchas casas no permiten combinarlas en una apuesta normal (o pagan menos que el producto de las cuotas), y no son independientes: aquí se calcula la probabilidad de que se cumplan juntas.`);
    }
    if (!m) avisos.push(`${p.local.nombre} vs ${p.visita.nombre} no tiene datos del modelo (liga no activa o equipos con menos de 4 partidos): esa selección se evalúa solo con su cuota.`);
    grupos.push({ partido: p, selecciones: evaluadas, prob, modelo: m, mModelo, mBase, defs });
  }

  const total = evaluarCombinada(grupos);
  const lista = grupos.flatMap((g) => g.selecciones);
  const n = lista.length;
  const sinCuota = lista.filter((s) => s.cuota == null);
  const conValor = total.valor != null;

  // --- Veredicto ------------------------------------------------------------------------
  const motivos = [];
  if (conValor && total.valor < -0.1) motivos.push(`el valor esperado es ${pct(total.valor)}: a la larga se pierde dinero`);
  if (total.prob < 0.2) motivos.push(`la probabilidad de acertar es baja (${pct(total.prob)})`);
  if (n > 4) motivos.push(`tiene ${n} selecciones: cada una suma el margen de la casa`);
  if (lista.some((s) => s.semaforo === "gris")) motivos.push("hay selecciones sin datos del modelo");
  if (grupos.some((g) => g.selecciones.length > 1)) motivos.push("combina selecciones del mismo partido");
  if (sinCuota.length) motivos.push(`falta la cuota de tu casa en ${sinCuota.length === 1 ? "1 selección" : `${sinCuota.length} selecciones`}, así que solo se mide el riesgo, no el valor`);
  let veredicto;
  if (conValor && total.valor < -0.1) veredicto = "Sin valor";
  else if (total.prob < 0.2 || n > 4 || lista.some((s) => s.semaforo === "gris") || grupos.some((g) => g.selecciones.length > 1)) veredicto = "Arriesgada";
  else if (conValor && total.valor >= -0.03 && total.prob >= 0.35) veredicto = "Correcta";
  else veredicto = "Aceptable con reservas";

  // --- Sugerencias ----------------------------------------------------------------------
  const sugerencias = [];
  if (n >= 2 && conValor) {
    let mejor = null;
    for (const s of lista) {
      const sin = grupos.map((g) => {
        const resto = g.selecciones.filter((x) => x !== s);
        if (!resto.length) return null;
        if (resto.length === g.selecciones.length) return g;
        let prob = resto.reduce((t, e) => t * e.prob, 1);
        if (resto.length > 1 && g.modelo) {
          const conj = probabilidadConjunta(resto.map((e) => e._def), g.mModelo, g.mBase).prob;
          prob = Math.min(conj * resto.reduce((t, e) => t * (e.prob / e.prob_modelo), 1), ...resto.map((e) => e.prob));
        }
        return { ...g, selecciones: resto, prob };
      }).filter(Boolean);
      const r = evaluarCombinada(sin);
      if (!mejor || r.valor > mejor.r.valor) mejor = { s, r };
    }
    if (mejor && mejor.r.valor - total.valor >= 0.02)
      sugerencias.push({
        tipo: "quitar", seleccion: mejor.s.nombre, partido: `${mejor.s.partido.local.nombre} vs ${mejor.s.partido.visita.nombre}`,
        partido_id: mejor.s.partido.id, mercado_actual: mejor.s.mercado,
        texto: `Quita "${mejor.s.nombre}" (${mejor.s.partido.local.nombre} vs ${mejor.s.partido.visita.nombre}): el valor esperado pasa de ${pct(total.valor)} a ${pct(mejor.r.valor)} y la probabilidad de acertar sube de ${pct(total.prob)} a ${pct(mejor.r.prob)}.`,
      });
  }
  const yaSugeridas = new Set(); // una misma alternativa no se sugiere dos veces en un partido
  for (const g of grupos) {
    if (!g.modelo) continue;
    for (const s of g.selecciones.filter((x) => x.semaforo === "rojo")) {
      const { mercados } = calcularMercados({ local: g.partido.local.nombre, visita: g.partido.visita.nombre, ...g.modelo });
      const alt = mercados
        .filter((x) => x.id !== s.mercado && x.prob >= 0.55 && x.ventaja >= 0.05 && x.confianza !== "baja")
        .filter((x) => !g.selecciones.some((e) => e.mercado === x.id) && !yaSugeridas.has(`${g.partido.id}|${x.id}`))
        .sort((a, b) => b.ventaja - a.ventaja)[0];
      if (alt) yaSugeridas.add(`${g.partido.id}|${alt.id}`);
      const partido = `${g.partido.local.nombre} vs ${g.partido.visita.nombre}`;
      sugerencias.push(alt
        ? { tipo: "cambiar", seleccion: s.nombre, partido, partido_id: g.partido.id, mercado_actual: s.mercado, alternativa: alt.nombre, mercado: alt.id, cuota_justa: alt.cuota_justa, texto: `En ${partido}, en vez de "${s.nombre}", el modelo ve más ventaja en "${alt.nombre}" (${pct(alt.prob)}, ${Math.round(alt.ventaja * 100)} puntos sobre la media de la liga). Solo tendría valor con una cuota de al menos ${num(1.03 / alt.prob)}.` }
        : { tipo: "revisar", seleccion: s.nombre, partido, partido_id: g.partido.id, mercado_actual: s.mercado, texto: `En ${partido} el modelo no ve ningún mercado con ventaja clara: "${s.nombre}" paga menos de lo que vale (${num(s.cuota)} frente a una cuota justa de ${num(s.cuota_justa)}). Considera quitarla.` });
    }
  }
  if (n >= 5)
    sugerencias.push({ tipo: "selecciones", texto: `Con ${n} selecciones, solo el margen de la casa se come en torno al ${pct(1 - (1 - MARGEN_CASA) ** n)} del valor. Un cupón más corto suele ser mejor apuesta.` });

  // --- Explicación del analista ---------------------------------------------------------
  const justa = 1 / total.prob;
  const conValorSel = lista.filter((s) => s.valor != null);
  const peor = [...conValorSel].sort((a, b) => a.valor - b.valor)[0];
  const mejorSel = [...conValorSel].sort((a, b) => b.valor - a.valor)[0];
  const deN = `${n} ${n === 1 ? "selección" : "selecciones"}`;
  const explicacion = [conValor
    ? `Tu cupón de ${deN} tiene una cuota total de ${num(total.cuota)}. Estimamos que acierta un ${pct(total.prob)} de las veces, así que para ser una apuesta justa debería pagar al menos ${num(justa)}. Valor esperado: ${pct(total.valor)}${monto ? `; con ${dinero(monto)}, ${total.valor >= 0 ? "la ganancia" : "la pérdida"} esperada es de ${dinero(Math.abs(total.valor * monto))} y, si aciertas, cobrarías ${dinero(monto * total.cuota)}` : ""}.`
    : `Estimamos que tu cupón de ${deN} acierta un ${pct(total.prob)} de las veces. Para que valga la pena, tu casa debería pagar al menos ${num(justa)} en total${monto ? ` (con ${dinero(monto)}, cobrar al menos ${dinero(monto * justa)} si aciertas)` : ""}. Sin la cuota de tu casa no podemos decir si tiene valor.`,
  ];
  if (sinCuota.length)
    explicacion.push(`Cuota mínima que deberías encontrar en tu casa: ${sinCuota.map((s) => `"${s.nombre}" ${num(s.cuota_justa)}`).join(", ")}. Si te pagan menos, esa selección pierde dinero a la larga. Escríbelas en el cupón y vuelve a evaluar.`);
  if (lista.some((s) => s.fuente_cuota === "mercado"))
    explicacion.push("Donde no escribiste cuota usamos la media del mercado de varias casas (The Odds API). La de tu casa puede ser distinta.");
  if (peor && peor !== mejorSel)
    explicacion.push(`La selección más débil es "${peor.nombre}" (${peor.partido.local.nombre} vs ${peor.partido.visita.nombre}): ${peor.fuente_cuota === "mercado" ? "la cuota media del mercado es" : "tu casa paga"} ${num(peor.cuota)}, pero estimamos un ${pct(peor.prob)}, que equivale a una cuota justa de ${num(peor.cuota_justa)}. La mejor es "${mejorSel.nombre}", con un valor esperado de ${pct(mejorSel.valor)}.`);
  if (lista.some((s) => s.confianza === "baja"))
    explicacion.push("Incluye mercados donde el modelo apenas mejora a la media de la liga (ambos marcan o resultado exacto): ahí pesa más lo que dice la cuota de tu casa que nuestro modelo.");
  if (lista.some((s) => s.muestra_corta))
    explicacion.push("Algún equipo tiene menos de 6 partidos de local o de visitante esta temporada: los números son poco fiables.");
  explicacion.push("Estimaciones de un modelo estadístico, no consejos de apuesta. Es una simulación sin dinero real. Juega con responsabilidad (+18).");

  return {
    veredicto, motivos, sugerencias, avisos, explicacion,
    total: { selecciones: n, sin_cuota: sinCuota.length, cuota: conValor ? +total.cuota.toFixed(2) : null, prob: total.prob, cuota_justa: +justa.toFixed(2), valor: total.valor, monto, ganancia_posible: conValor ? monto * total.cuota : null, resultado_esperado: conValor ? monto * total.valor : null },
    selecciones: lista.map(({ _def, ...s }) => s),
  };
}
