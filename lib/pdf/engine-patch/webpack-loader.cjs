"use strict";
// Loader de webpack (next.config.ts) que aplica la corrección local del motor
// de PDF (patch.cjs) a @react-pdf/textkit y @react-pdf/render en TODOS los
// bundles del servidor, incluido el chunk del hilo del PDF. Si la versión o el
// texto no son los revisados, lanza: el build falla con el motivo (D1).
const { patchEngineSource } = require("./patch.cjs");

module.exports = function bcpPdfEnginePatchLoader(source) {
  if (this && typeof this.cacheable === "function") this.cacheable(true);
  return patchEngineSource(this.resourcePath, source);
};
