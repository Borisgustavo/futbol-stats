// Simula qué combinadas armaría el apuestas.js ACTUAL para una o varias fechas, usando las
// predicciones guardadas, y las compara con las que se guardaron de verdad. Sirve para medir
// un cambio de criterios antes (o justo después) de aplicarlo, sin tocar data/apuestas.json.
//
// Uso (desde la raíz del proyecto, la carpeta con apuestas.js y data/):
//   node .claude/skills/apuesta-diaria/scripts/simular_armado.mjs                 # todas las fechas guardadas
//   node .claude/skills/apuesta-diaria/scripts/simular_armado.mjs 2026-10-25     # una o varias fechas
//   node .claude/skills/apuesta-diaria/scripts/simular_armado.mjs --json 2026-10-25
//
// Cómo funciona: copia las predicciones de esa fecha sin su resultado, finge que son las 22:00
// del día anterior (así todos los partidos cuentan como "por empezar") y llama a generar() del
// módulo real con un archivo temporal. Las ligas principales se leen de server.js si existe.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const comoJson = args.includes("--json");
const raiz = resolve(args.find((a) => a.startsWith("--raiz="))?.slice(7) || ".");
let fechas = args.filter((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));

const leer = async (ruta, clave) => (existsSync(ruta) ? JSON.parse(await readFile(ruta, "utf-8"))[clave] || {} : {});
const guardadas = await leer(join(raiz, "data", "apuestas.json"), "dias");
const predicciones = await leer(join(raiz, "data", "predicciones.json"), "predicciones");
if (!fechas.length) fechas = Object.keys(guardadas).sort();

let principales = new Set();
const srv = join(raiz, "server.js");
if (existsSync(srv)) {
  const m = (await readFile(srv, "utf-8")).match(/LIGAS_PRINCIPALES\s*=\s*new Set\(\[([^\]]*)\]/);
  if (m) principales = new Set([...m[1].matchAll(/"(\d+)"/g)].map((x) => x[1]));
}

const { crearApuestas, fechaLocal } = await import(pathToFileURL(join(raiz, "apuestas.js")).href);
const DIA = 86_400_000;
const resumen = (c) => c && {
  cuota_total: c.cuota_total, prob_total: c.prob_total,
  selecciones: c.selecciones.map((s) => ({ partido: `${s.local.nombre} vs ${s.visita.nombre}`, liga: s.liga.nombre, mercado: s.mercado, prob: +s.prob.toFixed(3), cuota: s.cuota })),
};

const resultados = [];
const ahoraReal = Date.now;
for (const fecha of fechas) {
  const delDia = Object.fromEntries(
    Object.entries(predicciones)
      .filter(([, p]) => fechaLocal(p.inicio) === fecha)
      .map(([id, p]) => [id, { ...p, resultado: null }]),
  );
  const dir = await mkdtemp(join(tmpdir(), "simular-armado-"));
  const [a, m, d] = fecha.split("-").map(Number);
  Date.now = () => new Date(a, m - 1, d, 0, 0, 0).getTime() - 2 * 3_600_000; // 22:00 del día anterior
  const sim = crearApuestas({ registroActual: async () => delDia, esPrincipal: (id) => principales.has(id), archivo: join(dir, "apuestas.json") });
  const log = console.log;
  console.log = () => {};
  await sim.generar();
  console.log = log;
  const hecho = (await sim.consulta()).manana;
  Date.now = ahoraReal;
  await rm(dir, { recursive: true, force: true });
  resultados.push({
    fecha,
    candidatas: Object.keys(delDia).length,
    simulada: hecho ? { doble: resumen(hecho.doble), riesgo: resumen(hecho.riesgo) } : null,
    guardada: guardadas[fecha] ? { doble: resumen(guardadas[fecha].doble), riesgo: resumen(guardadas[fecha].riesgo) } : null,
  });
}

if (comoJson) {
  console.log(JSON.stringify({ ligas_principales: [...principales], resultados }, null, 1));
} else {
  const linea = (c) => (c ? `cuota ${c.cuota_total} · prob ${Math.round(c.prob_total * 100)}% · ${c.selecciones.map((s) => `${s.partido} (${s.mercado} ${Math.round(s.prob * 100)}%, ${s.cuota})`).join(" + ")}` : "no se arma");
  if (!principales.size) console.log("(sin server.js: ninguna liga cuenta como principal en la simulación)\n");
  for (const r of resultados) {
    console.log(`## ${r.fecha} · ${r.candidatas} predicciones`);
    if (!r.simulada) { console.log("Simulada: no se arma nada (menos predicciones de las necesarias).\n"); continue; }
    for (const t of ["doble", "riesgo"]) {
      console.log(`- ${t} con el código actual: ${linea(r.simulada[t])}`);
      if (r.guardada) console.log(`  ${t} guardada:          ${linea(r.guardada[t])}`);
    }
    console.log("");
  }
}
