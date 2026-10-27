// Masterfutbol — interfaz de una sola página con rutas por hash.
const vista = document.getElementById("vista");
const arbol = document.getElementById("arbol-ligas");
const lateral = document.getElementById("lateral");
const buscador = document.getElementById("buscador");

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const img = (src, alt = "") => (src ? `<img src="${esc(src)}/tiny" onerror="this.onerror=null;this.src='${esc(src)}'" alt="${esc(alt)}" loading="lazy">` : "");

async function api(ruta) {
  const r = await fetch(ruta);
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || `Error ${r.status}`);
  return datos;
}
const catalogoListo = api("/api/ligas");

// --- Fechas en la zona horaria del navegador ----------------------------------
const pad = (n) => String(n).padStart(2, "0");
const fechaLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const sumarDias = (iso, n) => {
  const [a, m, d] = iso.split("-").map(Number);
  return fechaLocal(new Date(a, m - 1, d + n));
};
const hoy = () => fechaLocal(new Date());
const hora = (iso) => new Date(iso).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const fechaCorta = (iso) => new Date(iso).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit" });
const fechaLarga = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });

function rangoDelDia(iso) {
  const [a, m, d] = iso.split("-").map(Number);
  const desde = new Date(a, m - 1, d, 0, 0, 0);
  const hasta = new Date(a, m - 1, d, 23, 59, 59);
  return { desde: desde.toISOString().replace(/\.\d+Z$/, "Z"), hasta: hasta.toISOString().replace(/\.\d+Z$/, "Z") };
}

