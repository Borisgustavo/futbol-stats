## La doble del 25 de octubre

| Partido | Liga | Hora (UTC) | Pick | Prob. del modelo | Cuota |
|---|---|---|---|---|---|
| Fortuna Sittard vs Excelsior | Eredivisie | 11:15 | Más de 1,5 goles | 88,7 % | 1,13 |
| Nacional de Madeira vs Braga | Primeira Liga | 18:00 | Más de 1,5 goles | 78,1 % | 1,28 |
| **Combinada** | | | | **69,3 %** | **1,45** |

Se armó a las 02:56 UTC de hoy y ya no cambia. Ninguno de los dos partidos ha empezado todavía.

## Por qué eligió esos dos partidos

La regla de `apuestas.js` es sencilla. De los partidos de hoy que empiezan dentro de más de una hora, toma los que tienen una probabilidad del 68 % o más, los ordena de mayor a menor probabilidad y se queda con los dos primeros, con un máximo de uno por liga. **No mira cuotas ni valor, solo la probabilidad.**

Hoy solo había 5 partidos con predicción, que es justo el mínimo para armar las combinadas. Así que no eligió entre muchos partidos: tomó los dos más probables de esos cinco. Los otros tres (Angers–Lorient 71,5 %, Celta–Betis 70,7 % y River–Racing 69,2 %) fueron a la combinada de riesgo.

De dónde salen las probabilidades (es un modelo de goles tipo Poisson):

- **Fortuna Sittard–Excelsior:** el modelo espera 3,7 goles (1,71 del Fortuna y 2,02 del Excelsior). Se basa en que el Fortuna recibe 2,25 goles por partido en casa y el Excelsior marca 2,2 por partido fuera. Con 3,7 goles esperados, que haya menos de dos goles es muy raro, y por eso sale el 88,7 %.
- **Nacional–Braga:** espera 2,9 goles (1,19 + 1,69), sobre todo porque el Nacional recibe 2,5 goles por partido en casa. Eso deja un 78,1 % para el más de 1,5. Es un número bastante normal para ese mercado.

## ¿Tienen ventaja de verdad o son picks fáciles?

Son **picks fáciles por diseño**. El modelo no ha demostrado que tengan ventaja, por tres motivos:

1. **La cuota que ves no es de una casa de apuestas.** Las dos selecciones tienen `cuota_tipo: "justa"`, que es simplemente 1 ÷ probabilidad (1/0,887 ≈ 1,13 y 1/0,781 ≈ 1,28). `cuota_mercado` y `valor` están vacíos, y en estos dos partidos no hay ni cuotas 1X2 de referencia. Con esa cuota, la combinada da un valor esperado de 0,693 × 1,45 ≈ 1,00, es decir, ni ganas ni pierdes. La ventaja solo existiría si tu casa paga **más** que esas cuotas justas.
2. **Hay muy pocos datos.** Las cifras de goles salen de solo 4-5 partidos por equipo (como local o como visitante). El 88,7 % de Fortuna–Excelsior depende de unos pocos partidos con muchos goles. Es la selección más sólida de las dos, pero lo más probable es que el modelo esté sobrestimando los goles. (Para comparar, el partido de River usa 19 y 16 partidos.)
3. **No hay historial real.** El otro día guardado (23 de octubre) está marcado como "Datos inventados para los casos de prueba", y es el único otro día que entra en el balance de la página. Así que todavía no hay ningún resultado real que demuestre que el modelo acierta más de lo que dice.

**En la práctica:** antes de apostar, compara con las cuotas de tu casa. Según el modelo, solo hay ventaja si pagan más de **1,13** (Fortuna–Excelsior), más de **1,28** (Nacional–Braga) o más de **1,45** por la combinada. Como la muestra es tan pequeña, yo pediría algo de margen por encima de esas cuotas. Si tu casa paga lo mismo o menos (lo normal en "más de 1,5" de partidos que se esperan con muchos goles), es una apuesta probable pero sin ventaja. Y aun con un 69 %, la doble falla unos 3 de cada 10 días.
