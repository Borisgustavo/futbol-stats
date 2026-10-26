# Prueba de usuario de Masterfutbol (2026-10-25)

Recorrido hecho por el agente `usuario-prueba` el domingo 25 de octubre de 2026, entre las 15:50 y las 16:30 hora de Chile, con el servidor ya corriendo en `http://localhost:3000` (respondía 200 en `/api/stats`). Se usó una pestaña propia del navegador integrado: primero en móvil (375×812), luego en tablet (768×1024) y después en escritorio (1440×900).

- **Créditos de The Odds API:** 491 → 489. Se gastó 1 al ver la lista "En vivo" en el móvil (Argentina, `/api/cuotas/4406`, que la propia página pide para las tarjetas visibles) y 1 al abrir la página de la Champions (`/api/cuotas/4480`). Se abrieron fichas de partido de 2 ligas, Chile y LaLiga, ambas ya en caché. No se llamó nunca a `/api/cuotas` a mano.
- **Cupón del Simulador:** antes de tocarlo se guardó su contenido (6 selecciones, monto $10.000). Al terminar se restauró y se comprobó que es idéntico: SHA-256 `bf2ac731199ea4de…` y 1297 caracteres.
- **Archivos del proyecto:** no se modificó ninguno salvo este informe.

## 1. Resumen

La web cumple casi todo lo que promete el README: partidos del día, partidos en vivo, tablas, predicciones con su explicación, apuestas diarias y un Simulador que evalúa el cupón y aplica sugerencias. No hubo errores de consola ni peticiones fallidas, y ninguna pantalla tiene scroll horizontal en el móvil.

Lo más urgente:
1. **En el móvil, el buscador no hace nada visible.** Filtra un menú que está oculto.
2. **"Analizar →" no lleva a ningún análisis.** El botón del carrusel lleva a una ficha de partido que no muestra el pick ni la probabilidad del modelo, y esa ficha tardó 6 s en cargar.
3. **El aviso +18 de la portada está fuera de la vista.** Solo aparece en el pie, a unos 47.000 px de la parte de arriba.
4. **El dato de confianza de Predicciones está mal rotulado.** "Acierto en los últimos 7 días: 60%" corresponde solo a los partidos de hoy.

Le siguen varios números del Simulador que confunden a un apostador:
- "Ganancia posible" muestra el pago total, no la ganancia.
- La misma selección aparece con dos "cuotas justas" distintas.
- La evaluación no avisa cuando ya quedó desactualizada.

## 2. Recorridos

### Martina, aficionada en el móvil (375×812)

