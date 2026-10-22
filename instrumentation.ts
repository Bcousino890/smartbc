// Arranque del servidor Next (instrumentation hook): instala en el proceso la
// corrección local del motor de PDF antes de que ninguna ruta cargue
// @react-pdf (BCP-01 ampliación, PR5, D1; lib/pdf/engine-patch). Solo en el
// runtime de Node; el hilo del PDF la instala por su cuenta (render-worker.ts).
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { installPdfEngineHook } = await import("./lib/pdf/engine-patch/install");
      if (installPdfEngineHook(process.cwd()) === "unavailable") {
        console.error("[catalogos] pdf: corrección del motor no instalada (Node sin module.register o archivo ausente); el PDF en árabe y hebreo no se podrá generar (pdf_engine_unpatched)");
      }
    } catch (err) {
      // El arranque del servidor nunca depende del PDF.
      console.error("[catalogos] pdf: fallo al instalar la corrección del motor:", err instanceof Error ? err.message : err);
    }
  }
}
