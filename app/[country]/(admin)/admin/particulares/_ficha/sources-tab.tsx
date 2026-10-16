"use client";

import { addressLine } from "@/lib/particulares/address-title";
import { ExternalLink, Loader2, MessageCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AgencyMatchInfo, AgencyWebSource, LinkedAd } from "@/lib/particulares/links-types";
import { kindOfAdvertiser, kindOfCrmProperty, sourceLabel, type SourceKind } from "@/lib/particulares/source-kind";
import { SourceKindBadge, SourceKindIcon } from "./source-kind-badge";
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

const KIND_BADGE_TONE: Record<SourceKind, string> = {
  particular: "ring-2 ring-emerald-300",
  agencia_portal: "ring-2 ring-sky-300",
  agencia_web: "ring-2 ring-gold/60",
  crm_importada: "ring-2 ring-ink/20",
  agencia_web_propia: "ring-2 ring-teal-300",
};

const WEB_BADGE_TONE: Partial<Record<SourceKind, string>> = {
  agencia_web: "bg-gold/15 text-gold-dark",
  crm_importada: "bg-ink/5 text-ink/70",
  agencia_web_propia: "bg-teal-50 text-teal-800",
};

export function PortalBadge({ portal, kind, className }: { portal: string; kind?: SourceKind; className?: string }) {
  if (kind === "agencia_web" || kind === "crm_importada" || kind === "agencia_web_propia")
    return (
      <span aria-hidden className={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg", WEB_BADGE_TONE[kind], KIND_BADGE_TONE[kind], className)}>
        <SourceKindIcon kind={kind} size={14} />
      </span>
    );
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
        PORTAL_TONE[portal.toLowerCase()] ?? "bg-ink/10 text-ink",
        kind && KIND_BADGE_TONE[kind],
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
  const { members, events, loading, agencyMatches, agencyWebs } = useGroupLinks(rowId);
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
  if (members.length === 0 && agencyMatches.length === 0 && agencyWebs.length === 0) return <p className="py-6 text-sm text-ink/70">Sin fuentes registradas.</p>;

  const rows = members.filter((m) => m.operation === selected || m.operation == null);
  // Webs directas de agencias colaboradoras (propiedades del CRM) que son este mismo inmueble.
  const webRows = agencyMatches.filter((w) => w.property.operation === selected || w.property.operation == null);
  // Webs propias de las agencias anunciantes: la ficha es la de este anuncio, así que sigue su operación.
  const ownWebs = agencyWebs.filter((w) => {
    const ops = members.filter((m) => w.member_ids.includes(m.id)).map((m) => m.operation);
    return ops.length === 0 || ops.includes(selected) || ops.includes(null);
  });
  const total = members.length + agencyMatches.length + agencyWebs.length;
  const active =
    rows.filter((m) => m.is_active).length +
    webRows.filter((w) => w.property.status === "available" || w.property.status === "reserved").length +
    ownWebs.filter((w) => w.live !== false).length;

  return (
    <div className="space-y-4">
      <GroupHeader members={members} events={events} />
      <section className="overflow-hidden rounded-2xl border border-ink/10 bg-white">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-ink/10 px-4 py-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-ink">Fuentes ({total})</h3>
          <span className="hidden items-center gap-1.5 md:inline-flex" aria-label="Tipos de fuente">
            {(["particular", "agencia_portal", "agencia_web_propia", "agencia_web", "crm_importada"] as const).map((k) => (
              <SourceKindBadge key={k} kind={k} />
            ))}
          </span>
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
            {active} activa{active === 1 ? "" : "s"} de {rows.length + webRows.length + ownWebs.length}
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
              {rows.length === 0 && ownWebs.length === 0 && webRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-ink/65">Sin fuentes de {OP_LABEL[selected].toLowerCase()}.</td>
                </tr>
              )}
              {rows.map((m) => (
                <SourceRow key={m.id} m={m} />
              ))}
              {ownWebs.map((w) => (
                <OwnWebRow key={w.key} w={w} />
              ))}
              {webRows.map((w) => (
                <WebSourceRow key={w.id} w={w} />
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
        <p className="whitespace-nowrap font-mono text-xs text-ink/55" title="Referencia interna del CRM">
          {r.internal}
        </p>
      )}
    </div>
  );
}

function SourceRow({ m }: { m: LinkedAd }) {
  const wa = whatsappUrl(m.phone);
  const who = m.owner_name?.trim();
  const kind = kindOfAdvertiser(m.advertiser_type);
  return (
    <tr className={cn("border-t border-ink/10", !m.is_active && "bg-cream-50/60")}>
      <td className="px-3 py-2.5">
        <a
          href={m.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 font-semibold text-ink underline-offset-2 hover:underline"
        >
          <PortalBadge portal={m.portal} kind={kind} />
          <span className="min-w-0">
            <span className="flex items-center gap-1">
              {portalName(m.portal)}
              <ExternalLink size={11} aria-hidden />
            </span>
            <SourceKindBadge kind={kind} className="mt-0.5 text-xs" />
            <span className="block max-w-[170px] truncate text-xs font-normal text-ink/65" title={sourceLabel({ kind, portal: m.portal, agency: who })}>
              {who || "—"}
            </span>
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

/** Fuente «web de agencia»: propiedad del CRM (sindicación / web directa) que coincide con este inmueble. */
function WebSourceRow({ w }: { w: AgencyMatchInfo }) {
  const p = w.property;
  const live = p.status === "available" || p.status === "reserved";
  const sure = w.status === "confirmado" || w.level === "cierto";
  const reasons = Array.isArray((w.evidence as { reasons?: unknown }).reasons) ? ((w.evidence as { reasons: string[] }).reasons) : [];
  // Solo una agencia colaboradora de sindicación (con feed) es «Web de agencia»; «Portales externos»
  // es el cajón donde el CRM importa propiedades de portales.
  const kind = kindOfCrmProperty(p.agency_collab);
  const label = sourceLabel({ kind, agency: p.agency_name });
  return (
    <tr className={cn("border-t border-ink/10", kind === "agencia_web" && "bg-gold/[0.04]", !live && "bg-cream-50/60")}>
      <td className="px-3 py-2.5">
        <span className="inline-flex items-center gap-2 font-semibold text-ink">
          <PortalBadge portal="web" kind={kind} />
          <span className="min-w-0">
            {p.slug ? (
              <a href={`/es/admin/propiedades/${p.slug}`} className="flex items-center gap-1 underline-offset-2 hover:underline">
                {label}
                <ExternalLink size={11} aria-hidden />
              </a>
            ) : (
              <span>{label}</span>
            )}
            <span className="mt-0.5 flex flex-wrap items-center gap-1">
              <SourceKindBadge kind={kind} className="text-xs" />
              <span
                title={reasons.join(" · ") || w.rule}
                className={cn("rounded-md border px-1.5 py-0.5 text-xs font-semibold", sure ? "border-gold/40 bg-gold/10 text-gold-dark" : "border-amber-300 bg-amber-50 text-amber-700")}
              >
                {w.status === "confirmado" ? "Confirmado" : w.level === "cierto" ? "Seguro" : "Posible"}
              </span>
            </span>
          </span>
        </span>
      </td>
      <td className="px-3 py-2.5 text-xs text-ink/80">
        {p.reference ? <p className="whitespace-nowrap font-mono font-semibold text-ink" title={kind === "agencia_web" ? "Referencia en el CRM / web de la agencia" : "Referencia en el CRM"}>{p.reference}</p> : <span className="text-ink/60">—</span>}
        {reasons.length > 0 && <p className="mt-0.5 max-w-[200px] text-xs text-ink/60">{reasons.join(" · ")}</p>}
      </td>
      <td className="px-3 py-2.5 text-ink/60">—</td>
      <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums text-ink">
        {p.price != null ? formatEuros(p.price, { monthly: p.operation === "rent" }) : "—"}
      </td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <span className={cn("inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold", live ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-800")}>
          {live ? (p.status === "reserved" ? "Reservado" : "Activo") : "No disponible"}
        </span>
      </td>
      <td className="max-w-[220px] truncate px-3 py-2.5 text-ink/80" title={addressLine(p.address) || ""}>{addressLine(p.address) || "—"}</td>
      <td className="px-3 py-2.5 tabular-nums">{p.bedrooms || "—"}</td>
      <td className="px-3 py-2.5 tabular-nums">{p.bathrooms || "—"}</td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{p.square_meters ? `${p.square_meters} m²` : "—"}</td>
      <td className="px-3 py-2.5 text-ink/60">—</td>
      <td className="px-3 py-2.5 text-ink/60">No</td>
    </tr>
  );
}

const VERDICT_UI = {
  verificada: { text: "Verificada", tone: "border-teal-300 bg-teal-50 text-teal-800" },
  no_coincide: { text: "No coincide", tone: "border-red-200 bg-red-50 text-red-800" },
  sin_leer: { text: "Sin leer", tone: "border-ink/20 bg-ink/5 text-ink/70" },
} as const;

/** Fuente «web propia de la agencia»: la ficha del piso en la web de la agencia anunciante (enlace adicional del portal). */
function OwnWebRow({ w }: { w: AgencyWebSource }) {
  const v = VERDICT_UI[w.verdict.state];
  const label = sourceLabel({ kind: "agencia_web_propia", agency: w.agency_name });
  const href = w.canonical_url ?? w.url;
  const stateOk = w.live === true;
  return (
    <tr className={cn("border-t border-ink/10 bg-teal-50/30", w.live === false && "bg-cream-50/60")}>
      <td className="px-3 py-2.5">
        <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 font-semibold text-ink underline-offset-2 hover:underline">
          <PortalBadge portal="web" kind="agencia_web_propia" />
          <span className="min-w-0">
            <span className="flex items-center gap-1">
              {label}
              <ExternalLink size={11} aria-hidden />
            </span>
            <span className="mt-0.5 flex flex-wrap items-center gap-1">
              <SourceKindBadge kind="agencia_web_propia" className="text-xs" />
              <span title={w.verdict.reasons.join(" · ")} className={cn("rounded-md border px-1.5 py-0.5 text-xs font-semibold", v.tone)}>
                {v.text}
              </span>
            </span>
            <span className="block max-w-[190px] truncate text-xs font-normal text-ink/65">{w.domain}</span>
          </span>
        </a>
      </td>
      <td className="px-3 py-2.5 text-xs text-ink/80">
        {w.ref ? <p className="whitespace-nowrap font-mono font-semibold text-ink" title="Referencia en la web de la agencia">{w.ref}</p> : <span className="text-ink/60">—</span>}
        <a href={href} target="_blank" rel="noopener noreferrer" title={w.canonical_url && w.canonical_url !== w.url ? `Enlace del portal: ${w.url}` : "Enlace adicional del anuncio"} className="inline-flex max-w-[170px] items-center gap-1 truncate text-ink underline-offset-2 hover:underline">
          <span className="truncate">{w.domain}</span>
          <ExternalLink size={10} aria-hidden className="shrink-0" />
        </a>
        {w.photos.length > 0 && <p className="mt-0.5 text-xs text-ink/60">{w.photos.length} fotos sin marca</p>}
      </td>
      <td className="px-3 py-2.5 text-ink/60">—</td>
      <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums text-ink">{w.price != null ? formatEuros(w.price) : "—"}</td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <span
          className={cn(
            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            stateOk ? "border-emerald-300 bg-emerald-50 text-emerald-900" : w.live === false ? "border-red-200 bg-red-50 text-red-800" : "border-ink/20 bg-ink/5 text-ink/70",
          )}
        >
          {stateOk ? "Activo" : w.live === false ? "No disponible" : "Sin leer"}
        </span>
        {w.fetched_at && <p className="mt-0.5 text-xs text-ink/65">Leída {relativeTime(w.fetched_at)}</p>}
      </td>
      <td className="max-w-[220px] truncate px-3 py-2.5 text-ink/80" title={w.address ?? ""}>{w.address ?? "—"}</td>
      <td className="px-3 py-2.5 tabular-nums">{w.bedrooms ?? "—"}</td>
      <td className="px-3 py-2.5 tabular-nums">{w.bathrooms ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{w.square_meters ? `${w.square_meters} m²` : "—"}</td>
      <td className="px-3 py-2.5 text-ink/60">—</td>
      <td className="px-3 py-2.5 text-ink/60">No</td>
    </tr>
  );
}
