// Prueba retrospectiva de los 70 mercados del Simulador (mercados.js), sin mirar el futuro: recorre
// los partidos jugados de cada liga activa en orden y calcula cada mercado con SOLO los partidos
// anteriores de esa temporada, igual que el servidor (golesEsperados de predicciones.js y la
// matriz de marcadores de mercados.js). Para cada mercado compara tres probabilidades:
//   liga   = matriz con las medias de goles de la liga (sin mirar a los equipos);
//   modelo = matriz del modelo tal cual;
//   actual = lo que usa hoy el Simulador (la mezcla α de cada grupo en mercados.js).
// y busca la mezcla α·modelo + (1-α)·liga que mejor acierta en cada grupo. También prueba la
// corrección de Dixon-Coles para los marcadores bajos (0-0, 1-0, 0-1, 1-1).
//
// Uso (con el servidor en marcha, para leer las temporadas de su caché):
//   node scripts/backtest_mercados.mjs
//   node scripts/backtest_mercados.mjs --json salida.json
import { writeFile } from "node:fs/promises";
import { golesEsperados, MIN_PJ } from "../predicciones.js";
import { matriz, definiciones, GRUPOS } from "../mercados.js";

const BASE = "http://127.0.0.1:3000";
const MIN_PARTIDOS_LIGA = 20; // como en backtest_modelo.mjs
const ALFAS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const RHOS = [-0.2, -0.15, -0.1, -0.05, 0, 0.05];
const MAX = 10;

const defs = definiciones("L", "V");
const grupos = Object.keys(GRUPOS);
const enGrupo = Object.fromEntries(grupos.map((g) => [g, defs.map((d, i) => (d.grupo === g ? i : -1)).filter((i) => i >= 0)]));
// Tabla mercado × marcador: qué mercados se cumplen con cada marcador (i, j).
const cumpleEn = defs.map((d) => { const t = []; for (let i = 0; i <= MAX; i++) for (let j = 0; j <= MAX; j++) t.push(d.cumple(i, j)); return t; });

function matrizDC(lh, la, rho) {
  const m = matriz(lh, la);
  if (!rho) return m;
  m[0][0] *= 1 - lh * la * rho; m[0][1] *= 1 + lh * rho; m[1][0] *= 1 + la * rho; m[1][1] *= 1 - rho;
  const masa = m.flat().reduce((a, b) => a + Math.max(0, b), 0);
  return m.map((f) => f.map((p) => Math.max(0, p) / masa));
}
function probs(m) {
  const plano = m.flat();
  return cumpleEn.map((t) => { let p = 0; for (let k = 0; k < t.length; k++) if (t[k]) p += plano[k]; return p; });
}

// --- Datos: recorrido sin mirar el futuro ---------------------------------------------------
const api = async (ruta) => (await fetch(BASE + ruta)).json();
const ligas = (await api("/api/stats")).selector;
const registros = [];
let hechas = 0;
for (const lg of ligas) {
  const t = await api(`/api/temporada/${lg.id}`).catch(() => null);
  hechas++;
  if (!t?.partidos?.length) continue;
  const partidos = [...t.partidos].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const bloque = () => ({ pj: 0, gf: 0, gc: 0 });
  const eq = new Map();
  const r = { equipos: [] };
  const equipo = (id) => {
    if (!eq.has(id)) { const e = { general: bloque(), local: bloque(), visitante: bloque() }; eq.set(id, e); r.equipos.push(e); }
    return eq.get(id);
  };
  let n = 0;
  for (const p of partidos) {
    const l = equipo(p.local.id), v = equipo(p.visita.id);
    const gl = p.goles_local, gv = p.goles_visita;
    if (n >= MIN_PARTIDOS_LIGA && l.general.pj >= MIN_PJ && v.general.pj >= MIN_PJ) {
      const g = golesEsperados(r, l, v);
      registros.push({
        fecha: p.inicio, liga: lg.id, pj: Math.min(l.general.pj, v.general.pj), gl, gv,
        lh: g.lh, la: g.la, mh: g.mh, ma: g.ma,
        pm: probs(matriz(g.lh, g.la)), pb: probs(matriz(g.mh, g.ma)),
        y: defs.map((d) => d.cumple(gl, gv)),
      });
    }
    for (const [e, lado, f, c] of [[l, "local", gl, gv], [v, "visitante", gv, gl]])
      for (const b of [e.general, e[lado]]) { b.pj++; b.gf += f; b.gc += c; }
    n++;
  }
  process.stderr.write(`\r${hechas}/${ligas.length} ligas · ${registros.length} partidos`);
}
process.stderr.write("\n");

// --- Métricas -------------------------------------------------------------------------------
const recorta = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
const ll = (p, y) => -(y ? Math.log(recorta(p)) : Math.log(1 - recorta(p)));
const mezcla = (r, i, a) => a * r.pm[i] + (1 - a) * r.pb[i];
const alfaActual = (i) => defs[i].alfa;
const media = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

