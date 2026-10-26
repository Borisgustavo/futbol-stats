# Cupón simulado con analista de riesgo — análisis y diseño (25-oct-2026)

Propuesta del usuario: un apartado donde se eligen selecciones (como en un cupón de casa de
apuestas: mercado, cuota, partido, hora, monto) y un agente revisa el riesgo, dice si la apuesta
está bien o es arriesgada, qué partido sacaría y qué apuesta sería mejor. Esto es solo análisis y
diseño: no se ha construido nada.

## Lo que mostró el ejemplo del usuario

| Selección | Cuota | Lo que dice el modelo hoy | Problema que revela |
|---|---|---|---|
| Barcelona–Real Madrid, ambos marcan: sí | 1,26 (implica 79%) | 64,6% (calibrado) → valor esperado −19% | En goles el modelo es débil (ver calibración); la cuota de la casa probablemente sabe más. Hay que combinar modelo y cuota. |
| Palestino–Colo Colo, Colo Colo más de 0,5 goles | 1,17 | Sin dato | Es un mercado **por equipo**, que el modelo no ofrece, y el partido no tiene predicción guardada (solo se guardan picks con ventaja). |
| Galatasaray–Fenerbahçe, Galatasaray más de 0,5 goles | 1,16 | Sin dato | Igual que el anterior. |

## Cómo funcionaría para el usuario

1. **Añadir al cupón** desde la ficha del partido (una cuadrícula con todos los mercados, su
   probabilidad y su cuota justa), desde la lista del día y desde Predicciones.
2. **Cupón flotante** (lateral en escritorio, panel inferior en móvil), como el de la imagen: cada
   selección con su mercado, cuota **editable** (la que ofrece la casa del usuario; se precarga la
   del mercado si la tenemos), partido y hora; monto simulado, cuota total y ganancia posible.
3. **Analizar** → informe con:
   - Veredicto global: **Correcta**, **Arriesgada** o **Sin valor**, con los motivos.
   - Semáforo por selección: probabilidad, cuota justa, valor esperado, avisos (muestra corta,
     partido fuera de cobertura, ya empezado).
   - Sugerencias: qué selección quitar, qué cambio haría la apuesta mejor y la cuota mínima a exigir.
   - Explicación en lenguaje natural (el "agente").
4. **Mis simulaciones** (fase 3): los cupones analizados se guardan y, al terminar los partidos, se
   marcan como ganados o perdidos, para ver si los consejos del analista funcionan.

## Motor de análisis (determinista, en el servidor): la base de todo

Los números los calcula siempre código propio, no la IA. Un agente solo explica estos datos, así
no puede inventar probabilidades.

- **Probabilidad de cada selección**:
  - Modelo de Poisson calibrado, calculado **al vuelo** para cualquier partido de una liga activa
    (hoy solo se guardan los picks con ventaja).
  - Combinado con la probabilidad que implica la cuota, quitando el margen de la casa (~5%). Peso
    inicial propuesto: 1X2 mitad modelo y mitad cuota; goles, 25% modelo y 75% cuota, porque la
    prueba retrospectiva mostró que en goles el modelo casi no aporta. Sin cuotas históricas, estos
    pesos no se pueden calibrar todavía: se ajustarían con los cupones de la fase 3.
- **Selecciones del mismo partido**: probabilidad conjunta exacta desde la matriz de marcadores
  (por ejemplo, "Barcelona gana" y "más de 2,5" están muy relacionadas; multiplicarlas sería un
  error).
- **Métricas**: probabilidad total, cuota total, valor esperado por selección y total
  (`prob × cuota − 1`), pérdida esperada en dinero y cuota justa de cada selección.
- **Veredicto** (umbrales iniciales, a ajustar con datos):
  - Sin valor: valor esperado total < −10%.
  - Arriesgada: probabilidad total < 20%, más de 4 selecciones o alguna selección sin datos del modelo.
  - Correcta: valor esperado total ≥ −3% y probabilidad total ≥ 35%.
  - Si no encaja en ninguno: "Aceptable con reservas", explicando por qué.
- **Sugerencias**:
  - Quitar la selección con peor valor esperado, si sacarla mejora el total.
  - En el mismo partido, otro mercado con mejor valor (si hay cuota) o el pick con ventaja del
    modelo, indicando la cuota mínima que haría falta.
  - Recordar que cada selección añadida multiplica el margen de la casa.

## El "agente"

| Opción | Cómo | Costo | Calidad |
|---|---|---|---|
| A. Analista por reglas | Texto armado con plantillas a partir del análisis | Gratis, instantáneo | Correcto y consistente, algo rígido |
| B. Agente con IA | La API de Claude (por ejemplo Claude Haiku 5.5, o Sonnet 5.5 para más calidad) recibe el análisis numérico como datos, puede consultar estadísticas del partido con herramientas y redacta el consejo | Céntimos por análisis; requiere clave de API de Anthropic | Explicaciones naturales y adaptadas a cada cupón |