// --- Piezas reutilizables -------------------------------------------------------
function clasePpg(v) {
  if (v == null) return "nada";
  if (v >= 2.2) return "alto";
  if (v >= 1.6) return "medio";
  if (v >= 1.1) return "bajo";
  return "malo";
}
const ppg = (v, extra = "") => `<span class="ppg ${clasePpg(v)} ${extra}" title="Puntos por partido en los últimos 5">${v == null ? "–" : v.toFixed(2).replace(".", ",")}</span>`;
// La forma llega en español (V/E/D) desde las estadísticas de temporada y en inglés
// (W/D/L) desde la tabla de TheSportsDB: ojo, "D" es empate en inglés y derrota en español.
// Siempre del más antiguo (izquierda) al más reciente (derecha), que va marcado.
const formaEs = (f) => `<span class="forma" title="Últimos 5 partidos: el más reciente a la derecha">${[...(f || "")].map((c) => `<i class="${c}">${c}</i>`).join("")}</span>`;
const forma = (f) => formaEs([...(f || "")].map((c) => ({ W: "V", D: "E", L: "D" })[c] || c).join(""));
const pct = (x, n) => (n ? `${Math.round((x / n) * 100)}%` : "–");
// Coma decimal, como se escribe en Chile.
const num = (v, d = 2) => (v == null || Number.isNaN(v) ? "–" : Number(v).toFixed(d).replace(".", ","));
const migas = (...items) => `<nav class="migas">${items.filter(Boolean).map(([t, h]) => (h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`)).join(" › ")}</nav>`;
function calificacion(v, cortes) {
  const nombres = ["Excelente", "Muy bueno", "Bueno", "Regular", "Malo"];
  const clases = ["alto", "alto", "medio", "bajo", "malo"];
  if (v == null) return { texto: "Sin datos", clase: "nada" };
  const i = cortes.findIndex((c) => (cortes[0] > cortes[1] ? v >= c : v <= c));
  const k = i === -1 ? 4 : i;
  return { texto: nombres[k], clase: clases[k] };
}
// Color del puesto según lo que TheSportsDB dice que da esa posición.
function clasePuesto(desc) {
  if (/relegation|descenso/i.test(desc)) return "pos-desc";
  if (/champions|promotion|libertadores|playoff.*promotion/i.test(desc)) return "pos-1";
  if (/europa league|sudamericana/i.test(desc)) return "pos-2";
  if (/conference|qualif|play-?off/i.test(desc)) return "pos-3";
  return "";
}

function celdaHora(p) {
  if (p.estado === "en_vivo") return `<span class="hora vivo" title="Minuto informado por TheSportsDB: puede ir unos minutos atrasado">${esc(p.progreso ? `${p.progreso}'` : p.estado_texto || "En vivo")}</span>`;
  if (p.estado === "terminado") return `<span class="hora">Final</span>`;
  if (p.estado === "suspendido") return `<span class="hora">${esc(p.estado_texto)}</span>`;
  if (new Date(p.inicio) < new Date(Date.now() - 3 * 3_600_000)) return `<span class="hora" title="TheSportsDB no informa el resultado de este partido">Sin datos</span>`;
  return `<span class="hora">${hora(p.inicio)}</span>`;
}

function marcador(p) {
  const hay = p.goles_local != null && p.goles_visita != null;
  const vivo = p.estado === "en_vivo" ? "vivo" : "";
  return `<a class="marcador ${vivo}" href="#/partido/${p.id}">${hay ? `${p.goles_local} - ${p.goles_visita}` : `<span class="stats">Estad.</span>`}</a>`;
}

function filaPartido(p, conFecha = false) {
  const h = conFecha && p.estado === "programado" ? `<span class="hora">${fechaCorta(p.inicio)} ${hora(p.inicio)}</span>` : celdaHora(p);
  return `<div class="fila-partido" data-id="${esc(p.id)}" data-local="${esc(p.local.id)}" data-visita="${esc(p.visita.id)}">
    ${h}
    <span class="cuotas"></span>
    <a class="equipo local" href="#/equipo/${esc(p.local.id)}"><span>${esc(p.local.nombre)}</span>${img(p.local.escudo)}</a>
    <span class="ppg-l">${ppg(null)}</span>
    ${marcador(p)}
    <span class="ppg-v">${ppg(null)}</span>
    <a class="equipo visita" href="#/equipo/${esc(p.visita.id)}">${img(p.visita.escudo)}<span>${esc(p.visita.nombre)}</span></a>
    <span class="pick-celda"></span>
  </div>`;
}

function tarjetaLiga(liga, partidos, conFecha = false, plegada = false) {
  const titulo = liga.pais === "Internacional" ? `<b>${esc(liga.nombre)}</b>` : `<b>${esc(liga.pais)}</b> - ${esc(liga.nombre)}`;
  return `<section class="tarjeta ${plegada ? "plegada" : ""}" data-liga="${esc(liga.id)}">
    <div class="tarjeta__cabecera">${img(liga.escudo)} <span>${titulo}</span>${plegada ? `<button type="button" class="desplegar" aria-expanded="false">${partidos.length} ${partidos.length === 1 ? "partido" : "partidos"} ▾</button>` : ""}<a class="mas" href="#/liga/${esc(liga.id)}">Tabla y estadísticas ›</a></div>
    ${partidos.map((p) => filaPartido(p, conFecha)).join("")}
  </section>`;
}

// Rellena los indicadores de forma (PPG de los últimos 5) leyendo la tabla de cada liga,
// solo cuando la tarjeta entra en pantalla: la API limita las peticiones por minuto.
const tablasPedidas = new Map();
async function formaDeTarjeta(t) {
  const id = t.dataset.liga;
  if (!tablasPedidas.has(id)) tablasPedidas.set(id, api(`/api/tabla/${id}`).catch(() => { tablasPedidas.delete(id); return []; }));
  const tabla = await tablasPedidas.get(id);
  const porEquipo = new Map(tabla.map((f) => [f.equipo.id, f.ppg_forma]));
  for (const fila of t.querySelectorAll(".fila-partido")) {
    const l = porEquipo.get(fila.dataset.local);
    const v = porEquipo.get(fila.dataset.visita);
    if (l != null) fila.querySelector(".ppg-l").innerHTML = ppg(l);
    if (v != null) fila.querySelector(".ppg-v").innerHTML = ppg(v);
  }
  rellenarCuotas(id, t.querySelectorAll(".fila-partido"));
}

// Cuotas 1X2 (media de las casas) de The Odds API. En listas y ligas el servidor solo lee su
// caché (no gasta créditos); las cuotas nuevas se piden al abrir la ficha de un partido.
const cuotasPedidas = new Map();
function cuotasDeLiga(id) {
  if (!cuotasPedidas.has(id)) cuotasPedidas.set(id, api(`/api/cuotas/${id}`).catch(() => ({ disponible: false })));
  return cuotasPedidas.get(id);
}
const celdaCuotas = (c) => ["local", "empate", "visita"].map((k, i) =>
  `<span class="cuota" title="${["1 (local)", "X (empate)", "2 (visita)"][i]} · media de ${c.n_casas} casas · mejor ${c.mejor[k].precio} en ${esc(c.mejor[k].casa)}">${num(c[k])}</span>`).join("");
async function rellenarCuotas(idLiga, filas) {
  const cat = await catalogoListo.catch(() => null);
  if (!cat?.con_cuotas?.includes(idLiga)) return;
  const c = await cuotasDeLiga(idLiga);
  if (!c.disponible) return;
  for (const fila of filas) {
    const x = c.partidos[fila.dataset.id];
    const celda = fila.querySelector(".cuotas");
    if (x && celda) celda.innerHTML = celdaCuotas(x);
  }
}
let observador = null;
function rellenarForma(contenedor) {
  observador?.disconnect();
  observador = new IntersectionObserver((entradas) => {
    for (const e of entradas) {
      if (!e.isIntersecting || e.target.classList.contains("plegada")) continue;
      observador.unobserve(e.target);
      formaDeTarjeta(e.target);
    }
  }, { rootMargin: "200px" });
  contenedor.querySelectorAll("[data-liga]").forEach((t) => observador.observe(t));
}

// --- Portada: carrusel 3D de picks (lienzo "Fútbol Stats — rediseño") -----
const PICK_CORTO = { local: "1", visita: "2", empate: "X", aem_si: "Ambos", aem_no: "No ambos", mas15: "+1,5", mas25: "+2,5", menos25: "−2,5", menos35: "−3,5" };
const MERCADO_CORTO = { local: "Victoria local", visita: "Victoria visitante", empate: "Empate", aem_si: "Ambos marcan: sí", aem_no: "Ambos marcan: no", mas15: "Más de 1,5 goles", mas25: "Más de 2,5 goles", menos25: "Menos de 2,5 goles", menos35: "Menos de 3,5 goles" };
const PALETA_INICIALES = ["#2563EB", "#DC2626", "#0D9488", "#7C3AED", "#C2410C", "#0369A1", "#BE185D", "#4D7C0F"];
function escudoOIniciales(eq, clase) {
  if (eq.escudo) return `<span class="${clase}">${img(eq.escudo, eq.nombre)}</span>`;
  let h = 0;
  for (const c of eq.nombre) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const ini = eq.nombre.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  return `<span class="${clase} iniciales" style="background:${PALETA_INICIALES[h % PALETA_INICIALES.length]}">${esc(ini)}</span>`;
}

function tarjetaCarrusel(p, i) {
  const cuota = p.cuota_mercado ? `<span title="Cuota media de las casas (The Odds API)">Cuota ${num(p.cuota_mercado)}</span>` : `<span title="Cuota justa = 1 / probabilidad del modelo: la mínima que tendría que pagar una casa para que el pick valga la pena">Justa ${num(p.cuota_justa)}</span>`;
  // Un pick puede ser muy probable y aun así pagar menos de lo que vale: se dice en ambos casos.
  const valor = !p.cuota_mercado || p.valor == null ? ""
    : p.valor > 0 ? `<span class="chip chip--verde" title="La cuota media paga más de lo que vale según el modelo">Valor +${Math.round(p.valor * 100)}%</span>`
    : `<span class="chip chip--rojo" title="La cuota media paga menos de lo que vale según el modelo: probable, pero sin valor a esa cuota">Sin valor ${Math.round(p.valor * 100)}%</span>`;
  return `<article class="tarjeta-3d" data-i="${i}">
    <div class="tarjeta-3d__arriba"><span>${esc(p.liga.pais)} · ${esc(p.liga.nombre)}</span><span>${fechaRelativa(p.inicio)}</span></div>
    <div class="tarjeta-3d__equipos">
      <div>${escudoOIniciales(p.local, "escudo-grande")}<b>${esc(p.local.nombre)}</b></div>
      <div class="anillo-prob" style="background:conic-gradient(var(--acento-fuerte) ${Math.round(p.prob * 360)}deg, rgba(255,255,255,.08) 0)">
        <div title="Probabilidad de que se cumpla el pick según el modelo"><b>${pctTxt(p.prob)}</b><span>PROB.</span></div>
      </div>
      <div>${escudoOIniciales(p.visita, "escudo-grande")}<b>${esc(p.visita.nombre)}</b></div>
    </div>
    <div class="tarjeta-3d__chips"><span class="chip chip--cian">${esc(MERCADO_CORTO[p.mercado] || p.mercado)}</span><span class="chip chip--ambar">${cuota}</span>${valor}</div>
    <div class="tarjeta-3d__pie"><span>Goles esperados <b>${num(p.lh)} – ${num(p.la)}</b></span><a href="#/partido/${esc(p.id)}">Analizar →</a></div>
  </article>`;
}

let relojCarrusel = null;
function montarCarrusel(picks) {
  const anillo = document.getElementById("anillo-3d");
  const puntos = document.getElementById("puntos-3d");
  if (!anillo || !picks.length) return;
  const n = picks.length;
  const paso = 360 / n;
  const tarjetas = [...anillo.querySelectorAll(".tarjeta-3d")];
  let giro = 0;
  let pausa = false;
  const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  puntos.innerHTML = picks.map((p, i) => `<button type="button" aria-label="Pick ${i + 1}: ${esc(p.local.nombre)} contra ${esc(p.visita.nombre)}" data-i="${i}"><span></span></button>`).join("");
  const radio = () => (n < 3 ? 0 : Math.round(anillo.clientWidth / 2 / Math.tan(Math.PI / n)) + 40);
  const pintar = () => {
    const r = radio();
    const activo = ((giro % n) + n) % n;
    anillo.style.transform = `translateZ(-${r}px) rotateY(${-giro * paso}deg)`;
    tarjetas.forEach((t, i) => {
      const d = Math.min((i - activo + n) % n, (activo - i + n) % n);
      t.style.transform = `rotateY(${i * paso}deg) translateZ(${r}px)`;
      t.style.opacity = [1, 0.55, 0.22, 0.12][Math.min(d, 3)];
      t.classList.toggle("activa", d === 0);
      t.inert = d !== 0;
    });
    puntos.querySelectorAll("button").forEach((b, i) => b.classList.toggle("activo", i === activo));
  };
  const mover = (delta) => { giro += delta; pintar(); };
  document.getElementById("anterior-3d").addEventListener("click", () => mover(-1));
  document.getElementById("siguiente-3d").addEventListener("click", () => mover(1));
  puntos.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    let delta = Number(b.dataset.i) - (((giro % n) + n) % n);
    if (delta > n / 2) delta -= n;
    if (delta < -n / 2) delta += n;
    mover(delta);
  });
  const escenario = anillo.parentElement;
  escenario.addEventListener("mouseenter", () => { pausa = true; });
  escenario.addEventListener("mouseleave", () => { pausa = false; });
  escenario.addEventListener("focusin", () => { pausa = true; });
  escenario.addEventListener("focusout", () => { pausa = false; });
  window.addEventListener("resize", pintar);
  pintar();
  if (!reducido) relojCarrusel = setInterval(() => { if (!pausa && !document.hidden) mover(1); }, 5000);
}

async function pintarInicio(contenedor) {
  const d = await api("/api/predicciones/destacados");
  if (!document.body.contains(contenedor)) return;
  const fecha = new Date().toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "short" });
  contenedor.innerHTML = `
    <section class="portada" aria-labelledby="titulo-hero">
      <div class="portada__cabecera">
        <div class="portada__texto">
          <p class="portada__que">Estadísticas, pronósticos y simulador de apuestas <b>sin dinero real</b> para más de 400 competiciones de fútbol.</p>
          <nav class="portada__accesos" aria-label="Accesos rápidos"><a href="#/stats">Tablas y estadísticas</a><a href="#/predicciones">Pronósticos</a><a href="#/simulador">Simulador de cupones</a></nav>
          <span class="pastilla">Picks del modelo · ${esc(fecha)}</span>
          <h1 id="titulo-hero">Los partidos que el modelo ve más claros</h1>
          <p>${d.filas.length ? `${d.numeros.pendientes.toLocaleString("es-CL")} predicciones por jugar en ${d.ligas_activas} ligas activas. Gira el carrusel para ver cada pick con su probabilidad, la cuota y los goles esperados.` : "Todavía no hay picks con más del 55% de probabilidad en las próximas 36 horas."}</p>
        </div>
        ${d.filas.length > 1 ? `<div class="portada__flechas">
          <button type="button" id="anterior-3d" class="flecha" aria-label="Pick anterior"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>
          <button type="button" id="siguiente-3d" class="flecha flecha--primaria" aria-label="Pick siguiente"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg></button>
        </div>` : ""}
      </div>
      ${d.filas.length ? `<div class="escenario-3d"><div class="anillo-3d" id="anillo-3d">${d.filas.map(tarjetaCarrusel).join("")}</div></div><div class="puntos-3d" id="puntos-3d"></div>` : ""}
      <p class="aviso-juego">Estimaciones de un modelo estadístico, no consejos de apuesta · Juega con responsabilidad · +18</p>
    </section>`;
  if (d.filas.length > 1) montarCarrusel(d.filas);
  else contenedor.querySelector(".tarjeta-3d")?.classList.add("activa");
}

// Columna de pronóstico en las filas de partidos (como "Prob · Mercado · Cuota" en BetMines).
async function rellenarPicks(desde, hasta, contenedor) {
  const d = await api(`/api/predicciones/hoy?desde=${desde}&hasta=${hasta}`).catch(() => null);
  if (!d) return;
  const porId = new Map(d.filas.map((p) => [p.id, p]));
  for (const fila of contenedor.querySelectorAll(".fila-partido")) {
    const p = porId.get(fila.dataset.id);
    const celda = fila.querySelector(".pick-celda");
    if (!p || !celda) continue;
    const estado = p.resultado && !p.resultado.anulada ? (p.resultado.acierto ? "ok" : "fallo") : "";
    celda.innerHTML = `<a class="pick ${estado}" href="#/predicciones/hoy" title="${esc(MERCADO_CORTO[p.mercado] || p.mercado)} · probabilidad del modelo ${pctTxt(p.prob)}${estado ? (estado === "ok" ? " · acertado" : " · fallado") : ""}"><b>${esc(PICK_CORTO[p.mercado] || p.mercado)}</b><small>${pctTxt(p.prob)}</small></a>`;
  }
}

// --- Vistas --------------------------------------------------------------------
let refresco = null;
let filtroEstado = "todos";

async function vistaDia(fecha, soloVivo = false, esInicio = false) {
  const dias = [-1, 0, 1, 2, 3, 4, 5].map((n) => sumarDias(hoy(), n));
  const nombreDia = (f, n) => (n === -1 ? "Ayer" : n === 0 ? "Hoy" : n === 1 ? "Mañana" : f.slice(8, 10) + "/" + f.slice(5, 7));
  const pestañas = dias.map((f, k) => `<a href="#/dia/${f}" class="${f === fecha && !soloVivo ? "activo" : ""}">${nombreDia(f, k - 1)}</a>`).join("");
  vista.innerHTML = `${esInicio ? `<div id="inicio-hero"><div class="portada portada--cargando" aria-hidden="true"></div></div>` : ""}
    <${esInicio ? "h2" : "h1"} class="titulo-pagina">${soloVivo ? "Partidos en vivo" : esInicio ? "Partidos de hoy" : "Estadísticas de fútbol"}</${esInicio ? "h2" : "h1"}>
    <p class="subtitulo" id="resumen-dia">${soloVivo ? "Se actualiza cada 30 segundos." : `Partidos del ${esc(fechaLarga(fecha))}.`}</p>
    ${soloVivo ? "" : `<nav class="dias">${pestañas}</nav>`}
    ${soloVivo ? "" : `<div class="filtros" id="filtros">${["todos", "en_vivo", "programado", "terminado"].map((e) => `<button data-estado="${e}" class="${e === filtroEstado ? "activo" : ""}">${{ todos: "Todos", en_vivo: "En vivo", programado: "Por jugar", terminado: "Terminados" }[e]}</button>`).join("")}</div>`}
    <p class="leyenda-lista cuenta">${ppg(1.8)} puntos por partido de cada equipo en sus últimos 5 · a la derecha, el <b>pick del modelo</b> (el mercado donde ve más ventaja sobre la media de la liga) y su probabilidad, que no siempre supera el 50% · pulsa un partido para ver su ficha.</p>
    <div id="lista-partidos"><div class="cargando">Cargando partidos…</div></div>`;

  const pintar = async () => {
    const { desde, hasta } = rangoDelDia(fecha);
    const datos = await api(`/api/partidos?desde=${desde}&hasta=${hasta}`);
    const estado = soloVivo ? "en_vivo" : filtroEstado;
    const grupos = datos.ligas
      .map((g) => ({ ...g, partidos: g.partidos.filter((p) => estado === "todos" || p.estado === estado) }))
      .filter((g) => g.partidos.length);
    const total = grupos.reduce((s, g) => s + g.partidos.length, 0);
    const lista = document.getElementById("lista-partidos");
    if (!lista) return;
    document.getElementById("resumen-dia").textContent = soloVivo
      ? `${total} partidos en juego ahora · se actualiza cada 30 segundos · el minuto lo informa TheSportsDB y puede ir unos minutos atrasado.`
      : `${datos.total} partidos de ${datos.ligas.length} ligas el ${fechaLarga(fecha)}. Horarios en tu zona horaria.`;
    // Con muchas ligas, solo las primeras (las principales van primero) y las que tienen partidos en
    // vivo salen desplegadas; el resto muestra su número de partidos y se abre con un toque.
    const LIGAS_ABIERTAS = 12;
    const plegar = (g, i) => !soloVivo && grupos.length > LIGAS_ABIERTAS && i >= LIGAS_ABIERTAS && !g.partidos.some((p) => p.estado === "en_vivo");
    lista.innerHTML = grupos.length ? grupos.map((g, i) => tarjetaLiga(g.liga, g.partidos, false, plegar(g, i))).join("") : `<div class="tarjeta vacio">No hay partidos ${soloVivo ? "en vivo ahora" : "con este filtro"}.</div>`;
    rellenarForma(lista);
    rellenarPicks(desde, hasta, lista);
  };

  document.getElementById("filtros")?.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;
    filtroEstado = b.dataset.estado;
    document.querySelectorAll("#filtros button").forEach((x) => x.classList.toggle("activo", x === b));
    pintar().catch(mostrarError);
  });
  if (esInicio) pintarInicio(document.getElementById("inicio-hero")).catch(() => { document.getElementById("inicio-hero")?.remove(); });
  await pintar();
  if (soloVivo || fecha === hoy()) refresco = setInterval(() => pintar().catch(() => {}), soloVivo ? 30_000 : 60_000);
}

// Clasificación: orden y puntos de la tabla oficial (respeta sanciones y grupos) más las
// estadísticas calculadas con los partidos de la temporada. Sin tabla oficial, se calcula.
// En copas internacionales no se calcula: mezclaría rondas previas y fase de liga.
function filasClasificacion(tabla, equipos, calcular = true) {
  const stats = new Map(equipos.map((e) => [e.id, e]));
  if (tabla.length) return tabla.map((f) => ({ ...f, stats: stats.get(f.equipo.id) }));
  if (!calcular) return [];
  return equipos
    .filter((e) => e.general.pj)
    .map((e) => ({ equipo: { id: e.id, nombre: e.nombre, escudo: e.escudo }, grupo: "", descripcion: "", pj: e.general.pj, g: e.general.v, e: e.general.e, p: e.general.d, gf: e.general.gf, gc: e.general.gc, dg: e.general.gf - e.general.gc, pts: e.general.pts, ppg: e.general.ppp, forma: "", stats: e }))
    .sort((a, b) => b.pts - a.pts || b.dg - a.dg || b.gf - a.gf)
    .map((f, i) => ({ ...f, pos: i + 1 }));
}

function tablaPosiciones(filas, resaltar = []) {
  if (!filas.length) return `<div class="vacio">Esta competencia no tiene clasificación en TheSportsDB.</div>`;
  const grupos = new Map();
  for (const f of filas) {
    if (!grupos.has(f.grupo)) grupos.set(f.grupo, []);
    grupos.get(f.grupo).push(f);
  }
  const celdaPct = (s, k) => `<td class="tenue">${s ? pct(s.general[k], s.general.pj) : "–"}</td>`;
  return [...grupos.entries()].map(([grupo, fs]) => `
    ${grupos.size > 1 ? `<div class="subcabecera">${esc(grupo)}</div>` : ""}
    <div class="desplazable"><table class="tabla clasificacion">
      <thead><tr><th>#</th><th class="izq">Equipo</th><th class="pts-movil">Pts</th><th>PJ</th><th>V</th><th>E</th><th>D</th><th>GF</th><th>GC</th><th>DG</th><th class="pts-escritorio">Pts</th><th>Últimos 5</th><th>PPP</th>
        <th title="Valla invicta: partidos sin recibir goles">VI</th><th title="Ambos equipos marcan">AEM</th><th title="Partidos sin marcar">PSM</th><th title="Más de 1,5 goles">+1,5</th><th title="Más de 2,5 goles">+2,5</th><th title="Media de goles por partido">MG</th></tr></thead>
      <tbody>${fs.map((f) => {
        const s = f.stats;
        const ult = s?.general.ultimos5 ? formaEs(s.general.ultimos5) : forma(f.forma);
        const ppp = s?.general.ppp ?? f.ppg;
        return `<tr class="${resaltar.includes(f.equipo.id) ? "resaltada" : ""}" title="${esc(f.descripcion)}">
        <td><span class="puesto ${clasePuesto(f.descripcion)}">${f.pos}</span></td>
        <td class="izq"><a class="equipo" href="#/equipo/${esc(f.equipo.id)}">${img(f.equipo.escudo)}<span>${esc(f.equipo.nombre)}</span></a></td>
        <td class="pts-movil"><b>${f.pts}</b></td>
        <td>${f.pj}</td><td>${f.g}</td><td>${f.e}</td><td>${f.p}</td><td class="gf">${f.gf}</td><td class="gc">${f.gc}</td><td>${f.dg > 0 ? "+" : ""}${f.dg}</td>
        <td class="pts-escritorio"><b>${f.pts}</b></td><td>${ult}</td><td>${ppg(ppp)}</td>
        ${celdaPct(s, "pa0")}${celdaPct(s, "aem")}${celdaPct(s, "psm")}${celdaPct(s, "mas15")}${celdaPct(s, "mas25")}
        <td><b>${s ? num(s.general.mg) : "–"}</b></td></tr>`;
      }).join("")}</tbody>
    </table></div>`).join("");
}

function tendenciasLiga(equipos) {
  // Cada partido aparece una vez en el bloque "local" de su equipo local.
  const suma = (k) => equipos.reduce((t, e) => t + e.local[k], 0);
  const n = suma("pj");
  if (!n) return "";
  const dato = (t, v) => `<div><div class="dato-grande">${v}</div><div class="cuenta">${t}</div></div>`;
  return `<section class="tarjeta"><div class="tarjeta__cabecera"><b>Tendencias de la temporada</b><span class="cuenta">${n} partidos jugados</span></div>
    <div class="tarjeta__cuerpo rejilla-datos">
      ${dato("Goles por partido", num(suma("goles") / n))}${dato("Ambos marcan", pct(suma("aem"), n))}${dato("Más de 1,5 goles", pct(suma("mas15"), n))}${dato("Más de 2,5 goles", pct(suma("mas25"), n))}
      ${dato("Gana local", pct(suma("v"), n))}${dato("Empate", pct(suma("e"), n))}${dato("Gana visita", pct(suma("d"), n))}
    </div></section>`;
}

function enfrentamientos(d) {
  const stats = new Map(d.equipos.map((e) => [e.id, e]));
  const prox = d.proximos.slice(0, 10);
  if (!prox.length) return `<div class="vacio">No hay partidos programados.</div>`;
  return `<div class="desplazable"><table class="tabla enfrentamientos">
    <thead><tr><th class="izq">Fecha</th><th>Últimos 5<br>en casa</th><th class="der">Local</th><th>Forma</th><th></th><th>Forma</th><th class="izq">Visitante</th><th>Últimos 5<br>fuera</th><th>1 · X · 2</th><th></th></tr></thead>
    <tbody>${prox.map((p) => {
      const l = stats.get(p.local.id), v = stats.get(p.visita.id);
      return `<tr data-id="${esc(p.id)}"><td class="izq tenue">${fechaCorta(p.inicio)} ${hora(p.inicio)}</td>
        <td>${formaEs(l?.local.ultimos5)}</td>
        <td class="der"><a href="#/equipo/${esc(p.local.id)}">${esc(p.local.nombre)}</a></td>
        <td>${ppg(l?.general.ppp5 ?? null)}</td><td class="tenue">vs</td><td>${ppg(v?.general.ppp5 ?? null)}</td>
        <td class="izq"><a href="#/equipo/${esc(p.visita.id)}">${esc(p.visita.nombre)}</a></td>
        <td>${formaEs(v?.visitante.ultimos5)}</td>
        <td><span class="cuotas"></span></td>
        <td><a class="enlace" href="#/partido/${esc(p.id)}">Estad. »</a></td></tr>`;
    }).join("")}</tbody></table></div>`;
}

async function vistaLiga(id) {
  const d = await api(`/api/liga/${id}`);
  const liga = { id: d.id, nombre: d.nombre, pais: d.pais, escudo: d.escudo };
  document.title = `${d.nombre} — clasificación y estadísticas — Masterfutbol`;
  const nEquipos = d.equipos.length || d.tabla.length;
  const progreso = d.partidos_total ? Math.round((d.partidos_jugados / d.partidos_total) * 100) : null;
  const ficha = [
    ["País", d.pais],
    ["División", d.es_copa ? "Copa" : d.division === 0 ? 1 : d.division || "–"],
    ["Equipos", nEquipos || "–"],
    ["Temporada", d.temporada],
    ["Partidos", d.partidos_total ? `<b>${d.partidos_jugados}/${d.partidos_total}</b> jugados` : "–"],
  ];
  vista.innerHTML = `
    ${migas(["Inicio", "#/"], ["Fútbol", "#/"], [d.pais], [d.nombre])}
    <h1 class="titulo-liga">${img(d.escudo)} ${esc(d.nombre)} <span>Clasificación y estadísticas</span></h1>
    <div class="ficha-liga">
      <div class="ficha">
        <div class="ficha__escudo">${d.escudo ? `<img src="${esc(d.escudo)}" alt="${esc(d.nombre)}">` : ""}</div>
        <dl>${ficha.map(([k, v]) => `<dt>${k}</dt><dd>${typeof v === "string" && v.startsWith("<b>") ? v : esc(v)}</dd>`).join("")}
          ${progreso != null ? `<dt>Progreso</dt><dd><div class="progreso"><span style="width:${progreso}%"></span></div><b>${progreso}%</b> completado</dd>` : ""}</dl>
      </div>
      <section class="tarjeta"><div class="tarjeta__cabecera"><b>Enfrentamientos — ${esc(d.nombre)}</b><span class="cuenta mas">Hora en tu zona horaria</span></div>${enfrentamientos(d)}</section>
    </div>
    <section class="tarjeta"><div class="tarjeta__cabecera seccion"><b>${esc(d.nombre)} clasificación</b> <span class="cuenta">(${esc(d.pais)}) - ${esc(d.temporada)}</span></div>
      ${d.tabla_atrasada ? `<p class="aviso-tabla cuenta">TheSportsDB todavía no actualiza la clasificación con ${d.tabla_atrasada === 1 ? "la última jornada" : `las últimas ${d.tabla_atrasada} jornadas`} ya jugadas: los resultados de abajo están al día y la tabla se pondrá al día en unos minutos.</p>` : ""}
      ${tablaPosiciones(filasClasificacion(d.tabla, d.equipos, !d.internacional))}
      <div class="leyenda cuenta">PPP: puntos por partido · VI: valla invicta · AEM: ambos equipos marcan · PSM: partidos sin marcar · +1,5 / +2,5: partidos con más goles · MG: media de goles por partido</div>
    </section>
    ${tendenciasLiga(d.equipos)}
    <div id="minutos-liga"></div>
    <div class="columnas">
      <div>${d.proximos.length ? tarjetaLiga({ ...liga, nombre: "Próximos partidos", pais: "Internacional", escudo: "" }, d.proximos, true) : ""}</div>
      <div>${d.resultados.length ? tarjetaLiga({ ...liga, nombre: "Últimos resultados", pais: "Internacional", escudo: "" }, d.resultados.slice(0, 15), true) : ""}</div>
    </div>`;
  vista.querySelectorAll(".tarjeta[data-liga] .mas").forEach((a) => a.remove());
  rellenarForma(vista);
  rellenarCuotas(d.id, vista.querySelectorAll(".enfrentamientos tr[data-id]"));
  rellenarMinutos(document.getElementById("minutos-liga"), `/api/minutos/${d.id}`, tarjetasMinutosLiga);
}

function listaUltimos(titulo, partidos, idEquipo) {
  if (!partidos?.length) return `<section class="tarjeta"><div class="tarjeta__cabecera"><b>${esc(titulo)}</b></div><div class="vacio">Sin datos.</div></section>`;
  const res = partidos.map((p) => {
    if (p.goles_local == null) return "";
    const propio = p.local.id === idEquipo ? p.goles_local : p.goles_visita;
    const rival = p.local.id === idEquipo ? p.goles_visita : p.goles_local;
    return propio > rival ? "V" : propio === rival ? "E" : "D";
  }).join("");
  // Los partidos llegan del más reciente al más antiguo; la forma se muestra al revés, como en toda la web.
  return `<section class="tarjeta"><div class="tarjeta__cabecera"><b>${esc(titulo)}</b> ${formaEs([...res].reverse().join(""))}</div>
    ${partidos.map((p) => filaPartido(p, true)).join("")}</section>`;
}

// --- Minuto de los goles (cronología de TheSportsDB, solo en las ligas que la tienen) -----------
const TRAMOS = ["1-15'", "16-30'", "31-45'", "46-60'", "61-75'", "76-90'"];
// Columnas por tramo de 15 minutos, con una marca en el descanso.
function columnasTramos(cuentas, clase) {
  const max = Math.max(1, ...cuentas);
  const total = cuentas.reduce((a, b) => a + b, 0);
  return `<div class="tramos ${clase}">${cuentas.map((n, i) => `${i === 3 ? `<div class="tramos__descanso" title="Descanso"><span>Descanso</span></div>` : ""}
    <div class="tramos__col" title="${n} goles entre el ${TRAMOS[i].replace("'", "")} y su minuto final">
      <span class="tramos__n">${n}</span><div class="tramos__pista"><span style="height:${Math.round((n / max) * 100)}%"></span></div>
      <span class="tramos__pct">${total ? Math.round((n / total) * 100) : 0}%</span><span class="tramos__rango">${TRAMOS[i]}</span></div>`).join("")}</div>`;
}
const repartoMitades = (a, b, etiqueta) => {
  const t = a + b;
  return `<div class="mitades"><span><b>${t ? Math.round((a / t) * 100) : 0}%</b> 1ª mitad</span><span class="cuenta">${esc(etiqueta)} · ${t} goles</span><span><b>${t ? Math.round((b / t) * 100) : 0}%</b> 2ª mitad</span></div>`;
};
// "Antes / después del minuto X": se calcula en el navegador con los minutos de todos los goles.
const antesDespues = (minutos, pj) => `<div class="antes-despues" data-min="${esc(JSON.stringify(minutos))}" data-pj="${pj}">
    <label class="antes-despues__control">Con el partido en el minuto <b class="ad-min">30'</b><input type="range" min="1" max="89" value="30" aria-label="Minuto del partido"></label>
    <div class="rejilla-datos">
      <div><div class="dato-grande ad-pa">–</div><div class="cuenta">de los goles llegaron antes</div></div>
      <div><div class="dato-grande ad-pd">–</div><div class="cuenta">de los goles llegaron después</div></div>
      <div><div class="dato-grande ad-ma">–</div><div class="cuenta">goles por partido antes</div></div>
      <div><div class="dato-grande ad-md">–</div><div class="cuenta">goles por partido después</div></div>
    </div></div>`;
function activarAntesDespues(raiz) {
  raiz.querySelectorAll(".antes-despues").forEach((w) => {
    const mins = JSON.parse(w.dataset.min), pj = Number(w.dataset.pj) || 1, input = w.querySelector("input");
    const pintar = () => {
      const x = Number(input.value), antes = mins.filter((m) => m <= x).length, despues = mins.length - antes;
      w.querySelector(".ad-min").textContent = `${x}'`;
      w.querySelector(".ad-pa").textContent = pct(antes, mins.length);
      w.querySelector(".ad-pd").textContent = pct(despues, mins.length);
      w.querySelector(".ad-ma").textContent = num(antes / pj);
      w.querySelector(".ad-md").textContent = num(despues / pj);
    };
    input.addEventListener("input", pintar);
    pintar();
  });
}
// Un partido como línea de 90 minutos: goles a favor rellenos, goles en contra en hueco.
function lineaPartido(p) {
  const rival = p.de_local ? p.visita : p.local;
  const propios = p.de_local ? p.goles_local : p.goles_visita, ajenos = p.de_local ? p.goles_visita : p.goles_local;
  const res = propios > ajenos ? "V" : propios === ajenos ? "E" : "D";
  const pista = p.goles
    ? `<div class="linea-gol">${p.goles.map((g) => `<i class="${g.propio ? "propio" : "rival"}" style="left:${(g.min / 90) * 100}%" title="${g.min}' · ${g.propio ? "gol a favor" : "gol en contra"}"></i>`).join("")}</div>`
    : `<div class="linea-gol sin"><span class="cuenta">sin minutos</span></div>`;
  return `<a class="fila-linea" href="#/partido/${esc(p.id)}"><span class="tenue">${fechaCorta(p.inicio)}</span>
    <span class="fila-linea__rival">${p.de_local ? "vs" : "en"} ${esc(rival.nombre)}</span>
    <span class="res-chip ${res}">${propios}-${ajenos}</span>${pista}<b>${propios + ajenos}</b></a>`;
}
function sinMinutos(d, titulo) {
  const motivo = d?.cobertura === false ? "TheSportsDB no tiene el minuto de los goles en esta competición."
    : d?.cobertura == null ? "Esta competición todavía no se ha revisado: vuelve en unas horas."
    : "Los minutos de los goles se están descargando: vuelve en un rato.";
  return `<section class="tarjeta"><div class="tarjeta__cabecera"><b>${esc(titulo)}</b></div><div class="vacio">${motivo}</div></section>`;
}
function tarjetasMinutosEquipo(d, nombre) {
  const b = d?.equipo;
  if (!b) return sinMinutos(d, "Minuto de los goles");
  const leyenda = `<div class="leyenda cuenta">${b.pj} partidos con el minuto de cada gol · ${b.ambas} con goles de ${esc(nombre)} en las dos mitades (${pct(b.ambas, b.pj)})</div>`;
  return `<section class="tarjeta"><div class="tarjeta__cabecera seccion"><b>Minuto de los goles</b> <span class="cuenta">- ${esc(nombre)}</span></div>
      <div class="tarjeta__cuerpo columnas">
        <div><h3 class="subtitulo-tramos">Marcados</h3>${columnasTramos(b.favor, "favor")}${repartoMitades(b.f1, b.f2, "marcados")}</div>
        <div><h3 class="subtitulo-tramos">Recibidos</h3>${columnasTramos(b.contra, "contra")}${repartoMitades(b.c1, b.c2, "recibidos")}</div>
      </div>${leyenda}</section>
    <section class="tarjeta"><div class="tarjeta__cabecera"><b>Antes y después del minuto</b><span class="cuenta mas">Todos los goles de sus partidos</span></div>
      <div class="tarjeta__cuerpo">${antesDespues([...b.min_favor, ...b.min_contra], b.pj)}</div></section>
    ${d.ultimos?.length ? `<section class="tarjeta"><div class="tarjeta__cabecera"><b>Últimos partidos, minuto a minuto</b>
        <span class="cuenta mas"><i class="punto propio"></i> a favor · <i class="punto rival"></i> en contra</span></div>
      <div class="lineas-gol">${d.ultimos.map(lineaPartido).join("")}</div></section>` : ""}`;
}
function tarjetasMinutosLiga(d) {
  const b = d?.liga;
  if (!b) return sinMinutos(d, "Minuto de los goles");
  const todos = b.favor.map((n, i) => n + b.contra[i]);
  return `<section class="tarjeta"><div class="tarjeta__cabecera"><b>Minuto de los goles</b><span class="cuenta mas">${b.pj} partidos con datos · ${pct(b.gol_1t, b.pj)} con gol antes del descanso</span></div>
      <div class="tarjeta__cuerpo">${columnasTramos(todos, "favor")}${repartoMitades(b.f1 + b.c1, b.f2 + b.c2, "todos los goles")}</div>
      <div class="tarjeta__cuerpo">${antesDespues(b.minutos, b.pj)}</div></section>`;
}
// Se piden aparte para no retrasar la ficha; se pintan solo si el usuario sigue en la misma página.
async function rellenarMinutos(caja, ruta, pintar) {
  const d = await api(ruta).catch(() => null);
  if (!caja.isConnected) return;
  caja.innerHTML = pintar(d);
  activarAntesDespues(caja);
}

