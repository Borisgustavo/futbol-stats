Listo: desde ahora la Doble tiene que pagar **al menos 1,80 en total**. Abajo te explico qué cambié y lo que cuesta.

## Por qué salía en 1,45

La regla anterior era "las 2 selecciones más probables del día con 68% o más". Como siempre elegía las más seguras, la cuota total quedaba baja. La de hoy (25/10) es un buen ejemplo:

- Fortuna Sittard vs Excelsior, Más de 1,5 goles: 89%, cuota 1,13 (justa)
- Nacional de Madeira vs Braga, Más de 1,5 goles: 78%, cuota 1,28 (justa)
- **Total: 1,45, con una probabilidad del modelo del 69%**

Además, la primera selección aporta poco: en la Eredivisie ese mercado sale el 90% de las veces y el modelo le da 89%. Es un mercado fácil, no una ventaja.

## Lo que cuesta pedir 1,8

Una cuota justa de 1,80 equivale a un **56% de probabilidad combinada**, frente al 69% de antes. Es decir, la Doble va a fallar bastante más a menudo: más o menos 4 de cada 9 veces en lugar de 3 de cada 10, si el modelo está bien calibrado. No es un modelo mejor, es el mismo modelo apostando más arriesgado.

## Qué cambié en `apuestas.js`

1. En `TIPOS_APUESTA` la Doble tiene un criterio nuevo, `cuotaMin: 1.8`:
   `doble: { nombre: "Doble", selecciones: 2, probMin: 0.68, probMax: 1, cuotaMin: 1.8 }`
2. Añadí la función `mejorConCuotaMin()`. Revisa todas las parejas posibles que cumplen las reglas de siempre (cada selección con 68% o más y como mucho una por liga) y descarta las que no lleguen a 1,80. La cuota total se redondea igual que en la página, así que lo que se ve nunca baja de 1,80. De las que quedan, elige la que tenga más ligas principales y, a igualdad, **la más probable**. Así la cuota queda justo por encima de 1,8 y no se dispara.
3. Si ningún par llega a 1,80, ese día no hay Doble. No relajo los requisitos para forzarla.
4. La Riesgo funciona igual que antes. Actualicé también el comentario de la cabecera.

`node --check apuestas.js` pasa sin errores.

## Cómo habría quedado con los partidos de hoy

Repetí el armado con los mismos 5 candidatos de hoy, sin guardar nada:

- **Nueva Doble: 1,80**, con un 55% de probabilidad: Nacional de Madeira vs Braga, Más de 1,5 goles (78%, 1,28) + Celta Vigo vs Real Betis, Menos de 3,5 goles (71%, 1,41).
- Si LaLiga y la Ligue 1 cuentan como ligas principales en tu servidor, saldría Angers vs Lorient + Celta vs Betis, 1,97 (51%).

**Un efecto secundario que tienes que conocer:** como ahora la Doble usa selecciones del 68-75%, se cruza con el rango de la Riesgo (55-72%). Con solo 5 candidatos, a la Riesgo le quedaron 2 y **ese día no se habría armado**. En días con más partidos no debería pasar, pero si ves días sin Riesgo, la causa es esta. Si te pasa a menudo, se puede armar la Riesgo antes que la Doble o subir su mínimo de candidatos; dime y lo ajusto.

## Ten en cuenta

- **No se rehace nada de lo que ya existe.** La Doble de hoy (1,45) y la del 23/10 (ganada) siguen congeladas como están. La regla nueva se aplica desde la primera fecha sin combinadas, que es mañana (26/10).
- Si una selección se anula, cuenta como cuota 1 y la Doble puede cerrar por debajo de 1,8. Así funcionan las casas de apuestas.
- Todavía hay muy pocos datos: 1 Doble cerrada (ganada, +0,45 unidades). Cualquier conclusión sobre si 1,45 o 1,8 rinde mejor es ruido por ahora. Vale la pena revisarlo cuando haya unas 20 cerradas.
- Esta es una copia de prueba, así que **no reinicié el servidor**: en tu equipo hay que cerrar el proceso del puerto 3000 y ejecutar `npm start` para que tome el cambio. Tampoco anoté el cambio en el `README.md`, porque esta copia no lo tiene; en el proyecto real habría que añadirlo en la sección de apuestas con fecha 2026-10-25.

Estimaciones de un modelo estadístico, no consejos de apuesta. Juega con responsabilidad (+18).
