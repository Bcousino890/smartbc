"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, ArrowLeft } from "lucide-react";
import { CatalogCover } from "@/components/catalogs/catalog-cover";
import type { ActionResult } from "@/lib/catalogs/access";
import type { CatalogDetail, CatalogItemView } from "@/lib/catalogs/types";

// Gestión de un catálogo (BCP-01 T4). Interfaz del admin en Lato. Las acciones
// llegan inyectadas: en la página real son las acciones de servidor (con la
// guarda del dueño y las funciones SQL de 0192); en la prueba local, falsas.

type Res = ActionResult<{ version: number }>;

export interface CatalogManagerActions {
  updateMeta: (i: { catalogId: string; title: string; intro?: string | null }) => Promise<Res>;
  addProperty: (i: { catalogId: string; reference: string }) => Promise<Res>;
  removeProperty: (i: { catalogId: string; propertyId: string }) => Promise<Res>;
  reorder: (i: { catalogId: string; propertyIds: string[] }) => Promise<Res>;
  setStatus: (i: { catalogId: string; status: "active" | "archived" }) => Promise<Res>;
}

const STATUS_LABEL: Record<CatalogItemView["status"], string | null> = {
  available: null,
  reserved: "Reservada",
  sold: "Vendida",
  archived: "Archivada",
};

function facts(it: CatalogItemView): string {
  const parts = [
    it.squareMeters ? `${it.squareMeters} m²` : "m² · sin dato",
    it.bedrooms !== null ? `${it.bedrooms} dorm.` : "dorm. · sin dato",
    it.bathrooms !== null ? `${it.bathrooms} baño${it.bathrooms === 1 ? "" : "s"}` : "baños · sin dato",
  ];
  return parts.join(" · ");
}

