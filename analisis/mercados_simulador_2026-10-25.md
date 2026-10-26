# Calibración de los mercados nuevos del Simulador — análisis y propuesta (25-oct-2026)

**Estado: APLICADA el 25-oct-2026** (aprobada por el usuario): `mercados.js` tiene ahora una tabla
`AJUSTE` con el α y la confianza de cada grupo. Ver "Aplicado" al final.

Prueba: `node scripts/backtest_mercados.mjs` (con el servidor en marcha). Recorre **9.584 partidos de
115 ligas** sin mirar el futuro: cada partido se calcula solo con los anteriores de su temporada,
con el mismo código que usa el servidor (`golesEsperados` de `predicciones.js` y la matriz de
`mercados.js`). Para cada uno de los 70 mercados compara:

- **liga**: las medias de goles de la liga, sin mirar a los equipos (la referencia que hay que superar);
- **modelo**: el modelo tal cual;
- **actual**: lo que usa hoy el Simulador (40% modelo + 60% liga en los mercados que "calibran");
- **óptimo**: la mezcla α·modelo + (1−α)·liga que mejor acierta en cada grupo.

"Habilidad" = cuánto mejora el log loss sobre la liga (más es mejor; 0 = no aporta nada).
"ECE" = error medio entre la probabilidad prevista y la frecuencia real.

## Resultados por grupo

| Grupo | Confianza hoy | α hoy | Habilidad hoy | α óptimo (1ª / 2ª mitad) | Habilidad óptima | ECE hoy |
|---|---|---|---|---|---|---|
| Resultado 1X2 | alta | 1 | +3,1% | 1 (1 / 1) | +3,1% | 0,3% |
| Doble oportunidad | alta | 1 | +3,1% | 1 (1 / 1) | +3,1% | 0,3% |
| Goles totales | media | 0,4 | +0,4% | 0,4 (0,4 / 0,4) | +0,4% | 0,9% |
| Ambos marcan | media | 0,4 | +0,1% | 0,3 (0,2 / 0,3) | +0,1% | **2,5%** |
| Goles del local | baja | 0,4 | +1,8% | **0,9** (0,9 / 1) | **+2,7%** | 0,3% |
| Goles del visitante | baja | 0,4 | +1,4% | **0,8** (0,7 / 0,9) | **+1,9%** | 0,9% |
| Hándicap | baja | 1 | **+5,4%** | 1 (1 / 1) | +5,4% | 0,5% |
| Combos | baja | 0,4 | +1,2% | **0,9** (0,8 / 1) | +1,7% | 0,4% |
| Resultado exacto | baja | 1 | +0,9% | 0,8 (0,8 / 0,9) | +0,9% | 0,2% |

La habilidad es estable según los partidos jugados (4-7, 8-14, 15+) en todos los grupos.

### Lo que dice

1. **Hándicap es el grupo más fiable de todos** (+5,4%, igual en las dos mitades y en todos los
   tramos de partidos jugados, bien calibrado). Hoy está marcado como confianza baja sin motivo:
   es la misma información que el 1X2, medida sobre una diferencia de goles.
2. **Goles por equipo: el modelo sí acierta, y la mezcla 40/60 le quita la mitad.** A diferencia de
   los goles totales, aquí el modelo mejora claramente a la liga (+2,7% el local, +1,9% el
   visitante). El α óptimo es 0,8-0,9 y es estable. Con la mezcla actual las probabilidades se
   aplastan hacia la media de la liga: las selecciones con ventaja ≥ 5 pts prometían +6,6 pts y
   dieron **+15,8 pts** reales (local). Con α óptimo prometen +9,7 y dan +9,8: honestas.
3. **Combos: igual que goles por equipo.** α óptimo 0,9; con él aparecen 74 selecciones con ventaja
   ≥ 5 pts que prometen +24 pts y dan +28 pts reales. Con la mezcla actual no aparece ninguna.
4. **Ambos marcan no aporta casi nada** (+0,1% con cualquier mezcla) y es el peor calibrado:
   cuando dice 64% sale 59%, y cuando dice 72% sale 67%. Las selecciones con ventaja ≥ 5 pts
   prometían +6,1 pts y dieron +5,0 (207 casos). Su confianza "media" es generosa.