const MOTIVOS_CUOTAS = {
  sin_clave: "Falta la clave de The Odds API (ODDS_API_KEY en .env).",
  sin_emparejar: "The Odds API no tiene cuotas para este partido.",
  sin_creditos: "Se acabaron los créditos del mes de The Odds API.",
  limite: "The Odds API rechazó la petición por límite de uso.",
  clave_invalida: "La clave de The Odds API no es válida.",
  error: "No se pudieron cargar las cuotas.",
};
function tarjetaCuotas(c, p) {
  if (!c || c.motivo === "terminado" || c.motivo === "liga_sin_cuotas") return "";
  const cab = `<div class="tarjeta__cabecera"><b>${p.estado === "en_vivo" ? "Cuotas previas al partido" : "Cuotas 1X2"}</b><span class="cuenta mas">The Odds API${p.estado === "en_vivo" ? " · no se actualizan en vivo" : ""}</span></div>`;
  if (!c.disponible) return `<section class="tarjeta">${cab}<div class="vacio">${esc(MOTIVOS_CUOTAS[c.motivo] || MOTIVOS_CUOTAS.error)}</div></section>`;
  const inv = { local: 1 / c.local, empate: 1 / c.empate, visita: 1 / c.visita };
  const suma = inv.local + inv.empate + inv.visita;
  const caja = (k, etiqueta, nombre) => `<div class="cuota-grande">
      <div class="cuenta">${etiqueta} · ${esc(nombre)}</div>
      <div class="dato-grande">${num(c[k])}</div>
      <div class="cuenta">Mejor: <b>${num(c.mejor[k].precio)}</b> (${esc(c.mejor[k].casa)})</div>
      <div class="cuenta">Probabilidad implícita ${Math.round((inv[k] / suma) * 100)}%</div></div>`;
  return `<section class="tarjeta">${cab}
    <div class="tarjeta__cuerpo rejilla-cuotas">${caja("local", "1", p.local.nombre)}${caja("empate", "X", "Empate")}${caja("visita", "2", p.visita.nombre)}</div>
    ${c.casas?.length ? `<div class="desplazable"><table class="tabla"><thead><tr><th class="izq">Casa</th><th>1</th><th>X</th><th>2</th></tr></thead>
      <tbody>${c.casas.map((x) => `<tr><td class="izq">${esc(x.casa)}</td>${["local", "empate", "visita"].map((k) => `<td class="${x[k] === c.mejor[k].precio ? "mejor-cuota" : ""}">${num(x[k])}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : ""}
    <div class="leyenda cuenta">Media de ${c.n_casas} casas (región UE) · actualizado ${new Date(c.actualizado).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })}${c.antiguo ? " (sin refrescar)" : ""}. La probabilidad implícita quita el margen de la casa.</div>
    <p class="aviso-juego">Cuotas informativas, no consejos de apuesta · Juega con responsabilidad · +18</p>
  </section>`;
}

// La ficha se pinta en dos tiempos: primero la cabecera y el pronóstico (en cuanto llega el
// partido) y luego las cuotas, estadísticas y clasificación, y al final los últimos partidos.
async function vistaPartido(id) {
  const sigue = () => location.hash.startsWith(`#/partido/${id}`);
  const prPromesa = api(`/api/prediccion/${id}`).catch(() => null);
  const b = await api(`/api/partido/${id}/base`);
  if (!sigue()) return;
  pintarPartido({ partido: b.partido, estadisticas: [], cronologia: [], cuotas: null }, await prPromesa, true);
  const d = await api(`/api/partido/${id}`);
  if (!sigue()) return;
  pintarPartido(d, await prPromesa, false);
  const p = d.partido;
  // Los últimos partidos llegan aparte para no retrasar el resto de la ficha.
  const u = await api(`/api/partido/${id}/ultimos`).catch(() => null);
  const caja = document.getElementById("ultimos-partido");
  if (caja && sigue()) caja.innerHTML = `${listaUltimos(`Últimos de ${p.local.nombre}`, u?.ultimos_local, p.local.id)}${listaUltimos(`Últimos de ${p.visita.nombre}`, u?.ultimos_visita, p.visita.id)}`;
}

