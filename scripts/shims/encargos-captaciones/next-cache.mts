// Doble de next/cache para test-encargos-captaciones: como el de las acciones (apunta las rutas revalidadas) y
// además `unstable_cache`/`revalidateTag`, que arrastran los módulos de Captaciones (lib/db/queries/particulares.ts).
const g = globalThis as unknown as { __revalidated: string[] };
export function revalidatePath(p: string) {
  g.__revalidated.push(p);
}
export function revalidateTag(_t: string) {}
export function unstable_cache<T extends (...a: never[]) => unknown>(fn: T): T {
  return fn;
}
