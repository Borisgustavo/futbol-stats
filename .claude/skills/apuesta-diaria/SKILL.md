---
name: apuesta-diaria
description: Especialista en la sección "Apuestas diarias" de Masterfutbol (las combinadas Doble y Riesgo que el modelo arma cada día, con su historial de 3 días). Úsalo siempre que el usuario pregunte por la apuesta del día, la doble o la de riesgo, cómo le fue a las combinadas de ayer o de los últimos días, por qué el modelo eligió un partido, si conviene cambiar los criterios (umbrales de probabilidad, número de selecciones, ligas), si hay que corregir o regenerar una combinada, o quiera un resumen para compartir; aunque no nombre la sección y diga cosas como "la combinada de hoy", "el parlay", "¿ganamos ayer?" o "¿qué apostamos mañana?".
---

# Apuestas diarias de Masterfutbol

La sección vive en la web local de Masterfutbol (`http://localhost:3000/#/apuestas`). Cada día el
modelo arma dos combinadas con sus propias predicciones (un modelo de Poisson con los goles de la
temporada) y las **congela** al crearlas. Cuando terminan los partidos, cada selección se marca como
ganada o perdida con el resultado real. La página muestra hoy, mañana y los 3 días anteriores.

Quien te pregunta suele querer una de cinco cosas: ver la apuesta del día, saber cómo le fue,
entender por qué el modelo eligió algo, ajustar los criterios o compartir un resumen. Averigua cuál
antes de tocar nada.

## Dónde está cada cosa

Todas las rutas son relativas a la raíz del proyecto (la carpeta que contiene `server.js`; en el
equipo del usuario, `G:\Mi unidad\futbol-stats`).

| Qué | Dónde |
|---|---|
| Reglas de armado (`TIPOS_APUESTA`), congelado, estados y balance | `apuestas.js` |
| Predicciones, probabilidades y evaluación de resultados | `predicciones.js` |
| Combinadas guardadas (por fecha, hasta 30 días) | `data/apuestas.json` |
| Predicciones guardadas con su resultado | `data/predicciones.json` |
| API de la sección | `GET /api/apuestas` en `server.js` |
| Página | `vistaApuestas()` en `public/app.js`, estilos `.ad-*` en `public/app.css` |

Las reglas actuales (léelas en `apuestas.js` antes de citarlas, por si cambiaron):

- **Doble**: las 2 selecciones con más ventaja sobre la media de su liga, con probabilidad del
  modelo de 62% o más cada una (desde el 2026-10-25; antes, las 2 más probables de 68% o más). Se
  espera acertarla ~la mitad de los días con cuota ~2. Cada día guardado lleva `reglas` con la
  versión de las reglas con que se armó.
- **Riesgo**: 3 selecciones con probabilidad entre 55% y 72%, distintas de las de la Doble.
- Como mucho una selección por liga; primero las ligas principales y, dentro de eso, la de más
  ventaja (Doble) o la más probable (Riesgo).
- Solo partidos que empiezan dentro de más de una hora, y solo si hay al menos 5 predicciones ese día.
- Se arman las combinadas de hoy y de mañana cada 30 minutos, únicamente si esa fecha aún no tiene.
- Cuota de cada selección: la media del mercado (The Odds API) si es 1X2 y está guardada; si no, la
  cuota justa del modelo (1 / probabilidad). Una selección anulada cuenta como cuota 1.

## Paso 1: mira los datos reales

Ejecuta el informe incluido desde la raíz del proyecto. Lee los archivos directamente, así que
funciona aunque el servidor esté apagado (si la carpeta actual tiene `data/apuestas.json`, usa esa;
si no, pasa `--raiz <carpeta>`):

```bash
python -I .claude/skills/apuesta-diaria/scripts/estado_apuestas.py            # hoy, mañana y 3 días atrás
python -I .claude/skills/apuesta-diaria/scripts/estado_apuestas.py --dias 7   # historial más largo
python -I .claude/skills/apuesta-diaria/scripts/estado_apuestas.py --fecha 2026-10-25
python -I .claude/skills/apuesta-diaria/scripts/estado_apuestas.py --json     # para cálculos propios
```

Muestra cada combinada con su estado, la cuota total, la probabilidad combinada y, por selección,
la hora local, el resultado, los goles esperados, la media de ese mercado en la liga con la
**ventaja** en puntos, y los partidos que sostienen los números. Marca `SIN VENTAJA` (menos de
3 puntos sobre la media de la liga) y `MUESTRA CORTA` (menos de 6 partidos en casa o fuera). Al final
da el rendimiento: ganadas/cerradas y unidades por tipo, acierto por mercado y calibración
(probabilidad media del modelo frente al acierto real).

Para saber qué armaría el código **actual** en una fecha (sin tocar los datos), y compararlo con lo
que se guardó, usa la simulación. Ejecuta el `apuestas.js` real sobre las predicciones guardadas:

```bash
node .claude/skills/apuesta-diaria/scripts/simular_armado.mjs                # todas las fechas guardadas
node .claude/skills/apuesta-diaria/scripts/simular_armado.mjs 2026-10-25     # una o varias fechas
```