function pintarPartido(d, pr, cargando) {
  const p = d.partido;
  document.title = `${p.local.nombre} vs ${p.visita.nombre} — Masterfutbol`;
  const goles = p.goles_local != null ? `${p.goles_local} - ${p.goles_visita}` : hora(p.inicio);
  const estado = p.estado === "en_vivo" ? `<span class="hora vivo">${esc(p.progreso ? `${p.progreso}'` : p.estado_texto)}</span>` : `<span class="etiqueta">${{ terminado: "Final", programado: new Date(p.inicio).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" }), suspendido: esc(p.estado_texto) }[p.estado]}</span>`;
  const lado = (eq, fila) => `<div><a href="#/equipo/${esc(eq.id)}">${img(eq.escudo, eq.nombre)}<div class="nombre">${esc(eq.nombre)}</div></a>
    ${fila ? `<div class="cuenta">${fila.pos}º · ${fila.pts} pts · PPG ${fila.ppg ?? "–"}</div><div style="margin-top:6px">${forma(fila.forma)}</div>` : ""}</div>`;

  const stats = d.estadisticas.length
    ? d.estadisticas.map((s) => {
        const l = parseFloat(s.local) || 0, v = parseFloat(s.visita) || 0, t = l + v || 1;
        return `<div class="barra-stat"><div class="tipo">${esc(s.tipo)}</div><b>${esc(s.local)}</b><div class="barras"><span class="l" style="width:${(l / t) * 100}%"></span><span class="v" style="width:${(v / t) * 100}%"></span></div><b style="text-align:right">${esc(s.visita)}</b></div>`;
      }).join("")
    : `<div class="vacio">Las estadísticas aparecen durante y después del partido.</div>`;
  const icono = { Goal: "⚽", Card: "🟨", subst: "🔁", Subst: "🔁", Var: "📺" };
  const detalle = (t) => {
    const x = t.detalle || "";
    if (/red card/i.test(x)) return "Tarjeta roja";
    if (/yellow card/i.test(x)) return "Tarjeta amarilla";
    if (/substitution/i.test(x)) return `Cambio${t.asistencia ? ` por ${t.asistencia}` : ""}`;
    if (/own goal/i.test(x)) return "Autogol";
    if (/penalty/i.test(x)) return "Gol de penal";
    if (/goal/i.test(x)) return `Gol${t.asistencia ? ` · asist. ${t.asistencia}` : ""}`;
    return x;
  };
  const crono = d.cronologia.length
    ? `<ul class="cronologia">${d.cronologia.map((t) => `<li class="${t.local ? "" : "visita"}"><b>${esc(t.minuto)}'</b> ${/red card/i.test(t.detalle) ? "🟥" : icono[t.tipo] || ""} ${esc(t.jugador)} ${t.detalle ? `<span class="cuenta">(${esc(detalle(t))})</span>` : ""}</li>`).join("")}</ul>`
    : `<div class="vacio">${(p.goles_local || 0) + (p.goles_visita || 0) > 0 ? "TheSportsDB aún no publica los goles y tarjetas de este partido; suelen aparecer con unos minutos de retraso." : "Sin eventos registrados todavía."}</div>`;

  vista.innerHTML = `
    ${migas(["Inicio", "#/"], ["Fútbol", "#/"], [p.nombre_liga, `#/liga/${p.liga}`], [`${p.local.nombre} vs ${p.visita.nombre}`])}
    <section class="tarjeta"><div class="tarjeta__cabecera"><a href="#/liga/${esc(p.liga)}"><b>${esc(p.nombre_liga)}</b></a> ${p.jornada && Number(p.jornada) <= 60 ? `<span class="cuenta">Jornada ${esc(p.jornada)}</span>` : ""}${p.estado === "programado" ? ` <a class="enlace" href="#/simulador/partido/${esc(p.id)}">Simular apuesta ›</a>` : ""}<span class="mas" style="color:var(--tenue)">${esc([p.estadio, p.ciudad].filter(Boolean).join(", "))}</span></div>
      <div class="tarjeta__cuerpo marcador-grande">${lado(p.local, d.tabla_local)}<div><div class="goles">${esc(goles)}</div>${estado}</div>${lado(p.visita, d.tabla_visita)}</div>
    </section>
    ${tarjetaPronostico(pr?.prediccion, p)}
    ${cargando ? `<section class="tarjeta"><div class="cargando">Cargando cuotas, estadísticas y clasificación…</div></section>` : `${tarjetaCuotas(d.cuotas, p)}
    <div class="columnas">
      <section class="tarjeta"><div class="tarjeta__cabecera"><b>Estadísticas del partido</b></div><div class="tarjeta__cuerpo">${stats}</div></section>
      <section class="tarjeta"><div class="tarjeta__cabecera"><b>Cronología</b></div><div class="tarjeta__cuerpo">${crono}</div></section>
    </div>`}
    <div class="columnas" id="ultimos-partido"><section class="tarjeta"><div class="cargando">Cargando últimos partidos…</div></section></div>`;
}

async function vistaEquipo(id, idComp) {
  const d = await api(`/api/equipo/${id}`);
  document.title = `${d.nombre} — Masterfutbol`;
  const comp = d.competiciones.find((c) => c.id === idComp) || d.competiciones[0];
  const [temp, tablaComp] = comp
    ? await Promise.all([api(`/api/temporada/${comp.id}`).catch(() => null), api(`/api/tabla/${comp.id}`).catch(() => [])])
    : [null, []];
  const yo = temp?.equipos.find((e) => e.id === id);
  const g = yo?.general;

  const fm = calificacion(g?.ppp, [2.2, 1.8, 1.4, 1.0]);
  const mc = calificacion(g?.pj ? g.gf / g.pj : null, [2.2, 1.7, 1.3, 0.9]);
  const rc = calificacion(g?.pj ? g.gc / g.pj : null, [0.8, 1.0, 1.3, 1.7]);
  const caja = (titulo, cal, cuerpo) => `<div class="caja-dato"><div><b>${titulo}</b> - <span class="cal ${cal.clase}">${cal.texto}</span></div>${cuerpo}</div>`;

  const filas = filasClasificacion(tablaComp, temp?.equipos || [], comp?.pais !== "Internacional");
  const miniTabla = filas.length && !comp?.es_copa ? `<section class="tarjeta mini-tabla">
      <div class="tarjeta__cabecera"><b>${esc(comp.nombre)} clasificación</b></div>
      ${temp ? `<div class="cuenta" style="padding:6px 12px 0">${temp.jugados} / ${temp.total} partidos jugados</div>` : ""}
      <table class="tabla"><thead><tr><th>#</th><th class="izq">Equipo</th><th>PJ</th><th>% V</th><th>GF</th><th>GC</th><th>DG</th><th>Pts</th></tr></thead>
      <tbody>${filas.map((f) => `<tr class="${f.equipo.id === id ? "resaltada" : ""}"><td><span class="puesto ${clasePuesto(f.descripcion)}">${f.pos}</span></td>
        <td class="izq"><a href="#/equipo/${esc(f.equipo.id)}">${esc(f.equipo.nombre)}</a></td><td>${f.pj}</td><td>${pct(f.g, f.pj)}</td>
        <td class="gf">${f.gf}</td><td class="gc">${f.gc}</td><td>${f.dg}</td><td><b>${f.pts}</b></td></tr>`).join("")}</tbody></table></section>` : "";

  const ambitos = [["General", "general"], ["Local", "local"], ["Visitante", "visitante"]];
  const tablaResultados = yo ? `<table class="tabla stats-equipo">
      <thead><tr><th></th><th>PJ</th><th>V</th><th>E</th><th>D</th><th>Últimos 5</th><th>PPP</th></tr></thead>
      <tbody>${ambitos.map(([t, k]) => `<tr class="${k === "general" ? "resaltada" : ""}"><th>${t}</th><td>${yo[k].pj}</td><td>${yo[k].v}</td><td>${yo[k].e}</td><td>${yo[k].d}</td><td>${formaEs(yo[k].ultimos5)}</td><td>${ppg(yo[k].ppp)}</td></tr>`).join("")}
      <tr><td colspan="7" class="der cuenta">Diferencia local / visitante: <b>${yo.local.ppp != null && yo.visitante.ppp != null ? `${yo.local.ppp >= yo.visitante.ppp ? "+" : ""}${num(yo.local.ppp - yo.visitante.ppp)} PPP` : "–"}</b></td></tr></tbody></table>` : "";
  const tablaPorcentajes = yo ? `<table class="tabla stats-equipo">
      <thead><tr><th></th><th title="Valla invicta: partidos sin recibir goles">VI</th><th title="Ambos equipos marcan">AEM</th><th title="Partidos sin marcar">PSM</th></tr></thead>
      <tbody>${ambitos.map(([t, k]) => `<tr class="${k === "general" ? "resaltada" : ""}"><th>${t}</th>${["pa0", "aem", "psm"].map((m) => `<td><b>${pct(yo[k][m], yo[k].pj)}</b>${k === "general" ? `<div class="cuenta">(${yo[k][m]} / ${yo[k].pj} partidos)</div>` : ""}</td>`).join("")}</tr>`).join("")}</tbody></table>` : "";
  const tablaGoles = yo ? `<table class="tabla stats-equipo">
      <thead><tr><th></th><th>Goles / partido</th><th>Marcados / partido</th><th>Recibidos / partido</th><th>+1,5</th><th>+2,5</th></tr></thead>
      <tbody>${ambitos.map(([t, k]) => `<tr class="${k === "general" ? "resaltada" : ""}"><th>${t}</th><td><b>${num(yo[k].mg)}</b></td><td>${yo[k].pj ? num(yo[k].gf / yo[k].pj) : "–"}</td><td>${yo[k].pj ? num(yo[k].gc / yo[k].pj) : "–"}</td><td>${pct(yo[k].mas15, yo[k].pj)}</td><td>${pct(yo[k].mas25, yo[k].pj)}</td></tr>`).join("")}</tbody></table>` : "";

  const misPartidos = (temp?.partidos || []).filter((p) => p.local.id === id || p.visita.id === id).reverse();
  const misProximos = (temp?.proximos || []).filter((p) => p.local.id === id || p.visita.id === id);

  vista.innerHTML = `
    ${migas(["Inicio", "#/"], ["Fútbol", "#/"], d.liga && [d.liga.pais], d.liga && [d.liga.nombre, `#/liga/${d.liga.id}`], [d.nombre])}
    <div class="ficha-equipo">
      <aside>
        <h1 class="nombre-equipo">${esc(d.nombre)}</h1>
        <div class="resumen-equipo">
          <div class="resumen-equipo__escudo">${d.escudo ? `<img src="${esc(d.escudo)}" alt="${esc(d.nombre)}">` : ""}</div>
          <div>
            ${caja("Forma", fm, `<div class="fila-dato">${ppg(g?.ppp ?? null)}<span class="cuenta">Resultados finales<br>${formaEs(g?.ultimos5)}</span></div>`)}
            ${caja("Marcados", mc, `<div class="fila-dato"><span class="dato-medio">${g?.pj ? num(g.gf / g.pj) : "–"}</span><span class="cuenta">marcados / partido</span></div>`)}
            ${caja("Recibidos", rc, `<div class="fila-dato"><span class="dato-medio">${g?.pj ? num(g.gc / g.pj) : "–"}</span><span class="cuenta">recibidos / partido</span></div>`)}
          </div>
        </div>
        <p class="cuenta">${esc([d.pais, d.ciudad, d.estadio && (/^estadio/i.test(d.estadio) ? d.estadio : `Estadio ${d.estadio}`), d.fundado && `Fundado en ${d.fundado}`].filter(Boolean).join(" · "))}</p>
        ${comp ? `<p>Temporada: <span class="etiqueta">${esc(temp?.temporada || comp.temporada)}</span></p>` : ""}
        ${miniTabla}
      </aside>
      <div>
        <nav class="pestanas">${d.competiciones.map((c) => `<a href="#/equipo/${esc(id)}/${esc(c.id)}" class="${c.id === comp?.id ? "activo" : ""}">${img(c.escudo)}${esc(c.nombre)}</a>`).join("") || `<span class="cuenta">Sin competiciones en el catálogo.</span>`}</nav>
        ${yo ? `
        <section class="tarjeta"><div class="tarjeta__cabecera seccion"><b>${esc(temp.temporada)} estadísticas</b> <span class="cuenta">- ${esc(d.nombre)} · ${esc(comp.nombre)}</span></div>
          <div class="stats-doble">${tablaResultados}${tablaPorcentajes}</div></section>
        <section class="tarjeta"><div class="tarjeta__cabecera seccion"><b>Goles</b> <span class="cuenta">- ${esc(d.nombre)}</span></div>
          <div class="desplazable">${tablaGoles}</div></section>
        <div id="minutos-equipo"><div class="tarjeta vacio">Cargando el minuto de los goles…</div></div>
        <div class="columnas">
          ${listaUltimos(`Partidos en ${comp.nombre}`, misPartidos, id)}
          <section class="tarjeta"><div class="tarjeta__cabecera"><b>Próximos en ${esc(comp.nombre)}</b></div>${misProximos.length ? misProximos.map((p) => filaPartido(p, true)).join("") : `<div class="vacio">Sin partidos programados.</div>`}</section>
        </div>` : `<div class="tarjeta vacio">TheSportsDB no tiene partidos de ${esc(d.nombre)} en ${esc(comp?.nombre || "esta competición")} esta temporada.</div>
        <div class="columnas">${listaUltimos("Últimos partidos", d.ultimos, d.id)}
          <section class="tarjeta"><div class="tarjeta__cabecera"><b>Próximos partidos</b></div>${d.proximos.length ? d.proximos.map((p) => filaPartido(p, true)).join("") : `<div class="vacio">Sin partidos programados.</div>`}</section></div>`}
      </div>
    </div>`;
  const cajaMin = document.getElementById("minutos-equipo");
  if (cajaMin) rellenarMinutos(cajaMin, `/api/minutos/${comp.id}?equipo=${id}`, (m) => tarjetasMinutosEquipo(m, d.nombre));
}

// --- Sección de estadísticas (modelo: footystats.org/es/stats) --------------------------
const pctTxt = (x) => (x == null ? "–" : `${Math.round(x * 100)}%`);
const clasePct = (x) => (x == null ? "nada" : x >= 0.7 ? "alto" : x >= 0.55 ? "medio" : x >= 0.4 ? "bajo" : "malo");
function fechaRelativa(iso) {
  const d = new Date(iso);
  const f = fechaLocal(d);
  const dia = f === hoy() ? "Hoy" : f === sumarDias(hoy(), 1) ? "Mañana" : fechaCorta(iso);
  return `${dia} ${hora(iso)}`;
}

function celdaStat(col, f) {
  const v = f[col.clave];
  const sub = (t) => (t ? `<div class="cuenta sub">${esc(t)}</div>` : "");
  switch (col.tipo) {
    case "equipo":
      return `<td class="izq"><a class="equipo" href="#/equipo/${esc(v.id)}">${img(v.escudo)}<span>${esc(v.nombre)}</span></a>${sub(f.liga && ligaTxt(f.liga))}</td>`;
    case "liga":
      return `<td class="izq"><a class="equipo" href="#/liga/${esc(v.id)}">${img(v.escudo)}<span>${esc(v.nombre)}</span></a>${sub(v.pais)}</td>`;
    case "partido":
      return `<td class="izq"><a href="#/partido/${esc(v.id)}"><b>${esc(v.local.nombre)}</b> vs <b>${esc(v.visita.nombre)}</b></a>${sub(f.liga && ligaTxt(f.liga))}</td>`;
    case "pct": {
      const ancho = v == null ? 0 : Math.min(100, Math.abs(v) * 100);
      return `<td class="celda-pct"><b class="cal ${v != null && v < 0 ? "malo" : clasePct(v)}">${col.titulo === "Ventaja" && v > 0 ? "+" : ""}${pctTxt(v)}</b><span class="pct-barra"><span class="${v != null && v < 0 ? "malo" : clasePct(v)}" style="width:${ancho}%"></span></span></td>`;
    }
    case "num":
      return `<td>${v == null ? "–" : `${col.clave === "dif" && v > 0 ? "+" : ""}${num(v)}`}</td>`;
    case "fecha":
      return `<td class="tenue">${v ? fechaRelativa(v) : "–"}</td>`;
    case "siguiente":
      return v ? `<td class="izq"><a href="#/partido/${esc(v.id)}">${fechaRelativa(v.inicio)}</a>${sub(`${v.de_local ? "vs" : "en"} ${v.rival.nombre}`)}</td>` : `<td class="tenue">–</td>`;
    case "marcador":
      return `<td><span class="marcador-chip">${esc(v)}</span></td>`;
    case "progreso":
      return `<td><div class="progreso"><span style="width:${(v || 0) * 100}%"></span></div><span class="cuenta">${pctTxt(v)}</span></td>`;
    default:
      return `<td>${esc(v ?? "–")}</td>`;
  }
}

const VISIBLES_STATS = 20;
function seccionStat(s) {
  const filas = s.filas.map((f, i) => `<tr class="${i >= VISIBLES_STATS ? "oculta" : ""}"><td class="tenue">${i + 1}</td>${s.columnas.map((c) => celdaStat(c, f)).join("")}</tr>`).join("");
  return `<section class="tarjeta" id="sec-${esc(s.id)}">
    <div class="tarjeta__cabecera seccion"><b>${esc(s.titulo)}</b></div>
    <p class="cuenta descripcion-stat">${esc(s.descripcion)}</p>
    ${s.filas.length ? `<div class="desplazable"><table class="tabla tabla-stat"><thead><tr><th></th>${s.columnas.map((c) => `<th class="${["equipo", "liga", "partido", "siguiente"].includes(c.tipo) ? "izq" : ""}">${esc(c.titulo)}</th>`).join("")}</tr></thead><tbody>${filas}</tbody></table></div>
    ${s.filas.length > VISIBLES_STATS ? `<button class="ver-mas-stat" type="button">Ver los ${s.filas.length}</button>` : ""}` : `<div class="vacio">Todavía no hay datos suficientes.</div>`}
  </section>`;
}

// "País · Liga", o solo la liga si es una competencia internacional.
const ligaTxt = (l) => (l.pais === "Internacional" ? l.nombre : `${l.pais} · ${l.nombre}`);
function menuStats(tipos, noDisponibles, activo, liga) {
  const q = liga ? `?liga=${liga}` : "";
  return `<nav class="menu-stats">
    <div class="lateral__titulo">Estadísticas</div>
    <a href="#/stats" class="${!activo ? "activo" : ""}">Resumen</a>
    ${Object.entries(tipos).map(([k, t]) => `<a href="#/stats/${k}${q}" class="${k === activo ? "activo" : ""}">${esc(t)}</a>`).join("")}
    <p class="deshabilitado no-disponible" title="TheSportsDB solo da el marcador final de cada partido">Sin datos todavía: ${esc(noDisponibles.join(", ").toLowerCase())}.</p>
  </nav>`;
}

function avisoCalculo(c) {
  if (!c?.calculando) return "";
  return `<div class="aviso">Calculando estadísticas en segundo plano: ${c.hechas} de ${c.total} ligas. La página se actualiza sola.</div>`;
}
const actualizadoTxt = (iso) => (iso ? new Date(iso).toLocaleString("es-CL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }) : "en curso");

async function vistaStats() {
  const d = await api("/api/stats");
  document.title = "Estadísticas de fútbol — Masterfutbol";
  const filaMini = (t, f) => {
    const ent = f.equipo || f.liga;
    const nombre = f.marcador ? `Marcador ${f.marcador}` : ent?.nombre;
    const enlace = f.equipo ? `#/equipo/${f.equipo.id}` : f.liga ? `#/liga/${f.liga.id}` : `#/stats/${t.tipo}`;
    const col = t.columnas.find((c) => c.clave === "pct");
    const valor = col ? pctTxt(f.pct) : f.partidos ?? "";
    const pais = f.liga && (f.liga.pais === "Internacional" ? f.liga.nombre : f.liga.pais);
    return `<li><a href="${enlace}">${ent ? img(ent.escudo) : `<span class="marcador-chip">${esc(f.marcador)}</span>`}<span>${esc(nombre)}${pais ? ` <small class="cuenta">${esc(pais)}</small>` : ""}</span></a><b class="cal ${clasePct(f.pct)}">${valor}</b></li>`;
  };
  vista.innerHTML = `
    ${migas(["Inicio", "#/"], ["Estadísticas"])}
    <h1 class="titulo-pagina">Estadísticas de fútbol para tus predicciones</h1>
    <p class="subtitulo">Rankings de equipos y ligas por tipo de estadística, calculados con los partidos de esta temporada.
      Solo cuentan las competiciones en curso y los equipos con al menos 6 partidos jugados.
      ${d.ligas_activas} ligas activas · ${d.equipos} equipos · actualizado ${actualizadoTxt(d.actualizado)}.</p>
    ${avisoCalculo(d.calculo)}
    <div class="stats-disposicion">
      ${menuStats(d.tipos, d.no_disponibles, "", "")}
      <div class="tarjetas-stats">${d.tarjetas.map((t) => `<section class="tarjeta">
        <div class="tarjeta__cabecera"><b>${esc(t.titulo)}</b></div>
        ${t.filas.length ? `<ol class="mini-lista">${t.filas.map((f) => filaMini(t, f)).join("")}</ol>` : `<div class="vacio">Todavía no hay datos.</div>`}
        <a class="ver-todo" href="#/stats/${t.tipo}">Ver estadísticas completas ›</a></section>`).join("")}</div>
    </div>`;
  if (d.calculo?.calculando) refresco = setTimeout(() => vistaStats().catch(() => {}), 15_000);
}

