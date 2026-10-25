"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Bell, CalendarClock, MessageSquare, Star } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import type { NotificationItem } from "@/app/api/admin/notifications/route";
import { useCrmTheme } from "@/components/admin/crm-theme";
import { bellContextKey, createBellStore, type BellResult } from "@/lib/notifications/bell-store";

async function fetchBell(): Promise<BellResult<NotificationItem>> {
  try {
    const res = await fetch("/api/admin/notifications", { cache: "no-store" });
    if (res.status === 401 || res.status === 403) return { status: "denied" };
    if (!res.ok) return { status: "error" };
    const data = await res.json();
    return { status: "ok", items: Array.isArray(data) ? data : [] };
  } catch {
    return { status: "error" };
  }
}

// Una sola copia por pestaña (módulo del navegador), compartida por todas las
// campanas que se monten al navegar (CRM-02, E3 · D2).
const bellStore = createBellStore<NotificationItem>({ fetcher: fetchBell });

/** Cierre de sesión: borra lo que la campana tenga en memoria. */
export function clearNotificationsCache() {
  bellStore.clear();
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days === 1) return "ayer";
  return `hace ${days}d`;
}

const ICON_MAP: Record<NotificationItem["type"], React.ReactNode> = {
  visit: (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/10">
      <CalendarClock size={15} className="text-gold" strokeWidth={1.75} />
    </span>
  ),
  message: (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink/8">
      <MessageSquare size={15} className="text-ink/65" strokeWidth={1.75} />
    </span>
  ),
  catalog_feedback: (
    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gold/10">
      <Star size={15} className="text-gold" strokeWidth={1.75} />
    </span>
  ),
};

/**
 * 0218 · al abrir un aviso de opinión se marca como leído (solo ese tipo).
 * Excepción al plazo de 60 s (D2): en cuanto el servidor confirma, se vuelve a
 * pedir la campana.
 */
function markRead(noticeId: string | undefined, key: string | null) {
  if (!noticeId) return;
  void fetch("/api/admin/notifications", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "mark_read", ids: [noticeId] }),
    keepalive: true,
  })
    .catch(() => undefined)
    .finally(() => {
      if (key) void bellStore.load(key, { force: true });
    });
}

export function NotificationsBell() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Contexto de los datos: usuario de la sesión + país de la URL. Sin usuario
  // conocido (fuera del layout del admin) no se guarda nada entre montajes.
  const userId = useCrmTheme()?.userId ?? null;
  const params = useParams<{ country?: string }>();
  const country = typeof params?.country === "string" ? params.country : "es";
  const key = userId ? bellContextKey(userId, country) : null;

  useEffect(() => {
    let alive = true;
    if (!key) {
      // Sin contexto: el comportamiento de siempre, sin compartir nada.
      const run = () => {
        setLoading(true);
        void fetchBell()
          .then((r) => {
            if (alive && r.status === "ok") setNotifications(r.items);
            if (alive && r.status === "denied") setNotifications([]);
          })
          .finally(() => alive && setLoading(false));
      };
      run();
      const id = setInterval(run, 60_000);
      return () => {
        alive = false;
        clearInterval(id);
      };
    }
    bellStore.use(key);
    setNotifications(bellStore.peek(key) ?? []);
    const unsubscribe = bellStore.subscribe((changed) => {
      if (alive && (changed === key || changed === "*")) setNotifications(bellStore.peek(key) ?? []);
    });
    const refresh = () => {
      // Con datos frescos no pide nada: como mucho una petición por minuto.
      if (bellStore.isFresh(key)) return;
      setLoading(true);
      void bellStore.load(key).finally(() => alive && setLoading(false));
    };
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => {
      alive = false;
      unsubscribe();
      clearInterval(id);
    };
  }, [key]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const count = notifications.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={t("admin.notifications")}
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-ink/10 bg-white/70 text-ink/65 transition hover:border-gold/40 hover:text-ink"
      >
        <Bell size={16} strokeWidth={1.75} />
        {count > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold leading-none text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[360px] rounded-2xl border border-gold/15 bg-cream-50/95 shadow-xl backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gold/10 px-4 py-3">
            <span className="text-sm font-semibold text-ink">
              Notificaciones
            </span>
            <span className="text-xs text-ink/45">
              {count > 0 ? `${count} nueva${count !== 1 ? "s" : ""}` : "Al día"}
            </span>
          </div>

          {/* Body */}
          <div className="max-h-[380px] overflow-y-auto">
            {loading && notifications.length === 0 ? (
              <div className="flex items-center justify-center py-10">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
                <Bell size={28} className="text-ink/20" strokeWidth={1.5} />
                <p className="text-sm font-medium text-ink/70">Todo al día</p>
                <p className="text-xs text-ink/40">
                  No hay notificaciones nuevas.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-gold/8">
                {notifications.map((n) => (
                  <li key={n.id}>
                    <Link
                      href={n.href}
                      onClick={() => {
                        setOpen(false);
                        if (n.noticeId) {
                          if (key) bellStore.remove(key, (x) => x.id === n.id);
                          else setNotifications((all) => all.filter((x) => x.id !== n.id));
                          markRead(n.noticeId, key);
                        }
                      }}
                      className="flex items-start gap-3 px-4 py-3 transition hover:bg-gold/5"
                    >
                      {ICON_MAP[n.type]}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-ink">
                          {n.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-ink/55">
                          {n.subtitle}
                        </p>
                      </div>
                      <span className="shrink-0 text-xs text-ink/35">
                        {timeAgo(n.created_at)}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