// Log loss medio de un conjunto de mercados con una mezcla (α fijo o el actual de cada mercado).
function logloss(regs, idx, alfa) {
  let s = 0, n = 0;
  for (const r of regs) for (const i of idx) { s += ll(mezcla(r, i, alfa ?? alfaActual(i)), r.y[i]); n++; }
  return s / n;
}
const mejorAlfa = (regs, idx) => ALFAS.map((a) => [a, logloss(regs, idx, a)]).sort((x, y) => x[1] - y[1])[0];
const habilidad = (llx, llLiga) => (1 - llx / llLiga) * 100; // % de mejora sobre la media de la liga

// Error de calibración medio (ECE): |prevista − real| por tramos de 10 puntos, ponderado.
function calibracion(regs, idx, alfa) {
  const t = Array.from({ length: 10 }, () => ({ n: 0, sp: 0, ok: 0 }));
  for (const r of regs) for (const i of idx) {
    const p = mezcla(r, i, alfa ?? alfaActual(i)), b = t[Math.min(9, Math.floor(p * 10))];
    b.n++; b.sp += p; b.ok += r.y[i];
  }
  const total = t.reduce((a, b) => a + b.n, 0);
  return { ece: t.reduce((a, b) => a + (b.n ? Math.abs(b.sp - b.ok) : 0), 0) / total, tramos: t.map((b, k) => ({ tramo: `${k * 10}-${k * 10 + 10}%`, n: b.n, prevista: b.n ? b.sp / b.n : null, real: b.n ? b.ok / b.n : null })) };
}

// Selecciones que el Simulador sugeriría (prob ≥ 55% y ventaja ≥ 5 pts): ¿se cumplen más que la liga?
function sugeribles(regs, idx, alfa) {
  let n = 0, sp = 0, sb = 0, ok = 0;
  for (const r of regs) for (const i of idx) {
    const p = mezcla(r, i, alfa ?? alfaActual(i));
    if (p >= 0.55 && p - r.pb[i] >= 0.05) { n++; sp += p; sb += r.pb[i]; ok += r.y[i]; }
  }
  return n ? { n, prevista: sp / n, liga: sb / n, real: ok / n } : { n: 0 };
}

const mitad = [...registros].sort((a, b) => a.fecha.localeCompare(b.fecha));
const corte = mitad[Math.floor(mitad.length / 2)].fecha;
const primera = registros.filter((r) => r.fecha < corte), segunda = registros.filter((r) => r.fecha >= corte);
const tramosPj = [[4, 7], [8, 14], [15, 99]];

const pct = (x) => (x == null ? "–" : `${(x * 100).toFixed(1)}%`);
const f4 = (x) => x.toFixed(4);
const sg = (x) => `${x >= 0 ? "+" : ""}${x.toFixed(1)}`;

console.log(`Partidos predichos sin mirar el futuro: ${registros.length} (${ligas.length} ligas); corte de mitades ${corte.slice(0, 10)}\n`);

// 1) Por grupo
const porGrupo = {};
console.log("Por grupo (log loss; habilidad = % de mejora sobre la media de la liga)");
console.log("grupo          liga     modelo   actual   hab.modelo hab.actual  α óptimo (1ª / 2ª mitad)  hab.óptimo  ECE actual  ECE óptimo");
for (const g of grupos) {
  const idx = enGrupo[g];
  const lLiga = logloss(registros, idx, 0), lMod = logloss(registros, idx, 1), lAct = logloss(registros, idx);
  const [a, lOpt] = mejorAlfa(registros, idx);
  const a1 = mejorAlfa(primera, idx)[0], a2 = mejorAlfa(segunda, idx)[0];
  const cAct = calibracion(registros, idx), cOpt = calibracion(registros, idx, a);
  porGrupo[g] = {
    mercados: idx.length, ll_liga: lLiga, ll_modelo: lMod, ll_actual: lAct, alfa_actual: alfaActual(idx[0]),
    alfa_optimo: a, alfa_mitades: [a1, a2], ll_optimo: lOpt,
    habilidad: { modelo: habilidad(lMod, lLiga), actual: habilidad(lAct, lLiga), optimo: habilidad(lOpt, lLiga) },
    ece: { actual: cAct.ece, optimo: cOpt.ece }, calibracion_actual: cAct.tramos, calibracion_optimo: cOpt.tramos,
    sugeribles: { actual: sugeribles(registros, idx), optimo: sugeribles(registros, idx, a) },
    por_pj: tramosPj.map(([x, z]) => {
      const f = registros.filter((r) => r.pj >= x && r.pj <= z);
      return { pj: `${x}-${z === 99 ? "+" : z}`, n: f.length, hab_modelo: habilidad(logloss(f, idx, 1), logloss(f, idx, 0)), hab_optimo: habilidad(logloss(f, idx, a), logloss(f, idx, 0)) };
    }),
  };
  console.log(`${g.padEnd(14)} ${f4(lLiga)}   ${f4(lMod)}   ${f4(lAct)}   ${sg(porGrupo[g].habilidad.modelo).padStart(6)}%    ${sg(porGrupo[g].habilidad.actual).padStart(6)}%     α=${a} (${a1} / ${a2})${" ".repeat(10)}${sg(porGrupo[g].habilidad.optimo).padStart(6)}%     ${pct(cAct.ece).padStart(6)}      ${pct(cOpt.ece).padStart(6)}`);
}

