"use strict";
// Loader de webpack (next.config.ts) que aplica la corrección local del motor
// de PDF (patch.cjs) a @react-pdf/textkit y @react-pdf/render SI se compilan
// dentro de un bundle. Hoy Next los deja fuera (serverExternalPackages por
// defecto) y la corrección la aplica el hook de install.ts; este loader es la
// reserva. Si la versión o el texto no son los revisados, lanza: el build
// falla con el motivo (D1).
const { patchEngineSource } = require("./patch.cjs");

module.exports = function bcpPdfEnginePatchLoader(source) {
  if (this && typeof this.cacheable === "function") this.cacheable(true);
  return patchEngineSource(this.resourcePath, source);
};
