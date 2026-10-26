Listo. Cambié el código para que la Doble pague como mínimo 1,8 de aquí en adelante.

**Por qué salía en 1,45.** La regla vieja tomaba las 2 selecciones más probables (68% o más) una a una. Eso siempre la llevaba a mercados muy fáciles. Las de hoy son Más de 1,5 goles en el Fortuna Sittard–Excelsior (89%, cuota 1,13) y en el Nacional–Braga (78%, 1,28). Además, la primera no tiene ventaja: en la Eredivisie ese mercado ocurre el 90% de las veces.

**Qué cambié (`apuestas.js`)**
- En `TIPOS_APUESTA.doble` añadí `cuotaMin: 1.8`. Antes no había cuota mínima.
- Con ese mínimo, la Doble ya no elige selección por selección. Revisa las combinaciones posibles (una por liga, cada selección con 68% o más) y se queda con la de más ligas principales; si empatan, con la más probable que llegue a 1,8. Si ese día ninguna llega a 1,8, no se arma Doble. Prefiero eso a sacar una de 1,5.
- La Riesgo no la toqué: sigue con 3 selecciones de entre 55% y 72%.
- La sintaxis está comprobada con `node --check` y el cambio está anotado con fecha y motivo en el `README.md`.

**El costo: pagar más significa acertar menos.** Una cuota justa de 1,8 equivale a un 55-56% de probabilidad combinada. Antes era ~69%. Según el propio modelo, la Doble pasa a fallar casi 1 de cada 2 días en lugar de 1 de cada 3.

**Cómo habría salido con la regla nueva** (simulación con las predicciones guardadas):

| Fecha | Doble guardada (regla vieja) | Doble con la regla nueva |
|---|---|---|
| 23/10 | 1,45 · 69% · Fortuna + Nacional (ganada) | **1,80** · 55% · Nacional–Braga Más de 1,5 (78%, 1,28) + Celta–Betis Menos de 3,5 (71%, 1,41) |
| 25/10 (hoy) | 1,45 · 69% · Fortuna + Nacional | **1,80** · 55% · las mismas dos |

Dos efectos que tienes que conocer:
1. **El 23/10 la Doble nueva habría perdido.** El Celta–Betis terminó 3-2 y el Menos de 3,5 falló, así que la que de verdad se ganó (+0,45) habría restado 1 unidad. Es un solo día y no prueba nada, pero muestra el compromiso.
2. **La Riesgo se queda sin armar en días con pocas predicciones.** Para llegar a 1,8, la Doble ahora usa selecciones de entre 68% y 75%. Ese es justo el rango de la Riesgo, y una selección no puede ir en las dos. Esos días solo había 5 predicciones y la Riesgo se quedó sin las 3 que necesita. Con jornadas más llenas (más ligas) no debería pasar tanto. Si quieres asegurarla, puedo armar primero la Riesgo y después la Doble, o subir el mínimo de la Doble a 72%. Dime y lo hago.

**A partir de cuándo aplica.** Solo para las fechas que todavía no tienen combinadas, o sea desde mañana, 26/10. La Doble de hoy (1,45) y la del 23/10 siguen congeladas con la regla vieja, para que el historial sea honesto.

**Servidor:** como esto es una copia de prueba sin servidor, no reinicié nada. En tu equipo, para que el cambio entre en efecto, hay que cerrar el proceso del puerto 3000 y volver a ejecutar `npm start`.

Estimaciones de un modelo estadístico, no consejos de apuesta. Juega con responsabilidad (+18).
