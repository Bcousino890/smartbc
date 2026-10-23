// Doble del almacén de permisos: el perfil tiene Solicitudes (ver y editar) y
// ninguna excepción de alcance; así manda el alcance por defecto de su rol.
export async function getEffectivePermissions() {
  return { solicitudes: { view: true, edit: true, create: true, delete: false, export: false } };
}
export async function getEffectiveRoleAndPermissions(_id: string, role: string) {
  return { role, permissions: await getEffectivePermissions() };
}
export async function getScopeOverrides() {
  return [];
}