async function vistaStat(tipo, query) {
  const q = new URLSearchParams(query);
  const liga = q.get("liga") || "";
  const linea = q.get("linea") || "";
  const params = new URLSearchParams();
  if (liga) params.set("liga", liga);
  if (linea) params.set("linea", linea);
  const [d, portada] = await Promise.all([api(`/api/stats/${encodeURIComponent(tipo)}?${params}`), api("/api/stats")]);
  document.title = `${d.titulo} — Estadísticas — Masterfutbol`;
  const enlace = (cambios) => {
    const p = new URLSearchParams({ ...(liga && { liga }), ...(linea && { linea }), ...cambios });
    for (const [k, v] of [...p]) if (!v) p.delete(k);
    return `#/stats/${tipo}${p.toString() ? `?${p}` : ""}`;
  };
  // Selector de liga agrupado por país, en el orden del catálogo.
  const paises = new Map();
  for (const l of d.selector) {
    if (!paises.has(l.pais)) paises.set(l.pais, []);
    paises.get(l.pais).push(l);
  }
  const selector = `<label class="selector-liga">Liga: <select id="sel-liga"><option value="">Todas las ligas activas</option>
    ${[...paises.entries()].map(([p, ls]) => `<optgroup label="${esc(p)}">${ls.map((l) => `<option value="${esc(l.id)}" ${l.id === liga ? "selected" : ""}>${esc(l.nombre)}</option>`).join("")}</optgroup>`).join("")}
  </select></label>`;
  const lineas = d.lineas ? `<div class="filtros">${d.lineas.map((l) => `<a class="boton-filtro ${l === d.linea ? "activo" : ""}" href="${enlace({ linea: String(l) })}">Más / Menos de ${String(l).replace(".", ",")}</a>`).join("")}</div>` : "";
  vista.innerHTML = `
    ${migas(["Inicio", "#/"], ["Estadísticas", "#/stats"], [d.titulo, d.liga ? enlace({ liga: "" }) : null], d.liga && [d.liga.nombre])}
    <h1 class="titulo-pagina">Estadísticas de ${esc(d.titulo)}${d.liga ? ` — ${esc(d.liga.nombre)}` : ""}</h1>
    <p class="subtitulo">Última actualización: ${actualizadoTxt(d.actualizado)} · ${d.liga ? `${esc(d.liga.pais)}, equipos` : "Temporadas en curso, equipos"} con al menos ${d.min_pj} partidos.</p>
    ${avisoCalculo(d.calculo)}
    ${d.nota ? `<div class="aviso">${esc(d.nota)}</div>` : ""}
    <div class="stats-disposicion">
      ${menuStats(portada.tipos, portada.no_disponibles, tipo, liga)}
      <div>
        <div class="barra-stats">${selector}<nav class="indice-stats">${d.secciones.map((s) => `<a href="#" data-ir="sec-${esc(s.id)}">${esc(s.titulo)}</a>`).join("")}</nav></div>
        ${lineas}
        ${d.secciones.map(seccionStat).join("")}
      </div>
    </div>`;
  document.getElementById("sel-liga").addEventListener("change", (e) => { location.hash = enlace({ liga: e.target.value }); });
  vista.querySelectorAll("[data-ir]").forEach((a) => a.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById(a.dataset.ir)?.scrollIntoView({ behavior: "smooth" });
  }));
  vista.querySelectorAll(".ver-mas-stat").forEach((b) => b.addEventListener("click", () => {
    b.closest("section").querySelectorAll("tr.oculta").forEach((tr) => tr.classList.remove("oculta"));
    b.remove();
  }));
  if (d.calculo?.calculando && !liga) refresco = setTimeout(() => vistaStat(tipo, query).catch(() => {}), 15_000);
}

// --- Predicciones (modelo: footystats.org/es/predictions) --------------------------------
// Iconos de trazo (sin emojis), del mismo estilo que los de la cabecera.
const ICONO = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const ICONOS_PRED = {
  calendario: ICONO('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  reloj: ICONO('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  calculo: ICONO('<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'),
  flechas: ICONO('<path d="M7 7h12l-3-3M17 17H5l3 3"/>'),
  balon: ICONO('<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/>'),
  cadena: ICONO('<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>'),
  diana: ICONO('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/>'),
};
const MENU_PREDICCIONES = [
  ["hoy", "calendario", "Hoy"], ["manana", "calendario", "Mañana"], ["recientes", "reloj", "Más recientes"], ["matematicas", "calculo", "Predicciones matemáticas"],
  ["aem", "flechas", "Ambos marcan"], ["local", "balon", "Victorias en casa"], ["visita", "balon", "Victorias fuera de casa"], ["mas15", "balon", "Más de 1,5"],
  ["mas25", "balon", "Más de 2,5"], ["combinadas", "cadena", "Pronósticos combinados"], ["1x2", "balon", "Pronósticos 1X2"], ["exacto", "diana", "Resultado exacto"],
];
const PREDICCIONES_NO_DISPONIBLES = [
  ["Usuarios rentables", "Aquí no hay usuarios que publiquen predicciones"], ["Clasificación", "Aquí no hay usuarios que publiquen predicciones"],
  ["Córners", "Los córners están en Estadísticas; todavía no hay modelo para pronosticarlos"], ["Premium", "No hay contenido de pago"],
];

function nombreMercado(p, mercados) {
  return p.mercado === "exacto" ? `Resultado ${p.exacto}` : mercados[p.mercado] || p.mercado;
}

function estadoPrediccion(p) {
  if (p.resultado?.anulada) return `<span class="estado-pred tenue">Anulada</span>`;
  if (p.resultado) {
    const ok = p.resultado.acierto;
    return `<span class="estado-pred ${ok ? "ok" : "fallo"}" title="${ok ? "Acertada" : "Fallada"}">${ok ? "✓" : "✗"} ${p.resultado.goles_local}-${p.resultado.goles_visita}</span>`;
  }
  if (new Date(p.inicio) <= new Date()) return `<span class="estado-pred vivo">En juego</span>`;
  return `<span class="estado-pred">A jugar <small>${fechaRelativa(p.inicio)}</small></span>`;
}

function detallePrediccion(p, conEnlace = true) {
  const pr = p.probs;
  const barra = (t, x) => `<div class="prob"><span>${t}</span><span class="pct-barra"><span class="${clasePct(x)}" style="width:${Math.round(x * 100)}%"></span></span><b>${pctTxt(x)}</b></div>`;
  const d = p.datos || {};
  const n = (x) => (x == null ? "–" : num(x));
  return `<div class="detalle-pred">
    <div class="rejilla-prob">
      ${barra(`1 · ${p.local.nombre}`, pr.local)}${barra("X · Empate", pr.empate)}${barra(`2 · ${p.visita.nombre}`, pr.visita)}
      ${barra("Ambos marcan", pr.aem_si)}${barra("Más de 1,5", pr.mas15)}${barra("Más de 2,5", pr.mas25)}
      ${barra("Menos de 2,5", pr.menos25)}${barra("Menos de 3,5", pr.menos35)}
    </div>
    <p class="cuenta">Marcadores más probables: ${pr.marcadores.map((m) => `<span class="marcador-chip">${esc(m.marcador)}</span> ${pctTxt(m.prob)}`).join(" · ")}</p>
    <p class="cuenta">${esc(p.local.nombre)} marca ${n(d.local_gf)} y recibe ${n(d.local_gc)} por partido en casa (${d.local_pj ?? 0} PJ);
      ${esc(p.visita.nombre)} marca ${n(d.visita_gf)} y recibe ${n(d.visita_gc)} fuera (${d.visita_pj ?? 0} PJ).
      Goles esperados: <b>${num(p.lh)} - ${num(p.la)}</b>.
      ${p.cuotas_1x2 ? `Cuotas medias 1X2 (${p.cuotas_1x2.n_casas} casas): ${num(p.cuotas_1x2.local)} · ${num(p.cuotas_1x2.empate)} · ${num(p.cuotas_1x2.visita)}.` : ""}
      ${p.valor != null && p.cuota_mercado ? (p.valor > 0 ? `<b>Valor estimado frente a la cuota media: +${Math.round(p.valor * 100)}%</b>.` : `<b>Sin valor frente a la cuota media (${Math.round(p.valor * 100)}%)</b>: es probable, pero esa cuota paga menos de lo que vale.`) : ""}</p>
    ${conEnlace ? `<a class="enlace" href="#/partido/${esc(p.id)}">Ver partido ›</a>` : ""}
  </div>`;
}

// Tarjeta "Pronóstico del modelo" de la ficha del partido: el pick, su probabilidad y el detalle
// de Predicciones, con el botón para añadirlo al cupón del Simulador.
const NOMBRE_PICK = { local: (p) => `Gana ${p.local.nombre}`, empate: () => "Empate", visita: (p) => `Gana ${p.visita.nombre}`, aem_si: () => "Ambos marcan: sí", aem_no: () => "Ambos marcan: no", mas15: () => "Más de 1,5 goles", mas25: () => "Más de 2,5 goles", menos25: () => "Menos de 2,5 goles", menos35: () => "Menos de 3,5 goles" };
function tarjetaPronostico(pr, p) {
  const porJugar = p.estado === "programado";
  if (!pr && !porJugar) return "";
  const cab = `<div class="tarjeta__cabecera"><b>Pronóstico del modelo</b>${porJugar ? `<a class="mas" href="#/simulador/partido/${esc(p.id)}">Todos los mercados ›</a>` : ""}</div>`;
  const aviso = `<p class="aviso-juego">Estimaciones de un modelo estadístico, no consejos de apuesta · +18</p>`;
  if (!pr) return `<section class="tarjeta">${cab}<div class="vacio">El modelo todavía no tiene pronóstico para este partido: necesita que cada equipo haya jugado al menos 4 partidos de esta liga en la temporada. Puedes simularlo igual en el <a class="enlace" href="#/simulador/partido/${esc(p.id)}">Simulador</a>.</div></section>`;
  const nombre = pr.mercado ? (NOMBRE_PICK[pr.mercado]?.(pr) || pr.mercado) : null;
  const res = pr.resultado && !pr.resultado.anulada ? (pr.resultado.acierto ? `<span class="chip chip--verde">✓ Acertado</span>` : `<span class="chip chip--rojo">✗ Fallado</span>`) : "";
  const idSim = ID_DESDE_PICK[pr.mercado];
  const boton = porJugar && idSim ? botonCuota({ partido: p.id, mercado: idSim, nombre, cuota_justa: pr.cuota_justa, prob: pr.prob, encuentro: `${p.local.nombre} vs ${p.visita.nombre}`, inicio: p.inicio, cuota_mercado: pr.cuota_mercado }, true) : "";
  const pick = nombre
    ? `<div class="pick-ficha"><div><span class="cuenta">Pick del modelo</span><b>${esc(nombre)}</b><span class="cuenta">${pctTxt(pr.prob)} · cuota justa ${num(pr.cuota_justa)}${pr.cuota_mercado ? ` · media del mercado ${num(pr.cuota_mercado)}` : ""}${pr.base?.[pr.mercado] != null ? ` · ${Math.round((pr.prob - pr.base[pr.mercado]) * 100)} pts sobre la media de la liga` : ""}</span></div>
        <div class="pick-ficha__accion">${res}${boton ? `${boton}<span class="cuenta"><span class="pick-ficha__txt" data-partido="${esc(p.id)}" data-mercado="${esc(idSim)}">${enCupon(p.id, idSim) ? "En tu cupón ✓" : "Añadir al cupón"}</span> · <a class="enlace" href="#/simulador/evaluar">ver cupón</a></span>` : ""}</div></div>`
    : `<p class="cuenta">El modelo no ve ningún mercado con 5 puntos o más de ventaja sobre la media de la liga: no da pick en este partido.</p>`;
  return `<section class="tarjeta">${cab}<div class="tarjeta__cuerpo">${pick}${detallePrediccion(pr, false)}${aviso}</div></section>`;
}

function filaPrediccion(p, mercados) {
  const cuota = p.cuota_mercado
    ? `<span class="cuota-pred" title="Cuota media del mercado (The Odds API)">${num(p.cuota_mercado)}</span>`
    : `<span class="cuota-pred justa" title="Cuota justa = 1 / probabilidad del modelo">${num(p.cuota_justa)}</span>`;
  return `<details class="pred">
    <summary>
      ${img(p.liga.escudo, p.liga.nombre)}
      <span class="pred__texto"><b>${esc(nombreMercado(p, mercados))}</b> <span>${esc(p.local.nombre)} vs ${esc(p.visita.nombre)}</span>
        <small class="cuenta">${esc(p.liga.pais)} · ${esc(p.liga.nombre)}</small></span>
      ${estadoPrediccion(p)}
      <span class="prob-pred" title="Probabilidad del modelo">${pctTxt(p.prob)}</span>
      ${cuota}
    </summary>
    ${detallePrediccion(p)}
  </details>`;
}

function numerosPredicciones(n) {
  const pctAcierto = n.acierto7.n ? Math.round((n.acierto7.ok / n.acierto7.n) * 100) : null;
  const caja = (valor, texto) => `<div class="caja-numero"><div class="numero">${valor}</div><div>${texto}</div></div>`;
  // Con menos de 7 días guardados, el rótulo dice desde cuándo hay datos en vez de "7 días".
  const pocos = n.dias_datos && n.dias_datos < 7;
  const desde = n.datos_desde ? new Date(n.datos_desde).toLocaleDateString("es-CL", { day: "numeric", month: "long" }) : "";
  const periodo = pocos ? `desde el ${desde} (${n.dias_datos === 1 ? "1 día" : `${n.dias_datos} días`} de datos)` : "en los últimos 7 días";
  return `
    ${caja(n.ultimas24.toLocaleString("es-CL"), "Predicciones en las últimas 24 horas")}
    ${caja(n.total.toLocaleString("es-CL"), `Predicciones guardadas en total${desde ? `<br><small class="cuenta">desde el ${desde}</small>` : ""}`)}
    ${caja(pctAcierto == null ? "–" : `${pctAcierto}%`, `Acierto ${periodo}<br><small class="cuenta">${n.acierto7.ok} de ${n.acierto7.n} partidos ya jugados${pocos ? " · pocos datos todavía: la cifra puede cambiar mucho" : ""}</small>`)}
    ${n.por_mercado.length ? `<div class="caja-numero"><b>Acierto por mercado (${pocos ? `${n.dias_datos === 1 ? "1 día" : `${n.dias_datos} días`}` : "7 días"})</b><table class="tabla mini-tabla">${n.por_mercado.map((m) => `<tr><td class="izq">${esc(m.mercado)}</td><td>${m.ok}/${m.n}</td><td><b>${pctTxt(m.ok / m.n)}</b></td></tr>`).join("")}</table></div>` : ""}
    <p class="cuenta nota-pred">Las predicciones salen de un modelo estadístico (Poisson) con los goles de la temporada de cada equipo en casa y fuera, calibrado con 9.521 partidos ya jugados: en los mercados de goles se acerca a la media de la liga, donde el modelo solo aporta poco.
      No tienen en cuenta lesiones, alineaciones ni rotaciones, y no son un consejo de apuesta. Si apuestas, hazlo con responsabilidad (+18).</p>`;
}

async function vistaPredicciones(vistaId = "hoy") {
  const vistaReal = vistaId || "hoy";
  const params = new URLSearchParams();
  const rangoTxt = (f) => { const r = rangoDelDia(f); return [r.desde, r.hasta]; };
  if (vistaReal === "hoy") [params.desde, params.hasta] = rangoTxt(hoy());
  if (vistaReal === "manana") [params.desde, params.hasta] = rangoTxt(sumarDias(hoy(), 1));
  if (vistaReal === "matematicas") { params.desde = rangoDelDia(hoy()).desde; params.hasta = rangoDelDia(sumarDias(hoy(), 2)).hasta; }
  const q = new URLSearchParams(Object.fromEntries(Object.entries(params).filter(([, v]) => v)));
  const d = await api(`/api/predicciones/${encodeURIComponent(vistaReal)}?${q}`);
  document.title = `${d.titulo} — Masterfutbol`;
  const menu = `<nav class="menu-stats menu-pred">
    <div class="lateral__titulo">Ver contenido</div>
    ${MENU_PREDICCIONES.map(([k, ico, t]) => `<a href="#/predicciones/${k}" class="${k === vistaReal ? "activo" : ""}"><span class="ico">${ICONOS_PRED[ico]}</span>${esc(t)}</a>`).join("")}
    <p class="deshabilitado no-disponible" title="${esc(PREDICCIONES_NO_DISPONIBLES.map(([t, m]) => `${t}: ${m}`).join(" · "))}">No disponible: ${esc(PREDICCIONES_NO_DISPONIBLES.map(([t]) => t).join(", ").toLowerCase())}.</p>
  </nav>`;
  let centro;
  if (vistaReal === "combinadas") {
    centro = d.combinadas.length
      ? d.combinadas.map((c, i) => `<section class="tarjeta"><div class="tarjeta__cabecera"><b>Combinada ${i + 1}</b><span class="mas cuenta">Probabilidad ${pctTxt(c.prob)} · cuota justa <b>${num(c.cuota_justa)}</b></span></div>
          ${c.selecciones.map((p) => filaPrediccion(p, d.mercados)).join("")}</section>`).join("")
      : `<div class="tarjeta vacio">Todavía no hay suficientes predicciones con más del 60% de probabilidad.</div>`;
  } else {
    // En las vistas por día, primero lo que falta por jugar, luego lo que está en juego y al final
    // lo terminado (lo más reciente arriba).
    const porDia = ["hoy", "manana", "matematicas"].includes(vistaReal);
    const ahora = new Date().toISOString();
    const grupos = porDia
      ? [["Por jugar", d.filas.filter((p) => !p.resultado && p.inicio > ahora)],
         ["En juego", d.filas.filter((p) => !p.resultado && p.inicio <= ahora)],
         ["Terminadas", d.filas.filter((p) => p.resultado).sort((a, b) => b.inicio.localeCompare(a.inicio))]].filter(([, f]) => f.length)
      : [];
    centro = !d.filas.length ? null
      : porDia ? grupos.map(([t, f]) => `<h3 class="grupo-pred">${t} <span class="cuenta">(${f.length})</span></h3>${f.map((p) => filaPrediccion(p, d.mercados)).join("")}`).join("")
      : d.filas.map((p) => filaPrediccion(p, d.mercados)).join("");
    centro ??= `<div class="tarjeta vacio">No hay predicciones para esta vista todavía. El modelo predice partidos de las ligas activas en los próximos 3 días cuando ambos equipos jugaron al menos 4 partidos, y solo da pick si ve 5 puntos o más de ventaja sobre la media de la liga.</div>`;
  }
  vista.innerHTML = `
    ${migas(["Inicio", "#/"], ["Predicciones", "#/predicciones"], vistaReal !== "hoy" && [d.titulo])}
    <h1 class="titulo-pagina">Predicciones de fútbol</h1>
    <div class="pred-disposicion">
      <div>${menu}</div>
      <div><h2 class="subtitulo-pred">${esc(d.titulo)}</h2>
        ${vistaReal === "recientes" ? "" : `<p class="cuenta">Solo hay pick cuando el modelo ve al menos 5 puntos de ventaja sobre la media de la liga en ese mercado. Se muestra la probabilidad del modelo y la cuota: la media del mercado si The Odds API la tiene guardada, o la cuota justa (1 / probabilidad). Pulsa una fila para ver el detalle.</p>`}
        <div class="lista-pred">${centro}</div></div>
      <aside><h2 class="subtitulo-pred">En números</h2>${numerosPredicciones(d.numeros)}</aside>
    </div>`;
}

// --- Apuestas diarias (modelo: betmines.com/es/apuestas-diarias-futbol) ------------------
const ESTADO_APUESTA = { ganada: "Ganada", perdida: "Perdida", pendiente: "Pendiente", anulada: "Anulada" };
const fechaTitulo = (f) => new Date(`${f}T12:00:00`).toLocaleDateString("es-CL", { weekday: "long", day: "numeric", month: "long" });

function tarjetaCombinada(c, tipos, compacta = false) {
  if (!c) return "";
  const tipo = tipos[c.tipo];
  const filas = c.selecciones.map((s) => {
    const marcador = s.goles_local != null ? `<span class="ad-marcador"><b>${s.goles_local}</b><b>${s.goles_visita}</b></span>` : `<span class="ad-marcador"></span>`;
    return `<div class="ad-liga">${img(s.liga.escudo)}<span>${esc(s.liga.pais)} - <b>${esc(s.liga.nombre)}</b></span></div>
      <a class="ad-fila ad-fila--${s.estado}" href="#/partido/${esc(s.id)}">
        <span class="ad-hora">${hora(s.inicio)}${{ ganada: `<small class="ad-res ad-res--ganada">✓ Ganada</small>`, perdida: `<small class="ad-res ad-res--perdida">✗ Perdida</small>`, anulada: `<small class="ad-res">Anulada</small>` }[s.estado] || (s.goles_local != null ? `<small class="ad-res">En juego</small>` : "")}</span>
        <span class="ad-equipos"><span>${img(s.local.escudo)}${esc(s.local.nombre)}</span><span>${img(s.visita.escudo)}${esc(s.visita.nombre)}</span></span>
        ${marcador}
        <span class="ad-mercado">${esc(MERCADO_CORTO[s.mercado] || s.mercado)}</span>
        <span class="ad-pick">${esc(PICK_CORTO[s.mercado] || s.mercado)}<small>${pctTxt(s.prob)}</small></span>
        <span class="ad-cuota" title="${s.cuota_tipo === "mercado" ? "Cuota media de las casas (The Odds API)" : "Cuota justa del modelo (1 / probabilidad), sin el margen de la casa"}">${num(s.cuota)}<small>${s.cuota_tipo === "mercado" ? "mercado" : "justa"}</small></span>
      </a>`;
  }).join("");
  return `<section class="tarjeta ad-tarjeta ${compacta ? "ad-tarjeta--compacta" : ""}">
    <div class="ad-titulo"><h3>${esc(tipo.nombre)}</h3><span class="ad-estado ad-estado--${c.estado}">${ESTADO_APUESTA[c.estado]}</span></div>
    <div class="ad-cabecera"><span>${tipo.selecciones} selecciones</span><span>Mercado</span><span>Pick</span><span>Cuota</span></div>
    ${filas}
    <div class="ad-total"><span>Probabilidad del modelo <b>${pctTxt(c.prob_total)}</b></span><span>Cuota total: <b>${num(c.cuota_final ?? c.cuota_total)}</b></span></div>
    ${c.selecciones.some((s) => s.cuota_tipo !== "mercado") ? `<p class="ad-nota cuenta">${c.selecciones.every((s) => s.cuota_tipo !== "mercado") ? "Es la cuota justa del modelo, sin el margen de la casa" : "Incluye cuotas justas del modelo, sin el margen de la casa"}: tu casa pagará algo menos.</p>` : ""}
  </section>`;
}

function bloqueDia(etiqueta, d, tipos) {
  if (!d) return "";
  const vacio = !d.doble && !d.riesgo;
  return `<div class="ad-dia">
    <h2 class="ad-dia__titulo">${esc(etiqueta)} <span>${esc(fechaTitulo(d.fecha))}</span></h2>
    ${vacio ? `<div class="tarjeta vacio">Ese día no hubo suficientes partidos con probabilidad alta para armar las combinadas.</div>` : `<div class="ad-rejilla">${tarjetaCombinada(d.doble, tipos)}${tarjetaCombinada(d.riesgo, tipos)}</div>`}
  </div>`;
}

async function vistaApuestas() {
  const d = await api("/api/apuestas");
  document.title = "Apuestas diarias — Masterfutbol";
  const b = (t) => d.balance[t];
  const caja = (t) => `<div class="ad-balance__caja"><span>${esc(d.tipos[t].nombre)}</span>
    <b>${b(t).ganadas}/${b(t).cerradas}</b><small>ganadas</small>
    <b class="${b(t).unidades >= 0 ? "positivo" : "negativo"}">${b(t).unidades >= 0 ? "+" : ""}${num(b(t).unidades)} u</b><small>apostando 1 a cada una</small></div>`;
  const historial = d.historial.map((h) => h.sin_datos
    ? `<div class="ad-dia"><h2 class="ad-dia__titulo">${esc(fechaTitulo(h.fecha))}</h2><div class="tarjeta vacio">Sin apuestas guardadas ese día (la sección empezó a registrar el 24 de octubre de 2026).</div></div>`
    : bloqueDia("", h, d.tipos)).join("");
  vista.innerHTML = `
    ${migas(["Inicio", "#/"], ["Apuestas diarias"])}
    <h1 class="titulo-pagina">Apuestas diarias del modelo</h1>
    <p class="subtitulo">Cada día el modelo arma dos combinadas con sus predicciones: una <b>Doble</b> con las dos selecciones en las que ve más ventaja y una <b>Riesgo</b> de tres selecciones con más cuota. Se congelan al crearse y se marcan con el resultado real.</p>
    <div class="ad-balance">${caja("doble")}${caja("riesgo")}</div>
    ${bloqueDia("Hoy", d.hoy, d.tipos)}
    ${bloqueDia("Mañana", d.manana, d.tipos)}
    ${!d.hoy && !d.manana ? `<div class="tarjeta vacio">Las combinadas del día se arman cuando hay al menos 5 predicciones para esa fecha. Vuelve en unos minutos.</div>` : ""}
    <h2 class="ad-seccion">Historial · últimos 3 días</h2>
    ${historial}
    <section class="tarjeta ad-explica">
      <h2>¿Qué es la apuesta diaria?</h2>
      <p>Son dos combinadas que el modelo propone para cada día, elegidas entre sus predicciones de ligas activas: como mucho una selección por liga, priorizando las ligas principales y solo partidos que empiezan dentro de más de una hora.</p>
      <p><b>Doble:</b> las 2 selecciones del día con más ventaja sobre la media de su liga, con 62% o más de probabilidad cada una. Su cuota total suele estar entre 1,5 y 2,1, así que se espera acertarla entre la mitad y dos tercios de los días. <b>Riesgo:</b> 3 selecciones de entre 55% y 72%, con cuota de en torno a 3-4. La cuota es la media del mercado cuando The Odds API la tiene (solo 1X2) y, si no, la cuota justa del modelo (1 / probabilidad). Una selección anulada cuenta como cuota 1.</p>
      <p class="cuenta">Son estimaciones estadísticas, no consejos de apuesta: el modelo no sabe de lesiones, alineaciones ni rotaciones. Si apuestas, hazlo con responsabilidad y solo si eres mayor de edad (+18).</p>
    </section>`;
}

// --- Simulador de cupones (analisis/cupon_simulador.md, fase 1) -----------------------------
// Los botones muestran la cuota justa del modelo; en el cupón el usuario escribe la cuota real de
// su casa y "Evaluar cupón" pide al servidor el análisis (probabilidad, valor esperado y consejo).
// El cupón se guarda solo en este navegador.
const CUPON_CLAVE = "masterfutbol-cupon";
const MAX_CUPON = 10;
function leerCupon() {
  try {
    const c = JSON.parse(localStorage.getItem(CUPON_CLAVE));
    if (c && Array.isArray(c.selecciones)) return c;
  } catch {}
  return { selecciones: [], monto: 10000 };
}
let cupon = leerCupon();
function guardarCupon() {
  try { localStorage.setItem(CUPON_CLAVE, JSON.stringify(cupon)); } catch {}
  marcarEvaluacionVieja();
}

// La evaluación en pantalla deja de valer cuando el cupón cambia: se avisa con un botón para
// volver a evaluar y se desactivan las sugerencias de selecciones que ya no están en el cupón.
let firmaEvaluada = null;
const firmaCupon = () => JSON.stringify([cupon.monto, ...cupon.selecciones.map((s) => [s.partido, s.mercado, cuotaNum(s.cuota)])]);
function marcarEvaluacionVieja() {
  const cabecera = document.querySelector(".eval-cabecera");
  if (!cabecera || firmaEvaluada == null) return;
  const vieja = firmaCupon() !== firmaEvaluada;
  const aviso = document.querySelector(".eval-vieja");
  if (vieja && !aviso)
    cabecera.insertAdjacentHTML("beforebegin", `<div class="eval-vieja" role="status"><span>El cupón cambió desde esta evaluación: los números de abajo ya no corresponden.</span><button type="button" class="cupon__evaluar eval-vieja__boton" id="reevaluar">Volver a evaluar</button></div>`);
  else if (!vieja && aviso) aviso.remove();
  cabecera.classList.toggle("eval-desactualizada", vieja);
  document.querySelectorAll("[data-aplicar]").forEach((b) => {
    b.disabled = !cupon.selecciones.some((x) => x.partido === b.dataset.partido && x.mercado === b.dataset.mercado);
  });
}
const claveSel = (partido, mercado) => `${partido}|${mercado}`;
const enCupon = (partido, mercado) => cupon.selecciones.some((s) => claveSel(s.partido, s.mercado) === claveSel(partido, mercado));
const cuotaNum = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return n >= 1.01 ? n : null;
};

