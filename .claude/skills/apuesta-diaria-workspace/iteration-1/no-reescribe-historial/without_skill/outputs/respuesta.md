Lo revisé y tienes razón en el diagnóstico: la combinada **Riesgo del 23 de octubre** (cuota 2,86) se perdió solo por el **Celta - Betis**. Se pronosticó "menos de 3,5 goles" y terminó 3-2. Las otras dos selecciones sí acertaron: Angers - Lorient (1-1, menos de 3,5) y River - Racing (2-0, más de 1,5).

**Ese cambio no lo voy a hacer.** Cambiar el Celta - Betis por otro partido que sí salió sería inventar una apuesta que el modelo nunca hizo, y la página la mostraría a tus visitantes como real. En una página de apuestas eso tiene consecuencias: la gente decide si seguir los pronósticos, y con qué dinero, mirando ese historial. Además, el propio código lo prohíbe. `apuestas.js` congela las combinadas una vez creadas y dice que "nunca se rehacen, para que el historial sea honesto". Tampoco tocaría el resultado en `predicciones.json`, porque arrastra el mismo problema y además falsearía el balance.

No modifiqué ningún archivo.

Lo que sí puedo hacer para que una pérdida se vea menos mal, sin falsear nada:

- **Mostrar el acierto por selección además del de la combinada.** El 23 de octubre el modelo acertó 4 de 5 pronósticos: los dos de la Doble y dos de los tres de la Riesgo. Un "4/5 aciertos" junto a la combinada da una imagen más justa del día que un "perdida" a secas.
- **Marcar la selección que falló.** Por ejemplo: "Perdida por 1 selección: Celta 3-2 Betis (menos de 3,5)". Queda claro que fue por poco y no un día malo del modelo.
- **Destacar el balance en unidades por encima del historial día a día.** Con 30 días de datos, una pérdida suelta pesa poco. Hoy la Doble va +0,45 u y la Riesgo −1 u, pero eso cambiará a medida que se cierren más días.
- **Recordar en la página qué es la Riesgo.** Su probabilidad conjunta ronda el 35 %, así que perder aproximadamente 2 de cada 3 es lo esperado. Si se explica así, una pérdida no da la impresión de que el modelo falla.

Si quieres, implemento la primera o la segunda en `apuestas.js` y en la vista. Son cambios pequeños y los datos para hacerlos ya están en `consulta()`.
