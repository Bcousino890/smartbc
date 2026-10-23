// Doble de la sesión: cada llamada a getCurrentProfile consume el siguiente
// paso de globalThis.__profiles (un perfil, null = sin sesión/suspendida, o
// "throw" = fallo al leer el perfil); el último se repite.
export type ProfileRow = { id: string; role: string; country?: string };
type Step = ProfileRow | null | "throw";
const g = globalThis as unknown as { __profiles: Step[]; __profileCalls: number };

export async function getCurrentProfile(): Promise<ProfileRow | null> {
  const i = g.__profileCalls++;
  const step = g.__profiles[Math.min(i, g.__profiles.length - 1)];
  if (step === "throw") throw new Error("fallo sintético al leer el perfil");
  return step;
}
export async function getCurrentUser() {
  const p = await getCurrentProfile();
  return p ? { id: p.id } : null;
}