// sel: { partido, mercado, nombre, etiqueta?, cuota_justa, prob, encuentro, inicio, cuota_mercado? }
function botonCuota(sel, conProb = false) {
  const activo = enCupon(sel.partido, sel.mercado);
  return `<button type="button" class="cuota-btn ${activo ? "activa" : ""}" aria-pressed="${activo}" data-sel="${esc(JSON.stringify(sel))}" title="${esc(sel.nombre)} · probabilidad del modelo ${pctTxt(sel.prob)} · cuota justa ${num(sel.cuota_justa)}">
    <span>${esc(sel.etiqueta || sel.nombre)}</span><b>${num(sel.cuota_justa)}</b>${conProb ? `<small>${pctTxt(sel.prob)}</small>` : ""}</button>`;
}

function marcarBotonesCuota() {
  document.querySelectorAll(".pick-ficha__txt").forEach((t) => { t.textContent = enCupon(t.dataset.partido, t.dataset.mercado) ? "En tu cupón ✓" : "Añadir al cupón"; });
  document.querySelectorAll(".cuota-btn").forEach((b) => {
    const s = JSON.parse(b.dataset.sel);
    const activo = enCupon(s.partido, s.mercado);
    b.classList.toggle("activa", activo);
    b.setAttribute("aria-pressed", activo);
  });
}

// La cuota de tu casa empieza vacía aunque haya media del mercado: si se rellenara sola, el
// analista la trataría como la cuota de tu casa. La media se muestra como ayuda y el servidor la
// usa si dejas el campo vacío.
let cuponVaciado = null; // selecciones antes de "Vaciar", para poder deshacerlo
function alternarSeleccion(sel) {
  const k = claveSel(sel.partido, sel.mercado);
  if (enCupon(sel.partido, sel.mercado)) cupon.selecciones = cupon.selecciones.filter((s) => claveSel(s.partido, s.mercado) !== k);
  else if (cupon.selecciones.length >= MAX_CUPON) return alert(`El cupón admite como máximo ${MAX_CUPON} selecciones.`);
  else cupon.selecciones.push({ ...sel, cuota: "" });
  cuponVaciado = null;
  guardarCupon();
  marcarBotonesCuota();
  pintarCupon();
}

// La cuota total usa la de tu casa y, donde no la escribiste, la media del mercado si existe
// (lo mismo que hace el analista al evaluar).
function totalesCupon() {
  const cuotas = cupon.selecciones.map((s) => cuotaNum(s.cuota) || cuotaNum(s.cuota_mercado));
  const conMedia = cupon.selecciones.filter((s) => !cuotaNum(s.cuota) && cuotaNum(s.cuota_mercado)).length;
  const completas = cuotas.length > 0 && cuotas.every(Boolean);
  const total = completas ? cuotas.reduce((t, c) => t * c, 1) : null;
  const monto = Math.max(0, Number(cupon.monto) || 0);
  return { completas, conMedia, total, monto, ganancia: total ? total * monto : null };
}

function pintarTotalesCupon() {
  const t = totalesCupon();
  const el = (id) => document.getElementById(id);
  if (!el("cupon-total")) return;
  el("cupon-total").textContent = t.total ? num(t.total) : "–";
  const pesos = (x) => `$${Math.round(x).toLocaleString("es-CL")}`;
  el("cupon-ganancia").textContent = t.ganancia ? pesos(t.ganancia) : "–";
  el("cupon-ganancia-neta").textContent = t.ganancia ? `ganas ${pesos(t.ganancia - t.monto)} sobre lo apostado${t.conMedia ? ` · con la media del mercado en ${t.conMedia === 1 ? "1 selección" : `${t.conMedia} selecciones`}` : ""}` : "";
  const faltan = cupon.selecciones.filter((s) => !(Number(String(s.cuota || "").replace(",", ".")) >= 1.01)).length;
  el("cupon-evaluar").disabled = !cupon.selecciones.length;
  el("cupon-ayuda").hidden = !faltan || !cupon.selecciones.length;
  el("cupon-ayuda").textContent = `${faltan === 1 ? "1 selección" : `${faltan} selecciones`} sin tu cuota: se evalúa igual y te decimos la cuota mínima que necesitas.`;
  const resumen = el("cupon-resumen");
  if (resumen) resumen.textContent = `${cupon.selecciones.length} ${cupon.selecciones.length === 1 ? "selección" : "selecciones"}${t.total ? ` · cuota ${num(t.total)}` : ""}`;
}

