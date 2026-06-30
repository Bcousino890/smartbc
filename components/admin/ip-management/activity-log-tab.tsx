"use client"

import { IpActivityLogEntry } from "@/lib/db/queries/security"

interface ActivityLogTabProps {
  data: IpActivityLogEntry[]
}

export function ActivityLogTab({ data }: ActivityLogTabProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border border-gray-200 rounded">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left p-3">IP</th>
            <th className="text-left p-3">Acción</th>
            <th className="text-left p-3">Ruta</th>
            <th className="text-left p-3">Status</th>
            <th className="text-left p-3">Bot</th>
            <th className="text-left p-3">Scraper</th>
            <th className="text-left p-3">Requests/min</th>
            <th className="text-left p-3">Cuándo</th>
          </tr>
        </thead>
        <tbody>
          {data.map((entry) => (
            <tr key={entry.id} className="border-b hover:bg-gray-50">
              <td className="p-3 font-mono text-gray-600">{maskIP(entry.ip_address)}</td>
              <td className="p-3">
                <span
                  className={`px-2 py-1 rounded text-xs font-semibold ${
                    entry.action === "blocked"
                      ? "bg-red-100 text-red-700"
                      : entry.action === "rate_limited"
                        ? "bg-yellow-100 text-yellow-700"
                        : entry.action === "suspicious"
                          ? "bg-orange-100 text-orange-700"
                          : "bg-blue-100 text-blue-700"
                  }`}
                >
                  {entry.action}
                </span>
              </td>
              <td className="p-3 text-gray-600">{entry.page_path || "-"}</td>
              <td className="p-3 text-gray-600">
                {entry.http_status || "-"}
              </td>
              <td className="p-3">{entry.detected_bot ? "✓" : "-"}</td>
              <td className="p-3">{entry.detected_scraper ? "✓" : "-"}</td>
              <td className="p-3">
                {entry.request_count_last_minute || "-"}
              </td>
              <td className="p-3 text-gray-500">{formatTime(entry.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {data.length === 0 && (
        <p className="text-gray-500 text-center py-8">
          No hay actividad registrada
        </p>
      )}
    </div>
  )
}

function maskIP(ip: string): string {
  const parts = ip.split(".")
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.***`
  }
  return ip
}

function formatTime(isoString: string): string {
  const d = new Date(isoString)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)

  if (mins < 1) return "Ahora"
  if (mins < 60) return `${mins}m`
  if (mins < 1440) return `${Math.floor(mins / 60)}h`
  return `${Math.floor(mins / 1440)}d`
}