Si el servidor está corriendo, `curl -s http://127.0.0.1:3000/api/apuestas` da lo mismo que ve la
página. No inventes partidos, cuotas ni resultados: si una fecha no tiene combinadas, dilo.

## Paso 2: responde según lo que pidan

**La apuesta del día.** Presenta cada combinada como en la página: liga, partido, hora local,
mercado, probabilidad y cuota (aclarando si es de mercado o justa), y la cuota total. Si hoy no hay
combinadas, explica por qué (pocos partidos que falten por empezar, o ninguno en el rango de
probabilidad) y muestra la de mañana si existe.

**Por qué el modelo eligió algo.** Explica primero la regla: la Doble y la Riesgo eligen por
probabilidad, no por valor, así que tienden a quedarse con mercados fáciles. Luego, por selección:
goles esperados, lo que marca y recibe cada equipo en casa y fuera, y cuántos partidos sostienen
esos números. El dato que más importa es la ventaja frente a la media de la liga: una selección del
89% en una liga donde ese mercado ocurre el 90% de las veces no aporta nada, solo es un mercado
fácil. Da un veredicto claro por selección (ventaja real, ventaja dudosa por muestra corta, o pick
fácil) usando las marcas del informe.

**Cómo le fue.** Da ganadas/perdidas por tipo, las unidades (apostando 1 a cada combinada cerrada) y
qué selección hizo perder cada combinada perdida. Con menos de unas 20 combinadas cerradas, avisa de
que la muestra es pequeña y cualquier porcentaje es todavía ruido.

**Ajustar los criterios.** Primero diagnostica con el informe (calibración, acierto por mercado,
cuotas resultantes) y explica el compromiso: más cuota significa menos probabilidad (una cuota justa
de 1,8 equivale a un 56%). Si el cambio lo propones tú, pide confirmación antes de editar
`TIPOS_APUESTA` u otras reglas de `apuestas.js`; si el usuario ya lo pidió de forma explícita,
hazlo y explica qué cambiaste. Después de editar:
1. Comprueba la sintaxis: `node --check apuestas.js`.
2. Mide el efecto con `simular_armado.mjs` sobre las fechas guardadas y muestra el antes (guardada)
   y el después (código actual) de la **Doble y de la Riesgo**. La Doble y la Riesgo compiten por las
   mismas predicciones, porque una selección usada en una no puede ir en la otra. Un cambio en una
   puede dejar a la otra sin armarse en días con pocos partidos, así que dilo si pasa.
3. Anota el cambio en la sección de apuestas del `README.md`: la fecha, qué regla cambió (valor
   anterior y nuevo) y por qué. Es la única memoria de por qué el historial cambia de carácter a
   partir de ese día.
4. Reinicia el servidor (cierra el proceso del puerto 3000 y ejecuta `npm start`).

Los cambios solo afectan a las fechas que todavía no tienen combinadas. Las ya creadas no se rehacen.

**Compartir un resumen.** Texto breve con las combinadas, su cuota y su estado.

**Toda respuesta sobre las apuestas termina con el aviso**, también cuando solo explicas, auditas o
rechazas algo: "Estimaciones de un modelo estadístico, no consejos de apuesta. Juega con
responsabilidad (+18)." Quien lee sobre combinadas está pensando en apostar dinero, y ese
recordatorio no sobra nunca.

## Lo que no debes hacer

- **No reescribas el pasado.** No edites ni borres combinadas de `data/apuestas.json` cuyo primer
  partido ya empezó o que ya tengan resultado, ni los resultados de `data/predicciones.json` de los
  que dependen. El historial vale porque se congela; cambiarlo para que el modelo "quede mejor" lo
  vuelve inútil. Si el usuario lo pide, explícale esto y ofrece un ajuste de criterios para los días
  siguientes.
- **"Anular" no es una salida.** Una selección solo se anula cuando el partido se suspende o no se
  juega (TheSportsDB lo marca así y `predicciones.js` lo registra solo). Marcar como anulado un
  partido que sí se jugó, para que una combinada perdida no cuente o pase a ganada, es falsear el
  historial igual que cambiar el partido, aunque suene a un trámite. Comprueba con el informe que el
  partido terminó con un marcador; si es así, no lo anules.
- Una combinada de una fecha futura cuyo primer partido aún no empezó **sí** se puede rehacer, pero
  solo si el usuario lo confirma: borra esa fecha de `data/apuestas.json` con el servidor detenido y
  vuelve a arrancarlo (se rearma en el siguiente ciclo, en hasta 45 segundos).
- No presentes las combinadas como seguras ni como consejo de inversión. Son probabilidades de un
  modelo que no sabe de lesiones, alineaciones ni rotaciones.
- No gastes créditos de The Odds API para "completar" cuotas. Las apuestas solo leen cuotas que ya
  estén en caché; si hace falta pedir más, pregunta antes (el plan gratis trae 500 créditos al mes).
