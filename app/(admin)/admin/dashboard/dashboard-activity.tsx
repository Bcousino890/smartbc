"use client";

import { Home, Clock, Users } from "lucide-react";

interface Activity {
  type: "particular" | "visit" | "client";
  description: string;
  timestamp: string;
}

export function DashboardActivity({ activity }: { activity: Activity[] }) {
  const getTimeAgo = (timestamp: string) => {
    const now = new Date();
    const date = new Date(timestamp);
    const diff = now.getTime() - date.getTime();

    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Hace unos segundos";
    if (minutes < 60) return `Hace ${minutes}m`;
    if (hours < 24) return `Hace ${hours}h`;
    if (days < 7) return `Hace ${days}d`;
    return date.toLocaleDateString("es-ES");
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "particular":
        return <Home size={18} className="text-gold" />;
      case "visit":
        return <Clock size={18} className="text-blue-500" />;
      case "client":
        return <Users size={18} className="text-green-600" />;
      default:
        return null;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case "particular":
        return <span className="px-2 py-1 bg-gold/10 text-gold text-[11px] rounded">Anuncio</span>;
      case "visit":
        return <span className="px-2 py-1 bg-blue-100 text-blue-600 text-[11px] rounded">Visita</span>;
      case "client":
        return <span className="px-2 py-1 bg-green-100 text-green-700 text-[11px] rounded">Cliente</span>;
      default:
        return null;
    }
  };

  return (
    <div className="rounded-lg border border-gold/20 bg-white/80 overflow-hidden">
      {activity.length === 0 ? (
        <div className="p-6 text-center text-ink/50">
          <p>Sin actividad en los últimos 7 días</p>
        </div>
      ) : (
        <div className="divide-y divide-gold/10">
          {activity.map((item, idx) => (
            <div key={idx} className="p-4 flex items-center gap-4 hover:bg-cream-50/50 transition">
              <div className="flex-shrink-0">{getIcon(item.type)}</div>
              <div className="flex-grow min-w-0">
                <p className="text-sm text-ink truncate">{item.description}</p>
                <p className="text-[11px] text-ink/50 mt-1">{getTimeAgo(item.timestamp)}</p>
              </div>
              <div className="flex-shrink-0">{getTypeBadge(item.type)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
