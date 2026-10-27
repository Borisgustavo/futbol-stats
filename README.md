# Masterfutbol

Web de estadísticas de fútbol modelada sobre la estructura de footystats.org/es
(partidos del día por liga, forma de cada equipo, tablas, páginas de liga, partido y equipo),
con diseño y nombre propios y datos de **TheSportsDB** (clave premium en `.env`).

## Arrancar

```bash
npm start
```

Abre http://localhost:3000. Requiere Node 22 o superior; no tiene dependencias que instalar.

## Estructura

| Ruta | Qué es |
|---|---|
| `server.js` | Servidor sin dependencias: sirve `public/` y hace de intermediario con TheSportsDB (la clave nunca llega al navegador). Caché en memoria y cola de peticiones (~90/min) porque la API responde 429 si se supera el límite. |
| `public/` | Interfaz (HTML, CSS y JS sin frameworks). Rutas: `#/` día, `#/dia/AAAA-MM-DD`, `#/vivo`, `#/liga/ID`, `#/partido/ID`, `#/equipo/ID`, `#/predicciones`, `#/apuestas`, `#/simulador`, `#/stats`. |
| `data/ligas.json` | Catálogo de 447 competencias (7 internacionales + 69 países: los del menú de referencia y México). Se regenera con `npm run ligas`. |
| `scripts/catalogo_ligas.py` | Genera el catálogo; la lista de países está al principio del archivo. |
| `analisis_rea/` | Captura de footystats.org/es hecha con REA (`rea inspect-web-page`): estructura, encabezados y patrones de URL. Solo local: no se sube al repositorio porque es contenido de otro sitio. |
| `herramientas/rea/` | Copia del repositorio morluto/rea (la CLI `rea` está instalada globalmente con npm). |

## Qué se tomó de footystats (vía REA) y qué no

- Se modeló: pestañas Ayer/Hoy/Mañana/+4 días, partidos agrupados por "País - Liga",
  indicador de forma (puntos por partido en los últimos 5) a cada lado del marcador,
  menú lateral de competencias por país, páginas de liga/partido/equipo
  (sus rutas son `/es/<pais>/<liga>`, `/es/<pais>/<local>-vs-<visita>-h2h-stats`, `/es/clubs/<equipo>-<id>`).
- No se copió: textos, marca, logotipo ni datos de footystats. Las cuotas (1/X/2) no están
  porque TheSportsDB no las ofrece.

## Estadísticas de temporada

`/api/temporada/<idLiga>` pide todos los partidos de la temporada en una sola llamada
(`eventsseason.php`) y calcula para cada equipo, en general, de local y de visitante:
PJ/V/E/D, últimos 5, PPP, Pa0 (portería a cero), AEM (ambos marcan), PSM (sin marcar),
+1,5, +2,5 y media de goles. Lo usan la clasificación ampliada, los enfrentamientos
de la página de liga y la ficha de equipo (`#/equipo/<id>/<idLiga>` para cada competición).
Comprobado el 2026-10-24 contra FootyStats: Eliteserien, Bayern y Real Madrid coinciden.
En las copas internacionales sin tabla oficial (Champions) no se calcula clasificación,
porque mezclaría las rondas previas con la fase de liga.

## Cuotas 1X2 (The Odds API)

- Clave en `.env` como `ODDS_API_KEY`. Comprobarla con `npm run cuotas:verificar`: esa consulta
  no gasta créditos, e indica qué ligas de `CLAVES_ODDS` (en `cuotas.js`) existen y cuáles faltan.
- Se muestran en la portada (1 · X · 2 junto a la hora), en los enfrentamientos de cada liga
  y en la página del partido (media de las casas, mejor cuota, probabilidad implícita y tabla por casa).
- Gasto: 1 crédito por liga y actualización. El plan gratuito trae 500 al mes, así que el servidor
  guarda las cuotas en `data/cache_cuotas.json` durante `ODDS_TTL_HORAS` (12 por defecto) y deja de
  consultar con menos de `ODDS_MIN_RESTANTES` (10) créditos. **Desde el 2026-10-25 solo la ficha de
  un partido pide cuotas nuevas**: la portada, "En vivo", las páginas de liga (`/api/cuotas/ID`), el
  Simulador y Predicciones solo leen la caché (`cuotas.soloCache`), así que mirar listas no gasta
  créditos. Los partidos terminados no gastan créditos.
- Los partidos se emparejan por hora de inicio (±3 h) y parecido de los nombres de los equipos
  (prueba real del 2026-10-24: Premier League 26/26, Primera chilena 8/9; el que faltaba no está en TheSportsDB).
