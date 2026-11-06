// Doble de la sesión para test-encargos-actions: globalThis.__encargosProfile
// es el perfil actual (o null = sin sesión).
export type ProfileRow = { id: string; role: string; country?: string };
const g = globalThis as unknown as { __encargosProfile: ProfileRow | null };
export async function getCurrentProfile(): Promise<ProfileRow | null> {
  return g.__encargosProfile;
}
export async function getCurrentUser() {
  const p = await getCurrentProfile();
  return p ? { id: p.id } : null;
}
