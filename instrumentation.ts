// Arranque del servidor Next (instrumentation hook): instala en el proceso la
// corrección local del motor de PDF antes de que ninguna ruta cargue
// @react-pdf (BCP-01 ampliación, PR5, D1; lib/pdf/engine-patch). Solo en el
// runtime de Node; el hilo del PDF la instala por su cuenta (render-worker.ts).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installPdfEngineHook } = await import("./lib/pdf/engine-patch/install");
    if (installPdfEngineHook(process.cwd()) === "unavailable") {
      console.error("[catalogos] pdf: este Node no tiene module.register; el PDF en árabe y hebreo no se podrá generar (pdf_engine_unpatched)");
    }
  }
}