| Tarea | Estado | Clics | Comentario |
|---|---|---|---|
| Ver los partidos de hoy de la liga chilena (portada) | ⚠️ | 0 (scroll de ~1,4 pantallas) | Chile Primera es la 2.ª tarjeta, después de "Libertadores Femenina". Los nombres se cortan: "Universi…", "Unión L…", "Deporte…". En la misma tarjeta hay tres equipos "Universidad…" que no se distinguen. Los números de colores (0.60, 1.40) y el pick "2 · 47%" no tienen leyenda. |
| Buscar "chile" con el buscador | ❌ → ✅ | 3 (escribir, ☰, tocar la liga) | Al escribir no pasa nada en pantalla. El resultado solo aparece al abrir ☰, y no hay nada que lo indique. |
| Champions | ⚠️ | 3 (buscador, ☰, tocar) | Hoy no hay partidos de Champions, porque se juega el 3 y el 4 de noviembre. La página de la liga cargó en 2,4 s y la columna 1·X·2 sale vacía (aun así gastó 1 crédito). |
| Resultado de un partido en vivo | ⚠️ | 2 ("En vivo", tocar el marcador) | En "En vivo", Chile sale primero, lo que está bien. La ficha de U. La Calera 1-1 U. Católica (45') dice "Sin eventos registrados todavía" pese al 1-1, y muestra cuotas previas al partido (actualizadas a las 13:13) sin decir que son previas. |
| Tabla de su liga | ⚠️ | 3-4 | Carga en 1,0 s. En el móvil solo se ven #, Equipo, PJ, V, E y D. Para ver los **puntos** hay que deslizar la tabla hacia el lado (887 px de tabla en 342 px de pantalla). |
| Leer sin zoom ni scroll horizontal | ✅ | – | `scrollWidth` = 375 en todas las pantallas. La cabecera fija ocupa 168 px, un 21 % de la pantalla. |

### Diego, apostador frecuente (tablet 768×1024, luego escritorio 1440×900)

| Tarea | Estado | Clics | Comentario |
|---|---|---|---|
| Ver las Predicciones de hoy | ⚠️ | 1 | Carga en 0,3 s. Las 134 predicciones ya terminadas van antes que las "A jugar", así que los picks que le sirven quedan al final de una página de unos 13.000 px. |
| Entender por qué se eligió un pick | ✅ | 2 | Al tocar la fila (U. de Concepción vs Limache) se ven las probabilidades 1X2, los goles, los marcadores probables, los goles esperados, las cuotas medias y "Valor estimado +12 %". Muy bueno. Falta que diga cuántos puntos de ventaja sobre la liga tiene el pick. |
| Revisar Apuestas diarias | ⚠️ | 1 | Carga en 0,3 s y la explicación es clara. Las selecciones ganadas solo se marcan con un borde verde fino, y la cuota total (1.45, 2.86) es la "justa" del modelo, no una cuota que se pueda conseguir. |
| Armar un cupón de 4 selecciones | ✅ | 7 | 3 desde Destacados y 1 desde Competencias → Primera de Chile → Todos los mercados → "Ambos marcan: sí". Antes hubo que pulsar "Vaciar", que borró 6 selecciones sin pedir confirmación. |
| Escribir la cuota en unas selecciones y en otras no | ✅ | 2 | Acepta "1,55" con coma. La cuota de Barcelona se rellenó sola con la media del mercado (1.56) en el campo "Cuota de tu casa". |
| Evaluar el cupón | ✅ | 1 | 2,0 s. Veredicto "Arriesgada", 15 % de acierto y cuota mínima 6,64, con buena explicación. |
| Aplicar una sugerencia del analista | ⚠️ | 2 | Con una selección sin cuota no hubo ninguna sugerencia. Al poner 1.20 en Maipú aparecieron "Quitar" y "Cambiar por…", y "Cambiar" funcionó. Pero el veredicto "Sin valor" quedó en pantalla como si siguiera vigente, y el botón "Quitar del cupón" siguió activo para una selección que ya no estaba, sin hacer nada al pulsarlo. |
| Entender los números (probabilidad, cuota justa, valor) | ⚠️ | – | Para Antofagasta, el cupón dice cuota justa 1.46 (69 %) y la evaluación dice cuota justa 1.54 (65 %). Al escribir una cuota baja, la probabilidad de Maipú subió de 70 % a 75 %. "Ganancia posible $52.229" es el pago total, no la ganancia. |

### Visitante nuevo en escritorio (1440×900)

| Tarea | Estado | Clics | Comentario |
|---|---|---|---|
| Entender en 10 s qué es Masterfutbol | ⚠️ | 0 | El H1 dice "Los partidos que el modelo ve más claros": no explica qué modelo ni qué es el sitio. Aparece jerga sin explicar ("Justa 1.59", "PROB.", "No marcan ambos") y la página no tiene `meta description`. |
| Encontrar Estadísticas | ✅ | 1 | Carga en 0,3 s. Los rankings son claros y la página es honesta sobre los datos que faltan. |
| Encontrar una liga con el buscador | ⚠️ | 1 | En escritorio filtra el menú lateral al instante: "bundesliga", "inglaterra", "england" y "peru"/"perú" funcionan. "mexico" no da resultados porque la Liga MX no está en el catálogo, y "primera division chile" tampoco encuentra nada. |
| Abrir un pick del carrusel ("Analizar →") | ⚠️ | 1 | La ficha de Barcelona-Real Madrid tardó 6,0 s (`/api/partido/2506259`: 5961 ms) y no muestra el pick ni la probabilidad del modelo. |
| ¿Le dan ganas de volver? | ⚠️ | – | No hay nada personal: ni ligas favoritas, ni historial de cupones, ni alertas. |

## 3. Hallazgos priorizados

| # | Prioridad | Pantalla | Qué pasa | Evidencia | Propuesta |
|---|---|---|---|---|---|
| 1 | **Alta** | Cabecera, móvil | El buscador no da ningún resultado visible: filtra el menú lateral, que en el móvil está oculto (`display:none`), hasta que el usuario abre ☰. | 375×812: se escribió "chile" y la pantalla no cambió. `.lateral` estaba en `display:none`. `public/app.js:1276` solo llama a `pintarArbol`. | En pantallas de menos de 1100 px, abrir el lateral al escribir (`lateral.classList.add("abierto")` dentro del listener de `input`), o mostrar los resultados en un desplegable bajo el buscador. |
| 2 | **Alta** | Portada → ficha de partido | "Analizar →" del carrusel lleva a `#/partido/ID`, que no muestra el pick, la probabilidad ni los goles esperados del modelo. El usuario no encuentra el análisis que se le prometió. | Ficha de Barcelona-Real Madrid: el texto no contiene "modelo", "probabilidad" ni "goles esperados". `vistaPartido` (`public/app.js:464-505`) solo pinta cuotas, estadísticas, cronología y últimos partidos. | Añadir una tarjeta "Pronóstico del modelo" en `vistaPartido` que reutilice el detalle de Predicciones (probabilidades, marcadores, explicación y valor) y un botón "Añadir al cupón". Otra opción es que "Analizar" apunte a `#/simulador/partido/ID`. |
| 3 | **Alta** | Portada (y ficha con cuotas) | El aviso "+18 / no es consejo de apuesta" solo está en el pie, a 47.021 px en escritorio. El carrusel muestra picks y cuotas sin aviso, y la tarjeta "Cuotas 1X2" de la ficha tampoco lo tiene. | 1440×900: `footerTop` = 47.021 y la portada no contiene "+18" ni "consejo". El mismo resultado en `#/partido/2506259`. | Añadir una línea corta bajo el carrusel y bajo "Cuotas 1X2", igual que la franja del Simulador: "Estimaciones, no consejo de apuesta · +18". |
| 4 | **Alta** | Predicciones → "En números" | "Acierto en los últimos 7 días: 60 % (81 de 134)" cuenta en realidad solo partidos de hoy. Las 134 predicciones evaluadas empiezan a partir del 25-10 05:00 UTC, y "205 en las últimas 24 h" coincide con las "205 guardadas en total". El rótulo exagera el historial en que se basa la cifra de confianza. | Hoy, en la lista, hay 81 ✓ y 53 ✗, lo mismo que "en números". En `data/predicciones.json` la predicción más antigua es del 2026-10-25T05:00Z. | Rotular según los datos reales ("desde el 25 de octubre", con el número de días) y mostrar "pocos datos" mientras haya menos de 7 días. |
| 5 | Media | Simulador, cupón | "Ganancia posible $52.229" es el pago total (monto × cuota). La ganancia real es de $42.229. La evaluación lo llama bien ("Si aciertas"). | Monto $10.000 × cuota 5.22. `public/app.js:963` devuelve `ganancia: total * monto` y `:1001` le pone la etiqueta "Ganancia posible". | Cambiar el rótulo a "Pago si aciertas", o mostrar "Ganancia" como `total*monto - monto`. |
| 6 | Media | Simulador, evaluación | Al cambiar el cupón, ya sea editando una cuota o aplicando una sugerencia, la evaluación anterior sigue en pantalla sin avisar ("Sin valor", "falta la cuota…"). El botón "Quitar del cupón" de una sugerencia vieja sigue activo y no hace nada. | Después de "Cambiar por 'Deportivo Maipú: más de 1,5 goles'", la pantalla siguió mostrando "Sin valor -16 %". Al pulsar "Quitar del cupón" no cambió nada. | Cuando cambie el cupón, atenuar la evaluación con el texto "Desactualizada: vuelve a evaluar" y desactivar las sugerencias. Otra opción es reevaluar automáticamente después de aplicar una sugerencia. |
| 7 | Media | Simulador, cupón | "Vaciar" borra todas las selecciones (había 6) con un solo clic, sin confirmar y sin deshacer. | Después del clic, `localStorage` quedó en `{"selecciones":[]}`. | Mostrar un aviso "Cupón vaciado · Deshacer" durante 5 s, o pedir confirmación si hay 3 selecciones o más. |
| 8 | Media | Simulador, evaluación | La misma selección tiene dos "cuotas justas" y dos probabilidades. Para Antofagasta: 1.46 / 69 % en el cupón y 1.54 / 65 % en la evaluación. Además, la probabilidad cambia según la cuota que escribe el usuario: Maipú pasó de 70 % a 75 % al escribir 1.20. | Las tablas "Selección por selección" antes y después de escribir la cuota. | Llamar a la columna de la evaluación "Prob. combinada (modelo + casa)" y explicarla en una línea, o mostrar "modelo" y "combinada" en columnas separadas. |
| 9 | Media | Simulador | Barcelona sale en Destacados con "ventaja 17 pts", pero el analista la declara "la selección más débil" (−4 %). Esa conclusión parte de la media del mercado (1.56) que se rellenó sola en el campo "Cuota de tu casa", no de la cuota de su casa. | Cupón de prueba: "tu casa paga 1,56" sin que el usuario la escribiera. | No rellenar el campo de la casa: mostrar la media como texto de ayuda. En Destacados, indicar el valor frente al mercado cuando exista, para que pick y veredicto no se contradigan. |
| 10 | Media | Liga y ficha de partido | Los "últimos 5" de un equipo salen en orden opuesto según la pantalla, y en la misma ficha aparece una tercera versión. U. La Calera: "E D D V E" en la tabla, "E V D D E" en la cabecera de la ficha y "E E E V" en "Últimos de". Nada indica cuál es el más reciente. | La tabla usa el cálculo propio (`server.js:255`, `resultados.slice(-5)`, de antiguo a reciente) y la ficha usa `fila.forma` de TheSportsDB (`public/app.js:471`). | Usar una sola fuente y un solo orden, y marcar el partido más reciente (borde o "más reciente →"). |
| 11 | Media | Ficha de partido en vivo | Con el partido en juego (1-1, 45') se muestran las cuotas 1X2 previas sin decir que lo son, y la cronología dice "Sin eventos registrados todavía" pese al 1-1. | `#/partido/2413109`: "actualizado 25/10, 13:13". | Con `estado === "en_vivo"`, titular la tarjeta "Cuotas previas al partido". En la cronología vacía con goles, escribir "TheSportsDB aún no publica los goles de este partido". |
| 12 | Media | Portada y "En vivo" | Basta con mirar una lista para gastar créditos: cada tarjeta de liga con clave que entra en pantalla pide `/api/cuotas/ID`. Con 196 ligas en la portada, quien recorra la lista puede gastar decenas de créditos de 500 al mes. | En la prueba, solo ver "En vivo" en el móvil gastó 1 crédito (491 → 490, `/api/cuotas/4406`). `public/app.js:119` y `:422`. | En listas y páginas de liga, leer solo la caché (como ya hace el Simulador) y pedir cuotas nuevas solo en la ficha, o solo para las ligas principales. |
| 13 | Media | Ficha de partido | La carga es lenta: 6,0 s para Barcelona-Real Madrid. | `/api/partido/2506259`: 5961 ms. | Pintar primero la cabecera (equipos, hora, posición) y cargar después las cuotas y los últimos partidos, o paralelizar y cachear `ultimosEquipo`. |
| 14 | Media | Portada | Un visitante nuevo no entiende qué es el sitio. El H1 habla de "el modelo" sin explicarlo, y la jerga "Justa 1.59", "PROB." y "No marcan ambos" queda sin explicar. Tampoco hay `meta description`. | Escritorio, a la vista sin hacer scroll. | Añadir una línea bajo la marca ("Estadísticas, pronósticos y simulador de apuestas sin dinero real para más de 400 ligas"), tres accesos (Partidos y tablas · Pronósticos · Simulador) y un `title` en "Justa" que diga "cuota justa = 1 / probabilidad del modelo". |
| 15 | Media | Portada y "En vivo", móvil | Los nombres de los equipos se cortan a 100 px: "Universi…" frente a "Universi…" no se distinguen. | 375×812: en las 3 primeras tarjetas hay 10 nombres truncados (Universidad Católica, Universidad de Concepción, Unión La Calera…). | En el móvil, poner el nombre en dos líneas o usar el nombre corto ("U. Católica", "U. de Chile"). |
| 16 | Media | Página de liga, móvil | En la tabla de posiciones no se ven los puntos sin deslizar la tabla. | 375×812: tabla de 887 px en un contenedor de 342 px, con las columnas visibles #, Equipo, PJ, V, E y D. | En el móvil, ordenar las columnas como #, Equipo, PJ, DG, **Pts**, Forma y el resto, y fijar la columna del equipo. |
| 17 | Media | Portada, filas de partido | Las cajas de colores de forma (0.60, 1.40) y el pick ("2 · 47 %", "−3.5 · 69 %") no tienen leyenda. Un pick con 47 % de probabilidad confunde. | Tarjeta de Chile Primera, móvil y escritorio. | Añadir una leyenda corta sobre la lista ("Forma: puntos por partido en los últimos 5 · Pick del modelo y su probabilidad") y un `title` en las cajas de forma. |
| 18 | Media | Predicciones "Hoy" | Las predicciones terminadas van primero y las que interesan (por jugar) quedan al final de unos 13.000 px. | 768×1024: 134 terminadas y 24 en juego antes de las "A jugar". | Añadir filtros "Por jugar · En juego · Terminadas" (como en la portada) o mostrar primero las que faltan por jugar. |
| 19 | Media | Cabecera y subnavegación, móvil | La cabecera fija ocupa 168 px (21 % de la pantalla) y, en el Simulador, se suma la barra del cupón (53 px). La subnavegación tiene 10 enlaces en un carril horizontal de 1051 px sin indicador: "Apuestas d" queda cortado y Simulador y Estadísticas no se ven. | 375×812: `header` `position: sticky` de 168 px, `.subnav` `scrollWidth` 1051 frente a 375. | Ocultar el buscador al hacer scroll hacia abajo y añadir un degradado o una flecha en el borde derecho de la subnavegación. |
| 20 | Media | Portada, móvil | Los objetivos táctiles son pequeños: el marcador (enlace a la ficha) mide 42×17-24 px, los enlaces de equipo 23 px de alto, "Tabla ›" 42×20 y los puntos del carrusel 40×28. | Medición con `getBoundingClientRect` a 375×812. | Hacer clicable la fila entera hacia la ficha, o dar al marcador y a los enlaces un mínimo de 44 px de alto. |
| 21 | Media | Buscador / catálogo | No existe México (Liga MX) en el catálogo, y la búsqueda con varias palabras ("primera division chile") no encuentra nada. | `data/ligas.json` no tiene ninguna coincidencia con "mexic". La búsqueda es por subcadena exacta (`public/app.js:1243`). | Añadir México a `PAISES` en `scripts/catalogo_ligas.py`, y buscar por palabras (que todas coincidan con país + liga) sin distinguir tildes. |
| 22 | Baja | Apuestas diarias | Todas las cuotas son "justa" (1/probabilidad), así que la cuota total (1.45; 2.86) no es una cuota que se pueda conseguir, y "justa" se ve en letra muy pequeña. | Hoy y mañana, todas las selecciones tienen `cuota_tipo: "justa"`. | Escribir "Cuota justa del modelo (sin margen de la casa)" junto a la cuota total y la cuota mínima recomendada. |
| 23 | Baja | Apuestas diarias | Una selección ganada solo se distingue por un borde verde fino, sin "Ganada" ni ✓, y los partidos terminados no dicen "Final". | Riesgo de hoy: Angers 0-0 y Celta 0-0 están ganadas (estado `ganada` en `/api/apuestas`). | Añadir una etiqueta de estado por fila ("Ganada", "Perdida", "En juego"). |
| 24 | Baja | Toda la web | Se mezclan separadores decimales: cuotas con punto ("1.56") y textos con coma ("1,54 puntos", "más de 1,5 goles") en la misma pantalla. | Simulador, ficha de Palestino-Colo-Colo. | Usar coma decimal (es-CL) en todos los números, o al menos en todo lo que no sea una cuota. |
| 25 | Baja | Simulador | Hay un error gramatical: "Escribe la cuota de tu casa para la nueva selección y volver a evaluar el cupón". | Mensaje que aparece después de aplicar "Cambiar por". | Cambiar a "…y vuelve a evaluar el cupón". |
| 26 | Baja | Menú lateral | El encabezado "COMPETENCIAS PRINCIPALES" aparece vacío en búsquedas sin coincidencias internacionales, y el texto del buscador se queda al cambiar de página. | Búsquedas "chile" y "mexico". | Ocultar el encabezado si no hay resultados y limpiar el buscador al navegar a una liga. |
| 27 | Baja | Textos | Los nombres son incoherentes: "Primera Division" sin tilde junto a "Segunda División", "Competiciones" frente a "Competencias", nombres en inglés ("Women Bundesliga", "Primera Federación Group 1") y "Portería a cero" (de España) en lugar de "valla invicta" o "arco en cero". | Menú, Simulador › Competencias, leyenda de la tabla. | Usar `nombre_es` en todo el catálogo y revisar el glosario para Chile. |
| 28 | Baja | Estadísticas | Braga aparece con el país "Internacional", y el menú dedica 8 entradas a estadísticas "sin datos". | Tarjeta "Más porterías a 0" en `#/stats`. | Tomar el país de la liga doméstica del equipo y agrupar lo que no está disponible en una sola línea "No disponible: córners, tarjetas…". |
| 29 | Baja | Simulador / En vivo | El título de la pestaña no cambia en el Simulador ("Masterfutbol — partidos…"), y en "En vivo" las pestañas de días no tienen ninguna activa. | `document.title` en `#/simulador`. | Poner `document.title = "Simulador de apuestas — Masterfutbol"` y ocultar las pestañas de días en "En vivo". |
| 30 | Baja | Portada, móvil | La portada mide unos 72.000-79.000 px (713 partidos de 196 ligas) y no se pueden plegar ligas. | `document.body.scrollHeight` a 375×812. | Plegar por defecto las ligas que no son principales (con un contador de partidos) y añadir "Mis ligas" (ver idea 1). |
| 31 | Baja | En vivo | El minuto va con retraso respecto del reloj real. U. La Calera (inicio 15:00) marcaba 45' alrededor de las 15:55 y 49' hacia las 16:15. | Lista "En vivo" y portada. Es una limitación de TheSportsDB, sin confirmar contra el partido real. | Mostrar "actualizado hace X min" junto al minuto. |

## 4. Ideas para hacerla más atractiva

Ordenadas por impacto frente a esfuerzo:

1. **"Mis ligas" favoritas** (una estrella en el menú, guardada en `localStorage`), que fije esas tarjetas arriba en la portada, en "En vivo" y en Predicciones. Esfuerzo bajo. *Volvería* porque al abrir la web vería primero el fútbol chileno y lo suyo, sin buscar entre 196 ligas.
2. **Tarjeta "Pronóstico del modelo" en la ficha de partido**, con un botón "Añadir al cupón". Une Partidos, Predicciones y Simulador, y resuelve el hallazgo 2. *Volvería* porque cada partido que mira tendría una opinión y un siguiente paso.
3. **"Mis simulaciones":** guardar los cupones evaluados y marcarlos como ganados o perdidos cuando terminen los partidos, reutilizando la evaluación que ya existe para las predicciones (está en la fase 4 del README). *Volvería* a ver si su cupón habría ganado.
4. **Compartir un pick o un cupón** como enlace (`#/simulador?c=…`) o como imagen con el veredicto del analista y el aviso +18. *Volvería* con amigos, porque el enlace trae gente nueva.
5. **Una página de "transparencia" del modelo** con el acierto por semana y por mercado y una gráfica de calibración (cuando haya 7 días o más de datos reales). *Volvería* porque vería que los números se cumplen, que es la base de la confianza del apostador.

## 5. Lo que funciona bien (no romperlo al mejorar)

- **Estabilidad:** no hubo errores de consola ni peticiones fallidas en todo el recorrido, y ninguna pantalla tiene scroll horizontal en el móvil.
- **Velocidad:** Predicciones, Apuestas diarias, Simulador y Estadísticas cargan en unos 0,3 s, y la lista de partidos de la portada en 0,45 s.
- **Detalle de cada predicción:** probabilidades 1X2 y de goles, marcadores más probables, goles esperados con su explicación, cuotas medias y valor estimado. Es el mejor contenido de la web.
- **Simulador:**
  - El aviso "sin dinero real · no es consejo · +18" está arriba y dentro del cupón.
  - Los botones miden 44 px en el móvil y la barra del cupón queda fija abajo.
  - La selección ya añadida se resalta.
  - Acepta la coma decimal.
  - Da la cuota mínima a buscar cuando falta una cuota.
  - El veredicto viene con motivos, y el texto del analista es claro.
  - "Cambiar por…" funciona con un clic.
- **"En vivo":** Chile sale primero, y Chile viene abierto por defecto en el menú.
- **Apuestas diarias:** los estados vacíos son honestos ("la sección empezó a registrar el 24 de octubre") y la explicación de Doble y Riesgo está al final.
- **Estadísticas:** los rankings son legibles y la página es transparente sobre los datos que no hay en TheSportsDB.
- **Carrusel:** se pausa con el ratón o el foco y respeta "reducir movimiento".

## No probado

- La ficha de equipo (`#/equipo/ID`) y la pestaña "Próximos" del Simulador.
- Las páginas de otras ligas, que no se abrieron para no gastar más créditos.
- La navegación solo con teclado y los lectores de pantalla.
- Un tema claro (la web solo tiene tema oscuro).
- La parte visual de la tablet, evaluada solo a medias: el panel del navegador recortaba las capturas a 768×1024, así que los datos de esa vista salen del DOM.

## Corregido (25-oct-2026)

- **#1 Buscador en el móvil**: al escribir con la pantalla de 900 px o menos se abre el menú de
  competencias con los resultados (`public/app.js`, listener de `input` del buscador).
- **#2 Pronóstico en la ficha**: nueva tarjeta "Pronóstico del modelo" en `#/partido/ID` (pick,
  probabilidad, cuota justa, ventaja sobre la liga, probabilidades, marcadores, goles esperados,
  "Añadir al cupón" y enlace a todos los mercados). Endpoint nuevo `GET /api/prediccion/ID`. Si no
  hay pronóstico, lo explica y enlaza al Simulador. La lentitud de la ficha (#13) sigue pendiente:
  4,7 s en la prueba.
- **#3 Aviso +18**: bajo el carrusel de la portada, en la tarjeta del pronóstico y en "Cuotas 1X2".
- **#4 Acierto de Predicciones**: con menos de 7 días de datos el rótulo dice "desde el <fecha>
  (N días de datos)" y avisa de "pocos datos todavía"; el total muestra desde cuándo hay datos.
- **#12 Créditos**: `/api/cuotas/ID` solo lee la caché (`cuotas.soloCache`); solo la ficha de un
  partido pide cuotas nuevas. Prueba: 10 ligas consultadas, créditos 489 → 489.
- **#5 Ganancia**: el cupón dice "Pago si aciertas" (monto × cuota) y debajo "ganas $X sobre lo apostado".
- **#6 Evaluación desactualizada**: si el cupón cambia después de evaluar, aparece "El cupón cambió desde
  esta evaluación" con el botón "Volver a evaluar", la cabecera se atenúa y se desactivan las
  sugerencias de selecciones que ya no están. Si el cambio se deshace, el aviso desaparece.
- **#7 Vaciar**: deja "Cupón vaciado (N selecciones) · Deshacer".
- **#8 Dos probabilidades**: la evaluación rotula "Prob. estimada" y "Cuota justa estimada" y explica
  bajo la tabla que mezclan el modelo con la cuota (50/25/15% según el mercado).
- **#9 Cuota rellenada sola**: al añadir una selección, "Cuota de tu casa" queda vacía; la media del
  mercado se muestra como ayuda (y como ejemplo en el campo) y el servidor la usa si no escribes la
  tuya. El analista dice "la cuota media del mercado es" en vez de "tu casa paga" en ese caso.
  Destacados muestra además el valor frente a la cuota media ("ventaja 17 pts sobre la liga · frente
  a la cuota media 1,56: valor −3%").
- **Extra (encontrado al probar)**: un partido ya empezado bloqueaba toda la evaluación. Ahora el cupón
  lo marca ("ya empezó: quítalo") y la evaluación ofrece "Quitarlos y evaluar el resto".
- **#13 Ficha lenta**: cada petición a TheSportsDB espera su turno en la cola (~0,66 s) y la ficha hacía
  hasta 7 seguidas. Ahora: no pide la alineación (no se muestra), ni estadísticas ni cronología antes
  del partido; la hora en vivo va en paralelo; las cuotas se emparejan solo con este partido (sin
  descargar la temporada de la liga); y los últimos partidos de cada equipo llegan aparte
  (`GET /api/partido/ID/ultimos`) y se pintan cuando llegan. Medido sin caché: antes 4,0-5,0 s; ahora
  0,4-1,6 s la ficha (un caso 3,1 s) y ~1,3 s más para los últimos partidos.
- **#10 Forma**: la de TheSportsDB (del más reciente al más antiguo) se invierte en `tabla()` para que
  toda la web la muestre del más antiguo al más reciente; el más reciente lleva un borde y la forma
  tiene un `title` que lo explica. Los "Últimos de…" de la ficha siguen siendo otra cosa (todas las
  competiciones, con fecha).
- **#11 En vivo**: la tarjeta de cuotas se titula "Cuotas previas al partido · no se actualizan en
  vivo", y la cronología vacía con goles explica que TheSportsDB los publica con retraso.
- **#14 Portada**: línea de qué es el sitio, accesos a Tablas y estadísticas · Pronósticos ·
  Simulador, `meta description` y `title` en "Justa"/"Cuota" y en "PROB.".
- **#15 Nombres**: en el móvil van en dos líneas (5 de 30 siguen cortados en la tercera línea, nombres
  muy largos).
- **#16 Tabla en el móvil**: columna "Pts" justo después del equipo (en escritorio sigue en su sitio)
  y columna del equipo fija al deslizar.
- **#17 Leyenda**: sobre la lista de partidos explica las cajas de puntos por partido y el pick.
- **#18 Predicciones**: en Hoy/Mañana/Matemáticas, grupos "Por jugar", "En juego" y "Terminadas".
- **#19 Cabecera en el móvil**: fija; al bajar oculta el buscador (168 → 116 px) y al subir vuelve.
  La primera versión parpadeaba (el contenido se movía y el navegador corregía el scroll); con la
  cabecera fija hay un solo cambio por gesto. La subnavegación se desvanece en el borde y deja a la
  vista la sección actual.
- **#20 Toques**: toda la fila de un partido abre su ficha; marcador, equipos y puntos del carrusel
  con al menos 36-44 px.
- **#21 Búsqueda y México**: búsqueda por palabras y sin tildes ("primera division chile",
  "mexico", "liga mx"). México añadido al catálogo (Liga MX 4350, Liga de Expansión MX, Liga
  Femenil, Campeón de Campeones) y a `PAISES` de `scripts/catalogo_ligas.py`. Sin cuotas todavía: falta
  añadir su clave en `CLAVES_ODDS` y verificarla con `npm run cuotas:verificar`.

