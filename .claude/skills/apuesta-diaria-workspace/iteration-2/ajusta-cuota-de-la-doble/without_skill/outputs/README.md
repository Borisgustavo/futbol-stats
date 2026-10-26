# Masterfutbol

Web local de estadísticas y pronósticos de fútbol.

## Apuestas diarias (`#/apuestas`, modelo de betmines.com/es/apuestas-diarias-futbol)

- `apuestas.js` arma cada día dos combinadas con las predicciones del modelo: **Doble**
  (2 selecciones de 68%+ con cuota total de **al menos 1,80**: el par más probable que llega a
  esa cuota, sin quitarle a la Riesgo las selecciones que necesita si se puede) y **Riesgo**
  (3 selecciones de 55-72%), una por liga, primero las ligas principales y solo partidos que
  empiezan dentro de más de 1 hora. Si ningún par llega a 1,80 ese día no hay Doble. Se arman hoy y mañana
  cada 30 min si esa fecha aún no tiene, y quedan **congeladas** en `data/apuestas.json`
  (30 días guardados; la página muestra hoy, mañana y los 3 días anteriores).
- El estado de cada selección sale de las predicciones evaluadas; una anulada cuenta como cuota 1.
  El balance da ganadas/cerradas y unidades apostando 1 a cada combinada.
- Skill `apuesta-diaria` (`.claude/skills/apuesta-diaria/`): enseña a Claude cómo funciona la
  sección, incluye `scripts/estado_apuestas.py` (informe de combinadas, rendimiento y calibración
  sin necesidad del servidor) y 3 casos de prueba en `evals/`.
- Agente `analista-apuestas` (`.claude/agents/`): usa el skill para revisar la apuesta del día,
  auditar el historial y proponer ajustes; no modifica nada sin confirmación.
- Ambos se cargan cuando Claude Code se abre en esta carpeta (`G:\Mi unidad\futbol-stats`).
