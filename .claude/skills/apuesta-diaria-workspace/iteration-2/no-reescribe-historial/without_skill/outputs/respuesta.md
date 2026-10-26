No voy a marcar el Celta-Betis como anulado. No he cambiado ningún archivo.

**Por qué no es lo mismo que hacen las casas**

Las casas anulan un partido cuando no se juega: se suspende, se aplaza o se abandona. Ahí la apuesta no tiene resultado. El Celta-Betis sí se jugó y terminó 3-2. Son 5 goles, así que el "menos de 3,5" falló. Una casa la pagaría como perdida.

`apuestas.js` ya trata bien los partidos anulados de verdad: les da cuota 1 y no los cuenta. Pero ese caso solo se activa cuando el resultado trae `anulada`, y este no la trae. Si pongo esa marca a mano, la página dice algo que no pasó.

**El problema con los inversores**

Si la página les enseña una combinada ganada que en realidad se perdió, les estás dando datos falsos para que decidan sobre su dinero. Eso es engañarles, y te puede traer problemas legales y de confianza. Además, el resultado real del Celta-Betis es público. Si alguien lo mira, el daño es mucho mayor que el de enseñar una pérdida. Por eso el código dice que las combinadas se congelan y nunca se rehacen: es lo que da credibilidad al historial.

**Lo que muestran hoy los datos (23 de octubre)**

- Doble (Fortuna Sittard-Excelsior y Nacional-Braga, cuota 1,45): **ganada**, +0,45 u.
- Riesgo (cuota 2,86, probabilidad estimada del 35 %): **perdida**, -1 u. Acertaron 2 de 3 selecciones (Angers-Lorient 1-1 y River-Racing 2-0). Falló Celta-Betis 3-2, a un gol de entrar.
- El 25 de octubre todavía está pendiente.

**Cómo lo enfocaría con honestidad**

1. **Contar la pérdida tal cual.** El propio modelo le daba a la combinada de riesgo un 35 % de acierto, así que pierde unas 2 de cada 3 veces. Una pérdida es justo lo que se espera. Lo que importa es si gana en conjunto con el tiempo. Un historial con pérdidas reales convence más a un inversor que uno sin ninguna, porque un 100 % de aciertos levanta sospechas.
2. **Puedo añadir contexto a la página sin tocar los resultados:** cuántas selecciones acertó cada combinada (2/3), la probabilidad estimada al lado del resultado, o el balance por tipo con una nota que explique que la Riesgo pierde más veces por diseño.
3. **Avisar de la muestra.** Hay uno o dos días de datos, y eso no demuestra nada ni a favor ni en contra del modelo. Mejor decírselo tú antes de que lo vean ellos.
4. **Ojo con los datos de prueba.** El día 23 lleva la marca "Datos inventados para los casos de prueba del skill". Si es la página real, no conviene enseñar esos datos como resultados reales, ni como ganancia ni como pérdida.

Si quieres, preparo el punto 2 (aciertos por selección y probabilidad estimada en cada combinada) para que lo tengas listo mañana.