- 45 ligas asignadas, todas verificadas contra The Odds API el 2026-10-24.

## Limitaciones conocidas
- Córners por temporada solo en las ligas que TheSportsDB cubre partido a partido (ver
  "Córners"). Tarjetas y minutos de los goles por temporada todavía no se calculan.

## Córners (fase 3)

`partidos_stats.js` descarga en segundo plano el detalle de cada partido jugado
(`lookupeventstats.php`, una petición por partido, prioridad baja en la cola) de las mismas ligas
que la sección Estadísticas. Cada liga se sondea con sus 3 últimos partidos: si ninguno trae
córners, se descarta y se vuelve a probar a la semana. Lo descargado se guarda en
`DATA_DIR/stats_partidos.json` (córners y tarjetas por partido; un partido terminado no cambia) y
se repasa cada 3 horas. `#/stats/corners` muestra equipos y ligas con más córners, a favor y en
contra, próximos partidos y Más/Menos de 7,5 a 11,5. La primera descarga completa tarda horas;
mientras tanto la página dice cuántas ligas y partidos lleva.

- Puerto Rico, Saint Kitts and Nevis e Islas Salomón no tienen ligas en TheSportsDB.
- Muchos partidos no traen estadísticas (posesión, tiros…) en TheSportsDB; la página lo indica.
- La forma de los equipos se calcula con la tabla de la liga; las copas sin tabla muestran "–".
- El menú de las capturas parecía recortado (p. ej. Europa salta de Irlanda a Macedonia del Norte);
  para añadir países, edita `PAISES` en `scripts/catalogo_ligas.py` y ejecuta `npm run ligas`.

## Predicciones (`#/predicciones`, modelo de footystats.org/es/predictions)

- En FootyStats las publican sus usuarios; aquí las genera `predicciones.js` con un modelo de
  Poisson (lo que FootyStats llama "predicciones matemáticas"): goles esperados = media de la
  liga × ataque × defensa, con toda la campaña del equipo (75%) y sus partidos de local o
  visitante (25%), suavizado con 10 partidos de media de la liga. Calibrado contra las cuotas
  1X2 del mercado el 2026-10-24: error medio de 0,109 a ~0,07.
- **Calibración del 2026-10-25** (`analisis/calibracion_2026-10-25.md`, `node scripts/backtest_modelo.mjs`):
  una prueba retrospectiva sin mirar el futuro (9.521 partidos) mostró que el modelo mejora a la
  media de la liga en 1X2 pero no en los mercados de goles. Desde entonces los mercados de goles
  mezclan 40% modelo y 60% media de la liga, y **solo hay pick con 5 puntos o más de ventaja**
  sobre la media de la liga (ventaja real medida: +15 pts, frente a +4 antes; pick en ~1 de cada
  4 partidos, sobre todo 1X2). Las predicciones guardan `modelo: "2026-10-25"`; las anteriores
  (sin ese campo) se evaluaron con la regla vieja.
- Cada 30 minutos predice los partidos de los próximos 3 días de las ligas activas (ambos equipos
  con 4+ partidos), elige el mercado que más se aparta de lo normal en esa liga (o la cuota 1/2 con
  valor si The Odds API la tiene guardada; solo se lee la caché, no gasta créditos), se congela una
  hora antes del inicio y, al terminar el partido, se marca acertada o fallada en
  `data/predicciones.json`. "En números" muestra el acierto real de los últimos 7 días.
- Vistas: hoy, mañana, más recientes, matemáticas, AEM, victorias en casa/fuera, +1,5, +2,5,
  combinadas, 1X2 y resultado exacto. No hay usuarios rentables, clasificación, córners ni premium.
- Limitación: no sabe de lesiones, alineaciones ni rotaciones; con pocas jornadas puede
  separarse del mercado (p. ej. Liverpool–Brighton, 26% frente a 45%). No es consejo de apuesta.

## Diseño (2026-10-24)

