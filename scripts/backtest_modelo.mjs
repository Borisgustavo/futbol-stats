// Prueba retrospectiva del modelo de predicciones (Poisson), sin mirar el futuro: recorre los
// partidos jugados de cada liga activa en orden y predice cada uno usando SOLO los partidos
// anteriores de esa temporada. Compara configuraciones del modelo (suavizado, peso de los
// partidos de local/visitante y mezcla con la media de la liga) y la regla que elige el pick.
//
// Uso (con el servidor en marcha, para leer las temporadas de su caché):
//   node scripts/backtest_modelo.mjs                # resumen
//   node scripts/backtest_modelo.mjs --json salida.json
import { writeFile } from "node:fs/promises";
import { probabilidades } from "../predicciones.js";

const BASE = "http://127.0.0.1:3000";
const MIN_PJ = 4; // como en predicciones.js
const MIN_PARTIDOS_LIGA = 20; // partidos ya jugados en la liga antes de empezar a predecir
const MERCADOS = ["local", "empate", "visita", "aem_si", "aem_no", "mas15", "mas25", "menos25", "menos35"];
const BINARIOS = ["aem_si", "mas15", "mas25", "menos35"]; // evaluados como sí/no (sus contrarios son redundantes)
const CANDIDATOS = ["local", "visita", "aem_si", "aem_no", "mas15", "mas25", "menos25", "menos35"];

const SUAVIZADOS = [3, 5, 10, 15, 20, 30, 45];
const PESOS_LADO = [0, 0.25, 0.5];
const MEZCLAS = [1, 0.85, 0.7, 0.55]; // p = α·modelo + (1-α)·media de la liga
const ACTUAL = { k: 10, w: 0.25, a: 1 };

const acierto = (m, gl, gv) => {
  const t = gl + gv;
  return { local: gl > gv, visita: gv > gl, empate: gl === gv, aem_si: gl > 0 && gv > 0, aem_no: gl === 0 || gv === 0, mas15: t > 1.5, mas25: t > 2.5, menos25: t < 2.5, menos35: t < 3.5 }[m];
};
const bloque = () => ({ pj: 0, gf: 0, gc: 0 });

function lambdas(liga, l, v, k, w) {
  const mh = liga.gh / liga.n, ma = liga.ga / liga.n, m = (mh + ma) / 2;
  const f = (g, pj, med) => (g + k * med) / (pj + k) / med;
  const mez = (c, s) => (1 - w) * c + w * s;
  const aL = mez(f(l.general.gf, l.general.pj, m), f(l.local.gf, l.local.pj, mh));
  const dL = mez(f(l.general.gc, l.general.pj, m), f(l.local.gc, l.local.pj, ma));
  const aV = mez(f(v.general.gf, v.general.pj, m), f(v.visitante.gf, v.visitante.pj, ma));
  const dV = mez(f(v.general.gc, v.general.pj, m), f(v.visitante.gc, v.visitante.pj, mh));
  return [mh * aL * dV, ma * aV * dL, mh, ma];
}

const api = async (ruta) => (await fetch(BASE + ruta)).json();
const ligas = (await api("/api/stats")).selector;
const registros = [];
let hechas = 0;
for (const lg of ligas) {
  const t = await api(`/api/temporada/${lg.id}`).catch(() => null);
  hechas++;
  if (!t?.partidos?.length) continue;
  const partidos = [...t.partidos].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const eq = new Map();
  const equipo = (id) => (eq.has(id) ? eq.get(id) : eq.set(id, { general: bloque(), local: bloque(), visitante: bloque() }).get(id));
  const liga = { n: 0, gh: 0, ga: 0 };
  for (const p of partidos) {
    const l = equipo(p.local.id), v = equipo(p.visita.id);
    const gl = p.goles_local, gv = p.goles_visita;
    if (liga.n >= MIN_PARTIDOS_LIGA && l.general.pj >= MIN_PJ && v.general.pj >= MIN_PJ) {
      const r = { liga: lg.nombre, pais: lg.pais, pj: Math.min(l.general.pj, v.general.pj), res: Object.fromEntries(MERCADOS.map((m) => [m, acierto(m, gl, gv)])), conf: {} };
      const [, , mh, ma] = lambdas(liga, l, v, 10, 0);
      r.base = probabilidades(mh, ma);
      for (const k of SUAVIZADOS) for (const w of PESOS_LADO) {
        const [lh, la] = lambdas(liga, l, v, k, w);
        r.conf[`${k}|${w}`] = probabilidades(lh, la);
      }
      registros.push(r);
    }
    // Actualiza las estadísticas con este partido (después de predecirlo).
    for (const [e, lado, f, c] of [[l, "local", gl, gv], [v, "visitante", gv, gl]]) {
      for (const b of [e.general, e[lado]]) { b.pj++; b.gf += f; b.gc += c; }
    }
    liga.n++; liga.gh += gl; liga.ga += gv;
  }
  process.stderr.write(`\r${hechas}/${ligas.length} ligas · ${registros.length} partidos`);
}
process.stderr.write("\n");