function pintarCupon() {
  const caja = document.getElementById("cupon");
  if (!caja) return;
  const n = cupon.selecciones.length;
  caja.innerHTML = `
    <button type="button" class="cupon__barra" aria-expanded="${caja.classList.contains("abierto")}" aria-controls="cupon-cuerpo">
      <span>Cupón <b class="cupon__n">${n}</b></span><span id="cupon-resumen" class="cuenta"></span>
    </button>
    <div class="cupon__cuerpo" id="cupon-cuerpo">
      <div class="cupon__titulo"><b>Cupón simulado</b>${n ? `<button type="button" class="cupon__vaciar" id="cupon-vaciar">Vaciar</button>` : ""}</div>
      ${n ? `<ol class="cupon__lista">${cupon.selecciones.map((s, i) => `<li>
          <div class="cupon__sel"><b>${esc(s.nombre)}</b><button type="button" class="cupon__quitar" data-i="${i}" aria-label="Quitar ${esc(s.nombre)}">×</button></div>
          <div class="cuenta">${esc(s.encuentro)} · ${fechaRelativa(s.inicio)}${new Date(s.inicio) <= new Date() ? ` · <b class="cupon__empezado">ya empezó: quítalo</b>` : ""}</div>
          <label class="cupon__cuota"><span>Cuota de tu casa</span>
            <input type="text" inputmode="decimal" data-i="${i}" value="${esc(s.cuota || "")}" placeholder="p. ej. ${num(s.cuota_mercado || s.cuota_justa)}" aria-label="Cuota de tu casa para ${esc(s.nombre)}">
          </label>
          <div class="cuenta">Cuota justa del modelo: <b>${num(s.cuota_justa)}</b> (${pctTxt(s.prob)})${s.cuota_mercado ? ` · media del mercado ${num(s.cuota_mercado)}${s.cuota ? "" : " (se usa si no escribes la tuya)"}` : ""}</div>
        </li>`).join("")}</ol>` : cuponVaciado?.length
        ? `<p class="cuenta cupon__vacio">Cupón vaciado (${cuponVaciado.length === 1 ? "1 selección" : `${cuponVaciado.length} selecciones`}). <button type="button" class="enlace-boton" id="cupon-deshacer">Deshacer</button></p>`
        : `<p class="cuenta cupon__vacio">Pulsa una cuota para añadirla. Después escribe la cuota real que te ofrece tu casa de apuestas y evalúa el cupón.</p>`}
      <div class="cupon__pie">
      <label class="cupon__monto"><span>Monto simulado ($)</span><input type="text" inputmode="numeric" id="cupon-monto" aria-label="Monto simulado en pesos" value="${esc(String(cupon.monto ?? ""))}"></label>
      <div class="cupon__fila"><span>Cuota total</span><b id="cupon-total">–</b></div>
      <div class="cupon__fila"><span>Pago si aciertas</span><b id="cupon-ganancia">–</b></div>
      <div class="cuenta cupon__neta" id="cupon-ganancia-neta"></div>
      <p class="cuenta" id="cupon-ayuda" hidden></p>
      <button type="button" class="boton-primario cupon__evaluar" id="cupon-evaluar" disabled>Evaluar cupón</button>
      <p class="cuenta cupon__aviso">Simulación sin dinero real. No es un consejo de apuesta. +18.</p>
      </div>
    </div>`;
  pintarTotalesCupon();
}

document.addEventListener("click", (e) => {
  const b = e.target.closest(".cuota-btn");
  if (b) return alternarSeleccion(JSON.parse(b.dataset.sel));
  const q = e.target.closest(".cupon__quitar");
  if (q) {
    cupon.selecciones.splice(Number(q.dataset.i), 1);
    guardarCupon();
    marcarBotonesCuota();
    return pintarCupon();
  }
  if (e.target.closest("#cupon-vaciar")) {
    cuponVaciado = cupon.selecciones;
    cupon.selecciones = [];
    guardarCupon();
    marcarBotonesCuota();
    return pintarCupon();
  }
  if (e.target.closest("#cupon-deshacer")) {
    cupon.selecciones = cuponVaciado || [];
    cuponVaciado = null;
    guardarCupon();
    marcarBotonesCuota();
    return pintarCupon();
  }
  if (e.target.closest("#reevaluar")) return enrutar();
  if (e.target.closest("#quitar-empezados")) {
    cupon.selecciones = cupon.selecciones.filter((s) => new Date(s.inicio) > new Date());
    guardarCupon();
    marcarBotonesCuota();
    pintarCupon();
    return enrutar();
  }
  if (e.target.closest(".cupon__barra")) {
    const caja = document.getElementById("cupon");
    caja.classList.toggle("abierto");
    e.target.closest(".cupon__barra").setAttribute("aria-expanded", caja.classList.contains("abierto"));
    return;
  }
  if (e.target.closest("#cupon-evaluar")) {
    if (location.hash === "#/simulador/evaluar") enrutar();
    else location.hash = "#/simulador/evaluar";
  }
});
document.addEventListener("input", (e) => {
  if (e.target.matches(".cupon__cuota input")) {
    cupon.selecciones[Number(e.target.dataset.i)].cuota = e.target.value.trim();
    guardarCupon();
    pintarTotalesCupon();
  } else if (e.target.id === "cupon-monto") {
    cupon.monto = Number(e.target.value.replace(/\D/g, "")) || 0;
    guardarCupon();
    pintarTotalesCupon();
  }
});

// --- Páginas del Simulador ---------------------------------------------------------------
function simuladorPagina(contenido, pestana = "") {
  document.title = `${{ evaluar: "Evaluación del cupón", competencias: "Competencias", proximos: "Próximos partidos" }[pestana] || "Simulador de apuestas"} — Masterfutbol`;
  const tab = (id, texto) => `<a href="#/simulador${id ? `/${id}` : ""}" class="${pestana === id ? "activo" : ""}">${texto}</a>`;
  vista.innerHTML = `
    ${migas(["Inicio", "#/"], ["Simulador", "#/simulador"])}
    <div class="sim-aviso">Simulador sin dinero real · Los botones muestran la <b>cuota justa</b> del modelo; en el cupón escribes la cuota de tu casa · No es un consejo de apuesta · +18</div>
    <div class="sim">
      <div class="sim__principal">
        <nav class="sim-pestanas" aria-label="Simulador">${tab("", "Destacados")}${tab("competencias", "Competencias")}${tab("proximos", "Próximos")}</nav>
        ${contenido}
      </div>
      <aside class="cupon" id="cupon" aria-label="Cupón"></aside>
    </div>`;
  pintarCupon();
}

const ID_DESDE_PICK = { local: "1x2:1", empate: "1x2:X", visita: "1x2:2", aem_si: "aem:si", aem_no: "aem:no", mas15: "tot:mas:1.5", mas25: "tot:mas:2.5", menos25: "tot:menos:2.5", menos35: "tot:menos:3.5" };
function nombreMercadoSim(id, local, visita) {
  const [g, a, b] = id.split(":");
  if (g === "1x2") return { 1: `Gana ${local}`, X: "Empate", 2: `Gana ${visita}` }[a];
  if (g === "dc") return { "1X": `${local} o empate`, "12": `${local} o ${visita}`, X2: `Empate o ${visita}` }[a];
  if (g === "aem") return a === "si" ? "Ambos marcan: sí" : "Ambos marcan: no";
  if (g === "tot") return `${a === "mas" ? "Más" : "Menos"} de ${b.replace(".", ",")} goles`;
  return id;
}

async function vistaSimuladorDestacados() {
  const d = await api("/api/predicciones/destacados");
  const filas = d.filas.map((p) => {
    const id = ID_DESDE_PICK[p.mercado];
    const sel = { partido: p.id, mercado: id, nombre: nombreMercadoSim(id, p.local.nombre, p.visita.nombre), cuota_justa: p.cuota_justa, prob: p.prob, encuentro: `${p.local.nombre} vs ${p.visita.nombre}`, inicio: p.inicio, cuota_mercado: p.cuota_mercado };
    return `<div class="sim-fila">
      <div class="sim-fila__partido"><a href="#/simulador/partido/${esc(p.id)}"><b>${esc(p.local.nombre)}</b> vs <b>${esc(p.visita.nombre)}</b></a>
        <span class="cuenta">${esc(p.liga.pais)} · ${esc(p.liga.nombre)} · ${fechaRelativa(p.inicio)} · ventaja ${Math.round((p.ventaja ?? 0) * 100)} pts sobre la liga${p.cuota_mercado && p.valor != null ? ` · frente a la cuota media ${num(p.cuota_mercado)}: valor ${p.valor >= 0 ? "+" : ""}${Math.round(p.valor * 100)}%` : ""}</span></div>
      <div class="sim-fila__cuotas">${botonCuota(sel, true)}</div>
    </div>`;
  }).join("");
  simuladorPagina(`<h1 class="titulo-pagina">Simulador de apuestas</h1>
    <p class="subtitulo">Los picks en los que el modelo ve más ventaja en las próximas 36 horas. Pulsa una cuota para añadirla al cupón, o busca cualquier partido en Competencias o Próximos.</p>
    <section class="tarjeta">${filas || `<div class="vacio">No hay picks destacados ahora mismo.</div>`}</section>`, "");
}

async function vistaSimuladorCompetencias() {
  const cat = await catalogoListo;
  const POPULARES = [["4328", "Premier League"], ["4335", "LaLiga"], ["4332", "Serie A"], ["4331", "Bundesliga"], ["4334", "Ligue 1"], ["4344", "Primeira Liga"], ["4627", "Primera de Chile"], ["4501", "Copa Libertadores"], ["4480", "Champions League"]];
  const escudo = (id) => [...cat.internacionales, ...cat.paises.flatMap((p) => p.ligas)].find((l) => l.id === id)?.escudo;
  const enlace = (l, nombre) => `<a class="sim-liga" href="#/simulador/liga/${esc(l.id)}">${img(l.escudo)}<span>${esc(nombre || l.nombre_es || l.nombre)}</span></a>`;
  const regiones = new Map();
  for (const p of cat.paises) {
    const ligas = p.ligas.filter((l) => !l.es_copa && l.genero === "Male" && l.division <= 2);
    if (!ligas.length) continue;
    if (!regiones.has(p.region)) regiones.set(p.region, []);
    regiones.get(p.region).push(`<details class="sim-pais"><summary>${esc(p.nombre_es)} <span class="cuenta">${ligas.length}</span></summary>${ligas.map((l) => enlace(l)).join("")}</details>`);
  }
  simuladorPagina(`<h1 class="titulo-pagina">Competencias</h1>
    <h2 class="sim-subtitulo">Populares</h2>
    <div class="sim-populares">${POPULARES.map(([id, n]) => enlace({ id, escudo: escudo(id) }, n)).join("")}</div>
    <div class="sim-regiones">
      <section class="tarjeta"><div class="tarjeta__cabecera"><b>Competencias internacionales</b></div>${cat.internacionales.filter((l) => !/Recopa|Femenin/i.test(l.nombre)).map((l) => enlace(l)).join("")}</section>
      ${[...regiones.entries()].map(([r, html]) => `<section class="tarjeta"><div class="tarjeta__cabecera"><b>${esc(r)}</b></div>${html.join("")}</section>`).join("")}
    </div>`, "competencias");
}

function filaPartidoSim(p, ids) {
  const encuentro = `${p.local.nombre} vs ${p.visita.nombre}`;
  const porId = Object.fromEntries(p.mercados.map((m) => [m.id, m]));
  const etiquetas = { "1x2:1": "1", "1x2:X": "X", "1x2:2": "2", "dc:1X": "1X", "dc:12": "12", "dc:X2": "X2", "tot:mas:2.5": "Más 2,5", "tot:menos:2.5": "Menos 2,5", "aem:si": "Sí", "aem:no": "No" };
  return `<div class="sim-fila">
    <div class="sim-fila__partido"><a href="#/simulador/partido/${esc(p.id)}">${img(p.local.escudo)}<b>${esc(p.local.nombre)}</b></a><a href="#/simulador/partido/${esc(p.id)}">${img(p.visita.escudo)}<b>${esc(p.visita.nombre)}</b></a>
      <span class="cuenta">${fechaRelativa(p.inicio)} · <a class="enlace" href="#/simulador/partido/${esc(p.id)}">Todos los mercados ›</a></span></div>
    <div class="sim-fila__cuotas">${p.con_modelo ? ids.map((id) => porId[id] ? botonCuota({ partido: p.id, mercado: id, nombre: nombreMercadoSim(id, p.local.nombre, p.visita.nombre), etiqueta: etiquetas[id], cuota_justa: porId[id].cuota_justa, prob: porId[id].prob, encuentro, inicio: p.inicio, cuota_mercado: porId[id].cuota_mercado }) : "").join("") : `<span class="cuenta">Sin datos del modelo</span>`}</div>
  </div>`;
}

const MERCADOS_LISTA = {
  resultado: { titulo: "Resultado", ids: ["1x2:1", "1x2:X", "1x2:2"] },
  doble: { titulo: "Doble oportunidad", ids: ["dc:1X", "dc:12", "dc:X2"] },
  goles: { titulo: "Más/Menos 2,5", ids: ["tot:mas:2.5", "tot:menos:2.5"] },
  aem: { titulo: "Ambos marcan", ids: ["aem:si", "aem:no"] },
};
function listaPartidosSim(partidos, mercado) {
  return partidos.map((p) => filaPartidoSim(p, MERCADOS_LISTA[mercado].ids)).join("");
}
function chipsMercado(actual, base) {
  return `<div class="filtros">${Object.entries(MERCADOS_LISTA).map(([k, m]) => `<a class="boton-filtro ${k === actual ? "activo" : ""}" href="${base}?mercado=${k}">${m.titulo}</a>`).join("")}</div>`;
}

async function vistaSimuladorProximos(query) {
  const mercado = MERCADOS_LISTA[new URLSearchParams(query).get("mercado")] ? new URLSearchParams(query).get("mercado") : "resultado";
  const d = await api("/api/simulador/proximos");
  const porLiga = new Map();
  for (const p of d.partidos) {
    const k = p.liga.id;
    if (!porLiga.has(k)) porLiga.set(k, { liga: p.liga, partidos: [] });
    porLiga.get(k).partidos.push(p);
  }
  simuladorPagina(`<h1 class="titulo-pagina">Próximos partidos</h1>
    <p class="subtitulo">Las próximas 48 horas en las ligas activas, con la cuota justa del modelo.</p>
    ${chipsMercado(mercado, "#/simulador/proximos")}
    ${[...porLiga.values()].map((g) => `<section class="tarjeta"><div class="tarjeta__cabecera">${img(g.liga.escudo)} <span><b>${esc(g.liga.pais)}</b> - ${esc(g.liga.nombre)}</span><a class="mas" href="#/simulador/liga/${esc(g.liga.id)}">Ver liga ›</a></div>${listaPartidosSim(g.partidos, mercado)}</section>`).join("") || `<div class="tarjeta vacio">No hay partidos en las próximas 48 horas.</div>`}`, "proximos");
}