console.log("\nHabilidad del modelo puro y de la mezcla óptima según los partidos jugados del equipo con menos datos");
for (const g of grupos) console.log(`  ${g.padEnd(14)} ` + porGrupo[g].por_pj.map((t) => `${t.pj.padEnd(5)} n=${String(t.n).padStart(5)} modelo ${sg(t.hab_modelo).padStart(6)}% óptimo ${sg(t.hab_optimo).padStart(6)}%`).join("   "));

console.log("\nSelecciones sugeribles (prob ≥ 55% y ventaja ≥ 5 pts)   n      prevista  liga     real     ventaja real");
for (const g of grupos) for (const [k, s] of Object.entries(porGrupo[g].sugeribles)) {
  if (!s.n) { console.log(`  ${g.padEnd(14)} ${k.padEnd(7)} sin casos`); continue; }
  console.log(`  ${g.padEnd(14)} ${k.padEnd(7)} ${String(s.n).padStart(6)}   ${pct(s.prevista).padStart(6)}   ${pct(s.liga).padStart(6)}   ${pct(s.real).padStart(6)}   ${sg((s.real - s.liga) * 100).padStart(6)} pts (prometía ${sg((s.prevista - s.liga) * 100)})`);
}

// 2) Por mercado
const porMercado = defs.map((d, i) => {
  const lLiga = logloss(registros, [i], 0), lMod = logloss(registros, [i], 1), lAct = logloss(registros, [i]);
  const [a, lOpt] = mejorAlfa(registros, [i]);
  return { id: d.id, grupo: d.grupo, frecuencia: media(registros.map((r) => +r.y[i])), prob_actual: media(registros.map((r) => mezcla(r, i, alfaActual(i)))), ll_liga: lLiga, ll_modelo: lMod, ll_actual: lAct, alfa_optimo: a, hab_modelo: habilidad(lMod, lLiga), hab_actual: habilidad(lAct, lLiga), hab_optimo: habilidad(lOpt, lLiga) };
});
console.log("\nPor mercado                frecuencia  prob.media  hab.modelo  hab.actual  α óptimo  hab.óptimo");
for (const m of porMercado) console.log(`  ${m.id.padEnd(22)} ${pct(m.frecuencia).padStart(7)}   ${pct(m.prob_actual).padStart(7)}    ${sg(m.hab_modelo).padStart(6)}%    ${sg(m.hab_actual).padStart(6)}%     ${String(m.alfa_optimo).padEnd(4)}    ${sg(m.hab_optimo).padStart(6)}%`);

// 3) Dixon-Coles: ¿mejora corregir los marcadores bajos?
console.log("\nDixon-Coles (ρ) — log loss con la mezcla actual de cada grupo, y marcador exacto multiclase");
const dc = [];
for (const rho of RHOS) {
  const fila = { rho, grupos: {} };
  const regs = registros.map((r) => ({ ...r, pm: probs(matrizDC(r.lh, r.la, rho)), pb: probs(matrizDC(r.mh, r.ma, rho)) }));
  for (const g of grupos) fila.grupos[g] = logloss(regs, enGrupo[g]);
  let s = 0;
  for (const r of registros) { const m = matrizDC(r.lh, r.la, rho); s += -Math.log(recorta(r.gl <= 4 && r.gv <= 4 ? m[r.gl][r.gv] : 1 - m.slice(0, 5).reduce((t, f) => t + f.slice(0, 5).reduce((a, b) => a + b, 0), 0))); }
  fila.exacto_multiclase = s / registros.length;
  const emp = calibracion(regs, [defs.findIndex((d) => d.id === "1x2:X")]);
  fila.empate = { prevista: media(regs.map((r) => r.pm[defs.findIndex((d) => d.id === "1x2:X")])), ece: emp.ece };
  dc.push(fila);
}
const frecEmpate = media(registros.map((r) => +(r.gl === r.gv)));
console.log(`  ρ       ${grupos.map((g) => g.slice(0, 9).padEnd(10)).join("")}exacto(mc)  empate previsto (real ${pct(frecEmpate)})`);
for (const f of dc) console.log(`  ${String(f.rho).padEnd(6)}  ${grupos.map((g) => f4(f.grupos[g]).padEnd(10)).join("")}${f4(f.exacto_multiclase)}      ${pct(f.empate.prevista)}`);

const j = process.argv.indexOf("--json");
if (j > 0) await writeFile(process.argv[j + 1], JSON.stringify({ partidos: registros.length, ligas: ligas.length, corte, por_grupo: porGrupo, por_mercado: porMercado, dixon_coles: dc, frecuencia_empate: frecEmpate }, null, 1));