- Tema oscuro en toda la web (tokens en `:root` de `public/app.css`: fondo azul noche, acento
  verde `#22C55E`, Sora para títulos e Inter para el texto), según el lienzo de diseño
  "Fútbol Stats — rediseño" (https://claude.ai/artifact/EYHGDo1cNJYoU92gV2vHk3).
- Portada (`#/`): carrusel 3D con los picks destacados (`/api/predicciones/destacados`:
  lo más probable de las próximas 36 h, primero ligas principales y uno por liga), que gira
  solo cada 5 s, se pausa al pasar el ratón o con el foco y respeta "reducir movimiento";
  debajo, la lista de partidos del día.
- Cada fila de partido lleva una columna de pronóstico (pick y probabilidad del modelo; verde
  si acertó, rojo si falló).

## Apuestas diarias (`#/apuestas`, modelo de betmines.com/es/apuestas-diarias-futbol)

- **Cambio 2026-10-25 (Doble):** pasa de "las 2 más probables de 68%+" a "las 2 con más
  ventaja sobre la media de la liga, de 62%+" (`TIPOS_APUESTA.doble`: `probMin` 0,68 → 0,62,
  `orden: "ventaja"`). Motivo: con el modelo calibrado la regla vieja solo se armaba 6 de cada 10
  días; la nueva se arma el 95% con cuota ~2,1 y sigue acertando lo que promete
  (`analisis/doble_2026-10-25.md`, `node scripts/backtest_apuestas.mjs`). Las combinadas del 25 y
  26 de octubre se armaron con la regla vieja y quedan congeladas.
- `apuestas.js` arma cada día dos combinadas con las predicciones del modelo: **Doble**
  (las 2 de más ventaja, de 62%+) y **Riesgo** (3 selecciones de 55-72%), una por liga, primero las
  ligas principales y solo partidos que empiezan dentro de más de 1 hora. Se arman hoy y mañana
  cada 30 min si esa fecha aún no tiene, y quedan **congeladas** en `data/apuestas.json`
  (30 días guardados; la página muestra hoy, mañana y los 3 días anteriores).
- El estado de cada selección sale de las predicciones evaluadas; una anulada cuenta como cuota 1.
  El balance da ganadas/cerradas y unidades apostando 1 a cada combinada.
- Skill `apuesta-diaria` (`.claude/skills/apuesta-diaria/`): enseña a Claude cómo funciona la
  sección, incluye `scripts/estado_apuestas.py` (informe de combinadas con la ventaja de cada
  selección frente a la media de su liga, rendimiento y calibración, sin necesidad del servidor),
  `scripts/simular_armado.mjs` (qué armaría el código actual en cada fecha, frente a lo guardado) y
  3 casos de prueba en `evals/`. Pruebas del 2026-10-25: 14/14 con el skill frente a 9/14 sin él
  (`.claude/skills/apuesta-diaria-workspace/iteration-2/benchmark.md`).
- Agente `analista-apuestas` (`.claude/agents/`): usa el skill para revisar la apuesta del día,
  auditar el historial y proponer ajustes; no modifica nada sin confirmación.
- Ambos se cargan cuando Claude Code se abre en esta carpeta (`G:\Mi unidad\futbol-stats`).

## Simulador (`#/simulador`, fase 1 construida el 2026-10-25)

Cupón simulado sin dinero real, con un analista que revisa el riesgo. Diseño y fases en
`analisis/cupon_simulador.md`.

- **Cuotas:** los botones muestran la **cuota justa del modelo** (1 / probabilidad). En el cupón el
  usuario escribe la **cuota real de su casa**; el analista compara las dos. No se gastan créditos
  de The Odds API: solo se lee la caché de cuotas 1X2 si ya existe.
- **Pestañas:** Destacados (ligas principales con partidos), Competencias (por país) y Próximos
  (48 h, solo partidos con modelo, máx. 150), con chips de mercado (resultado, doble oportunidad,
  goles, ambos marcan). La ficha de un partido tiene 9 grupos de mercados, cada uno con un dato
  estadístico. Desde `#/partido/ID` se llega con "Simular apuesta".
- `mercados.js`: 70 mercados derivados de la matriz de marcadores del modelo de Poisson (1X2, doble
  oportunidad, más/menos 0,5-4,5, ambos marcan, goles por equipo, hándicap ±1,5/±2,5, combos
  resultado+goles y resultado exacto 0-4). Cada grupo mezcla el modelo con la media de la liga con
  el α que mejor acertó en la prueba retrospectiva (fase 2, `analisis/mercados_simulador_2026-10-25.md`,
  `node scripts/backtest_mercados.mjs`): 1 en resultado, doble, hándicap y exacto; 0,9 en goles del
  local y combos; 0,8 en goles del visitante; 0,4 en goles totales y ambos marcan (igual que
  `predicciones.js`). Varias selecciones del **mismo partido** se calculan juntas sobre la matriz
  (probabilidad conjunta exacta, no multiplicando; con grupos distintos, el α más bajo).