// --- Métricas -------------------------------------------------------------------------------
const probDe = (r, cfg, m) => {
  const p = r.conf[`${cfg.k}|${cfg.w}`][m];
  return cfg.a * p + (1 - cfg.a) * r.base[m];
};
const recorta = (p) => Math.min(1 - 1e-6, Math.max(1e-6, p));
function evaluar(cfg, filtro = () => true) {
  let ll1x2 = 0, llBin = 0, brier = 0, n = 0, nb = 0;
  for (const r of registros) {
    if (!filtro(r)) continue;
    n++;
    const real = r.res.local ? "local" : r.res.empate ? "empate" : "visita";
    ll1x2 += -Math.log(recorta(probDe(r, cfg, real)));
    for (const m of BINARIOS) {
      const p = recorta(probDe(r, cfg, m));
      llBin += -(r.res[m] ? Math.log(p) : Math.log(1 - p));
      brier += (p - (r.res[m] ? 1 : 0)) ** 2;
      nb++;
    }
  }
  return { partidos: n, logloss_1x2: ll1x2 / n, logloss_goles: llBin / nb, brier_goles: brier / nb };
}
const evaluarBase = (filtro = () => true) => {
  const cfg = { k: 10, w: 0, a: 0 };
  return evaluar(cfg, filtro);
};

// Calibración: probabilidad prevista frente a frecuencia real, por tramos.
function calibracion(cfg) {
  const tramos = [[0.5, 0.6], [0.6, 0.7], [0.7, 0.8], [0.8, 0.9], [0.9, 1.01]];
  return tramos.map(([a, b]) => {
    let n = 0, sp = 0, ok = 0;
    for (const r of registros) for (const m of MERCADOS) {
      const p = probDe(r, cfg, m);
      if (p >= a && p < b) { n++; sp += p; ok += r.res[m]; }
    }
    return { tramo: `${Math.round(a * 100)}-${Math.min(100, Math.round(b * 100))}%`, n, prevista: n ? sp / n : null, real: n ? ok / n : null };
  });
}

// La regla que elige el pick (predicciones.js, sin cuotas): el mercado con prob ≥ 55% que más se
// aparta de la media de la liga; si ninguno llega, el más probable.
function picks(cfg, regla = "desvio") {
  let n = 0, sp = 0, ok = 0, sb = 0;
  for (const r of registros) {
    const p = Object.fromEntries(CANDIDATOS.map((m) => [m, probDe(r, cfg, m)]));
    let m;
    if (regla === "desvio") {
      const op = CANDIDATOS.filter((x) => p[x] >= 0.55).sort((a, b) => (p[b] - r.base[b]) - (p[a] - r.base[a]));
      m = op[0] || [...CANDIDATOS].sort((a, b) => p[b] - p[a])[0];
    } else {
      m = [...CANDIDATOS].sort((a, b) => p[b] - p[a])[0];
    }
    n++; sp += p[m]; sb += r.base[m]; ok += r.res[m];
  }
  return { n, prevista: sp / n, media_liga: sb / n, real: ok / n };
}

