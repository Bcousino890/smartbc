/**
 * El pase inicial se programa con `after()` (después de responder) y un fallo
 * nunca rompe a quien lo pide. Lo usan las acciones de encargos y el diálogo de
 * siempre «Editar encargo» (saveClientPreferencesFull), así que los dos caminos
 * hacen lo mismo; la DECISIÓN de cuándo (solo España y solo si cambian los
 * criterios) está en lib/encargos/rescan.ts y se prueba en test-encargos-ui-state.
 *
 *   npm run test:encargos-ui-state   (lo ejecuta detrás)
 */
import { scheduleInitialPass } from "../lib/encargos/schedule.ts";

const g = globalThis as unknown as { __afterTasks?: unknown[] };
let failed = 0;
const ok = (cond: boolean, name: string) => {
  if (!cond) {
    failed++;
    console.error(`FAIL ${name}`);
  }
};

g.__afterTasks = [];
scheduleInitialPass("e1");
ok(g.__afterTasks.length === 1, "programa exactamente una tarea after()");
ok(typeof g.__afterTasks[0] === "function", "la tarea es una función (se ejecuta tras responder)");

// La tarea NO se ejecuta aquí: llamaría al runner real (base de datos). Que un
// fallo del pase no se propague lo garantiza el try/catch de la propia tarea.

console.log(failed ? `${failed} fallos` : "schedule: OK");
if (failed) process.exit(1);