Recomendación: construir A primero (sirve sola y es la base) y B como mejora opcional, con su
propio skill de instrucciones y casos de prueba, como se hizo con `apuesta-diaria`.

## Qué hace falta además de lo que ya existe

1. **Cálculo del modelo al vuelo para cualquier partido** (endpoint nuevo): hoy solo se guardan
   los picks con ventaja.
2. **Más mercados**, todos derivables de la matriz de Poisson: más/menos 0,5 del partido, goles de
   cada equipo (más de 0,5/1,5), doble oportunidad, empate no válido, hándicap y marcador exacto.
3. **Calibrar esos mercados nuevos**: los de goles por equipo no están probados. Se puede ampliar
   `scripts/backtest_modelo.mjs` sin costo.
4. **Cuotas**: que el usuario escriba la cuota de su casa (recomendado, gratis). La alternativa,
   pedir los mercados de goles a The Odds API, gasta créditos por cada mercado extra y 500 al mes
   no alcanzan; haría falta un plan de pago.
5. **Partidos sin cobertura** (ligas no activas, equipos con menos de 4 partidos, partidos en
   juego): el análisis debe decirlo y evaluar solo con la cuota.
6. **Para la opción B**: clave de API de Anthropic, un presupuesto mensual y un skill del analista
   con sus casos de prueba.
7. **Guardar cupones**: en el navegador (para uso personal); si la web se publica, harían falta
   cuentas de usuario.
8. **Juego responsable**: dejar claro que es una simulación sin dinero real; nunca sugerir subir el
   monto; mostrar la pérdida esperada; avisos de +18. Si la web se publica, esta sección es la más
   delicada legalmente, porque es literalmente consejo sobre apuestas concretas.

## Fases propuestas

1. **Cupón + motor de análisis + analista por reglas** (incluye los puntos 1, 2, 4, 5, 7 y 8).
2. **Calibración de los mercados nuevos** (punto 3) y ajuste de umbrales.
3. **Agente con IA** (punto 6), opcional.
4. **Mis simulaciones** con resultados, para medir si los consejos aciertan.

---

# Segunda parte: un apartado exclusivo tipo "casa de apuestas" (25-oct-2026, tarde)

El usuario mostró como referencia la navegación de una casa de apuestas: Destacados /
Competencias / Próximos, árbol de competencias, página de liga con los partidos y botones de
cuota por mercado (Resultado, Más/Menos, Doble oportunidad, Ambos marcan, Medio tiempo, Córners,
Tarjetas, Anotador), y ficha de partido con grupos de mercados (Goles, Jugadores, Córners,
Tarjetas, Medio tiempo, Combos, Especiales, Hándicap, Hándicap asiático, Minutos), cada uno con
un dato estadístico ("Colo Colo promedia 1,7 goles por partido"). La idea: ir eligiendo cuotas,
que se arme el cupón y tenga un botón **Evaluar cupón**.

## Cómo sería en Masterfutbol (diseño propio, sin imitar la marca de ninguna casa)

- **Nueva sección "Simulador"** en la cabecera, con tres pestañas:
  - **Destacados**: los picks con ventaja y el carrusel, que ya existen.
  - **Competencias**: el árbol de ligas que ya existe, más accesos rápidos a las populares.
  - **Próximos**: los partidos por hora.
- **Página de liga** con la lista de partidos y una fila de chips de mercado (Resultado,
  Más/Menos, Doble oportunidad, Ambos marcan…). Cada botón de cuota se puede pulsar.
- **Ficha de partido** con grupos plegables por mercado. Cada grupo lleva su dato estadístico,
  generado con los datos de la temporada.
- **Cupón fijo** (columna derecha en escritorio, barra inferior desplegable en móvil): selecciones,
  cuota editable, monto simulado, cuota total, ganancia posible y **Evaluar cupón**.
- **Informe de evaluación**: el de la primera parte (veredicto, semáforo, qué quitar, qué cambiar).

## De dónde salen las cuotas (la decisión clave)

Una casa muestra sus propias cuotas. Masterfutbol tiene tres caminos:

1. **Cuota justa del modelo** (1 / probabilidad) en todos los botones. Gratis y disponible para
   todos los mercados que el modelo calcula. Pero evaluar un cupón armado solo con cuotas justas
   no tiene sentido: su valor esperado es cero por definición.
2. **Cuota justa en los botones + cuota real que el usuario escribe en el cupón** (la de su casa).
   Gratis, y la evaluación compara la cuota real con la probabilidad. **Recomendado**.