const configs = [];
for (const k of SUAVIZADOS) for (const w of PESOS_LADO) for (const a of MEZCLAS) configs.push({ k, w, a, ...evaluar({ k, w, a }) });
const puntuar = (c) => c.logloss_1x2 + c.logloss_goles;
configs.sort((x, y) => puntuar(x) - puntuar(y));
const actual = { ...ACTUAL, ...evaluar(ACTUAL) };
const mejor = configs[0];
const base = evaluarBase();
const porMuestra = [[4, 7], [8, 14], [15, 99]].map(([a, b]) => {
  const f = (r) => r.pj >= a && r.pj <= b;
  return { pj: `${a}-${b === 99 ? "+" : b}`, actual: evaluar(ACTUAL, f), mejor: evaluar(mejor, f), base: evaluarBase(f) };
});

const salida = {
  partidos: registros.length, ligas: ligas.length,
  base, actual, mejor, top5: configs.slice(0, 5),
  calibracion: { actual: calibracion(ACTUAL), mejor: calibracion(mejor) },
  picks: { actual_desvio: picks(ACTUAL), mejor_desvio: picks(mejor), mejor_mas_probable: picks(mejor, "probable"), actual_mas_probable: picks(ACTUAL, "probable") },
  por_muestra: porMuestra,
};
const pct = (x) => (x == null ? "–" : `${Math.round(x * 1000) / 10}%`);
const f3 = (x) => x.toFixed(4);
console.log(`Partidos predichos sin mirar el futuro: ${salida.partidos} (${salida.ligas} ligas)\n`);
console.log("Log loss (menos es mejor)        1X2      goles(binarios)  Brier goles");
for (const [n, c] of [["Solo media de la liga", base], [`Actual (K=${ACTUAL.k}, w=${ACTUAL.w}, α=${ACTUAL.a})`, actual], [`Mejor (K=${mejor.k}, w=${mejor.w}, α=${mejor.a})`, mejor]])
  console.log(`${n.padEnd(32)} ${f3(c.logloss_1x2)}   ${f3(c.logloss_goles)}           ${f3(c.brier_goles)}`);
console.log("\nTop 5:", configs.slice(0, 5).map((c) => `K=${c.k} w=${c.w} α=${c.a} (${f3(puntuar(c))})`).join(" · "));
console.log("\nCalibración (todos los mercados)  tramo     n      prevista  real");
for (const [n, cal] of [["actual", salida.calibracion.actual], ["mejor", salida.calibracion.mejor]])
  for (const t of cal) console.log(`  ${n.padEnd(7)} ${t.tramo.padEnd(9)} ${String(t.n).padStart(6)}   ${pct(t.prevista).padStart(6)}   ${pct(t.real).padStart(6)}`);
console.log("\nPicks                           prevista  media liga  real");
for (const [n, p] of Object.entries(salida.picks)) console.log(`  ${n.padEnd(28)} ${pct(p.prevista).padStart(6)}    ${pct(p.media_liga).padStart(6)}    ${pct(p.real).padStart(6)}  (n=${p.n})`);
console.log("\nPor partidos jugados del equipo con menos datos (log loss 1X2 + goles)");
for (const m of porMuestra) console.log(`  ${m.pj.padEnd(6)} n=${String(m.actual.partidos).padStart(5)}  base ${f3(m.base.logloss_1x2 + m.base.logloss_goles)}  actual ${f3(m.actual.logloss_1x2 + m.actual.logloss_goles)}  mejor ${f3(m.mejor.logloss_1x2 + m.mejor.logloss_goles)}`);

// --- Desglose por mercado y mezcla separada para 1X2 y goles ------------------------------
const GOLES = ["aem_si", "aem_no", "mas15", "mas25", "menos25", "menos35"];
const llMercado = (m, prob) => {
  let ll = 0;
  for (const r of registros) { const p = recorta(prob(r)); ll += -(r.res[m] ? Math.log(p) : Math.log(1 - p)); }
  return ll / registros.length;
};
const cfgA = (k, w) => (r, m, a) => a * r.conf[`${k}|${w}`][m] + (1 - a) * r.base[m];
console.log("\nPor mercado (log loss; menos es mejor)   media liga   actual   α óptimo y su log loss");
const alfas = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
for (const m of MERCADOS) {
  const base = llMercado(m, (r) => r.base[m]);
  const act = llMercado(m, (r) => r.conf["10|0.25"][m]);
  const mejores = alfas.map((a) => [a, llMercado(m, (r) => cfgA(10, 0.25)(r, m, a))]).sort((x, y) => x[1] - y[1])[0];
  console.log(`  ${m.padEnd(9)} ${base.toFixed(4)}   ${act.toFixed(4)}   α=${mejores[0]} → ${mejores[1].toFixed(4)}`);
}

