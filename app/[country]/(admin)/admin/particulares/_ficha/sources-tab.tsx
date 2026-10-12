"use client";

import { addressLine } from "@/lib/particulares/address-title";
import { ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LinkedAd } from "@/lib/particulares/links-types";
import { cn } from "@/lib/utils";
import { formatEuros, formatPhone, portalName, relativeTime, shortId, sourceRefs, whatsappUrl } from "./format";
import { GroupHeader } from "./group-header";
import type { Op } from "./group-history";
import { useGroupLinks } from "./use-group-links";

const PORTAL_TONE: Record<string, string> = {
  idealista: "bg-lime-100 text-lime-900",
  fotocasa: "bg-sky-100 text-sky-900",
  pisos: "bg-orange-100 text-orange-900",
  habitaclia: "bg-rose-100 text-rose-900",
};

export function PortalBadge({ portal, className }: { portal: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
        PORTAL_TONE[portal.toLowerCase()] ?? "bg-ink/10 text-ink",
        className,
      )}
    >
      {portalName(portal).charAt(0)}
    </span>
  );
}

const OP_LABEL: Record<Op, string> = { sale: "Venta", rent: "Alquiler" };

/**
 * «Fuentes (N)»: una propiedad = grupo de fuentes. Conmutador Venta | Alquiler y
 * tabla comparable (anunciante, referencia, teléfono, precio, estado, dirección,
 * hab., baños, m², parcela, particular) con scroll interno.
 */
