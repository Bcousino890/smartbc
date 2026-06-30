"use client";

import type { PageViewRow } from "@/lib/db/queries/analytics";

interface RecentSessionsTableProps {
  sessions: Array<
    PageViewRow & {
      eventsCount: number;
    }
  >;
}

export function RecentSessionsTable({ sessions }: RecentSessionsTableProps) {
  if (sessions.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No hay sesiones recientes</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left p-2 font-semibold text-gray-700">IP</th>
            <th className="text-left p-2 font-semibold text-gray-700">
              País/Ciudad
            </th>
            <th className="text-left p-2 font-semibold text-gray-700">
              Dispositivo
            </th>
            <th className="text-left p-2 font-semibold text-gray-700">
              Navegador
            </th>
            <th className="text-center p-2 font-semibold text-gray-700">
              Eventos
            </th>
            <th className="text-right p-2 font-semibold text-gray-700">
              Cuándo
            </th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session, index) => (
            <tr
              key={session.id}
              className={`border-b border-gray-100 hover:bg-gray-50 ${
                index % 2 === 0 ? "bg-white" : "bg-gray-50"
              }`}
            >
              <td className="p-2 font-mono text-gray-600">{maskIP(session.ip)}</td>
              <td className="p-2 text-gray-700">
                {session.city || session.country_code ? (
                  <>
                    <span>{getCountryFlag(session.country_code)}</span>{" "}
                    {session.city && `${session.city}, `}
                    {session.country_code}
                  </>
                ) : (
                  "-"
                )}
              </td>
              <td className="p-2 text-gray-700">
                {session.device_type || "-"}
              </td>
              <td className="p-2 text-gray-700">{session.browser || "-"}</td>
              <td className="text-center p-2">
                <span className="inline-block px-2 py-1 bg-blue-100 text-blue-700 rounded font-semibold">
                  {session.eventsCount}
                </span>
              </td>
              <td className="text-right p-2 text-gray-600">
                {formatTime(session.created_at)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function maskIP(ip?: string | null): string {
  if (!ip) return "-";
  const parts = ip.split(".");
  if (parts.length === 4) {
    return `${parts[0]}.${parts[1]}.${parts[2]}.***`;
  }
  return ip;
}

function formatTime(isoString: string): string {
  const d = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins = Math.floor(diff / 60000);

  if (mins < 1) return "Ahora";
  if (mins < 60) return `${mins}m`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h`;
  return `${Math.floor(mins / 1440)}d`;
}

function getCountryFlag(countryCode?: string | null): string {
  if (!countryCode || countryCode === "unknown") return "🌐";
  try {
    const codePoints = countryCode
      .toUpperCase()
      .split("")
      .map((char) => 127397 + char.charCodeAt(0));
    return String.fromCodePoint(...codePoints);
  } catch {
    return "🌐";
  }
}
