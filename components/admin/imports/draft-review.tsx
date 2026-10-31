"use client";

import { AlertCircle, ArrowDown, ArrowUp, CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { REAL_IMPORT_ACTIONS, type ImportDraftActions } from "./import-actions";
export { draftPhotoSrc } from "./import-actions";
import type { Country } from "@/lib/country-config";
import {
  activationEffects,
  type DraftFields,
  type DraftPhoto,
  EMPTY_FIELDS,
  type FieldEvidence,
  missingForConfirm,
} from "@/lib/imports/draft-model";
import type { DuplicateMatch } from "@/lib/imports/duplicates-core";
import { importErrorMessage } from "@/lib/imports/errors";
import type { AgencyChoice, DraftRow } from "@/lib/imports/drafts";
import { cn } from "@/lib/utils";

// Revisión de un borrador de importación (BCP-01 P6, I-10 a I-16). La usan el
// importador por enlace y el de PDF. Nada se crea hasta «Confirmar»: el
// borrador es privado y no es una ficha. Al confirmar, la ficha se crea UNA
// vez (el servidor bloquea el borrador) y después corren los pasos (fotos,
// catálogo, enlace del cliente), cada uno con su reintento.

type Loaded = { draft: DraftRow; agencies: AgencyChoice[]; catalogTitle: string | null; catalogs: { id: string; title: string }[]; propertySlug: string | null };

const FIELD_LABELS: Partial<Record<keyof DraftFields | "reference", string>> = {
  title: "Título",
  description: "Descripción",
  operation: "Operación",
  stay: "Estancia",
  price: "Precio",
  bedrooms: "Dormitorios",
  bathrooms: "Baños",
  squareMeters: "m²",
  zone: "Zona",
  subzone: "Barrio",
  address: "Dirección (privada)",
  features: "Características",
  floor: "Planta",
};

const input = "w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none disabled:opacity-60";


function EvidenceBadge({ ev, empty }: { ev?: FieldEvidence; empty: boolean }) {
  if (empty && (!ev || ev.status !== "dudoso")) return <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">Falta</span>;
  if (!ev) return null;
  if (ev.status === "dudoso")
    return (
      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900" title={ev.snippet ?? undefined}>
        Dudoso{ev.page ? ` · pág. ${ev.page}` : ""}
      </span>
    );
  if (ev.status === "seguro" && ev.page) return <span className="text-xs text-ink/45" title={ev.snippet ?? undefined}>pág. {ev.page}</span>;
  return null;
}

export function DraftReview({
  country,
  draftId,
  onDiscarded,
  backHref,
  actions = REAL_IMPORT_ACTIONS,
}: {
  country: Country;
  draftId: string;
  onDiscarded?: () => void;
  backHref?: { href: string; label: string } | null;
  actions?: ImportDraftActions;
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [fields, setFields] = useState<DraftFields>(EMPTY_FIELDS);
  const [order, setOrder] = useState<string[]>([]);
  const [agencyId, setAgencyId] = useState("");
  const [notify, setNotify] = useState(false);
  const [catalogId, setCatalogId] = useState<string>("");
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [dups, setDups] = useState<DuplicateMatch[] | null>(null);
  const [updateFields, setUpdateFields] = useState<Record<string, string[]>>({});
  const [steps, setSteps] = useState<DraftRow["steps"]>({});
  const [result, setResult] = useState<{ slug: string; choice: string } | null>(null);
  const confirming = useRef(false);
  // Chile: pesos que vale 1 UF hoy, para enseñar el precio en pesos.
  const [ufInClp, setUfInClp] = useState<number | null>(null);
  useEffect(() => {
    if (country !== "cl") return;
    fetch("/api/exchange-rate?from=UF&to=CLP")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j?.rate > 1000) setUfInClp(j.rate);
      })
      .catch(() => {});
  }, [country]);

  const apply = useCallback((l: Loaded) => {
    const d = l.draft;
    setLoaded(l);
    setFields({ ...EMPTY_FIELDS, ...(d.fields as Partial<DraftFields>) });
    setOrder(d.photos.filter((p) => p.selected).map((p) => p.id));
    setAgencyId(d.agency_id ?? "");
    setNotify(d.notify_clients);
    setCatalogId(d.catalog_id ?? "");
    setSteps(d.steps ?? {});
    setDirty(false);
  }, []);

  const reload = useCallback(async () => {
    const r = await actions.get(country, draftId);
    if (!r.ok) return setError(r.error);
    apply(r);
    return r.draft;
  }, [actions, apply, country, draftId]);

  useEffect(() => {
    void reload().then((d) => {
      if (d && d.state === "review") void actions.duplicates(country, draftId).then((r) => setDups(r.ok ? r.matches : []));
    });
  }, [actions, reload, country, draftId]);

  if (!loaded) {
    return error ? <ErrorBox text={error} /> : <p className="text-sm text-ink/55">Cargando el borrador…</p>;
  }
  const d = loaded.draft;
  // Chile: la moneda es la del anuncio (UF o pesos); España siempre euros.
  const previewCurrency = String((d.extracted?.preview as { currency?: string | null } | undefined)?.currency ?? "").toLowerCase();
  const priceUnit = country === "cl" ? (previewCurrency === "uf" ? "UF" : previewCurrency === "usd" ? "US$" : "$ CLP") : "€";
  const evidence = ((d.extracted?.evidence ?? {}) as Record<string, FieldEvidence>) || {};
  const set = <K extends keyof DraftFields>(k: K, v: DraftFields[K]) => {
    setFields((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };
  const agency = loaded.agencies.find((a) => a.id === agencyId) ?? null;
  const catTitle = loaded.catalogs.find((c) => c.id === catalogId)?.title ?? loaded.catalogTitle;
  const effects = activationEffects({ notifyClients: notify, collaborator: agency?.collaborator ? agency.name : null, catalogTitle: catalogId ? catTitle ?? "el catálogo elegido" : null });
  const inReview = d.state === "review";

  async function save(): Promise<DraftRow | null> {
    setError(null);
    const r = await actions.update({
      country,
      id: d.id,
      expectedVersion: d.version,
      fields,
      photoOrder: order,
      agencyId: agencyId || undefined,
      notifyClients: notify,
      catalogId: catalogId || null,
    });
    if (!r.ok) {
      setError(r.error);
      if (r.code === "draft_changed") await reload();
      return null;
    }
    apply({ ...loaded!, draft: r.draft });
    return r.draft;
  }

  async function runSteps() {
    // Fotos por tandas hasta terminar (o fallar); luego catálogo y cliente.
    for (let i = 0; i < 30; i++) {
      const cur = (await actions.get(country, d.id)) as { ok: boolean; draft?: DraftRow };
      const st = cur.ok ? cur.draft!.steps?.photos?.status : undefined;
      if (cur.ok) setSteps(cur.draft!.steps);
      if (st !== "pending" && st !== "running") break;
      setBusy("Guardando fotos…");
      const r = await actions.photos(country, d.id);
      if (!r.ok || r.status === "ok" || r.status === "failed") break;
    }
    const after = (await actions.get(country, d.id)) as { ok: boolean; draft?: DraftRow };
    if (after.ok && after.draft!.steps?.catalog?.status === "pending") {
      setBusy("Añadiendo al catálogo…");
      await actions.catalog(country, d.id);
    }
    if (after.ok && after.draft!.steps?.client_link?.status === "pending") {
      setBusy("Vinculando con el cliente…");
      await actions.clientLink(country, d.id);
    }
    setBusy(null);
    await reload();
  }

  async function confirm(choice: Parameters<ImportDraftActions["confirm"]>[0]["choice"]) {
    if (confirming.current) return; // doble clic: una sola petición desde aquí (y el servidor lo garantiza igual)
    confirming.current = true;
    setError(null);
    setMissing([]);
    setBusy("Creando la ficha…");
    try {
      const saved = dirty ? await save() : d;
      if (!saved) return;
      const r = await actions.confirm({ country, id: d.id, expectedVersion: saved.version, choice });
      if (!r.ok) {
        setError(r.error);
        if (r.missing) setMissing(r.missing);
        if (r.code === "draft_changed") await reload();
        return;
      }
      setResult({ slug: r.slug, choice: r.choice });
      await runSteps();
    } finally {
      setBusy(null);
      confirming.current = false;
    }
  }

  async function retry(step: "photos" | "catalog" | "client_link") {
    setBusy("Reintentando…");
    if (step === "photos") {
      await actions.photos(country, d.id, true);
      await runSteps();
    } else if (step === "catalog") await actions.catalog(country, d.id);
    else await actions.clientLink(country, d.id);
    setBusy(null);
    await reload();
  }

  const photosById = new Map(d.photos.map((p) => [p.id, p]));
  const togglePhoto = (id: string) => {
    setOrder((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id]));
    setDirty(true);
  };
  const movePhoto = (id: string, delta: -1 | 1) => {
    setOrder((o) => {
      const i = o.indexOf(id);
      const j = i + delta;
      if (i < 0 || j < 0 || j >= o.length) return o;
      const n = [...o];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
    setDirty(true);
  };
  const sortedPhotos: DraftPhoto[] = [...order.map((id) => photosById.get(id)!).filter(Boolean), ...d.photos.filter((p) => !order.includes(p.id))];
  const blocksNew = (dups ?? []).some((m) => m.blocksNew);
  const textField = (k: keyof DraftFields, label: string, opts: { type?: string; area?: boolean; placeholder?: string } = {}) => {
    const v = fields[k];
    const empty = v === null || v === "" || (Array.isArray(v) && v.length === 0);
    const required = ["title", "price", "zone"].includes(k);
    return (
      <label className="block space-y-1">
        <span className="flex items-center gap-2 text-xs font-medium text-ink/70">
          {label}
          <EvidenceBadge ev={evidence[k]} empty={empty && (required || Boolean(evidence[k]))} />
        </span>
        {opts.area ? (
          <textarea value={String(v ?? "")} onChange={(e) => set(k, e.target.value as never)} disabled={!inReview} rows={6} className={input} data-field={k} />
        ) : (
          <input
            type={opts.type ?? "text"}
            inputMode={opts.type === "number" ? "numeric" : undefined}
            value={v === null ? "" : String(v)}
            placeholder={opts.placeholder}
            onChange={(e) => set(k, (opts.type === "number" ? (e.target.value === "" ? null : Number(e.target.value.replace(/[^\d]/g, ""))) : e.target.value) as never)}
            disabled={!inReview}
            className={input}
            data-field={k}
          />
        )}
        {evidence[k]?.snippet && evidence[k]?.status !== "seguro" ? <span className="block text-xs text-ink/50">«{evidence[k]!.snippet}»</span> : null}
      </label>
    );
  };

  return (
    <div className="space-y-5" data-testid="draft-review" data-state={d.state}>
      <div className="rounded-xl border border-gold/20 bg-gold/5 px-4 py-3 text-xs text-ink/70">
        <strong>Borrador privado</strong> · solo lo ves tú. No es una ficha: no sale en Propiedades, catálogos, alertas ni en la web hasta que lo confirmes.
        {d.source_kind === "link" && d.source_url ? (
          <>
            {" "}
            Origen:{" "}
            <a href={d.source_url} target="_blank" rel="noreferrer noopener" className="underline">
              {new URL(d.source_url).hostname}
            </a>
          </>
        ) : null}
        {d.source_kind === "pdf" ? ` Origen: ${d.source_name ?? "PDF"}${d.source_part ? ` · vivienda ${d.source_part}` : ""}.` : null}
      </div>

      {error ? <ErrorBox text={error} extra={missing.length ? `Falta: ${missing.join(", ")}.` : undefined} /> : null}

      <fieldset disabled={!inReview} className="grid gap-4 md:grid-cols-2">
        <div className="md:col-span-2">{textField("title", FIELD_LABELS.title!)}</div>
        <label className="block space-y-1">
          <span className="flex items-center gap-2 text-xs font-medium text-ink/70">
            Operación <EvidenceBadge ev={evidence.operation} empty={!fields.operation} />
          </span>
          <select value={fields.operation} onChange={(e) => set("operation", e.target.value as DraftFields["operation"])} className={input} data-field="operation">
            <option value="">Elige…</option>
            <option value="sale">Venta</option>
            <option value="rent">Alquiler</option>
          </select>
          {evidence.price?.alternatives?.length ? <span className="block text-xs text-amber-800">Otro precio en el documento: {evidence.price.alternatives.join(" · ")} (elige uno: no se crean fichas de venta y alquiler a la vez).</span> : null}
        </label>
        {fields.operation === "rent" ? (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-ink/70">Estancia</span>
            <select value={fields.stay} onChange={(e) => set("stay", e.target.value as DraftFields["stay"])} className={input}>
              <option value="">Sin dato</option>
              <option value="long">Larga</option>
              <option value="short">Corta</option>
            </select>
          </label>
        ) : (
          <div />
        )}
        {textField("price", `Precio (${priceUnit})${fields.operation === "rent" ? "/mes" : ""}${priceUnit === "UF" && ufInClp && fields.price ? ` ≈ $${Math.round(fields.price * ufInClp).toLocaleString("es-CL")} CLP` : ""}`, { type: "number" })}
        {textField("squareMeters", FIELD_LABELS.squareMeters!, { type: "number" })}
        {textField("bedrooms", FIELD_LABELS.bedrooms!, { type: "number" })}
        {textField("bathrooms", FIELD_LABELS.bathrooms!, { type: "number" })}
        {textField("zone", FIELD_LABELS.zone!, { placeholder: country === "cl" ? "Las Condes, Providencia…" : "Salamanca, Chamberí…" })}
        {textField("subzone", FIELD_LABELS.subzone!, { placeholder: "Recoletos, Almagro…" })}
        {textField("floor", FIELD_LABELS.floor!, { placeholder: "3, bajo, ático…" })}
        {textField("address", FIELD_LABELS.address!, { placeholder: "No se enseña al cliente" })}
        <label className="block space-y-1 md:col-span-2">
          <span className="text-xs font-medium text-ink/70">Características (separadas por comas)</span>
          <input
            value={fields.features.join(", ")}
            onChange={(e) => set("features", e.target.value.split(",").map((x) => x.trim()).filter(Boolean))}
            className={input}
            data-field="features"
          />
        </label>
        <div className="md:col-span-2">{textField("description", FIELD_LABELS.description!, { area: true })}</div>
      </fieldset>

      <section aria-label="Fotos" className="space-y-2">
        <h3 className="text-sm font-semibold text-ink/80">
          Fotos · {order.length} elegida{order.length === 1 ? "" : "s"} de {d.photos.length}
          <span className="ml-2 text-xs font-normal text-ink/50">La primera es la portada.</span>
        </h3>
        {d.photos.length === 0 ? <p className="text-xs text-ink/50">Sin fotos.</p> : null}
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6" data-testid="draft-photos">
          {sortedPhotos.map((p) => {
            const pos = order.indexOf(p.id);
            return (
              <li key={p.id} className={cn("relative overflow-hidden rounded-lg border", pos >= 0 ? "border-gold" : "border-ink/10 opacity-50")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={actions.photoSrc(d.id, country, p)} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                <div className="flex items-center justify-between gap-1 bg-white/90 px-1 py-0.5 text-xs">
                  <label className="inline-flex items-center gap-1">
                    <input type="checkbox" checked={pos >= 0} onChange={() => togglePhoto(p.id)} disabled={!inReview} />
                    {pos === 0 ? "Portada" : pos > 0 ? `${pos + 1}` : "Fuera"}
                  </label>
                  {pos >= 0 && inReview ? (
                    <span className="flex">
                      <button type="button" onClick={() => movePhoto(p.id, -1)} aria-label="Antes" className="p-0.5">
                        <ArrowUp size={12} />
                      </button>
                      <button type="button" onClick={() => movePhoto(p.id, 1)} aria-label="Después" className="p-0.5">
                        <ArrowDown size={12} />
                      </button>
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-ink/70">Agencia</span>
          <select value={agencyId} onChange={(e) => (setAgencyId(e.target.value), setDirty(true))} disabled={!inReview} className={input} data-field="agency">
            {loaded.agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.collaborator ? " (colaboradora)" : ""}
              </option>
            ))}
          </select>
        </label>
        {loaded.catalogs.length ? (
          <label className="block space-y-1">
            <span className="text-xs font-medium text-ink/70">Añadir a un catálogo (opcional)</span>
            <select value={catalogId} onChange={(e) => (setCatalogId(e.target.value), setDirty(true))} disabled={!inReview} className={input} data-field="catalog">
              <option value="">No añadir</option>
              {loaded.catalogs.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="inline-flex items-start gap-2 text-sm text-ink/80 md:col-span-2">
          <input type="checkbox" checked={notify} onChange={(e) => (setNotify(e.target.checked), setDirty(true))} disabled={!inReview} className="mt-1" data-field="notify" />
          <span>
            Avisar por correo a los clientes con alertas de propiedades nuevas
            <span className="block text-xs text-ink/50">Desmarcado por defecto: la ficha no entra en el correo de alertas.</span>
          </span>
        </label>
      </section>

      <section className="rounded-xl border border-ink/10 bg-white/70 p-4" data-testid="activation-effects">
        <h3 className="mb-2 text-sm font-semibold text-ink/80">Qué pasa al confirmar</h3>
        <ul className="list-disc space-y-1 pl-5 text-xs text-ink/70">
          {effects.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      </section>

      {inReview && dups && dups.length ? (
        <section className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/70 p-4" data-testid="duplicates">
          <h3 className="text-sm font-semibold text-amber-900">Posibles duplicados ({dups.length})</h3>
          <p className="text-xs text-amber-900/80">Nada se sobrescribe sin que lo elijas.</p>
          <ul className="space-y-2">
            {dups.map((m) => (
              <li key={m.propertyId} className="rounded-lg bg-white/80 p-3 text-xs" data-testid="duplicate">
                <p className="text-sm text-ink">
                  <span className={cn("mr-2 rounded-full px-2 py-0.5 text-xs font-semibold", m.level === "clave" || m.level === "cierto" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900")}>
                    {m.level === "clave" ? "Mismo anuncio" : m.level === "cierto" ? "Casi seguro" : m.level === "probable" ? "Probable" : "Posible"}
                  </span>
                  {m.bcReference ? <span className="mr-1 text-ink/50">{m.bcReference}</span> : null}
                  <Link href={`/${country}/admin/propiedades/${m.slug}`} target="_blank" className="underline">
                    {m.title}
                  </Link>
                  {m.archived || m.status !== "available" ? <span className="ml-2 text-ink/50">({m.archived ? "archivada" : m.status})</span> : null}
                </p>
                <p className="mt-1 text-ink/60">{m.reasons.join(" · ")}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={!!busy} onClick={() => void confirm({ kind: "existing", propertyId: m.propertyId })} className="rounded-md border border-ink/20 bg-white px-3 py-1" data-testid="use-existing">
                    Usar la existente
                  </button>
                  {m.canUpdate ? (
                    <details className="rounded-md border border-ink/15 bg-white px-2 py-1">
                      <summary className="cursor-pointer">Actualizar la existente…</summary>
                      <p className="mt-1 text-ink/60">Elige qué campos se copian del borrador. No se tocan las fotos, el estado, la publicación ni la fecha.</p>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {(["title", "description", "price", "bedrooms", "bathrooms", "square_meters", "zone", "subzone", "address", "features", "stay"] as const).map((k) => (
                          <label key={k} className="inline-flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={(updateFields[m.propertyId] ?? []).includes(k)}
                              onChange={(e) =>
                                setUpdateFields((u) => ({ ...u, [m.propertyId]: e.target.checked ? [...(u[m.propertyId] ?? []), k] : (u[m.propertyId] ?? []).filter((x) => x !== k) }))
                              }
                            />
                            {FIELD_LABELS[k === "square_meters" ? "squareMeters" : (k as keyof DraftFields)] ?? k}
                          </label>
                        ))}
                      </div>
                      <button
                        type="button"
                        disabled={!!busy || !(updateFields[m.propertyId] ?? []).length}
                        onClick={() => void confirm({ kind: "update", propertyId: m.propertyId, expectedUpdatedAt: m.updatedAt, fields: updateFields[m.propertyId] ?? [] })}
                        className="mt-2 rounded-md bg-ink px-3 py-1 text-cream-50 disabled:opacity-50"
                      >
                        Actualizar esos campos
                      </button>
                    </details>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {inReview ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-gold/15 pt-4">
          <button type="button" onClick={() => void save()} disabled={!!busy || !dirty} className="rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-sm text-ink/80 disabled:opacity-50" data-testid="draft-save">
            Guardar borrador
          </button>
          <button
            type="button"
            onClick={() => void confirm({ kind: "new" })}
            disabled={!!busy || blocksNew}
            title={blocksNew ? "Ya hay una ficha con la misma agencia y referencia: usa o actualiza la existente." : undefined}
            className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-cream-50 disabled:opacity-50"
            data-testid="draft-confirm"
          >
            {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
            {dups && dups.length && !blocksNew ? "Crear otra ficha igualmente" : "Confirmar y crear la ficha"}
          </button>
          {missingForConfirm(fields).length ? <span className="text-xs text-red-700">Falta: {missingForConfirm(fields).join(", ")}</span> : null}
          <button
            type="button"
            onClick={async () => {
              if (!window.confirm("¿Descartar este borrador? Se borran sus fotos subidas.")) return;
              const r = await actions.discard(country, d.id);
              if (r.ok) onDiscarded?.();
              else setError(r.error);
            }}
            disabled={!!busy}
            className="ml-auto text-sm text-ink/55 underline"
          >
            Descartar
          </button>
          {busy ? <span className="text-xs text-ink/55">{busy}</span> : null}
        </div>
      ) : (
        <StepsPanel country={country} draft={d} steps={steps} busy={busy} onRetry={retry} result={result ?? (loaded.propertySlug ? { slug: loaded.propertySlug, choice: d.duplicate_choice ?? "new" } : null)} catalogTitle={catTitle} backHref={backHref} />
      )}
    </div>
  );
}

function ErrorBox({ text, extra }: { text: string; extra?: string }) {
  return (
    <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="draft-error">
      <AlertCircle size={16} className="mt-0.5 shrink-0" />
      <div>
        {text}
        {extra ? <div className="mt-1 text-xs">{extra}</div> : null}
      </div>
    </div>
  );
}

const STEP_LABEL: Record<string, string> = { photos: "Fotos", catalog: "Catálogo", client_link: "Ficha del cliente" };
const STATUS_LABEL: Record<string, string> = { pending: "Pendiente", running: "En curso", ok: "Hecho", failed: "Falló", skipped: "No aplica" };

function StepsPanel({
  country,
  draft,
  steps,
  busy,
  onRetry,
  result,
  catalogTitle,
  backHref,
}: {
  country: Country;
  draft: DraftRow;
  steps: DraftRow["steps"];
  busy: string | null;
  onRetry: (s: "photos" | "catalog" | "client_link") => void;
  result: { slug: string; choice: string } | null;
  catalogTitle: string | null;
  backHref?: { href: string; label: string } | null;
}) {
  const [slug, setSlug] = useState(result?.slug ?? null);
  useEffect(() => {
    if (result?.slug) setSlug(result.slug);
  }, [result]);
  const done = draft.state === "done";
  return (
    <section className={cn("space-y-3 rounded-xl border p-4", done ? "border-emerald-200 bg-emerald-50/60" : "border-gold/25 bg-white/70")} data-testid="draft-steps">
      <h3 className="text-sm font-semibold text-ink/85">
        {draft.duplicate_choice === "existing" ? "Se usa la ficha existente" : draft.duplicate_choice === "update" ? "Ficha existente actualizada" : "Ficha creada"}
        {done ? " · todo hecho" : ""}
      </h3>
      <ul className="space-y-1 text-sm">
        {(["photos", "catalog", "client_link"] as const).map((k) => {
          const st = steps?.[k];
          if (!st || st.status === "skipped") return null;
          return (
            <li key={k} className="flex flex-wrap items-center gap-2" data-testid={`step-${k}`} data-status={st.status}>
              <span className="w-32 text-ink/70">{STEP_LABEL[k]}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs", st.status === "ok" ? "bg-emerald-100 text-emerald-800" : st.status === "failed" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900")}>
                {STATUS_LABEL[st.status] ?? st.status}
                {k === "photos" && typeof st.total === "number" ? ` · ${st.done ?? 0}/${st.total}` : ""}
              </span>
              {st.error ? <span className="text-xs text-red-700">{/^[a-z_]+$/.test(String(st.error)) ? importErrorMessage(String(st.error)) : String(st.error)}</span> : null}
              {k === "catalog" && catalogTitle ? <span className="text-xs text-ink/55">«{catalogTitle}»</span> : null}
              {st.status === "failed" ? (
                <button type="button" onClick={() => onRetry(k)} disabled={!!busy} className="rounded-md border border-ink/20 bg-white px-2 py-0.5 text-xs" data-testid={`retry-${k}`}>
                  Reintentar
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      {busy ? <p className="text-xs text-ink/55">{busy}</p> : null}
      {slug ? (
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href={`/${country}/admin/propiedades/${slug}`} className="rounded-lg bg-ink px-3 py-1.5 text-cream-50" data-testid="open-property">
            Abrir la ficha
          </Link>
          <a href={`/compartir/${slug}`} target="_blank" rel="noreferrer" className="rounded-lg border border-ink/15 bg-white px-3 py-1.5">
            Ver como cliente (/compartir)
          </a>
          <Link href={`/${country}/admin/propiedades/${slug}#smartlinks`} className="rounded-lg border border-ink/15 bg-white px-3 py-1.5">
            Generar enlace con seguimiento
          </Link>
          {backHref ? (
            <Link href={backHref.href} className="rounded-lg border border-ink/15 bg-white px-3 py-1.5" data-testid="back-link">
              {backHref.label}
            </Link>
          ) : null}
          {draft.catalog_id ? (
            <Link href={`/${country}/admin/mi-espacio/catalogos/${draft.catalog_id}`} className="rounded-lg border border-ink/15 bg-white px-3 py-1.5">
              Volver al catálogo
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
