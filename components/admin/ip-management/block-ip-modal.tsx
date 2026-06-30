"use client"

import { useState } from "react"

interface BlockIPModalProps {
  onClose: () => void
  onSubmit: (entry: {
    ip: string
    reason: string
    severity?: string
    notes?: string
    expiresAt?: string
  }) => void
  isLoading?: boolean
}

export function BlockIPModal({
  onClose,
  onSubmit,
  isLoading = false,
}: BlockIPModalProps) {
  const [form, setForm] = useState({
    ip: "",
    reason: "suspicious",
    severity: "high",
    notes: "",
    expiresAt: "",
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onSubmit({
      ip: form.ip,
      reason: form.reason,
      severity: form.severity,
      notes: form.notes,
      expiresAt: form.expiresAt || undefined,
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-lg p-6 w-96 space-y-4 shadow-lg"
      >
        <h2 className="text-xl font-bold text-gray-900">Bloquear IP</h2>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">
            IP Address
          </label>
          <input
            type="text"
            placeholder="192.168.1.100"
            value={form.ip}
            onChange={(e) => setForm({ ...form, ip: e.target.value })}
            required
            disabled={isLoading}
            className="w-full border rounded px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">
            Razón
          </label>
          <select
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
            disabled={isLoading}
            className="w-full border rounded px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="scraper">Scraper</option>
            <option value="bot">Bot</option>
            <option value="ddos">DDoS</option>
            <option value="suspicious">Sospechosa</option>
            <option value="manual_block">Bloqueo manual</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">
            Severidad
          </label>
          <select
            value={form.severity}
            onChange={(e) => setForm({ ...form, severity: e.target.value })}
            disabled={isLoading}
            className="w-full border rounded px-3 py-2 text-sm disabled:opacity-50"
          >
            <option value="low">Baja</option>
            <option value="medium">Media</option>
            <option value="high">Alta</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">
            Expira (opcional)
          </label>
          <input
            type="date"
            value={form.expiresAt}
            onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            disabled={isLoading}
            className="w-full border rounded px-3 py-2 text-sm disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 text-gray-700">
            Notas
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            disabled={isLoading}
            className="w-full border rounded px-3 py-2 text-sm disabled:opacity-50"
            rows={3}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600 disabled:opacity-50 text-sm font-medium"
          >
            {isLoading ? "Bloqueando..." : "Bloquear"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="flex-1 border border-gray-300 rounded px-4 py-2 text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-sm font-medium"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
