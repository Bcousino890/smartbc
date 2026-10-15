"use client";

import { addressLine } from "@/lib/particulares/address-title";
import { useCallback, useEffect, useState } from "react";
import { Building2, ExternalLink, Link2, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { groupThousands } from "./_ficha/format";
import type {
  LinkedAd,
  LinkInfo,
  LinkSummaryLite,
  ParticularLinksPayload,
} from "@/lib/particulares/links-types";
import { setParticularLinkStatus } from "./link-actions";

/**
 * Ficha unificada de un particular (migración 0176): el MISMO inmueble puede
 * estar en Idealista y en Fotocasa, en venta en uno y en alquiler en el otro,
 * incluso con otro teléfono y otro nombre (la pareja). Aquí se ve todo junto:
 * cada oferta con su portal, precio y enlace, los contactos distintos, las
 * fotos de los otros portales y los posibles gemelos que el equipo debe
 * confirmar o descartar.
 */

const portalName = (p: string) => p.charAt(0).toUpperCase() + p.slice(1);
const opName = (op: string | null) => (op === "rent" ? "Alquiler" : op === "sale" ? "Venta" : "—");
const priceText = (ad: { price: number | null; operation: string | null }) =>
  ad.price == null ? "Sin precio" : `${groupThousands(Math.round(ad.price))} €${ad.operation === "rent" ? "/mes" : ""}`;

/** Texto del distintivo de operación en el listado: «Venta + Alquiler» si el inmueble tiene las dos. */
export function linkedOpLabel(row: {
  operation: "rent" | "sale" | null;
  link_summary?: LinkSummaryLite | null;
  link_ops?: string[] | null;
}): string {
  const ops = row.link_ops && row.link_ops.length > 1 ? row.link_ops : null;
  if (ops) return ops.map((o) => opName(o)).sort((a, b) => (a === "Venta" ? -1 : b === "Venta" ? 1 : 0)).join(" + ");
  return row.operation === "rent" ? "Alquiler" : "Venta";
}

/** Texto del distintivo de portal en el listado: «Idealista + Fotocasa». */
export function linkedPortalLabel(row: { portal: string; link_summary?: LinkSummaryLite | null }): string {
  const ports = row.link_summary?.portals;
  return ports && ports.length > 1 ? ports.map(portalName).join(" + ") : row.portal;
}

/** Línea bajo el precio en el listado: las OTRAS ofertas del mismo inmueble. */
export function LinkedOffersLine({
  row,
}: {
  row: { id: string; operation: "rent" | "sale" | null; portal: string; link_summary?: LinkSummaryLite | null };
}) {
  const s = row.link_summary;
  if (!s || s.n < 2 || !s.offers?.length) return null;
  const others = s.offers
    .filter((o) => o.active && !(o.op === row.operation && o.portal === row.portal))
    .slice(0, 3);
  if (others.length === 0) return null;
  return (
    <p className="mt-0.5 truncate text-xs text-ink/50" title="Otras ofertas del mismo inmueble">
      También:{" "}
      {others
        .map((o) => `${opName(o.op)} ${o.price == null ? "" : `${groupThousands(Math.round(o.price))} €${o.op === "rent" ? "/mes" : ""} `}(${portalName(o.portal)})`)
        .join(" · ")}
    </p>
  );
}

function describeEvidence(ev: Record<string, unknown>): string[] {
  const out: string[] = [];
  if (ev.manual) out.push("confirmado a mano");
  if (ev.phone) out.push("mismo teléfono");
  if (ev.other_contact) out.push("otro teléfono");
  if (ev.same_first_name) out.push("mismo nombre");
  if (ev.street) out.push("misma calle y número");
  if (typeof ev.coords_m === "number") out.push(`a ${ev.coords_m} m`);
  if (ev.m2_close) out.push("mismos m²");
  if (ev.beds_equal === true) out.push("mismas habitaciones");
  if (ev.baths_equal === true) out.push("mismos baños");
  if (ev.floor_equal === true) out.push("misma planta");
  if (ev.other_operation) out.push("otra operación");
  if (typeof ev.price_diff_pct === "number") out.push(ev.price_diff_pct === 0 ? "mismo precio" : `precio ±${ev.price_diff_pct} %`);
  if (ev.ambiguous) out.push("hay más pisos iguales en el edificio");
  return out;
}

function LevelBadge({ link }: { link: LinkInfo | null }) {
  if (!link) return null;
  const confirmed = link.status === "confirmado";
  const label = confirmed ? "Confirmado" : link.level === "cierto" ? "Seguro" : "Posible";
  const cls = confirmed
    ? "border-emerald-300 bg-emerald-50 text-emerald-700"
    : link.level === "cierto"
      ? "border-gold/40 bg-gold/10 text-gold-dark"
      : "border-amber-300 bg-amber-50 text-amber-700";
  return (
    <span
      title={describeEvidence(link.evidence).join(" · ") || link.rule}
      className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold ${cls}`}
    >
      {label}
    </span>
  );
}

function AdRow({
  ad,
  currentId,
  onDecide,
  busy,
  mode = "suggestion",
}: {
  ad: LinkedAd;
  currentId: string;
  onDecide?: (linkId: string, status: "confirmado" | "descartado") => void;
  busy: boolean;
  /** member: ya está en la ficha (solo se puede corregir) · suggestion: por confirmar. */
  mode?: "member" | "suggestion";
}) {
  const reasons = ad.link ? describeEvidence(ad.link.evidence) : [];
  return (
    <li className="flex items-start gap-3 rounded-lg border border-ink/10 bg-white p-2.5">
      {ad.cover_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={ad.cover_url} alt="" className="h-14 w-14 flex-none rounded-md object-cover" loading="lazy" />
      ) : (
        <div className="flex h-14 w-14 flex-none items-center justify-center rounded-md bg-ink/5 text-xs text-ink/30">sin foto</div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-md bg-gold/90 px-1.5 py-0.5 text-xs font-semibold text-ink">{portalName(ad.portal)}</span>
          <span className="rounded-md bg-ink/85 px-1.5 py-0.5 text-xs font-semibold text-cream-50">{opName(ad.operation)}</span>
          <span className="text-sm font-semibold text-ink">{priceText(ad)}</span>
          {!ad.is_active && <span className="rounded-md bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-600">Retirado</span>}
          {ad.id === currentId && <span className="text-xs text-ink/40">(este anuncio)</span>}
          <LevelBadge link={ad.link} />
        </div>
        <p className="mt-0.5 truncate text-xs text-ink/55">
          {[ad.square_meters ? `${ad.square_meters} m²` : null, ad.bedrooms != null ? `${ad.bedrooms} hab.` : null, ad.bathrooms != null ? `${ad.bathrooms} baños` : null, addressLine(ad.address) || ad.zone]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="mt-0.5 text-xs text-ink/55">
          {ad.owner_name ? <span className="font-medium text-ink/70">{ad.owner_name}</span> : null}
          {ad.owner_name && ad.phone ? " · " : null}
          {ad.phone ?? (ad.owner_name ? "" : "Sin contacto")}
          {ad.n_photos > 0 ? ` · ${ad.n_photos} fotos` : ""}
        </p>
        {reasons.length > 0 && ad.link && ad.link.level !== "cierto" && (
          <p className="mt-1 text-xs text-amber-700">Por qué se propone: {reasons.join(" · ")}</p>
        )}
        {onDecide && ad.link && (
          <div className="mt-1.5 flex gap-2">
            {mode === "suggestion" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => onDecide(ad.link!.id, "confirmado")}
                className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
              >
                Es el mismo inmueble
              </button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() => onDecide(ad.link!.id, "descartado")}
              className="rounded-md border border-ink/15 bg-white px-2 py-1 text-xs text-ink/60 hover:bg-ink/5 disabled:opacity-50"
            >
              {mode === "member" ? "No es el mismo inmueble" : "No lo es"}
            </button>
          </div>
        )}
      </div>
      <a
        href={ad.source_url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex flex-none items-center gap-1 rounded-md border border-ink/15 px-2 py-1 text-xs text-ink/70 hover:border-gold/50 hover:text-ink"
        title={`Abrir en ${portalName(ad.portal)}`}
      >
        Abrir <ExternalLink size={11} />
      </a>
    </li>
  );
}

export function LinkedAdsSection({
  rowId,
  onChanged,
}: {
  rowId: string;
  /** El listado debe recargarse (cambió la agrupación). */
  onChanged?: () => void;
}) {
  const [data, setData] = useState<ParticularLinksPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showContact, setShowContact] = useState(false);
  const country = String(useParams()?.country ?? "es");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/particulares/links?id=${encodeURIComponent(rowId)}`);
      if (!res.ok) return;
      setData((await res.json()) as ParticularLinksPayload);
    } catch {
      /* sin ficha unificada: el modal sigue funcionando como siempre */
    }
  }, [rowId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(linkId: string, status: "confirmado" | "descartado") {
    setBusy(true);
    setError(null);
    const res = await setParticularLinkStatus(linkId, status);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    await load();
    onChanged?.();
  }

  if (!data) return null;
  const { members, suggestions, same_contact, contacts } = data;
  const agencyMatches = data.agency_matches ?? [];
  if (members.length < 2 && suggestions.length === 0 && same_contact.length === 0 && agencyMatches.length === 0) return null;

  const ops = [...new Set(members.map((m) => m.operation))] as Array<"rent" | "sale" | null>;
  const otherPhotos = members.filter((m) => m.id !== rowId && m.photos.length > 0);

  return (
    <div className="rounded-xl border border-gold/30 bg-gold/[0.04] p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link2 size={15} className="text-gold-dark" />
        <p className="crm-label-sm text-ink/60">Mismo inmueble en otros portales y operaciones</p>
        {members.length > 1 && (
          <span className="rounded-md bg-ink/85 px-2 py-0.5 text-xs font-semibold text-cream-50">
            {members.length} anuncios · {[...new Set(members.map((m) => portalName(m.portal)))].join(" + ")}
          </span>
        )}
      </div>

      {members.length > 1 &&
        ops.map((op) => (
          <div key={op ?? "x"} className="mb-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink/45">{opName(op)}</p>
            <ul className="flex flex-col gap-2">
              {members
                .filter((m) => m.operation === op)
                .map((m) => (
                  <AdRow key={m.id} ad={m} currentId={rowId} busy={busy} mode="member" onDecide={m.link && m.id !== data.root_id ? decide : undefined} />
                ))}
            </ul>
          </div>
        ))}

      {contacts.length > 1 && (
        <div className="mb-3 rounded-lg border border-ink/10 bg-white p-2.5">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-ink/60">
            <Users size={13} /> {contacts.length} contactos distintos para este inmueble
          </p>
          <ul className="flex flex-col gap-0.5 text-xs text-ink/65">
            {contacts.map((c, i) => (
              <li key={i}>
                <span className="font-medium text-ink/80">{c.name || "Sin nombre"}</span> · {c.phone ?? "sin teléfono"} · {c.portals.map(portalName).join(", ")}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-ink/40">Suele ser la pareja o un familiar publicando con su propio número.</p>
        </div>
      )}

      {otherPhotos.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink/45">Fotos de otros anuncios</p>
          <div className="flex flex-col gap-2">
            {otherPhotos.map((m) => (
              <div key={m.id}>
                <p className="mb-1 text-xs text-ink/50">
                  {portalName(m.portal)} · {opName(m.operation)} · {m.n_photos} fotos
                </p>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {m.photos.slice(0, 10).map((p, i) => (
                    <a key={i} href={p.url} target="_blank" rel="noopener noreferrer" className="flex-none">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="h-16 w-24 rounded-md object-cover" loading="lazy" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {agencyMatches.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink/45">
            <Building2 size={13} /> Fuente Agencia — propiedades del CRM
          </p>
          <ul className="flex flex-col gap-2">
            {agencyMatches.map((m) => {
              const p = m.property;
              const reasons = describeEvidence(m.evidence);
              const sure = m.status === "confirmado" || m.level === "cierto";
              return (
                <li key={m.id} className="rounded-lg border border-ink/10 bg-white p-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="rounded-md bg-gold/90 px-1.5 py-0.5 text-xs font-semibold text-ink">Agencia</span>
                    {p.agency_name && <span className="text-xs font-medium text-ink/70">{p.agency_name}</span>}
                    {p.reference && <span className="font-mono text-xs text-ink/50">{p.reference}</span>}
                    <span className="rounded-md bg-ink/85 px-1.5 py-0.5 text-xs font-semibold text-cream-50">{opName(p.operation)}</span>
                    <span className="text-sm font-semibold text-ink">{priceText({ price: p.price, operation: p.operation })}</span>
                    <span
                      title={reasons.join(" · ") || m.rule}
                      className={`rounded-md border px-1.5 py-0.5 text-xs font-semibold ${sure ? "border-gold/40 bg-gold/10 text-gold-dark" : "border-amber-300 bg-amber-50 text-amber-700"}`}
                    >
                      {m.status === "confirmado" ? "Confirmado" : m.level === "cierto" ? "Seguro" : "Posible"}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink/55">
                    {[p.square_meters ? `${p.square_meters} m²` : null, p.bedrooms ? `${p.bedrooms} hab.` : null, p.bathrooms ? `${p.bathrooms} baños` : null, addressLine(p.address)]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {!sure && reasons.length > 0 && <p className="mt-1 text-xs text-amber-700">Por qué se propone: {reasons.join(" · ")}</p>}
                  {p.slug && (
                    <a
                      href={`/${country}/admin/propiedades/${p.slug}`}
                      className="mt-1.5 inline-flex items-center gap-1 text-xs font-medium text-ink/70 underline-offset-2 hover:underline"
                    >
                      Abrir propiedad <ExternalLink size={11} />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-amber-700">Posibles gemelos — confirmar</p>
          <ul className="flex flex-col gap-2">
            {suggestions.map((m) => (
              <AdRow key={m.id} ad={m} currentId={rowId} busy={busy} onDecide={decide} />
            ))}
          </ul>
        </div>
      )}

      {same_contact.length > 0 && (
        <div>
          <button type="button" onClick={() => setShowContact((v) => !v)} className="text-xs font-medium text-ink/55 underline-offset-2 hover:underline">
            {showContact ? "Ocultar" : "Ver"} otros {same_contact.length} anuncios del mismo contacto (otros inmuebles)
          </button>
          {showContact && (
            <ul className="mt-2 flex flex-col gap-2">
              {same_contact.map((m) => (
                <AdRow key={m.id} ad={m} currentId={rowId} busy={busy} />
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
