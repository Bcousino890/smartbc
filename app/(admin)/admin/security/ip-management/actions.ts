"use server"

import {
  addToBlacklist,
  removeFromBlacklist,
  addToWhitelist,
  removeFromWhitelist,
} from "@/lib/db/queries/security"
import { revalidatePath } from "next/cache"
import { assertPermission } from "@/lib/auth/guard"

interface BlacklistEntry {
  ip: string
  reason: string
  severity?: string
  notes?: string
  expiresAt?: string
}

interface WhitelistEntry {
  ip: string
  description?: string
}

export async function addToBlacklistAction(entry: BlacklistEntry) {
  await assertPermission("configuracion", "create")
  try {
    await addToBlacklist({
      ip: entry.ip,
      reason: entry.reason,
      severity: entry.severity || "high",
      notes: entry.notes,
      blockedBy: undefined,
      expiresAt: entry.expiresAt ? new Date(entry.expiresAt).toISOString() : undefined,
    })
    revalidatePath("/admin/security/ip-management")
  } catch (error) {
    console.error("Error in addToBlacklistAction:", error)
    throw error
  }
}

export async function removeFromBlacklistAction(id: string) {
  await assertPermission("configuracion", "delete")
  try {
    await removeFromBlacklist(id)
    revalidatePath("/admin/security/ip-management")
  } catch (error) {
    console.error("Error in removeFromBlacklistAction:", error)
    throw error
  }
}

export async function addToWhitelistAction(entry: WhitelistEntry) {
  await assertPermission("configuracion", "create")
  try {
    await addToWhitelist({
      ip: entry.ip,
      description: entry.description,
      addedBy: undefined,
    })
    revalidatePath("/admin/security/ip-management")
  } catch (error) {
    console.error("Error in addToWhitelistAction:", error)
    throw error
  }
}

export async function removeFromWhitelistAction(id: string) {
  await assertPermission("configuracion", "delete")
  try {
    await removeFromWhitelist(id)
    revalidatePath("/admin/security/ip-management")
  } catch (error) {
    console.error("Error in removeFromWhitelistAction:", error)
    throw error
  }
}
