// Programa el pase inicial de un encargo sobre todo el stock actual (un único
// aviso agrupado) DESPUÉS de responder, sin que un fallo rompa la acción que lo
// pide. Lo usan las acciones de encargos y `saveClientPreferencesFull` (el
// diálogo «Editar encargo» de siempre). El runner se importa al ejecutarse para
// no cargar el motor de matching en cada acción; la elegibilidad (activo, brief
// suficiente, cliente de España) la decide el propio pase.

import { after } from "next/server";

export function scheduleInitialPass(encargoId: string): void {
  try {
    after(async () => {
      try {
        const { runEncargoInitialPass } = await import("@/lib/encargos/runner");
        await runEncargoInitialPass(encargoId);
      } catch (e) {
        console.error(`[encargos] pase inicial del encargo ${encargoId} falló`, e);
      }
    });
  } catch (e) {
    console.error("[encargos] no se pudo programar el pase inicial", e);
  }
}
