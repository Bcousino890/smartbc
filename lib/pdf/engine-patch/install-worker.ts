import { workerData } from "node:worker_threads";
import { installPdfEngineHook } from "./install";

// Primera importación del hilo del PDF (render-worker.ts): instala la
// corrección del motor antes de que el hilo cargue @react-pdf (D1).
installPdfEngineHook((workerData as { root?: string } | null)?.root ?? process.cwd());
