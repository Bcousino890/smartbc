"use client";

import { addressLine } from "@/lib/particulares/address-title";
import { ExternalLink, Loader2, MessageCircle, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { LinkedAd } from "@/lib/particulares/links-types";
import { kindOfAdvertiser, kindOfCrmProperty, sourceLabel, type SourceKind } from "@/lib/particulares/source-kind";
import { SourceKindBadge, SourceKindIcon } from "./source-kind-badge";
import { pairAgencyInmuebles, webLinks, type AgencyInmueble } from "@/lib/particulares/agency-pairs";
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
  const { members, events, loading, agencyMatches, agencyWebs, reload } = useGroupLinks(rowId);
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
  // Una sola fila por inmueble de agencia: su web (si se detecta) + nuestra ficha del CRM (si la hay).
  const allItems = pairAgencyInmuebles(agencyWebs, agencyMatches);
  const items = allItems.filter((it) => {
    const ops = it.crm
      ? [it.crm.property.operation]
      : members.filter((m) => it.web?.member_ids.includes(m.id)).map((m) => m.operation);
    return ops.length === 0 || ops.includes(selected) || ops.includes(null);
  });
  const total = members.length + allItems.length;
  const active =
    rows.filter((m) => m.is_active).length +
    items.filter((it) => (it.web ? it.web.live !== false : it.crm?.property.status === "available" || it.crm?.property.status === "reserved")).length;

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
            {active} activa{active === 1 ? "" : "s"} de {rows.length + items.length}
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
              {rows.length === 0 && items.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-6 text-center text-ink/65">Sin fuentes de {OP_LABEL[selected].toLowerCase()}.</td>
                </tr>
              )}
              {rows.map((m) => (
                <SourceRow key={m.id} m={m} />
              ))}
              {items.map((it) => (
                <AgencyInmuebleRow key={it.web?.key ?? it.crm?.id} it={it} onReread={reload} />
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

const VERDICT_UI = {
  verificada: { text: "Verificada", tone: "border-teal-300 bg-teal-50 text-teal-800" },
  no_coincide: { text: "No coincide", tone: "border-red-200 bg-red-50 text-red-800" },
  sin_leer: { text: "Sin leer", tone: "border-ink/20 bg-ink/5 text-ink/70" },
} as const;

const BTN = "inline-flex min-h-8 items-center gap-1 rounded-md border px-2 text-xs font-semibold transition";

/**
 * UNA fila por inmueble de agencia: reúne la web de la agencia (fuente «Web propia») y nuestra ficha del CRM
 * («En el CRM»). Siempre muestra el nombre de la agencia, «Ficha en el CRM» y «Ver en la web», y las dos
 * referencias (la de su web y la BC nuestra). Sin web leída, «Ref. en su web» sale de la URL o del anuncio.
 */
function AgencyInmuebleRow({ it, onReread }: { it: AgencyInmueble; onReread: () => void }) {
  const { web: w, crm } = it;
  const p = crm?.property ?? null;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const reread = async () => {
    if (!w) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/particulares/agency-web/reread", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ particular_id: w.member_ids[0], key: w.key }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setErr(j.error ?? "No se pudo releer");
      else onReread();
    } catch {
      setErr("Sin conexión");
    } finally {
      setBusy(false);
    }
  };

  const links = w ? webLinks(w) : null;
  const v = w ? VERDICT_UI[w.verdict.state] : null;
  // El nombre de la agencia: el del anuncio del portal (en «Portales externos» el nombre del CRM no es el de la agencia).
  const agencyName = w?.agency_name?.trim() || (p && crm && p.agency_name && p.agency_name !== "Portales externos" ? p.agency_name : null) || w?.domain || "Agencia";
  const crmKind = p ? kindOfCrmProperty(p.agency_collab) : null;
  const crmLive = p ? p.status === "available" || p.status === "reserved" : null;
  const live = w ? w.live : crmLive;
  const sure = crm ? crm.status === "confirmado" || crm.level === "cierto" : null;
  const reasons = crm && Array.isArray((crm.evidence as { reasons?: unknown }).reasons) ? ((crm.evidence as { reasons: string[] }).reasons) : [];
  const price = w?.price ?? p?.price ?? null;
  const op = p?.operation ?? null;
  const address = p?.address ? addressLine(p.address) : w?.address;
  const beds = p?.bedrooms || w?.bedrooms || null;
  const baths = p?.bathrooms || w?.bathrooms || null;
  const m2 = p?.square_meters || w?.square_meters || null;

  return (
    <tr className={cn("border-t border-ink/10", w ? "bg-teal-50/30" : "bg-gold/[0.04]", live === false && "bg-cream-50/60")}>
      <td className="px-3 py-2.5">
        <div className="flex items-start gap-2">
          <PortalBadge portal="web" kind={w ? "agencia_web_propia" : (crmKind ?? "agencia_web")} />
          <div className="min-w-0">
            <p className="max-w-[210px] truncate font-semibold text-ink" title={agencyName}>{agencyName}</p>
            <div className="mt-0.5 flex flex-wrap items-center gap-1">
              {w && <SourceKindBadge kind="agencia_web_propia" className="text-xs" />}
              {crmKind && <SourceKindBadge kind={crmKind} className="text-xs" />}
              {v && (
                <span title={w?.verdict.reasons.join(" · ")} className={cn("rounded-md border px-1.5 py-0.5 text-xs font-semibold", v.tone)}>
                  {v.text}
                </span>
              )}
              {sure != null && (
                <span title={reasons.join(" · ") || crm?.rule} className={cn("rounded-md border px-1.5 py-0.5 text-xs font-semibold", sure ? "border-gold/40 bg-gold/10 text-gold-dark" : "border-amber-300 bg-amber-50 text-amber-700")}>
                  {crm?.status === "confirmado" ? "Confirmado" : sure ? "Seguro" : "Posible"}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {p?.slug && (
                <a href={`/es/admin/propiedades/${p.slug}`} className={cn(BTN, "border-ink/20 bg-white text-ink hover:border-gold/60")}>
                  Ficha en el CRM <ExternalLink size={11} aria-hidden />
                </a>
              )}
              {links && (
                <a href={links.main} target="_blank" rel="noopener noreferrer" className={cn(BTN, "border-teal-300 bg-white text-teal-900 hover:bg-teal-50")}>
                  Ver en la web <ExternalLink size={11} aria-hidden />
                </a>
              )}
            </div>
            {links?.original && (
              <a href={links.original} target="_blank" rel="noopener noreferrer" title="Enlace adicional tal como lo publica el portal" className="mt-1 block max-w-[210px] truncate text-xs text-ink/60 underline-offset-2 hover:underline">
                Enlace del portal: {w?.domain}
              </a>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5 text-xs text-ink/80">
        {w && (
          <p className="whitespace-nowrap" title="Referencia en la web de la agencia">
            <span className="text-ink/60">Ref. en su web: </span>
            <span className="font-mono font-semibold text-ink">{w.ref ?? "—"}</span>
          </p>
        )}
        {p && (
          <p className="whitespace-nowrap" title="Referencia en nuestro CRM">
            <span className="text-ink/60">Ref. en nuestro CRM: </span>
            <span className="font-mono font-semibold text-ink">{p.bc_reference ?? p.reference ?? "—"}</span>
          </p>
        )}
        {w && w.photos.length > 0 && <p className="mt-0.5 text-ink/60">{w.photos.length} fotos sin marca</p>}
      </td>
      <td className="px-3 py-2.5 text-ink/60">—</td>
      <td className="whitespace-nowrap px-3 py-2.5 font-semibold tabular-nums text-ink">{price != null ? formatEuros(price, { monthly: op === "rent" }) : "—"}</td>
      <td className="whitespace-nowrap px-3 py-2.5">
        <span
          className={cn(
            "inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold",
            live === true ? "border-emerald-300 bg-emerald-50 text-emerald-900" : live === false ? "border-red-200 bg-red-50 text-red-800" : "border-ink/20 bg-ink/5 text-ink/70",
          )}
        >
          {live === true ? (p?.status === "reserved" ? "Reservado" : "Activo") : live === false ? "No disponible" : w?.blocked ? "Sin leer · bloqueada por la web" : "Sin leer"}
        </span>
        {w?.note && <p className="mt-0.5 max-w-[190px] text-xs text-ink/65">{w.note}</p>}
        {w?.fetched_at && <p className="mt-0.5 text-xs text-ink/65">Web leída {relativeTime(w.fetched_at)}</p>}
        {w && (
          <button
            type="button"
            onClick={reread}
            disabled={busy}
            title="Vuelve a leer la ficha de la web de la agencia ahora"
            className="mt-1 inline-flex items-center gap-1 rounded-md border border-ink/15 px-2 py-0.5 text-xs font-medium text-ink/80 hover:border-gold/60 disabled:opacity-50"
          >
            {busy ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} aria-hidden />} Releer web
          </button>
        )}
        {err && <p className="mt-0.5 max-w-[190px] text-xs text-red-700">{err}</p>}
      </td>
      <td className="max-w-[220px] truncate px-3 py-2.5 text-ink/80" title={address ?? ""}>{address || "—"}</td>
      <td className="px-3 py-2.5 tabular-nums">{beds ?? "—"}</td>
      <td className="px-3 py-2.5 tabular-nums">{baths ?? "—"}</td>
      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{m2 ? `${m2} m²` : "—"}</td>
      <td className="px-3 py-2.5 text-ink/60">—</td>
      <td className="px-3 py-2.5 text-ink/60">No</td>
    </tr>
  );
}
