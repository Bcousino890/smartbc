"use client";

import { cn } from "@/lib/utils";

/** Utilidades visuales comunes de las secciones del diálogo de scrapers. */

export const nf = new Intl.NumberFormat("es-ES");
export const fmt = (n: number | null | undefined) => (n == null ? "—" : nf.format(Math.round(n)));

export function relTime(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "nunca";
  const minutes = Math.max(0, Math.round((nowMs - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "hace segundos";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

/** «en 4 min» / «en 2 h» para la próxima ejecución; «ahora» si ya tocaba. */
export function inTime(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return "—";
  const minutes = Math.round((new Date(iso).getTime() - nowMs) / 60_000);
  if (minutes <= 0) return "ahora";
  if (minutes < 60) return `en ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `en ${hours} h`;
  return `en ${Math.round(hours / 24)} d`;
}

export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "UTC" });
}

export function Section({
  title,
  description,
  children,
  id,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section aria-labelledby={id} className="rounded-2xl border border-ink/10 bg-white p-4 md:p-5">
      <h3 id={id} className="text-base font-bold text-ink">
        {title}
      </h3>
      {description && <p className="mt-1 max-w-2xl text-sm text-ink/70">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function Notice({ tone, children }: { tone: "info" | "warn" | "error"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn(
        "rounded-xl border px-3.5 py-3 text-sm",
        tone === "info" && "border-ink/10 bg-cream-50 text-ink/75",
        tone === "warn" && "border-amber-200 bg-amber-50 text-amber-900",
        tone === "error" && "border-red-200 bg-red-50 text-red-800",
      )}
    >
      {children}
    </div>
  );
}

export const BTN_PRIMARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-cream-50 transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-45";
export const BTN_SECONDARY =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-ink/15 bg-white px-4 text-sm font-semibold text-ink transition hover:border-ink/35 disabled:cursor-not-allowed disabled:opacity-45";