export function CatalogManager({
  catalog,
  actions,
  preparedBy,
  basePath,
  numberLabel,
  onLocalAdd,
}: {
  catalog: CatalogDetail;
  actions: CatalogManagerActions;
  preparedBy: string;
  basePath: string;
  numberLabel?: string | null;
  /** Solo en la prueba local: devuelve el elemento sintético que se añadió. */
  onLocalAdd?: (reference: string) => CatalogItemView | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState(catalog.items);
  const [status, setStatus] = useState(catalog.status);
  const [title, setTitle] = useState(catalog.title);
  const [intro, setIntro] = useState(catalog.intro ?? "");
  const [reference, setReference] = useState("");
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => setItems(catalog.items), [catalog.items]);
  useEffect(() => setStatus(catalog.status), [catalog.status]);

  function run(fn: () => Promise<Res>, ok: string, onOk?: () => void, onFail?: () => void) {
    setMessage(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        onFail?.();
        setMessage({ kind: "error", text: res.error });
        return;
      }
      onOk?.();
      setMessage({ kind: "ok", text: ok });
      if (!onLocalAdd) router.refresh();
    });
  }

  function move(index: number, delta: -1 | 1) {
    const j = index + delta;
    if (j < 0 || j >= items.length) return;
    const before = items;
    const next = [...items];
    [next[index], next[j]] = [next[j], next[index]];
    setItems(next);
    run(
      () => actions.reorder({ catalogId: catalog.id, propertyIds: next.map((i) => i.propertyId) }),
      "Orden guardado.",
      undefined,
      () => setItems(before),
    );
  }

  function remove(it: CatalogItemView) {
    if (!onLocalAdd && !window.confirm(`¿Quitar «${it.title}» de este catálogo? La propiedad no se borra del CRM.`)) return;
    const before = items;
    setItems(items.filter((x) => x.propertyId !== it.propertyId));
    run(
      () => actions.removeProperty({ catalogId: catalog.id, propertyId: it.propertyId }),
      "Propiedad quitada del catálogo.",
      undefined,
      () => setItems(before),
    );
  }

  function add(e: React.FormEvent) {
    e.preventDefault();
    const ref = reference;
    run(
      () => actions.addProperty({ catalogId: catalog.id, reference: ref }),
      "Propiedad añadida.",
      () => {
        setReference("");
        const local = onLocalAdd?.(ref);
        if (local) setItems((xs) => [...xs, local]);
      },
    );
  }

  function saveMeta(e: React.FormEvent) {
    e.preventDefault();
    run(() => actions.updateMeta({ catalogId: catalog.id, title, intro }), "Datos guardados.");
  }

  function toggleStatus() {
    const next = status === "active" ? "archived" : "active";
    run(() => actions.setStatus({ catalogId: catalog.id, status: next }), next === "archived" ? "Catálogo archivado." : "Catálogo reactivado.", () => setStatus(next));
  }

  const archived = status === "archived";

  return (
    <div className="mt-6 space-y-6 pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={basePath} className="inline-flex items-center gap-1 text-sm text-ink/60 hover:text-ink">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Mi espacio
        </Link>
        <div className="flex items-center gap-3">
          <span className={`rounded-full px-3 py-1 text-xs ${archived ? "bg-ink/10 text-ink/60" : "bg-gold/15 text-ink/80"}`}>
            {archived ? "Archivado" : "Activo"}
          </span>
          <button
            type="button"
            onClick={toggleStatus}
            disabled={pending}
            className="rounded-lg border border-gold/40 px-3 py-1.5 text-sm text-ink/80 transition hover:bg-white/70 disabled:opacity-60"
          >
            {archived ? "Reactivar" : "Archivar"}
          </button>
        </div>
      </div>

      {message ? (
        <p
          role={message.kind === "error" ? "alert" : "status"}
          className={`rounded-lg px-3 py-2 text-sm ${message.kind === "error" ? "bg-red-50 text-red-800" : "bg-emerald-50 text-emerald-800"}`}
        >
          {message.text}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="min-w-0 space-y-4 lg:col-span-2" aria-labelledby="cm-props">
          <div className="flex items-end justify-between gap-3">
            <h2 id="cm-props" className="crm-section-title text-ink">
              Propiedades
            </h2>
            <span className="text-sm text-ink/55">
              {items.length} en el catálogo
            </span>
          </div>

          <form onSubmit={add} className="flex flex-col gap-2 rounded-xl border border-gold/20 bg-white/60 p-3 sm:flex-row sm:items-center">
            <label className="sr-only" htmlFor="cm-ref">
              Referencia BC, slug o URL de la ficha
            </label>
            <input
              id="cm-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              disabled={archived}
              placeholder="BC-1234, slug o URL de la ficha"
              className="min-w-0 flex-1 rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={pending || archived || !reference.trim()}
              className="rounded-lg bg-gold/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gold disabled:opacity-50"
            >
              Añadir
            </button>
          </form>
          <p className="text-xs text-ink/50">
            Solo propiedades que ya están en el CRM. Importar desde portales o PDF llega en la fase 3.
          </p>

          {items.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-10 text-center text-sm text-ink/55">
              Este catálogo todavía no tiene propiedades.
            </div>
          ) : (
            <ol className="space-y-2">
              {items.map((it, i) => {
                const badge = STATUS_LABEL[it.status];
                return (
                  <li
                    key={it.propertyId}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-gold/15 bg-white/60 p-2 pr-3 sm:flex-nowrap"
                    data-check-overflow="fila"
                  >
                    <span className="w-6 shrink-0 text-center text-xs text-ink/45">{i + 1}</span>
                    <div className="h-12 w-16 shrink-0 overflow-hidden rounded-md bg-cream-200 sm:h-14 sm:w-20">
                      {it.photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.photoUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-xs text-ink/45">Sin foto</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="crm-body-strong line-clamp-2 text-ink">
                        {it.bcReference ? <span className="mr-2 text-xs text-ink/45">{it.bcReference}</span> : null}
                        {it.title}
                      </p>
                      <p className="text-xs text-ink/55">
                        {[it.zone ?? "Zona · sin dato", it.operation].join(" · ")}
                      </p>
                      <p className="text-xs text-ink/55">
                        <span className="text-ink/80">{it.price}</span> · {facts(it)}
                      </p>
                    </div>
                    {badge ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{badge}</span>
                    ) : null}
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => move(i, -1)}
                        disabled={pending || i === 0}
                        aria-label={`Subir «${it.title}»`}
                        className="rounded-md p-1.5 text-ink/60 hover:bg-white disabled:opacity-30"
                      >
                        <ArrowUp className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, 1)}
                        disabled={pending || i === items.length - 1}
                        aria-label={`Bajar «${it.title}»`}
                        className="rounded-md p-1.5 text-ink/60 hover:bg-white disabled:opacity-30"
                      >
                        <ArrowDown className="h-4 w-4" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(it)}
                        disabled={pending}
                        className="ml-1 rounded-md px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-40"
                      >
                        Quitar
                      </button>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <aside className="min-w-0 space-y-4">
          <div className="mx-auto aspect-[150/212] w-full max-w-[240px] overflow-hidden rounded-sm shadow-[0_10px_24px_-14px_rgba(60,40,20,0.45)]" data-check-overflow="portada">
            <CatalogCover
              data={{
                title: title || catalog.title,
                subtitle: intro || null,
                numberLabel,
                edition: catalog.edition,
                photoUrl: items[0]?.photoUrl ?? null,
                preparedBy,
              }}
            />
          </div>
          <form onSubmit={saveMeta} className="space-y-3 rounded-xl border border-gold/20 bg-white/60 p-4">
            <label className="block">
              <span className="crm-label-sm text-ink/70">Título</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                required
                className="mt-1 w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
              />
            </label>
            <label className="block">
              <span className="crm-label-sm text-ink/70">Introducción</span>
              <textarea
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                maxLength={2000}
                rows={4}
                className="mt-1 w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
              />
            </label>
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-gold/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gold disabled:opacity-60"
            >
              Guardar
            </button>
          </form>
          <p className="rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-3 text-xs text-ink/55">
            El enlace para compartir, el lector y la descarga en PDF llegan en las fases siguientes. Por ahora el
            catálogo no es visible para nadie más.
          </p>
        </aside>
      </div>
    </div>
  );
}
