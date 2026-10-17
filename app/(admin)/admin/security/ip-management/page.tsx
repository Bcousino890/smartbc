import { guardPageRoles } from "@/lib/auth/guard-roles"
import { IPManagementDashboard } from "@/components/admin/ip-management/dashboard"
import {
  getBlacklist,
  getWhitelist,
  getActivityLog,
} from "@/lib/db/queries/security"

export const dynamic = "force-dynamic"

export default async function IPManagementPage() {
  // Lista negra/blanca de IPs y registro de actividad: las ESCRITURAS ya exigían
  // configuracion, pero la lectura de la página no tenía gate. Solo
  // Propietario y Administrador.
  await guardPageRoles(["owner", "admin"])

  const [blacklist, whitelist, activityLog] = await Promise.all([
    getBlacklist(true),
    getWhitelist(true),
    getActivityLog(100),
  ])

  return (
    <IPManagementDashboard
      initialData={{ blacklist, whitelist, activityLog }}
    />
  )
}