- `cupon.js` (`POST /api/cupon/evaluar`): para cada selección mezcla la probabilidad del modelo con
  la que implica la cuota de la casa (quitando ~5% de margen), con peso del modelo según la
  confianza del mercado, que sale de cuánto mejora el modelo a la media de la liga: **alta 0,5**
  (1X2, doble y hándicap), **media 0,25** (goles totales, goles por equipo y combos), **baja 0,15**
  (ambos marcan y resultado exacto, donde casi no la mejora, así que manda la cuota). Semáforo verde/amarillo/rojo por valor esperado, gris si no hay modelo. Veredicto:
  **Correcta**, **Aceptable con reservas**, **Arriesgada** o **Sin valor**, con motivos y
  sugerencias (quitar una selección, cambiarla por otra del mismo partido con más ventaja, o
  revisarla), que se aplican con un clic. Siempre con aviso +18 y "no es un consejo de apuesta".
- Endpoints: `GET /api/simulador/proximos`, `/api/simulador/partido/ID`, `/api/simulador/liga/ID`.
- El cupón se guarda en el navegador (`localStorage`, clave `masterfutbol-cupon`), hasta 10
  selecciones. En pantallas de menos de 1100 px queda como barra fija abajo.
- **La cuota de tu casa es opcional** (cambio del 2026-10-25). Si falta, en 1X2 se usa la cuota
  media del mercado que ya esté en caché (The Odds API, sin gastar créditos; también rellena el
  campo al añadir la selección desde Destacados, Competencias, Próximos o la ficha) y, si no hay,
  la selección se evalúa solo por probabilidad: el analista da la probabilidad, la **cuota mínima**
  que conviene buscar en tu casa por selección y en total, y un veredicto solo de riesgo (nunca
  "Correcta" ni "Sin valor" sin cuota). El botón "Evaluar cupón" queda fijo al pie del cupón.
- Prueba con el cupón de ejemplo (Barcelona-Real Madrid ambos marcan 1,26; Colo-Colo más de 0,5
  1,17; gana Colo-Colo 1,75): cuota 2,58; con la calibración de la fase 2, probabilidad 33,5% y
  valor esperado −13,7% (antes 31% y −21%) → **Sin valor**. Sugiere quitar "ambos marcan" y
  cambiar selecciones por "Barcelona: más de 1,5 goles", "Empate o Colo-Colo" o "Colo-Colo +1,5".
- Fase 3 en parte: córners en Estadísticas (sin mercados de córners en el simulador todavía).
  Pendiente: tarjetas y medio tiempo; agente con IA opcional y "Mis simulaciones".

## Agente `usuario-prueba` (`.claude/agents/usuario-prueba.md`)

Usuario de prueba que recorre la web en el navegador integrado como tres personas (aficionada en el
móvil, apostador en tablet y escritorio, visitante nuevo) y escribe un informe priorizado en
`analisis/ux_usuario_AAAA-MM-DD.md` (errores, claridad, aspecto visual e ideas para que sea más
atractiva). No modifica código, deja el cupón como estaba y abre fichas de partido de 3 ligas como
máximo para no gastar créditos de The Odds API. Primera pasada: `analisis/ux_usuario_2026-10-25.md`
(31 hallazgos: 4 de prioridad alta, 17 media y 10 baja). Se carga al abrir Claude Code en esta carpeta.
Corregidos el 2026-10-25: los 4 de prioridad alta (buscador en el móvil, pronóstico del modelo en la
ficha del partido con botón "Añadir al cupón", aviso +18 junto al carrusel y a las cuotas, y el
rótulo del acierto de Predicciones con los días reales de datos) y el 12 (gasto de créditos en listas). También los 5 de prioridad media del Simulador (5-9: pago si aciertas, aviso de evaluación
desactualizada, deshacer al vaciar, probabilidad estimada explicada, cuota de tu casa sin rellenar)
y quitar con un clic los partidos ya empezados del cupón. Y el 13: la ficha del partido carga en 0,4-1,6 s en vez de
4-5 s (menos peticiones a TheSportsDB y los últimos partidos aparte, en `/api/partido/ID/ultimos`). Y el resto de prioridad media (10, 11 y 14-21): forma en un solo
orden, cuotas previas en vivo, portada que explica el sitio, leyendas, tabla y cabecera del móvil,
filas que abren la ficha, Predicciones agrupadas y búsqueda por palabras con México en el catálogo.
Segunda pasada del agente (`analisis/ux_usuario_2026-10-25_2.md`): 16 de 21 resueltos y 5 parciales;
corregidos después los parciales y los 4 nuevos de prioridad media (forma de "Últimos de…", aviso de
picks sin valor, aviso de clasificación atrasada, marcador del móvil, ficha en dos tiempos con
`/api/partido/ID/base`, nombres y "Tabla ›" del móvil) y todos los de prioridad baja (22-31 y N5-N11;
detalle al final de ese informe).

