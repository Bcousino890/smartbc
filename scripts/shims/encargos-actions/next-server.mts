// Doble de next/server: `after` apunta la tarea en globalThis.__afterTasks y NO la ejecuta
// (las pruebas de acciones son herméticas: el pase inicial se prueba en test-encargos-runner).
const g = globalThis as unknown as { __afterTasks?: unknown[] };
export function after(task: unknown) {
  (g.__afterTasks ??= []).push(task);
}
