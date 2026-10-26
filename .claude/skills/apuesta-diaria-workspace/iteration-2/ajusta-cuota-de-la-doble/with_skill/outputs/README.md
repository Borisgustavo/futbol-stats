# Masterfutbol

Web local de estadísticas y pronósticos de fútbol.

## Apuestas diarias (`#/apuestas`, modelo de betmines.com/es/apuestas-diarias-futbol)

- `apuestas.js` arma cada día dos combinadas con las predicciones del modelo: **Doble**
  (2 selecciones de 68%+) y **Riesgo** (3 selecciones de 55-72%), una por liga, primero las
  ligas principales y solo partidos que empiezan dentro de más de 1 hora. Se arman hoy y mañana
  cada 30 min si esa fecha aún no tiene, y quedan **congeladas** en `data/apuestas.json`
  (30 días guardados; la página muestra hoy, mañana y los 3 días anteriores).
- **Cambio 2026-10-25 (Doble, cuota mínima):** la Doble pasa a exigir **cuota total de 1,8 o más**
  (`cuotaMin: 1.8` en `TIPOS_APUESTA.doble`; antes no había mínimo y salía ~1,45). Ya no toma las
  2 selecciones más probables una a una: elige la combinación (una por liga, prob. 68%+) con más
  ligas principales y, a igualdad, la más probable que llegue a 1,8; si ninguna llega, ese día no
  hay Doble. Motivo: el usuario quiere que la Doble pague al menos 1,8. Compromiso: la probabilidad
  combinada baja de ~69% a ~55%. Afecta solo a las fechas sin combinadas (desde el 2026-10-26);
  las anteriores siguen congeladas con la regla vieja. Como la Doble ahora usa selecciones de
  68-75%, compite más con la Riesgo (55-72%) y en días con pocas predicciones la Riesgo puede
  quedarse sin armar.
- El estado de cada selección sale de las predicciones evaluadas; una anulada cuenta como cuota 1.
  El balance da ganadas/cerradas y unidades apostando 1 a cada combinada.
- Skill `apuesta-diaria` (`.claude/skills/apuesta-diaria/`): enseña a Claude cómo funciona la
  sección, incluye `scripts/estado_apuestas.py` (informe de combinadas, rendimiento y calibración
  sin necesidad del servidor) y 3 casos de prueba en `evals/`.
- Agente `analista-apuestas` (`.claude/agents/`): usa el skill para revisar la apuesta del día,
  auditar el historial y proponer ajustes; no modifica nada sin confirmación.
- Ambos se cargan cuando Claude Code se abre en esta carpeta (`G:\Mi unidad\futbol-stats`).