3. **Cuotas reales de mercado en los botones**. Hoy solo hay 1X2 de 45 ligas (The Odds API, 500
   créditos al mes). Más mercados (totales, hándicap, ambos marcan) multiplican el gasto de
   créditos, y algunos solo se piden partido a partido: haría falta un plan de pago, o un
   proveedor como API-Football, que da cuotas de muchos mercados y estadísticas en un solo plan.

## Qué mercados se pueden ofrecer

| Mercado (como en la referencia) | Estado | Qué hace falta |
|---|---|---|
| Resultado 1X2, doble oportunidad, empate no válido | Derivable del modelo | Solo código (matriz de Poisson) |
| Más/Menos del partido (0,5 a 4,5), ambos marcan | Derivable del modelo | Código; los de goles van calibrados 40/60 |
| Goles de cada equipo, marcador exacto, hándicap y hándicap asiático, combos (resultado + goles) | Derivable del modelo | Código + calibrarlos con la prueba retrospectiva |
| Medio tiempo (resultado y goles al descanso) | Posible solo en ligas grandes | Minuto de cada gol desde la cronología de TheSportsDB, partido a partido |
| Córners y tarjetas (totales y por equipo) | Posible solo en ligas grandes | Estadísticas por partido de TheSportsDB, partido a partido, y un modelo nuevo |
| Jugadores (anotador, tiros…), minutos del gol | No | Datos de jugadores y de cada evento: otro proveedor de pago |

## Hallazgo: TheSportsDB sí tiene córners, tarjetas y medio tiempo (con límites)

Corrige lo que dice la sección de Estadísticas ("solo hay marcadores finales"): la lista de la
temporada solo trae el marcador, pero el **detalle de cada partido** (`lookupeventstats.php` y
`lookuptimeline.php`) trae córners, tarjetas, xG, tiros, posesión y el minuto de cada gol.

- Cobertura comprobada el 25-oct en partidos ya jugados: **sí** en LaLiga, Premier League,
  Primera de Chile y Copa Libertadores; **no** en la Eliteserien de Noruega, Indonesia,
  Finlandia, Egipto ni Costa Rica. Antes de construir hay que revisar liga por liga (una petición
  por liga).
- Coste: una petición por partido. Las ~9.500 jugadas de la temporada serían ~3,5 horas de
  descarga inicial a 90 por minuto (dos llamadas por partido, solo en las ligas con cobertura será
  bastante menos), en segundo plano y guardadas en disco (no cambian), y después unas decenas al
  día.
- Con eso se podrían añadir córners y tarjetas a la sección Estadísticas y a los mercados del
  simulador en las ligas cubiertas.

## Avisos para esta versión "tipo casa de apuestas"

- **Legal y juego responsable**: un cupón con cuotas y montos parece una casa de apuestas. Debe
  decir en todo momento que es una **simulación sin dinero real**: sin depósitos, sin enlaces a
  casas de apuestas, con +18 y sin sugerir montos. Si la web se publica, es la parte que más hay
  que revisar con la normativa local.
- **No copiar el diseño ni la marca de la casa de referencia**: tomar la estructura (pestañas,
  grupos, cupón) con la identidad de Masterfutbol.
- **Confianza por mercado**: el informe debe decir cuánto fiarse de cada tipo de mercado (1X2:
  modelo probado; goles: débil; córners y tarjetas: sin probar hasta calibrarlos).

## Fases revisadas

1. Simulador con mercados del modelo (1X2, doble oportunidad, más/menos, ambos marcan, goles por
   equipo, hándicap, combos), cuotas justas, cupón con cuota editable y **Evaluar cupón** con el
   analista por reglas.
2. Calibración de los mercados derivados nuevos con la prueba retrospectiva.
3. Descarga de estadísticas por partido (córners, tarjetas, minuto de los goles) en las ligas
   cubiertas → Estadísticas con córners y tarjetas, y mercados de córners, tarjetas y medio tiempo.
4. Agente con IA (opcional) y "Mis simulaciones" con resultados.

## Fase 1 construida (25-oct-2026)

Decisión del usuario: los botones muestran la cuota justa del modelo y en el cupón se escribe la
cuota real de la casa. Construido: `mercados.js` (70 mercados), `cupon.js` (evaluación y
sugerencias), endpoints `/api/simulador/*` y `POST /api/cupon/evaluar`, y la vista `#/simulador`
(Destacados, Competencias, Próximos, ficha del partido y evaluación). Probado en el navegador en
móvil y escritorio. Con el cupón de ejemplo da **Sin valor** (cuota 2,58, 31%, valor esperado
−21%). Detalle en el README, sección "Simulador". Siguiente: fase 2.

