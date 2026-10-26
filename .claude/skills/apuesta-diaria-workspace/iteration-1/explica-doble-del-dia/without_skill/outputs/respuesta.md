## La doble del 25 de octubre

| # | Partido | Liga | Hora (UTC) | Pick | Prob. del modelo | Cuota |
|---|---|---|---|---|---|---|
| 1 | Fortuna Sittard vs Excelsior | Eredivisie (Países Bajos) | 11:15 | Más de 1,5 goles | 88,7 % | 1,13 |
| 2 | Nacional de Madeira vs Braga | Primeira Liga (Portugal) | 18:00 | Más de 1,5 goles | 78,1 % | 1,28 |

**Cuota total: 1,45. Probabilidad de acertar según el modelo: 69,3 %.**

Se creó hoy a las 02:56 UTC y ya está congelada: aunque las predicciones cambien durante el día, esta doble no se rehace.

## Por qué el modelo eligió estos dos partidos

La selección es mecánica y no analiza nada caso por caso:

1. Para hoy solo había **5 partidos con predicción**, justo el mínimo que pide el sistema para armar combinadas.
2. Para la doble entran los picks con probabilidad del 68 % o más. Pasaron los 5 (88,7 %, 78,1 %, 71,5 %, 70,7 % y 69,2 %).
3. Los ordena de mayor a menor probabilidad, toma uno por liga y se queda con los dos primeros. Nada más.

Los otros tres (Angers–Lorient menos de 3,5, Celta–Betis menos de 3,5 y River–Racing más de 1,5) fueron a la combinada de riesgo, con cuota 2,86. En la práctica, hoy la doble y la de riesgo son la misma lista de 5 partidos partida en dos.

Cómo sale cada probabilidad: el modelo estima cuántos goles marcará cada equipo y aplica una distribución de Poisson. Lo comprobé y las cifras cuadran exactamente.

- **Fortuna Sittard–Excelsior:** espera 1,71 + 2,02 = **3,7 goles**. Se basa en que Fortuna encaja 2,25 goles por partido en casa (4 partidos) y en que Excelsior marca 2,2 por partido fuera (5 partidos). Con 3,7 goles esperados, que haya 0 o 1 gol solo tiene un 11 % de probabilidad.
- **Nacional–Braga:** espera 1,19 + 1,69 = **2,9 goles**. Se basa sobre todo en que Nacional encaja 2,5 goles por partido en casa (4 partidos).

## ¿Tienen ventaja de verdad o son picks fáciles?

Siendo honesto: **son picks fáciles, y con los datos que hay no se puede demostrar que tengan ventaja.**

- **La doble no busca valor, busca probabilidad.** El criterio es "lo más probable del día", no "donde la casa paga de más". Más de 1,5 goles es de los mercados más seguros que hay, y por eso paga tan poco.
- **No hay cuota de casa para comparar.** En los datos de estos dos partidos, la cuota de mercado y el campo de valor están vacíos. El 1,13 y el 1,28 son **cuotas justas del propio modelo** (1 ÷ probabilidad), no lo que paga una casa. Por eso la cuota de 1,45 tiene ventaja cero por construcción: es el modelo comparándose consigo mismo.
- **Las muestras son minúsculas.** Las dos probabilidades salen de 4-5 partidos por equipo. Un Excelsior que marca 2,2 goles por partido fuera de casa difícilmente lo mantiene toda la temporada. Además, 3,7 goles esperados es bastante más de lo que suele dar un partido de liga normal. Lo más probable es que **el 88,7 % esté inflado** y que la probabilidad real sea algo menor.
- **El modelo no sabe nada más.** No tiene en cuenta lesiones, rotaciones, alineaciones ni motivación: solo goles a favor y en contra recientes.
- **El "historial" que puedas ver no cuenta.** La doble del 23 de octubre que sale como ganada son datos de prueba: son estos mismos partidos y estas mismas probabilidades con resultados inventados (ids `prueba-…`). No es un historial real del modelo.

## Cómo saber si te conviene

Compara con tu casa antes de apostar:

- **Umbrales del modelo:** solo hay valor, según el modelo, si te pagan **más de 1,13** el más de 1,5 del Fortuna–Excelsior, **más de 1,28** el del Nacional–Braga y **más de 1,45** la combinada.
- **Si pagan menos de esos umbrales,** pierdes dinero a la larga incluso creyéndote las probabilidades del modelo.
- **Si pagan más,** el modelo diría que hay valor. Pero esa ventaja solo es tan buena como una estimación hecha con 4 o 5 partidos, así que yo la trataría con mucha cautela.
- **Lo que exige una cuota de 1,45:** acertar como mínimo el 69 % de las veces solo para no perder. Ganas 0,45 por unidad cuando aciertas y pierdes 1 cuando fallas, así que un solo fallo se come más de dos aciertos.

**En resumen:** son dos "más de 1,5 goles" elegidos porque eran los más probables de un día con muy pocos partidos, no porque el modelo haya encontrado una cuota mal puesta. Pueden salir perfectamente, pero tómalos como picks de alta probabilidad y bajo pago, no como una apuesta con ventaja demostrada.
