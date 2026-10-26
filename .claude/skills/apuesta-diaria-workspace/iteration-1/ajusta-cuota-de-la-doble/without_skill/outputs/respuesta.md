Cambio hecho en `apuestas.js`: a partir de ahora la Doble paga **como mínimo 1,80**.

**Por qué salía 1,45**
El código tomaba siempre los dos partidos más probables del día. Casi siempre eran un "más de 1,5 goles" al 89 % (cuota 1,13) y otro al 78 % (cuota 1,28): 1,13 × 1,28 = 1,45. Ninguna regla pedía una cuota mínima.

**Qué cambié**
- En `TIPOS_APUESTA.doble` añadí `cuotaMin: 1.8`.
- La Doble ya no toma los dos partidos más probables. Revisa todas las parejas posibles (un partido por liga, cada uno con al menos 68 % de probabilidad, como antes) y se queda con la **más probable de las que llegan a 1,80**. Así paga lo que pides con el menor riesgo posible. Las ligas principales siguen teniendo prioridad.
- Si hay varias parejas válidas, prefiere una que deje partidos libres para armar la Riesgo.
- Si ningún par del día llega a 1,80, ese día **no hay Doble**. No se publica una que pague menos. La página ya sabe mostrar ese caso (`doble: null`).
- La Riesgo no cambia.

**Prueba** (con un archivo temporal, sin tocar `data/` y sin levantar el servidor)
- Con los partidos de hoy, la Doble pasa a ser Primeira Liga más de 1,5 (1,28) + menos de 3,5 en la liga 4335 (1,41): **cuota 1,80** y 55 % de probabilidad. Antes era 1,45 con 69 %.
- Con un día de 11 partidos salen las dos: Doble 1,80 y Riesgo 3,09.
- Con un día en el que ninguna pareja llega a 1,80, no hay Doble y la Riesgo sale igual.

**Lo que tienes que saber**
1. **Hoy no cambia.** La Doble del 25 de octubre ya estaba creada (1,45) y queda congelada, como manda el sistema para que el historial sea honesto. Lo nuevo empieza con la del 26 de octubre, después de reiniciar el servidor (yo no lo inicié).
2. **Pagar más significa acertar menos.** La Doble pasa de acertar alrededor del 69 % de las veces a alrededor del 55 %. Subir la cuota no hace la apuesta más rentable por sí solo: vas a ganar más cuando aciertes, pero perderás más seguido.
3. **Casi todas las cuotas son "justas" del modelo** (`cuota_tipo: "justa"`, es decir, 1 ÷ probabilidad), no cuotas reales de una casa. Una casa de apuestas suele pagar algo menos por su margen, así que una Doble que aquí marca 1,80 podría pagarte unos 1,70 de verdad. Si quieres 1,80 real en la casa, sube `cuotaMin` a 1,9.
4. **En días con pocos partidos, las dos combinadas compiten.** Con solo 5 partidos, como hoy, la Doble de 1,80 usa partidos que necesitaba la Riesgo, así que ese día la Riesgo no sale. Antes pasaba lo contrario: salían las dos, pero la Doble pagaba 1,45. Con 8 partidos o más no debería pasar. Si te molesta, se puede bajar el `probMin` de la Riesgo o subir `MIN_CANDIDATAS`.

Para cambiar el mínimo más adelante, basta con editar el número `cuotaMin` en la línea de `doble` dentro de `TIPOS_APUESTA`.