export function SourcesTab({ rowId, currentOp, onCount }: { rowId: string; currentOp?: Op | null; onCount?: (n: number) => void }) {
  const { members, events, loading } = useGroupLinks(rowId);
  const [op, setOp] = useState<Op | null>(null);

  useEffect(() => {
    if (members) onCount?.(members.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members]);

  const counts = useMemo(
    () => ({
      sale: (members ?? []).filter((m) => m.operation === "sale" || m.operation == null).length,
      rent: (members ?? []).filter((m) => m.operation === "rent" || m.operation == null).length,
    }),
    [members],
  );
  const selected: Op = op ?? (currentOp && counts[currentOp] > 0 ? currentOp : counts.sale > 0 ? "sale" : "rent");

  if (loading || members === null)
    return (
      <p className="flex items-center gap-2 py-6 text-sm text-ink/70">
        <Loader2 size={14} className="animate-spin" /> Cargando fuentes…
      </p>
    );
  if (members.length === 0) return <p className="py-6 text-sm text-ink/70">Sin fuentes registradas.</p>;

  const rows = members.filter((m) => m.operation === selected || m.operation == null);
  const active = rows.filter((m) => m.is_active).length;

  return (
    <div className="space-y-4">
      <GroupHeader members={members} events={events} />
      <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink/10 px-4 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">Fuentes ({members.length})</h3>
          <div role="tablist" aria-label="Operación" className="inline-flex rounded-lg border border-ink/15 bg-cream-50 p-0.5">
            {(["sale", "rent"] as const).map((o) => (
              <button
                key={o}
                role="tab"
                type="button"
                aria-selected={selected === o}
                disabled={counts[o] === 0}
                onClick={() => setOp(o)}
                className={cn(
                  "min-h-8 rounded-md px-3 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-40",
                  selected === o ? "bg-ink text-cream-50 shadow-sm" : "text-ink/75 hover:text-ink",
                )}
              >
                {OP_LABEL[o]} ({counts[o]})
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-ink/65">
            {active} activa{active === 1 ? "" : "s"} de {rows.length}
          </span>
        </header>
        <div className="max-h-[440px] overflow-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="sticky top-0 z-[1] bg-cream-50 text-xs uppercase tracking-wide text-ink/65">
              <tr>
                {["Fuente", "Referencia", "Teléfono", selected === "rent" ? "Precio de alquiler" : "Precio de venta", "Estado", "Dirección", "Hab.", "Baños", "Área constr.", "Parcela", "Particular"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-3 py-2.5 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-ink/65">Sin fuentes de {OP_LABEL[selected].toLowerCase()}.</td>
                </tr>
              )}
              {rows.map((m) => (
                <SourceRow key={m.id} m={m} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** Referencia del anunciante, ID del anuncio en el portal, enlace de la agencia y (secundaria) la referencia interna PART-…. */
function RefsCell({ m }: { m: LinkedAd }) {
  const r = sourceRefs(m);
  if (!r.reference && !r.adId && !r.internal && !r.agency) return <span className="text-ink/60">—</span>;
  return (
    <div className="space-y-0.5">
      {r.reference && (
        <p className="whitespace-nowrap font-mono font-semibold text-ink" title="Referencia del anunciante en el portal">
          {r.reference}
        </p>
      )}
      {r.adId && (
        <p className="whitespace-nowrap font-mono text-ink/80" title={`ID del anuncio en ${portalName(m.portal)}: ${r.adId}`}>
          <span className="font-sans text-ink/60">ID </span>
          {shortId(r.adId)}
        </p>
      )}
      {r.agency && (
        <a
          href={r.agency.href}
          target="_blank"
          rel="noopener noreferrer"
          title="Enlace adicional de la agencia"
          className="inline-flex max-w-[170px] items-center gap-1 truncate text-ink underline-offset-2 hover:underline"
        >
          <span className="truncate">{r.agency.domain}</span>
          <ExternalLink size={10} aria-hidden className="shrink-0" />
        </a>
      )}
      {r.internal && (
        <p className="whitespace-nowrap font-mono text-[11px] text-ink/55" title="Referencia interna del CRM">
          {r.internal}
        </p>
      )}
    </div>
  );
}

function SourceRow({ m }: { m: LinkedAd }) {
  const wa = whatsappUrl(m.phone);
  const who = m.owner_name?.trim();
  return (
    <tr className={cn("border-t border-ink/10", !m.is_active && "bg-cream-50/60")}>
      <td className="px-3 py-2.5">
        <a
          href={m.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 font-semibold text-ink underline-offset-2 hover:underline"
        >
          <PortalBadge portal={m.portal} />
          <span className="min-w-0">
            <span className="flex items-center gap-1">
              {portalName(m.portal)}
              <ExternalLink size={11} aria-hidden />
            </span>
            <span className="block max-w-[170px] truncate text-xs font-normal text-ink/65">{who || "—"}</span>
          </span>
        </a>
      </td>
      <td className="px-3 py-2.5 text-xs text-ink/80">
        <RefsCell m={m} />
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 text-ink">
        {m.phone ? (
          <span className="inline-flex items-center gap-1.5">
            {formatPhone(m.phone)}
            {wa && (
              <a href={wa} target="_blank" rel="noopener noreferrer" aria-label="Escribir por WhatsApp" title="WhatsApp" className="text-emerald-700 hover:text-emerald-900">
                <MessageCircle size={15} />
              </a>
            )}
          </span>
        ) : (
          <span className="text-ink/60">—</span>
        )}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums text-ink">
        {m.price != null ? formatEuros(m.price, { monthly: m.operation === "rent" }) : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <span
          className={cn(
            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            m.is_active ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800",
          )}
        >
          {m.is_active ? "Activo" : "No disponible"}
        </span>
        <p className="mt-0.5 text-xs text-ink/65">
          {m.is_active
            ? m.created_at && `Detectado ${relativeTime(m.created_at)}`
            : m.taken_down_at && `Baja ${relativeTime(m.taken_down_at)}`}
        </p>
      </td>
      <td className="max-w-[220px] truncate px-3 py-2.5 text-ink/80" title={addressLine(m.address) || m.zone || ""}>{addressLine(m.address) || m.zone || "—"}</td>
      <td className="px-3 py-2.5 tabular-nums">{m.bedrooms ?? "—"}</td>
      <td className="px-3 py-2.5 tabular-nums">{m.bathrooms ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{m.square_meters != null ? `${m.square_meters} m²` : "—"}</td>
      <td className="px-3 py-2.5 text-ink/60">—</td>
      <td className="px-3 py-2.5">
        {m.advertiser_type === "particular" ? "Sí" : m.advertiser_type === "professional" ? "No" : <span className="text-ink/60">—</span>}
      </td>
    </tr>
  );
}
