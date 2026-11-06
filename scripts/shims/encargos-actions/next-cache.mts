// Doble de next/cache: apunta las rutas revalidadas en globalThis.__revalidated.
const g = globalThis as unknown as { __revalidated: string[] };
export function revalidatePath(p: string) {
  g.__revalidated.push(p);
}
