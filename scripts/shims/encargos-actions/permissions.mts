// Doble del almacén de permisos: el staff tiene Clientes (ver/editar/crear) y
// ninguna excepción de alcance; así manda el alcance por defecto de su rol.
export async function getEffectivePermissions() {
  return { clientes: { view: true, edit: true, create: true, delete: false, export: false } };
}
export async function getEffectiveRoleAndPermissions(_id: string, role: string) {
  return { role, permissions: await getEffectivePermissions() };
}
export async function getScopeOverrides() {
  return [];
}
