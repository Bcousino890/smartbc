// Prueba técnica del PR5 (5.1): este archivo era el hook del parche del
// motor. La corrección ya es de producción (lib/pdf/engine-patch, D1) y el
// hook de los scripts es scripts/pdf/engine-patch-hook.mjs; se conserva este
// nombre para que la reproducción de result-pr5-spike.md siga funcionando.
import "./engine-patch-hook.mjs";