// ¿Una ventaja mayor según el modelo es una ventaja real mayor? Picks por tramo de desvío.
console.log("\nPicks por ventaja estimada (modelo − media liga)   n     modelo   media liga   real   ventaja real");
const filas = [];
for (const r of registros) {
  const pr = r.conf["10|0.25"];
  const op = CANDIDATOS.filter((x) => pr[x] >= 0.55).sort((a, b) => (pr[b] - r.base[b]) - (pr[a] - r.base[a]));
  const m = op[0];
  if (!m) continue;
  filas.push({ m, d: pr[m] - r.base[m], p: pr[m], b: r.base[m], ok: r.res[m], goles: GOLES.includes(m) });
}
for (const [a, b] of [[-1, 0.03], [0.03, 0.06], [0.06, 0.1], [0.1, 0.15], [0.15, 1]]) {
  for (const tipo of ["1X2", "goles"]) {
    const f = filas.filter((x) => x.d >= a && x.d < b && (tipo === "goles") === x.goles);
    if (!f.length) continue;
    const media = (k) => f.reduce((t, x) => t + Number(x[k]), 0) / f.length;
    console.log(`  ${(`${Math.round(Math.max(a, 0) * 100)}-${Math.round(Math.min(b, 1) * 100)} pts`).padEnd(10)} ${tipo.padEnd(6)} ${String(f.length).padStart(5)}   ${pct(media("p")).padStart(6)}   ${pct(media("b")).padStart(6)}   ${pct(media("ok")).padStart(6)}   ${((media("ok") - media("b")) * 100).toFixed(1).padStart(5)} pts`);
  }
}

// --- Propuesta: 1X2 sin tocar; mercados de goles mezclados con la media de la liga ----------
console.log("\nPropuesta (1X2 α=1; goles α=αg)   log loss goles   picks: n   % 1X2   modelo   media liga   real   ventaja real");
for (const ag of [1, 0.5, 0.4, 0.3]) {
  for (const minVentaja of [0, 0.05]) {
    const prob = (r, m) => (GOLES.includes(m) ? ag * r.conf["10|0.25"][m] + (1 - ag) * r.base[m] : r.conf["10|0.25"][m]);
    let llg = 0, nb = 0;
    for (const r of registros) for (const m of BINARIOS) { const q = recorta(prob(r, m)); llg += -(r.res[m] ? Math.log(q) : Math.log(1 - q)); nb++; }
    let n = 0, n1x2 = 0, sp = 0, sb = 0, ok = 0;
    for (const r of registros) {
      const q = Object.fromEntries(CANDIDATOS.map((m) => [m, prob(r, m)]));
      const op = CANDIDATOS.filter((x) => q[x] >= 0.55 && q[x] - r.base[x] >= minVentaja).sort((x, y) => (q[y] - r.base[y]) - (q[x] - r.base[x]));
      const m = op[0];
      if (!m) continue;
      n++; n1x2 += !GOLES.includes(m); sp += q[m]; sb += r.base[m]; ok += r.res[m];
    }
    console.log(`  αg=${String(ag).padEnd(4)} ventaja≥${Math.round(minVentaja * 100)}pts   ${(llg / nb).toFixed(4)}         ${String(n).padStart(5)}   ${pct(n1x2 / n).padStart(6)}   ${pct(sp / n).padStart(6)}   ${pct(sb / n).padStart(6)}   ${pct(ok / n).padStart(6)}   ${((ok - sb) / n * 100).toFixed(1).padStart(5)} pts`);
  }
}
const i = process.argv.indexOf("--json");
if (i > 0) await writeFile(process.argv[i + 1], JSON.stringify(salida, null, 1));
