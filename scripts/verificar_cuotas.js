// Comprueba la clave de The Odds API y el mapeo de ligas de cuotas.js.
// Uso: npm run cuotas:verificar   (la lista de competiciones no gasta créditos)
import { readFile } from "node:fs/promises";
import { CLAVES_ODDS } from "../cuotas.js";

const clave = process.env.ODDS_API_KEY;
if (!clave) {
  console.error("Falta ODDS_API_KEY en .env");
  process.exit(1);
}
const r = await fetch(`https://api.the-odds-api.com/v4/sports/?all=true&apiKey=${encodeURIComponent(clave)}`);
if (r.status === 401) {
  console.error("La clave no es válida (401).");
  process.exit(1);
}
if (!r.ok) {
  console.error(`The Odds API respondió ${r.status}`);
  process.exit(1);
}
const deportes = (await r.json()).filter((d) => d.group === "Soccer");
const porClave = new Map(deportes.map((d) => [d.key, d]));
const catalogo = JSON.parse(await readFile(new URL("../data/ligas.json", import.meta.url), "utf-8"));
const nombres = new Map([...catalogo.internacionales, ...catalogo.paises.flatMap((p) => p.ligas)].map((l) => [l.id, l.nombre]));

console.log(`Créditos restantes: ${r.headers.get("x-requests-remaining")} · usados: ${r.headers.get("x-requests-used")}\n`);
console.log("Ligas mapeadas:");
for (const [id, key] of Object.entries(CLAVES_ODDS)) {
  const d = porClave.get(key);
  const estado = !d ? "NO EXISTE" : d.active ? "activa" : "sin partidos ahora";
  console.log(`  ${estado.padEnd(18)} ${key.padEnd(42)} ← ${id} ${nombres.get(id) || "(no está en el catálogo)"}`);
}
const mapeadas = new Set(Object.values(CLAVES_ODDS));
const libres = deportes.filter((d) => !mapeadas.has(d.key));
console.log(`\nCompeticiones de fútbol de The Odds API sin mapear (${libres.length}):`);
for (const d of libres) console.log(`  ${d.active ? "activa " : "inactiva"} ${d.key.padEnd(42)} ${d.title}`);
