// Prueba retrospectiva de las apuestas diarias (Doble y Riesgo) con el modelo calibrado del
// 2026-10-25, sin mirar el futuro: predice cada partido de la temporada con los partidos
// anteriores, aplica la regla real de pick (ventaja >= 5 pts sobre la media de la liga), agrupa
// los picks por día y arma cada día la Doble y la Riesgo con distintas reglas.
//
// Las cuotas históricas de las casas no existen en los datos, así que se mide con la cuota justa
// del modelo (1 / probabilidad): un modelo bien calibrado da ~0 unidades con ella. Lo que importa
// es cuántos días se arma cada combinada, su cuota y si acierta lo que dice (o más).
//
// Uso (con el servidor en marcha): node scripts/backtest_apuestas.mjs
import { readFile } from "node:fs/promises";
import { calibrar, probabilidades } from "../predicciones.js";

const BASE = "http://127.0.0.1:3000";
const MIN_PJ = 4, MIN_PARTIDOS_LIGA = 20, MIN_CANDIDATAS = 5;
const SUAVIZADO = 10, PESO_LADO = 0.25, VENTAJA_MINIMA = 0.05;
const CANDIDATOS = ["local", "visita", "aem_si", "aem_no", "mas15", "mas25", "menos25", "menos35"];
const ES_1X2 = new Set(["local", "visita"]);

const acierto = (m, gl, gv) => {
  const t = gl + gv;
  return { local: gl > gv, visita: gv > gl, aem_si: gl > 0 && gv > 0, aem_no: gl === 0 || gv === 0, mas15: t > 1.5, mas25: t > 2.5, menos25: t < 2.5, menos35: t < 3.5 }[m];
};
const bloque = () => ({ pj: 0, gf: 0, gc: 0 });
function lambdas(liga, l, v) {
  const mh = liga.gh / liga.n, ma = liga.ga / liga.n, m = (mh + ma) / 2;
  const f = (g, pj, med) => (g + SUAVIZADO * med) / (pj + SUAVIZADO) / med;
  const mez = (c, s) => (1 - PESO_LADO) * c + PESO_LADO * s;
  const aL = mez(f(l.general.gf, l.general.pj, m), f(l.local.gf, l.local.pj, mh));
  const dL = mez(f(l.general.gc, l.general.pj, m), f(l.local.gc, l.local.pj, ma));
  const aV = mez(f(v.general.gf, v.general.pj, m), f(v.visitante.gf, v.visitante.pj, ma));
  const dV = mez(f(v.general.gc, v.general.pj, m), f(v.visitante.gc, v.visitante.pj, mh));
  return [mh * aL * dV, ma * aV * dL, mh, ma];
}

let principales = new Set();
try {
  const m = (await readFile(new URL("../server.js", import.meta.url), "utf-8")).match(/LIGAS_PRINCIPALES\s*=\s*new Set\(\[([^\]]*)\]/);
  if (m) principales = new Set([...m[1].matchAll(/"(\d+)"/g)].map((x) => x[1]));
} catch {}

// --- Picks de toda la temporada con la regla real ------------------------------------------
const api = async (ruta) => (await fetch(BASE + ruta)).json();
const ligas = (await api("/api/stats")).selector;
const picksPorDia = new Map();
let partidos = 0;
for (const lg of ligas) {
  const t = await api(`/api/temporada/${lg.id}`).catch(() => null);
  if (!t?.partidos?.length) continue;
  const eq = new Map();
  const equipo = (id) => (eq.has(id) ? eq.get(id) : eq.set(id, { general: bloque(), local: bloque(), visitante: bloque() }).get(id));
  const liga = { n: 0, gh: 0, ga: 0 };
  for (const p of [...t.partidos].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const l = equipo(p.local.id), v = equipo(p.visita.id), gl = p.goles_local, gv = p.goles_visita;
    if (liga.n >= MIN_PARTIDOS_LIGA && l.general.pj >= MIN_PJ && v.general.pj >= MIN_PJ) {
      partidos++;
      const [lh, la, mh, ma] = lambdas(liga, l, v);
      const base = probabilidades(mh, ma);
      const pr = calibrar(probabilidades(lh, la), base);
      const op = CANDIDATOS.filter((m) => pr[m] >= 0.55 && pr[m] - base[m] >= VENTAJA_MINIMA).sort((a, b) => (pr[b] - base[b]) - (pr[a] - base[a]));
      if (op.length) {
        const m = op[0];
        const fecha = new Date(p.inicio).toLocaleDateString("sv-SE");
        if (!picksPorDia.has(fecha)) picksPorDia.set(fecha, []);
        picksPorDia.get(fecha).push({ liga: lg.id, principal: principales.has(lg.id), mercado: m, prob: pr[m], base: base[m], ventaja: pr[m] - base[m], ok: acierto(m, gl, gv) });
      }
    }
    for (const [e, lado, f, c] of [[l, "local", gl, gv], [v, "visitante", gv, gl]]) for (const b of [e.general, e[lado]]) { b.pj++; b.gf += f; b.gc += c; }
    liga.n++; liga.gh += gl; liga.ga += gv;
  }
}

