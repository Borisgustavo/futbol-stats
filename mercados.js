// Mercados de un partido para el Simulador, derivados de la matriz de marcadores del modelo de
// Poisson. Cada mercado es una condición sobre el marcador final (i goles del local, j del
// visitante), así que la probabilidad de varias selecciones del mismo partido a la vez se calcula
// exacta sumando la matriz donde se cumplen todas (no multiplicando, que sería un error).
//
// Mezcla y confianza por grupo (analisis/mercados_simulador_2026-10-25.md, prueba retrospectiva
// sin mirar el futuro con 9.584 partidos): prob = α·modelo + (1−α)·media de la liga, con el α que
// mejor acertó en cada grupo. La confianza ordena los grupos por cuánto mejora el modelo a la
// media de la liga y decide cuánto pesa frente a la cuota de la casa en el cupón (cupon.js):
//   alta  = resultado, doble oportunidad y hándicap (+3% a +5%);
//   media = goles totales, goles por equipo y combos (+0,4% a +2,7%);
//   baja  = ambos marcan y resultado exacto (casi no mejoran a la liga).
const MAX = 10;

const poisson = (l, k) => {
  let p = Math.exp(-l);
  for (let i = 1; i <= k; i++) p *= l / i;
  return p;
};
export function matriz(lh, la) {
  const ph = Array.from({ length: MAX + 1 }, (_, k) => poisson(lh, k));
  const pa = Array.from({ length: MAX + 1 }, (_, k) => poisson(la, k));
  const m = [];
  let masa = 0;
  for (let i = 0; i <= MAX; i++) {
    m.push([]);
    for (let j = 0; j <= MAX; j++) { m[i].push(ph[i] * pa[j]); masa += ph[i] * pa[j]; }
  }
  return m.map((fila) => fila.map((p) => p / masa));
}

const coma = (x) => String(x).replace(".", ",");
const LINEAS_TOTALES = [0.5, 1.5, 2.5, 3.5, 4.5];
const LINEAS_EQUIPO = [0.5, 1.5, 2.5];
const HANDICAPS = [-2.5, -1.5, 1.5, 2.5];

// Catálogo de mercados: id estable, grupo, nombre (con los nombres de los equipos) y condición.
export function definiciones(local, visita) {
  const d = [];
  const add = (id, grupo, nombre, cumple) => d.push({ id, grupo, nombre, cumple, ...AJUSTE[grupo] });
  add("1x2:1", "resultado", `Gana ${local}`, (i, j) => i > j);
  add("1x2:X", "resultado", "Empate", (i, j) => i === j);
  add("1x2:2", "resultado", `Gana ${visita}`, (i, j) => i < j);
  add("dc:1X", "doble", `${local} o empate`, (i, j) => i >= j);
  add("dc:12", "doble", `${local} o ${visita}`, (i, j) => i !== j);
  add("dc:X2", "doble", `Empate o ${visita}`, (i, j) => i <= j);
  for (const l of LINEAS_TOTALES) {
    add(`tot:mas:${l}`, "totales", `Más de ${coma(l)} goles`, (i, j) => i + j > l);
    add(`tot:menos:${l}`, "totales", `Menos de ${coma(l)} goles`, (i, j) => i + j < l);
  }
  add("aem:si", "aem", "Ambos marcan: sí", (i, j) => i > 0 && j > 0);
  add("aem:no", "aem", "Ambos marcan: no", (i, j) => i === 0 || j === 0);
  for (const l of LINEAS_EQUIPO) {
    add(`gl:mas:${l}`, "goles_local", `${local}: más de ${coma(l)} goles`, (i) => i > l);
    add(`gl:menos:${l}`, "goles_local", `${local}: menos de ${coma(l)} goles`, (i) => i < l);
    add(`gv:mas:${l}`, "goles_visita", `${visita}: más de ${coma(l)} goles`, (i, j) => j > l);
    add(`gv:menos:${l}`, "goles_visita", `${visita}: menos de ${coma(l)} goles`, (i, j) => j < l);
  }
  for (const h of HANDICAPS) {
    const s = h > 0 ? `+${coma(h)}` : coma(h);
    add(`hcp:1:${h}`, "handicap", `${local} ${s}`, (i, j) => i + h > j);
    add(`hcp:2:${h}`, "handicap", `${visita} ${s}`, (i, j) => j + h > i);
  }
  add("cmb:1+mas2.5", "combos", `Gana ${local} y más de 2,5`, (i, j) => i > j && i + j > 2.5);
  add("cmb:1+menos2.5", "combos", `Gana ${local} y menos de 2,5`, (i, j) => i > j && i + j < 2.5);
  add("cmb:X+menos2.5", "combos", "Empate y menos de 2,5", (i, j) => i === j && i + j < 2.5);
  add("cmb:2+mas2.5", "combos", `Gana ${visita} y más de 2,5`, (i, j) => i < j && i + j > 2.5);
  add("cmb:2+menos2.5", "combos", `Gana ${visita} y menos de 2,5`, (i, j) => i < j && i + j < 2.5);
  add("cmb:1+aem", "combos", `Gana ${local} y ambos marcan`, (i, j) => i > j && j > 0);
  add("cmb:2+aem", "combos", `Gana ${visita} y ambos marcan`, (i, j) => i < j && i > 0);
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++)
    add(`ex:${i}-${j}`, "exacto", `Resultado exacto ${i}-${j}`, (a, b) => a === i && b === j);
  return d;
}

