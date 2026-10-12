"use client";

import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { LinkedAd, ParticularLinksPayload } from "@/lib/particulares/links-types";
import { cn } from "@/lib/utils";
import { formatEuros, formatPhone, portalName, relativeTime } from "./format";

/**
 * «Fuentes»: todos los anuncios donde aparece este inmueble (el abierto más los
 * enlazados de otros portales u operaciones), en una tabla comparable: quién lo
 * publica, con qué referencia, teléfono, precio y estado de cada uno.
 */
export function SourcesTab({ rowId, onCount }: { rowId: string; onCount?: (n: number) => void }) {
  const [members, setMembers] = useState<LinkedAd[] | null>(null);

  useEffect(() => {
    let off = false;
    fetch(`/api/admin/particulares/links?id=${encodeURIComponent(rowId)}`)
      .then((r) => (r.ok ? (r.json() as Promise<ParticularLinksPayload>) : null))
      .then((d) => {
        if (off) return;
        setMembers(d?.members ?? []);
        onCount?.(d?.members?.length ?? 0);
      })
      .catch(() => !off && setMembers([]));
    return () => {
      off = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowId]);

  if (members === null)
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-ink/70">
        <Loader2 size={14} className="animate-spin" /> Cargando fuentes…
      </p>
    );
  if (members.length === 0) return <p className="py-6 text-sm text-ink/70">Sin fuentes registradas.</p>;

  const active = members.filter((m) => m.is_active).length;
  return (
    <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
      <header className="flex items-center gap-2 border-b border-ink/10 px-4 py-3">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">Comercializando</h3>
        <span className="rounded-full bg-ink/10 px-2 py-0.5 text-xs font-medium text-ink">
          {members.length} {members.length === 1 ? "fuente" : "fuentes"}
        </span>
        <span className="ml-auto text-xs text-ink/65">{active} activa{active === 1 ? "" : "s"}</span>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-ink/65">
            <tr>
              {["Fuente", "Referencia", "Teléfono", "Precio", "Estado", "Dirección", "Hab.", "Baños", "m²"].map((h) => (
                <th key={h} className="px-4 py-2.5 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-t border-ink/10">
                <td className="px-4 py-3">
                  <a href={m.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-ink underline-offset-2 hover:underline">
                    {portalName(m.portal)} <ExternalLink size={12} aria-hidden />
                  </a>
                  <p className="text-xs text-ink/65">Particular</p>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-ink/80">{m.particular_reference ?? m.external_id}</td>
                <td className="px-4 py-3 text-ink">{m.phone ? formatPhone(m.phone) : <span className="text-ink/60">Sin teléfono</span>}</td>
                <td className="px-4 py-3 font-semibold tabular-nums text-ink">
                  {m.price != null ? formatEuros(m.price, { monthly: m.operation === "rent" }) : "Sin precio"}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={cn(
                      "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                      m.is_active ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800",
                    )}
                  >
                    {m.is_active ? (m.operation === "rent" ? "Alquiler activo" : "Venta activa") : "Retirado"}
                  </span>
                  {m.created_at && <p className="mt-0.5 text-xs text-ink/65">Detectado {relativeTime(m.created_at)}</p>}
                </td>
                <td className="max-w-[220px] truncate px-4 py-3 text-ink/80" title={m.address ?? m.zone ?? ""}>{m.address ?? m.zone ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{m.bedrooms ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{m.bathrooms ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{m.square_meters ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