async function vistaSimuladorLiga(id, query) {
  const mercado = MERCADOS_LISTA[new URLSearchParams(query).get("mercado")] ? new URLSearchParams(query).get("mercado") : "resultado";
  const d = await api(`/api/simulador/liga/${id}`);
  simuladorPagina(`
    <div class="sim-liga-cabecera">${img(d.liga.escudo)}<div><h1>${esc(d.liga.nombre)}</h1><p class="cuenta">${esc(d.liga.pais)} · <a class="enlace" href="#/liga/${esc(id)}">Clasificación y estadísticas ›</a></p></div></div>
    ${chipsMercado(mercado, `#/simulador/liga/${id}`)}
    <section class="tarjeta">${d.partidos.length ? listaPartidosSim(d.partidos, mercado) : `<div class="vacio">No hay partidos programados en los próximos 7 días.</div>`}</section>`, "competencias");
}

async function vistaSimuladorPartido(id) {
  const d = await api(`/api/simulador/partido/${id}`);
  const p = d.partido;
  const encuentro = `${p.local.nombre} vs ${p.visita.nombre}`;
  const CONF = { alta: "Modelo probado", media: "Modelo calibrado", baja: "Aporta poco: pesa más la cuota" };
  const grupos = d.grupos.map((g) => `<details class="tarjeta sim-grupo" open>
      <summary class="tarjeta__cabecera"><b>${esc(g.titulo)}</b><span class="etiqueta conf-${esc(g.confianza)}">${CONF[g.confianza] || ""}</span></summary>
      <p class="sim-dato cuenta">${esc(g.dato)}</p>
      <div class="sim-mercados">${g.mercados.map((m) => botonCuota({ partido: p.id, mercado: m.id, nombre: m.nombre, cuota_justa: m.cuota_justa, prob: m.prob, encuentro, inicio: p.inicio, cuota_mercado: d.cuotas_1x2 && { "1x2:1": d.cuotas_1x2.local, "1x2:X": d.cuotas_1x2.empate, "1x2:2": d.cuotas_1x2.visita }[m.id] }, true)).join("")}</div>
    </details>`).join("");
  simuladorPagina(`
    <section class="tarjeta sim-partido">
      <div class="cuenta">${esc(p.pais)} · <a class="enlace" href="#/simulador/liga/${esc(p.liga)}">${esc(p.nombre_liga)}</a> · ${fechaRelativa(p.inicio)}</div>
      <div class="sim-partido__equipos">
        <span>${img(p.local.escudo)}<b>${esc(p.local.nombre)}</b></span><span class="cuenta">vs</span><span>${img(p.visita.escudo)}<b>${esc(p.visita.nombre)}</b></span>
      </div>
      ${d.con_modelo ? `<p class="cuenta">Goles esperados: <b>${num(d.goles_esperados[0])} – ${num(d.goles_esperados[1])}</b>${d.muestra_corta ? " · Ojo: algún equipo tiene menos de 6 partidos de local o visitante" : ""}${d.cuotas_1x2 ? ` · Cuotas medias del mercado 1X2: ${num(d.cuotas_1x2.local)} / ${num(d.cuotas_1x2.empate)} / ${num(d.cuotas_1x2.visita)}` : ""} · <a class="enlace" href="#/partido/${esc(p.id)}">Ficha del partido ›</a></p>` : ""}
    </section>
    ${d.con_modelo ? grupos : `<div class="tarjeta vacio">El modelo no tiene datos de este partido (liga no activa o equipos con menos de 4 partidos). Puedes añadirlo desde otra sección, pero solo se evaluaría con la cuota.</div>`}`, "competencias");
}

async function vistaSimuladorEvaluar() {
  const t = totalesCupon();
  if (!cupon.selecciones.length) {
    simuladorPagina(`<h1 class="titulo-pagina">Evaluación del cupón</h1><div class="tarjeta vacio">El cupón está vacío: añade selecciones desde Destacados, Competencias o Próximos.</div>`, "evaluar");
    return;
  }
  const empezados = cupon.selecciones.filter((s) => new Date(s.inicio) <= new Date());
  if (empezados.length) {
    const partidosEmp = empezados.map((s) => s.encuentro).filter((x, i, a) => a.indexOf(x) === i);
    const nSel = empezados.length === 1 ? "1 selección" : `${empezados.length} selecciones`;
    simuladorPagina(`<h1 class="titulo-pagina">Evaluación del cupón</h1><div class="tarjeta vacio">${nSel} del cupón ${partidosEmp.length === 1 ? "es de un partido que ya empezó" : `son de ${partidosEmp.length} partidos que ya empezaron`} (${esc(partidosEmp.join(", "))}) y no se ${empezados.length === 1 ? "puede" : "pueden"} simular.
      <div style="margin-top:12px"><button type="button" class="cupon__evaluar eval-vieja__boton" id="quitar-empezados">Quitarlos y evaluar el resto</button></div></div>`, "evaluar");
    return;
  }
  simuladorPagina(`<h1 class="titulo-pagina">Evaluación del cupón</h1><div class="cargando">Analizando el cupón…</div>`, "evaluar");
  const firma = firmaCupon();
  firmaEvaluada = null;
  const boton = document.getElementById("cupon-evaluar");
  if (boton) { boton.textContent = "Evaluando…"; boton.disabled = true; }
  const r = await fetch("/api/cupon/evaluar", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ monto: t.monto, selecciones: cupon.selecciones.map((s) => ({ partido: s.partido, mercado: s.mercado, cuota: cuotaNum(s.cuota) || null })) }),
  }).then((x) => x.json()).catch(() => ({ error: "No se pudo evaluar el cupón." }));
  if (boton) { boton.textContent = "Evaluar cupón"; boton.disabled = !cupon.selecciones.length; }
  const contenedor = vista.querySelector(".sim__principal");
  if (!contenedor) return;
  if (r.error) {
    contenedor.querySelector(".cargando").outerHTML = `<div class="error">${esc(r.error)}</div>`;
    return;
  }
  const clase = { "Correcta": "ok", "Aceptable con reservas": "medio", "Arriesgada": "riesgo", "Sin valor": "mal" }[r.veredicto];
  const dinero = (x) => `$${Math.round(x).toLocaleString("es-CL")}`;
  const T = r.total;
  const sem = { verde: "Con valor", amarillo: "Justa", rojo: "Paga poco", gris: "Sin datos del modelo", sin_cuota: "Falta tu cuota" };
  const signo = (x) => (x == null ? "–" : `${x >= 0 ? "+" : ""}${pctTxt(x)}`);
  const claseV = (x) => (x == null ? "" : x >= 0 ? "positivo" : "negativo");
  contenedor.querySelector(".cargando").outerHTML = `
    <section class="tarjeta eval-cabecera eval-${clase}">
      <div class="eval-veredicto"><span class="cuenta">Veredicto del analista</span><b>${esc(r.veredicto)}</b>${r.motivos.length ? `<span class="cuenta">Porque ${esc(r.motivos.join("; "))}.</span>` : ""}</div>
      <div class="eval-cifras">
        <div><span>Probabilidad de acertar</span><b>${pctTxt(T.prob)}</b></div>
        <div><span>Cuota total</span><b>${T.cuota == null ? "–" : num(T.cuota)}</b></div>
        <div><span>${T.cuota == null ? "Cuota mínima" : "Cuota justa"}</span><b>${num(T.cuota_justa)}</b></div>
        <div><span>Valor esperado</span><b class="${claseV(T.valor)}">${signo(T.valor)}</b></div>
        ${T.monto && T.cuota != null ? `<div><span>Si aciertas</span><b>${dinero(T.ganancia_posible)}</b></div><div><span>Resultado esperado</span><b class="${claseV(T.resultado_esperado)}">${T.resultado_esperado >= 0 ? "+" : "−"}${dinero(Math.abs(T.resultado_esperado))}</b></div>` : ""}
      </div>
    </section>
    ${r.sugerencias.length ? `<section class="tarjeta"><div class="tarjeta__cabecera"><b>Qué cambiaría el analista</b></div>
      <ul class="eval-sugerencias">${r.sugerencias.map((s, i) => `<li><p>${esc(s.texto)}</p>${s.tipo === "quitar" || s.tipo === "revisar" ? `<button type="button" class="boton-filtro" data-aplicar="${i}" data-partido="${esc(s.partido_id)}" data-mercado="${esc(s.mercado_actual)}">Quitar del cupón</button>` : s.tipo === "cambiar" ? `<button type="button" class="boton-filtro" data-aplicar="${i}" data-partido="${esc(s.partido_id)}" data-mercado="${esc(s.mercado_actual)}">Cambiar por "${esc(s.alternativa)}"</button>` : ""}</li>`).join("")}</ul></section>` : ""}
    <section class="tarjeta"><div class="tarjeta__cabecera"><b>Selección por selección</b></div>
      <div class="desplazable"><table class="tabla eval-tabla"><thead><tr><th class="izq">Selección</th><th>Tu cuota</th><th>Cuota justa estimada</th><th>Prob. estimada</th><th>Valor</th><th>Confianza</th><th></th></tr></thead>
      <tbody>${r.selecciones.map((s) => `<tr><td class="izq"><b>${esc(s.nombre)}</b><div class="cuenta">${esc(s.partido.local.nombre)} vs ${esc(s.partido.visita.nombre)}</div></td>
        <td>${s.cuota == null ? "–" : num(s.cuota)}${s.fuente_cuota === "mercado" ? `<div class="cuenta">media del mercado</div>` : ""}</td><td>${num(s.cuota_justa)}</td><td>${pctTxt(s.prob)}<div class="cuenta">modelo ${s.prob_modelo == null ? "–" : pctTxt(s.prob_modelo)} · cuota ${s.prob_cuota == null ? "–" : pctTxt(s.prob_cuota)}</div></td>
        <td class="${claseV(s.valor)}">${signo(s.valor)}</td><td class="cuenta">${esc(s.confianza)}</td>
        <td><span class="semaforo semaforo--${s.semaforo}">${sem[s.semaforo]}</span></td></tr>`).join("")}</tbody></table></div>
      <div class="leyenda cuenta">La <b>probabilidad estimada</b> mezcla la del modelo con la que indica la cuota (quitando el margen de la casa). El modelo pesa un 50% en resultado, doble oportunidad y hándicap, un 25% en goles y combos, y un 15% en ambos marcan y resultado exacto, porque la casa también sabe cosas que el modelo no ve (lesiones, alineaciones). Por eso puede diferir de la cuota justa del modelo que ves en el cupón, y una cuota más baja en tu casa la sube un poco.</div></section>
    ${r.avisos.length ? `<section class="tarjeta"><div class="tarjeta__cuerpo">${r.avisos.map((a) => `<p class="aviso">${esc(a)}</p>`).join("")}</div></section>` : ""}
    <section class="tarjeta ad-explica"><h2>El analista</h2>${r.explicacion.map((x) => `<p>${esc(x)}</p>`).join("")}</section>`;
  firmaEvaluada = firma;
  marcarEvaluacionVieja();
  contenedor.querySelectorAll("[data-aplicar]").forEach((b) => b.addEventListener("click", () => {
    const s = r.sugerencias[Number(b.dataset.aplicar)];
    const i = cupon.selecciones.findIndex((x) => x.partido === s.partido_id && x.mercado === s.mercado_actual);
    if (i < 0) return;
    if (s.tipo === "cambiar") {
      const viejo = cupon.selecciones[i];
      cupon.selecciones[i] = { ...viejo, mercado: s.mercado, nombre: s.alternativa, cuota_justa: s.cuota_justa, prob: 1 / s.cuota_justa, cuota: "", cuota_mercado: null };
    } else cupon.selecciones.splice(i, 1);
    guardarCupon();
    pintarCupon();
    b.closest("li").innerHTML = `<p class="cuenta">Aplicado. ${s.tipo === "cambiar" ? "Escribe la cuota de tu casa para la nueva selección y vuelve a evaluar el cupón." : "Puedes volver a evaluar el cupón."}</p>`;
  }));
}

// --- Árbol de competencias ---------------------------------------------------------
const VISIBLES = 6;
function pintarArbol(catalogo, filtro = "") {
  // Busca por palabras, sin distinguir tildes ni mayúsculas: "primera division chile" encuentra la
  // Primera División de Chile porque cada palabra aparece en el país o en la liga.
  const normal = (x) => (x || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const q = normal(filtro.trim());
  const palabras = q.split(/\s+/).filter(Boolean);
  const coincide = (...t) => { const texto = normal(t.join(" ")); return palabras.every((w) => texto.includes(w)); };
  const enlace = (l, directo = false) => `<a class="liga-enlace ${directo ? "directo" : ""}" href="#/liga/${l.id}">${img(l.escudo)}<span>${esc(l.nombre_es || l.nombre)}</span></a>`;
  let html = "";
  const inter = catalogo.internacionales.filter((l) => coincide(l.nombre_es, l.nombre));
  const tituloInter = lateral.querySelector(":scope > .lateral__titulo");
  if (tituloInter) tituloInter.hidden = Boolean(q) && !inter.length;
  if (inter.length) html += inter.map((l) => enlace(l, true)).join("");
  let region = "";
  for (const p of catalogo.paises) {
    const ligas = p.ligas.filter((l) => coincide(p.nombre_es, p.pais, l.nombre, l.alternativo));
    if (!ligas.length || (!p.ligas.length && q)) continue;
    if (p.region !== region) {
      region = p.region;
      html += `<div class="region">${esc(region)}</div>`;
    }
    const abierto = q || p.nombre_es === "Chile" ? "abierto" : "";
    const principales = q ? ligas : ligas.slice(0, VISIBLES);
    html += `<div class="pais ${abierto}"><button type="button"><span>${esc(p.nombre_es)}</span><span class="cuenta">${ligas.length}</span></button>
      <div class="ligas">${principales.map((l) => enlace(l)).join("")}${ligas.length > principales.length ? `<button class="ver-mas" type="button" data-pais="${esc(p.pais)}">Ver todas (${ligas.length})</button>` : ""}</div></div>`;
  }
  arbol.innerHTML = html || `<div class="vacio">Sin resultados para “${esc(filtro)}”.</div>`;
}

let catalogo = null;
arbol.addEventListener("click", (ev) => {
  const verMas = ev.target.closest(".ver-mas");
  if (verMas) {
    const p = catalogo.paises.find((x) => x.pais === verMas.dataset.pais);
    verMas.parentElement.innerHTML = p.ligas.map((l) => `<a class="liga-enlace" href="#/liga/${l.id}">${img(l.escudo)}<span>${esc(l.nombre)}</span></a>`).join("");
    return;
  }
  const boton = ev.target.closest(".pais > button");
  if (boton) boton.parentElement.classList.toggle("abierto");
  if (ev.target.closest("a")) {
    lateral.classList.remove("abierto");
    if (buscador.value) { buscador.value = ""; pintarArbol(catalogo, ""); }
  }
});
buscador.addEventListener("input", () => {
  if (!catalogo) return;
  pintarArbol(catalogo, buscador.value);
  // En el móvil el menú de competencias está oculto: se abre para mostrar los resultados.
  if (matchMedia("(max-width: 900px)").matches && buscador.value.trim()) {
    lateral.classList.add("abierto");
    lateral.scrollTop = 0;
  }
});
document.getElementById("abrir-menu").addEventListener("click", () => lateral.classList.toggle("abierto"));

// --- Enrutador -------------------------------------------------------------------
function mostrarError(e) {
  vista.innerHTML = `<div class="error">No se pudieron cargar los datos: ${esc(e.message)}</div>`;
}

async function enrutar() {
  clearInterval(refresco);
  clearTimeout(refresco);
  clearInterval(relojCarrusel);
  document.title = "Masterfutbol — partidos, pronósticos y estadísticas";
  const [, ruta = "", param = "", param2 = ""] = location.hash.split("/");
  document.querySelectorAll(".subnav a").forEach((a) => {
    const h = a.getAttribute("href");
    a.classList.toggle("activo", h === "#/" ? !ruta || ruta === "dia" : location.hash === h || location.hash.startsWith(`${h}/`) || location.hash.startsWith(`${h}?`));
  });
  // En el móvil la subnavegación se desplaza de lado: deja a la vista la sección actual.
  const activo = document.querySelector(".subnav a.activo");
  if (activo) activo.parentElement.scrollLeft = activo.offsetLeft - activo.parentElement.clientWidth / 2 + activo.clientWidth / 2;
  vista.innerHTML = `<div class="cargando">Cargando…</div>`;
  window.scrollTo(0, 0);
  try {
    if (ruta === "liga") await vistaLiga(param);
    else if (ruta === "partido") await vistaPartido(param);
    else if (ruta === "equipo") await vistaEquipo(param, param2);
    else if (ruta === "simulador") {
      const [sub = "", q1 = ""] = param.split("?");
      const [sid = "", q2 = ""] = param2.split("?");
      if (sub === "competencias") await vistaSimuladorCompetencias();
      else if (sub === "proximos") await vistaSimuladorProximos(q1);
      else if (sub === "liga") await vistaSimuladorLiga(sid, q2);
      else if (sub === "partido") await vistaSimuladorPartido(sid);
      else if (sub === "evaluar") await vistaSimuladorEvaluar();
      else await vistaSimuladorDestacados();
    }
    else if (ruta === "apuestas") await vistaApuestas();
    else if (ruta === "predicciones") await vistaPredicciones(param);
    else if (ruta.startsWith("stats")) {
      const [tipo, query = ""] = param.split("?");
      if (tipo) await vistaStat(tipo, query);
      else await vistaStats();
    }
    else if (ruta === "vivo") await vistaDia(hoy(), true);
    else await vistaDia(ruta === "dia" && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : hoy(), false, ruta !== "dia");
  } catch (e) {
    mostrarError(e);
  }
}

window.addEventListener("hashchange", enrutar);
enrutar();
catalogoListo.then((c) => { catalogo = c; pintarArbol(c); }).catch(() => { arbol.textContent = "No se pudo cargar el catálogo."; });

// En el móvil, la cabecera oculta el buscador al bajar y lo vuelve a mostrar al subir (ocupaba
// un 21% de la pantalla). Nunca mientras se está escribiendo en él.
const cabecera = document.querySelector(".cabecera");
let ultimoScroll = 0;
// En el móvil la cabecera es fija: el contenido deja arriba el hueco de su altura completa.
const medirCabecera = () => {
  if (!cabecera.classList.contains("cabecera--compacta")) document.documentElement.style.setProperty("--alto-real-cabecera", `${cabecera.offsetHeight}px`);
};
medirCabecera();
addEventListener("resize", medirCabecera);
addEventListener("scroll", () => {
  const y = scrollY;
  const compacta = matchMedia("(max-width: 640px)").matches && y > 120 && y > ultimoScroll && document.activeElement !== buscador;
  if (compacta) cabecera.classList.add("cabecera--compacta");
  else if (y < ultimoScroll - 10 || y <= 120) cabecera.classList.remove("cabecera--compacta");
  ultimoScroll = y;
}, { passive: true });

// --- 20: toda la fila de un partido lleva a su ficha (los enlaces de equipo siguen igual) --------
document.addEventListener("click", (e) => {
  const fila = e.target.closest(".fila-partido");
  if (!fila || e.target.closest("a, button") || !fila.dataset.id) return;
  location.hash = `#/partido/${fila.dataset.id}`;
});

// Ligas plegadas de la lista de partidos: al abrirlas se piden su forma y sus cuotas (en caché).
document.addEventListener("click", (e) => {
  const b = e.target.closest(".desplegar");
  if (!b) return;
  const t = b.closest(".tarjeta");
  t.classList.remove("plegada");
  b.remove();
  observador?.unobserve(t);
  formaDeTarjeta(t);
});

