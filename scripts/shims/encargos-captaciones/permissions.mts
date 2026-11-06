// Doble del almacén de permisos para test-encargos-captaciones: el staff ve y edita Clientes, ve Particulares
// (Captaciones) y las colecciones del cliente; ninguna excepción de alcance (manda el de su rol).
export async function getEffectivePermissions() {
  const all = { view: true, edit: true, create: true, delete: false, export: false };
  return { clientes: all, particulares: all, viewing_collections: all };
}
export async function getEffectiveRoleAndPermissions(_id: string, role: string) {
  return { role, permissions: await getEffectivePermissions() };
}
export async function getScopeOverrides() {
  return [];
}
