"use client";

import { ArrowRight, ClipboardPaste, FileText, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DraftReview } from "@/components/admin/imports/draft-review";
import { REAL_IMPORT_ACTIONS, type ImportDraftActions } from "@/components/admin/imports/import-actions";
import { getCountryConfig, type Country } from "@/lib/country-config";
import type { DraftRow } from "@/lib/imports/drafts";

// Importar por enlace con borrador (BCP-01 P6). El servidor descarga y lee el
// anuncio y guarda un BORRADOR privado; nada se crea hasta confirmar en la
// revisión. Se llega desde Propiedades («Importar por link»), desde el
// catálogo (?catalogo=<id>, solo el dueño de la HOME; el servidor lo
// comprueba) y desde los enlaces de portales de un cliente (?url, linkId,
// clienteId). ?borrador=<id> retoma un borrador.

const newKey = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");

const STATE_LABEL: Record<DraftRow["state"], string> = { review: "En revisión", created: "Ficha creada · pasos pendientes", done: "Hecho", discarded: "Descartado" };

export function ImportClient({ country, canCreate, actions = REAL_IMPORT_ACTIONS }: { country: Country; canCreate: boolean; actions?: ImportDraftActions }) {
  const router = useRouter();
  const sp = useSearchParams();
  const config = getCountryConfig(country);
  const prefilledUrl = sp.get("url") ?? "";
  const portalLinkId = sp.get("linkId");
  const clienteId = sp.get("clienteId");
  const catalogo = sp.get("catalogo");
  const borrador = sp.get("borrador");
  const [url, setUrl] = useState(prefilledUrl);
  const [error, setError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [html, setHtml] = useState("");
  const [creating, setCreating] = useState(false);
  const [drafts, setDrafts] = useState<DraftRow[] | null>(null);
  const keyFor = useRef(new Map<string, string>());

  const openDraft = useCallback(
    (id: string | null) => {
      const q = new URLSearchParams(sp.toString());
      if (id) q.set("borrador", id);
      else q.delete("borrador");
      router.replace(`?${q.toString()}`);
    },
    [router, sp],
  );

  useEffect(() => {
    if (borrador) return;
    void actions.list(country).then((r) => setDrafts(r.ok ? r.drafts : []));
  }, [actions, borrador, country]);

  const create = useCallback(
    async (target: string, pasted?: string) => {
      if (!target.trim()) return;
      setError(null);
      setCreating(true);
      // La misma clave para el mismo enlace: un doble clic o un reintento dan el MISMO borrador.
      const k = `${target.trim()}|${pasted ? pasted.length : ""}`;
      if (!keyFor.current.has(k)) keyFor.current.set(k, newKey());
      const r = await actions.createLink({ country, url: target.trim(), html: pasted, requestKey: keyFor.current.get(k)!, catalogId: catalogo, portalLinkId });
      setCreating(false);
      if (!r.ok) {
        setError(r.error);
        if (pasted !== undefined || r.code === "blocked" || r.code === "fetch_failed") setShowPaste(true);
        return;
      }
      setShowPaste(false);
      setHtml("");
      openDraft(r.draft.id);
    },
    [actions, catalogo, country, openDraft, portalLinkId],
  );

  // Con el enlace ya en la URL (desde la ficha del cliente) se lee solo.
  const auto = useRef(false);
  useEffect(() => {
    if (!prefilledUrl || borrador || auto.current || !canCreate) return;
    auto.current = true;
    void create(prefilledUrl);
  }, [prefilledUrl, borrador, canCreate, create]);

  if (!canCreate) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">No tienes permiso para crear propiedades. Pide a un administrador que te dé acceso desde Usuarios.</p>;
  }

  const backHref = clienteId
    ? { href: `${config.prefix}/clientes/${clienteId}?tab=properties#portal-links`, label: "Volver a la ficha del cliente" }
    : { href: `${config.prefix}/propiedades`, label: "Ir a Propiedades" };

  if (borrador) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => openDraft(null)} className="text-sm text-ink/60 underline">
          ← Otro enlace o mis borradores
        </button>
        <DraftReview key={borrador} actions={actions} country={country} draftId={borrador} onDiscarded={() => openDraft(null)} backHref={backHref} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {catalogo ? <p className="rounded-lg bg-gold/10 px-3 py-2 text-xs text-ink/70">Al confirmar podrás añadir la ficha a tu catálogo (si es tuyo y es una selección fija).</p> : null}
      <div className="space-y-2">
        <label htmlFor="import-url" className="text-sm font-medium text-ink/80">
          URL de la propiedad
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="import-url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.idealista.com/inmueble/..."
            className="flex-1 rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-sm placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
            disabled={creating}
          />
          <button
            type="button"
            onClick={() => void create(url)}
            disabled={!url.trim() || creating}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-cream-50 transition disabled:opacity-50"
            data-testid="import-extract"
          >
            {creating ? <Loader2 size={15} className="animate-spin" /> : <ArrowRight size={15} />}
            Extraer datos
          </button>
        </div>
        <p className="text-xs text-ink/45">Se crea un borrador privado: revisas los datos, eliges agencia y fotos, y solo entonces se crea la ficha.</p>
      </div>
      {error ? (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" data-testid="import-error">
          {error}
        </p>
      ) : null}
      {showPaste ? (
        <div className="space-y-2 rounded-xl border border-gold/25 bg-white/70 p-4">
          <p className="flex items-center gap-2 text-sm font-medium text-ink/80">
            <ClipboardPaste size={15} /> Pega el código de la página
          </p>
          <p className="text-xs text-ink/55">Abre el anuncio en tu navegador, pulsa Ctrl+U (Cmd+Opción+U en Mac), luego Ctrl+A y Ctrl+C, y pégalo aquí.</p>
          <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={5} className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 font-mono text-xs" data-testid="import-html" />
          <button type="button" onClick={() => void create(url, html)} disabled={!html.trim() || creating} className="rounded-lg bg-ink px-3 py-2 text-sm text-cream-50 disabled:opacity-50" data-testid="import-html-submit">
            Leer el código pegado
          </button>
        </div>
      ) : null}
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink/80">
          <FileText size={15} /> Tus borradores
        </h3>
        {drafts === null ? <p className="text-xs text-ink/50">Cargando…</p> : null}
        {drafts && drafts.length === 0 ? <p className="text-xs text-ink/50">No tienes borradores. Caducan a los 30 días si no se confirman.</p> : null}
        {drafts && drafts.length ? (
          <ul className="divide-y divide-gold/10 rounded-xl border border-gold/15 bg-white/70" data-testid="draft-list">
            {drafts.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{(d.fields as { title?: string }).title || d.source_url || d.source_name || "Sin título"}</span>
                <span className="text-xs text-ink/55">
                  {d.source_kind === "pdf" ? "PDF" : "Enlace"} · {STATE_LABEL[d.state]}
                </span>
                <button type="button" onClick={() => openDraft(d.id)} className="rounded-md border border-ink/15 bg-white px-2 py-1 text-xs">
                  Abrir
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}