// --- Armado de combinadas --------------------------------------------------------------------
// regla: { n, min, max, orden: "prob" | "ventaja", solo1x2, cuotaMin }
function armar(picks, regla, usadas) {
  const orden = picks
    .filter((p) => p.prob >= regla.min && p.prob <= (regla.max ?? 1) && !usadas.has(p) && (!regla.solo1x2 || ES_1X2.has(p.mercado)))
    .sort((a, b) => Number(b.principal) - Number(a.principal) || (regla.orden === "ventaja" ? b.ventaja - a.ventaja : b.prob - a.prob));
  const sel = [], ligasUsadas = new Set();
  for (const p of orden) {
    if (sel.length === regla.n) break;
    if (ligasUsadas.has(p.liga)) continue;
    sel.push(p);
    ligasUsadas.add(p.liga);
  }
  if (sel.length < regla.n) return null;
  const prob = sel.reduce((t, p) => t * p.prob, 1);
  if (regla.cuotaMin && 1 / prob < regla.cuotaMin) return null;
  sel.forEach((p) => usadas.add(p));
  return { prob, base: sel.reduce((t, p) => t * p.base, 1), cuota: 1 / prob, ok: sel.every((p) => p.ok), n1x2: sel.filter((p) => ES_1X2.has(p.mercado)).length };
}

const RIESGO = { n: 3, min: 0.55, max: 0.72, orden: "prob" };
const REGLAS_DOBLE = [
  ["Actual: ≥68%, más probables", { n: 2, min: 0.68, orden: "prob" }],
  ["≥65%, más probables", { n: 2, min: 0.65, orden: "prob" }],
  ["≥62%, más probables", { n: 2, min: 0.62, orden: "prob" }],
  ["≥60%, más probables", { n: 2, min: 0.60, orden: "prob" }],
  ["≥62%, más ventaja", { n: 2, min: 0.62, orden: "ventaja" }],
  ["≥60%, más ventaja", { n: 2, min: 0.60, orden: "ventaja" }],
  ["≥62%, solo 1X2", { n: 2, min: 0.62, orden: "prob", solo1x2: true }],
  ["≥60%, solo 1X2, más ventaja", { n: 2, min: 0.60, orden: "ventaja", solo1x2: true }],
];

const dias = [...picksPorDia.keys()].sort().filter((f) => picksPorDia.get(f).length >= MIN_CANDIDATAS);
const pct = (x) => `${(x * 100).toFixed(1)}%`;
const resumen = (lista, total) => {
  if (!lista.length) return { armadas: 0 };
  const n = lista.length, ok = lista.filter((c) => c.ok);
  const media = (k) => lista.reduce((t, c) => t + c[k], 0) / n;
  return {
    armadas: n, pctDias: n / total, cuota: media("cuota"), prevista: media("prob"), base: media("base"), real: ok.length / n,
    unidades: ok.reduce((t, c) => t + c.cuota, 0) - n, n1x2: media("n1x2"),
  };
};
const totalPicks = [...picksPorDia.values()].reduce((t, l) => t + l.length, 0);
console.log(`${partidos} partidos predichos · ${totalPicks} picks (${pct(totalPicks / partidos)}) · ${dias.length} días con ${MIN_CANDIDATAS}+ picks`);
console.log(`Picks: modelo ${pct(totalPicks && [...picksPorDia.values()].flat().reduce((t, p) => t + p.prob, 0) / totalPicks)} · real ${pct([...picksPorDia.values()].flat().filter((p) => p.ok).length / totalPicks)} · 1X2 ${pct([...picksPorDia.values()].flat().filter((p) => ES_1X2.has(p.mercado)).length / totalPicks)}\n`);
console.log("Regla de la Doble               días armados   cuota  prevista  media liga   real   unidades*  1X2/2 | Riesgo: días   cuota   real");
for (const [nombre, regla] of REGLAS_DOBLE) {
  const dobles = [], riesgos = [];
  for (const f of dias) {
    const usadas = new Set();
    const d = armar(picksPorDia.get(f), regla, usadas);
    if (d) dobles.push(d);
    const r = armar(picksPorDia.get(f), RIESGO, usadas);
    if (r) riesgos.push(r);
  }
  const D = resumen(dobles, dias.length), R = resumen(riesgos, dias.length);
  console.log(`${nombre.padEnd(31)} ${String(D.armadas).padStart(4)} (${pct(D.pctDias ?? 0).padStart(6)})  ${(D.cuota ?? 0).toFixed(2)}   ${pct(D.prevista ?? 0).padStart(6)}   ${pct(D.base ?? 0).padStart(6)}   ${pct(D.real ?? 0).padStart(6)}   ${(D.unidades ?? 0).toFixed(1).padStart(6)}    ${(D.n1x2 ?? 0).toFixed(1)}  |  ${String(R.armadas).padStart(4)} (${pct(R.pctDias ?? 0).padStart(6)})  ${(R.cuota ?? 0).toFixed(2)}   ${pct(R.real ?? 0)}`);
}
console.log("\n* unidades con la cuota justa del modelo: ~0 si el modelo acierta lo que dice; positivas si acierta más.");
console.log("  'media liga' = probabilidad de acertar la combinada usando solo la media de la liga en esos mercados.");

// --- Estabilidad: primera y segunda mitad de la temporada --------------------------------
console.log("\nEstabilidad (mitad 1 | mitad 2)          días   prevista   real      |  días   prevista   real");
const mitad = Math.floor(dias.length / 2);
for (const [nombre, regla] of REGLAS_DOBLE.filter(([n]) => /Actual|≥62%, más ventaja|≥60%, más ventaja|≥62%, más probables/.test(n))) {
  const partes = [dias.slice(0, mitad), dias.slice(mitad)].map((ds) => {
    const lista = [];
    for (const f of ds) { const d = armar(picksPorDia.get(f), regla, new Set()); if (d) lista.push(d); }
    return resumen(lista, ds.length);
  });
  console.log(`${nombre.padEnd(31)} ${partes.map((r) => `${String(r.armadas).padStart(5)}   ${pct(r.prevista ?? 0).padStart(6)}   ${pct(r.real ?? 0).padStart(6)}`).join("   |  ")}`);
}
console.log(`(mitad 1: ${dias[0]} a ${dias[mitad - 1]} · mitad 2: ${dias[mitad]} a ${dias.at(-1)})`);
