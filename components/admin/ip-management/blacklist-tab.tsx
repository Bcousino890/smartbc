"use client"

import { useState } from "react"
import {
  addToBlacklistAction,
  removeFromBlacklistAction,
} from "@/app/(admin)/admin/security/ip-management/actions"
import { BlockIPModal } from "./block-ip-modal"
import { IpBlocklistEntry } from "@/lib/db/queries/security"

interface BlacklistTabProps {
  data: IpBlocklistEntry[]
}

export function BlacklistTab({ data: initialData }: BlacklistTabProps) {
  const [data, setData] = useState<IpBlocklistEntry[]>(initialData)
  const [showModal, setShowModal] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const handleAdd = async (entry: {
    ip: string
    reason: string
    severity?: string
    notes?: string
    expiresAt?: string
  }) => {
    try {
      setIsLoading(true)
      await addToBlacklistAction(entry)
      setShowModal(false)
      // Recargar datos desde el servidor
      window.location.reload()
    } catch (error) {
      console.error("Error añadiendo IP a blacklist:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemove = async (id: string) => {
    if (confirm("¿Desbloquear esta IP?")) {
      try {
        setIsLoading(true)
        await removeFromBlacklistAction(id)
        // Recargar datos
        window.location.reload()
      } catch (error) {
        console.error("Error removiendo IP de blacklist:", error)
      } finally {
        setIsLoading(false)
      }
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <button
          onClick={() => setShowModal(true)}
          disabled={isLoading}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 disabled:opacity-50"
        >
          + Bloquear IP
        </button>
      </div>

      {showModal && (
        <BlockIPModal
          onClose={() => setShowModal(false)}
          onSubmit={handleAdd}
          isLoading={isLoading}
        />
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-gray-200 rounded">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">IP</th>
              <th className="text-left p-3">Razón</th>
              <th className="text-left p-3">Severidad</th>
              <th className="text-left p-3">Bloqueada</th>
              <th className="text-left p-3">Expira</th>
              <th className="text-left p-3">Notas</th>
              <th className="text-center p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry) => (
              <tr key={entry.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-mono text-gray-700">{entry.ip_address}</td>
                <td className="p-3 text-gray-600">{entry.reason}</td>
                <td className="p-3">
                  <span
                    className={`px-2 py-1 rounded text-xs font-semibold ${
                      entry.severity === "high"
                        ? "bg-red-100 text-red-700"
                        : entry.severity === "medium"
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-blue-100 text-blue-700"
                    }`}
                  >
                    {entry.severity}
                  </span>
                </td>
                <td className="p-3 text-gray-500 text-sm">
                  {new Date(entry.blocked_at).toLocaleDateString("es-ES")}
                </td>
                <td className="p-3 text-gray-500 text-sm">
                  {entry.expires_at
                    ? new Date(entry.expires_at).toLocaleDateString("es-ES")
                    : "∞"}
                </td>
                <td className="p-3 text-gray-600 text-xs max-w-xs truncate">
                  {entry.notes || "-"}
                </td>
                <td className="p-3 text-center">
                  <button
                    onClick={() => handleRemove(entry.id)}
                    disabled={isLoading}
                    className="text-red-600 hover:underline text-xs disabled:opacity-50"
                  >
                    Desbloquear
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.length === 0 && (
        <p className="text-gray-500 text-center py-8">No hay IPs bloqueadas</p>
      )}
    </div>
  )
}