const AJUSTE = {
  resultado: { alfa: 1, confianza: "alta" },
  doble: { alfa: 1, confianza: "alta" },
  totales: { alfa: 0.4, confianza: "media" },
  aem: { alfa: 0.4, confianza: "baja" },
  goles_local: { alfa: 0.9, confianza: "media" },
  goles_visita: { alfa: 0.8, confianza: "media" },
  handicap: { alfa: 1, confianza: "alta" },
  combos: { alfa: 0.9, confianza: "media" },
  exacto: { alfa: 1, confianza: "baja" },
};

export const GRUPOS = {
  resultado: "Resultado del partido",
  doble: "Doble oportunidad",
  totales: "Goles totales Más/Menos",
  aem: "Ambos equipos marcan",
  goles_local: "Goles del local",
  goles_visita: "Goles del visitante",
  handicap: "Hándicap",
  combos: "Combos: resultado y goles",
  exacto: "Resultado exacto",
};

const suma = (m, cumple) => {
  let p = 0;
  for (let i = 0; i <= MAX; i++) for (let j = 0; j <= MAX; j++) if (cumple(i, j)) p += m[i][j];
  return p;
};

// Probabilidad de que se cumplan a la vez todas las condiciones (mercados del mismo partido). Con
// mercados de grupos distintos se usa la mezcla más prudente (el α más bajo).
export function probabilidadConjunta(defs, mModelo, mBase) {
  const cumple = (i, j) => defs.every((d) => d.cumple(i, j));
  const pm = suma(mModelo, cumple), pb = suma(mBase, cumple);
  const alfa = Math.min(...defs.map((d) => d.alfa));
  return { prob: alfa * pm + (1 - alfa) * pb, prob_modelo: pm, prob_liga: pb };
}

// Todos los mercados de un partido con su probabilidad, cuota justa y ventaja sobre la liga.
export function calcularMercados({ local, visita, lh, la, mh, ma }) {
  const mModelo = matriz(lh, la), mBase = matriz(mh, ma);
  const defs = definiciones(local, visita);
  const mercados = defs.map((d) => {
    const { prob, prob_liga } = probabilidadConjunta([d], mModelo, mBase);
    return { id: d.id, grupo: d.grupo, nombre: d.nombre, confianza: d.confianza, prob, cuota_justa: prob > 0.001 ? +(1 / prob).toFixed(2) : null, ventaja: prob - prob_liga };
  });
  return { mercados, mModelo, mBase, defs };
}
