import { IPManagementDashboard } from "@/components/admin/ip-management/dashboard"
import {
  getBlacklist,
  getWhitelist,
  getActivityLog,
} from "@/lib/db/queries/security"

export const dynamic = "force-dynamic"

export default async function IPManagementPage() {
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
