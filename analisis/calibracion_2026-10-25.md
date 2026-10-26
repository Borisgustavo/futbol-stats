# Calibración del modelo de predicciones — 25 de octubre de 2026

Análisis hecho antes de cambiar nada. Para repetirlo (con el servidor en marcha):
`node scripts/backtest_modelo.mjs`

## Por qué no bastan las 40 predicciones reales

Las primeras 40 predicciones evaluadas acertaron el 52%, cuando el modelo esperaba el 66%.
Pero no son una muestra neutral: la regla elige en cada partido el mercado que **más se aparta
de la media de la liga**, justo donde más se equivoca un modelo con pocos datos. Para esos 40
picks, la media de la liga daba un 57%, el modelo un 66% y el acierto real fue un 52%. Con 40
partidos, eso puede ser en buena parte una mala racha.

## Prueba retrospectiva sin mirar el futuro

9.521 partidos de 115 ligas activas. Cada uno se predijo usando solo los partidos de la
temporada anteriores a su fecha, igual que hace el modelo en la web.

| Log loss (menos es mejor) | 1X2 | Mercados de goles |
|---|---|---|
| Solo la media de la liga | 1,0714 | 0,6299 |
| Modelo actual | **1,0361** | 0,6324 (peor que la media) |
| Propuesta (goles mezclados 40/60 con la media) | 1,0361 | **0,6283** |

- **1X2: el modelo funciona.** Cuanta más ventaja estima, más ventaja real hay. Con 10-15
  puntos estimados sobre la media de la liga, la ventaja real es de +14 puntos; con más de 15,
  de +25.
- **Goles (ambos marcan, más/menos de 1,5/2,5/3,5): el modelo no aporta.** Sus predicciones son
  peores que usar la media de la liga, y la ventaja que estima casi no existe: con 10-15 puntos
  estimados, la real es de +6. En todos esos mercados, lo mejor es mezclar un 30-50% del modelo
  con un 50-70% de la media de la liga.
- **Exceso de confianza moderado:** lo que el modelo da como 80-90% ocurre un 80%, y lo que da
  como 90% o más, un 87%.

## Efecto sobre los picks

| Regla | Picks | % 1X2 | Modelo | Media liga | Real | Ventaja real |
|---|---|---|---|---|---|---|
| Actual | 9.398 | 16% | 65,9% | 58,1% | 62,3% | +4,2 pts |
| Goles 40/60, sin mínimo | 9.298 | 19% | 65,5% | 60,8% | 64,9% | +4,1 pts |
| Goles 40/60 + ventaja ≥ 5 pts | 2.200 | 75% | 62,6% | 48,8% | 63,8% | **+15,0 pts** |

Con la mezcla, las probabilidades pasan a estar bien calibradas (el modelo dice 65,5% y ocurre un
64,9%). Si además se exige una ventaja mínima de 5 puntos, los picks se concentran en 1X2, donde
el modelo sí sabe algo, y la ventaja real frente a la media de la liga pasa de +4 a +15 puntos, a
cambio de dar pick solo en 1 de cada 4 partidos.

## Aplicado el 2026-10-25 (opción A)

Aprobado por el usuario y aplicado en `predicciones.js` (`calibrar()`, `PESO_MODELO_GOLES = 0.4`,
`VENTAJA_MINIMA = 0.05`, `VERSION_MODELO = "2026-10-25"`). Al recalcular: de 285 predicciones
pendientes quedaron 141. Las 90 que siguen con el modelo anterior son partidos ya empezados o a
menos de 1 hora (congelados), y las 58 ya evaluadas no cambiaron. Los picks nuevos tienen una
ventaja media de 14 puntos sobre la media de la liga.

Efecto en las apuestas diarias (simulado con `simular_armado.mjs`): con las probabilidades de
goles más bajas, la Doble (68% o más) no se arma algunos días; por ejemplo, el 26-oct no habría
Doble y el 27-oct sí (cuota 1,67). La Riesgo se sigue armando. Revisar los criterios de la Doble
es la siguiente decisión pendiente.

## Propuesta original

1. En `predicciones.js`, mezclar los mercados de goles: `p = 0,4 · modelo + 0,6 · media de la
   liga`. El 1X2 queda igual.
2. Elegir el pick solo si supera en 5 puntos o más la media de la liga en ese mercado (opción A),
   o mantener un pick por partido y marcar los que tienen ventaja (opción B).
3. Las predicciones ya congeladas o evaluadas no se tocan; las pendientes se recalculan solas en el
   siguiente ciclo.
4. Revisar después el efecto sobre la Doble y la Riesgo: con las probabilidades de goles más
   bajas, habrá menos selecciones de goles por encima del 68%.
5. Repetir esta prueba cada mes o cuando haya ~150 predicciones reales evaluadas.
