Listo. Desde ahora la Doble siempre paga **1,80 o más**.

**Por qué salía en 1,45:** el código elegía las 2 selecciones *más probables* del día (de 68% para arriba). Las más probables son siempre las que menos pagan. Por ejemplo, la de hoy junta un +1,5 goles al 89% (1,13) con otro al 78% (1,28), y eso da 1,45.

**Qué cambié en `apuestas.js`:**
- Agregué `cuotaMin: 1.8` a la Doble en `TIPOS_APUESTA`. La Riesgo no cambia.
- La Doble ya no se queda con las 2 más probables. Ahora revisa todos los pares que llegan a 1,80, siempre una selección por liga y cada una de 68% o más. De esos, elige el par más probable, así que la cuota queda lo más cerca posible de 1,80 y no se dispara. Las ligas principales siguen teniendo prioridad.
- Si puede, elige un par que no le quite a la Riesgo las selecciones que necesita.
- Actualicé el comentario del archivo y el `README.md`.

**Lo probé** con los partidos de `data/predicciones.json` y fechas simuladas, sin servidor:
- Con los partidos de hoy, la Doble sale **1,80** (Braga +1,5 goles a 1,28 × LaLiga −3,5 goles a 1,41), con 55% de probabilidad.
- En un día simulado con 20 partidos, la Doble sale 1,82 y la Riesgo 3,05, y las dos se arman sin problema.

**Antes de que lo uses, ten en cuenta esto:**
1. **Pagar más significa acertar menos.** La Doble pasa de ganar ~69% de las veces a ~55%. El modelo no encuentra más valor, solo cambia seguridad por cuota. Como las cuotas son las justas del modelo, a la larga se gana lo mismo, pero con rachas más largas de pérdidas.
2. **Los días con pocos partidos puede que no haya Riesgo.** Con los 5 partidos de hoy no se pueden armar las dos: cualquier par que llegue a 1,80 usa una de las tres únicas selecciones de 55-72%. En ese caso gana la Doble, que es lo que pediste, y ese día no hay Riesgo. Si ningún par llega a 1,80, ese día no hay Doble. Con más partidos en el día no pasa.
3. **La cuota es la del modelo, no la de la casa.** En mercados como +1,5 o −3,5 goles la cuota guardada es la cuota justa del modelo. En una casa de apuestas, con su margen, ese 1,80 probablemente quede en 1,70-1,75. Si quieres 1,80 *real* en la casa, sube `cuotaMin` a ~1.9.
4. **Lo que ya está guardado no cambia.** La Doble de hoy (25-oct, 1,45) ya estaba armada y queda congelada, para que el historial sea honesto. El cambio se nota desde la de mañana, 26-oct, cuando reinicies el servidor.

Si quieres otro mínimo, cambia `cuotaMin` en `TIPOS_APUESTA.doble`.
