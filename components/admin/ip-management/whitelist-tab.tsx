"use client"

import { useState } from "react"
import {
  addToWhitelistAction,
  removeFromWhitelistAction,
} from "@/app/(admin)/admin/security/ip-management/actions"
import { IpWhitelistEntry } from "@/lib/db/queries/security"

interface WhitelistTabProps {
  data: IpWhitelistEntry[]
}

export function WhitelistTab({ data: initialData }: WhitelistTabProps) {
  const [data, setData] = useState<IpWhitelistEntry[]>(initialData)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ ip: "", description: "" })
  const [isLoading, setIsLoading] = useState(false)

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      setIsLoading(true)
      await addToWhitelistAction({
        ip: form.ip,
        description: form.description,
      })
      setForm({ ip: "", description: "" })
      setShowForm(false)
      // Recargar datos
      window.location.reload()
    } catch (error) {
      console.error("Error añadiendo IP a whitelist:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemove = async (id: string) => {
    if (confirm("¿Remover de whitelist?")) {
      try {
        setIsLoading(true)
        await removeFromWhitelistAction(id)
        // Recargar datos
        window.location.reload()
      } catch (error) {
        console.error("Error removiendo IP de whitelist:", error)
      } finally {
        setIsLoading(false)
      }
    }
  }

  return (
    <div className="space-y-4">
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          disabled={isLoading}
          className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 disabled:opacity-50"
        >
          + Agregar IP
        </button>
      )}

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="bg-white border rounded p-4 space-y-4 max-w-lg"
        >
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">
              IP Address o CIDR
            </label>
            <input
              type="text"
              placeholder="Ej: 203.0.113.42 o 10.0.0.0/8"
              value={form.ip}
              onChange={(e) => setForm({ ...form, ip: e.target.value })}
              required
              disabled={isLoading}
              className="w-full border rounded px-2 py-2 text-sm disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1 text-gray-700">
              Descripción
            </label>
            <input
              type="text"
              placeholder="Ej: Oficina Madrid"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              disabled={isLoading}
              className="w-full border rounded px-2 py-2 text-sm disabled:opacity-50"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isLoading}
              className="bg-blue-500 text-white px-4 py-2 rounded text-sm hover:bg-blue-600 disabled:opacity-50"
            >
              {isLoading ? "Agregando..." : "Agregar"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              disabled={isLoading}
              className="border rounded px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border border-gray-200 rounded">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-3">IP / CIDR</th>
              <th className="text-left p-3">Descripción</th>
              <th className="text-left p-3">Agregada</th>
              <th className="text-center p-3">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {data.map((entry) => (
              <tr key={entry.id} className="border-b hover:bg-gray-50">
                <td className="p-3 font-mono text-gray-700">
                  {entry.ip_address || entry.cidr_range}
                </td>
                <td className="p-3 text-gray-600">
                  {entry.description || "-"}
                </td>
                <td className="p-3 text-gray-500 text-sm">
                  {new Date(entry.created_at).toLocaleDateString("es-ES")}
                </td>
                <td className="p-3 text-center">
                  <button
                    onClick={() => handleRemove(entry.id)}
                    disabled={isLoading}
                    className="text-red-600 hover:underline text-xs disabled:opacity-50"
                  >
                    Remover
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.length === 0 && (
        <p className="text-gray-500 text-center py-8">
          No hay IPs en whitelist
        </p>
      )}
    </div>
  )
}