5. **Goles totales: la mezcla 40/60 de hoy es exactamente la óptima** (α 0,4 en las dos mitades).
   Aporta poco (+0,4%), pero lo que sugiere se cumple: prometía +6,3 pts y dio +7,6.
6. **Resultado exacto**: mejora mínima (+0,9%), con mucho ruido marcador por marcador (unos
   mejoran un 5%, otros empeoran). α 0,8 o 1 dan lo mismo. Sigue siendo confianza baja.
7. **Dixon-Coles (corrección de los marcadores bajos) no hace falta.** El modelo ya prevé 25,8% de
   empates frente al 25,6% real; con ρ negativo mejora un pelo "ambos marcan" pero empeora el 1X2
   y el marcador exacto. ρ = 0 (sin corrección) es lo mejor.

## Propuesta

| Grupo | α | Confianza | Cambio |
|---|---|---|---|
| Resultado, doble | 1 | alta | ninguno |
| Goles totales | 0,4 | media | ninguno |
| Ambos marcan | 0,4 | media → **baja** | baja la confianza (no la mezcla: 0,3 y 0,4 dan lo mismo) |
| Goles del local | 0,4 → **0,9** | baja → **media** | mezcla y confianza |
| Goles del visitante | 0,4 → **0,8** | baja → **media** | mezcla y confianza |
| Hándicap | 1 | baja → **alta** | confianza |
| Combos | 0,4 → **0,9** | baja → **media** | mezcla y confianza |
| Resultado exacto | 1 | baja | ninguno |

Qué cambiaría para el usuario:

- **Cuotas justas de los botones**: cambian en goles por equipo y combos (se separan más de la
  media de la liga, porque el modelo pesa más). Las de 1X2, doble, totales, ambos marcan, hándicap
  y exacto no cambian.
- **Analista del cupón**: la confianza decide cuánto pesa el modelo frente a la cuota de la casa
  (alta 0,5, media 0,25, baja 0,15). Hándicap pasaría a pesar 0,5; goles por equipo y combos 0,25;
  ambos marcan bajaría a 0,15.
- **Sugerencias "cambiar por"**: hoy solo proponen mercados de confianza alta o media. Con el
  cambio podrían proponer hándicap, goles por equipo y combos, y dejarían de proponer "ambos marcan".
- **No afecta** a Predicciones ni a Apuestas diarias: usan `predicciones.js`, que no se toca.
  (Ambos marcan sigue disponible ahí como pick; esta prueba confirma que sus picks con ventaja
  ≥ 5 pts se cumplen algo por encima de la liga, aunque menos de lo prometido.)

Implementación: en `mercados.js` el campo `calibra` (sí/no) pasaría a un α por grupo, y se
cambiarían las confianzas de las definiciones.

## Lo que esta prueba NO mide

- **La mezcla con la cuota de la casa** (pesos 0,5 / 0,25 / 0,15 del cupón). Para calibrarla hacen
  falta cuotas históricas de cada mercado, y solo tenemos 1X2 de hoy (The Odds API, plan gratis).
  Los pesos actuales siguen siendo una decisión de prudencia, ahora ordenada por la habilidad medida.
- Córners, tarjetas y medio tiempo: no están en el modelo (fase 3).
- Que haya valor frente a las casas: el modelo supera a la media de la liga, no necesariamente a
  la cuota de una casa, que ya incorpora mucha más información.

## Aplicado (25-oct-2026)

- `mercados.js`: tabla `AJUSTE` por grupo (α y confianza exactamente como en la propuesta). Con
  selecciones de grupos distintos del mismo partido, la probabilidad conjunta usa el α más bajo.
- `cupon.js`: el aviso de confianza baja ahora habla de "ambos marcan o resultado exacto".
- `public/app.js`: la etiqueta de confianza baja dice "Aporta poco: pesa más la cuota".
- `scripts/backtest_mercados.mjs` lee el α de cada mercado, así que "actual" ya es la mezcla nueva.
- Cupón de ejemplo: sigue **Sin valor**, ahora con probabilidad 33,5% y valor esperado −13,7%
  (antes 31% y −21%), y sugerencias de hándicap y goles por equipo que antes no aparecían.
- Predicciones y Apuestas diarias no cambian (usan `predicciones.js`).
