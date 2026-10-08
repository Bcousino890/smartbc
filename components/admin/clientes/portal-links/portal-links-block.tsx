"use client";

// ============================================================================
// Panel "Enlaces de portales" de la ficha del cliente.
//
// Es el paso que faltaba ANTES de la selección: el piso que se ve con el
// cliente en Idealista todavía no es una ficha nuestra. Aquí se recopila, se
// reparte, se llama y —cuando la cosa avanza— se convierte en ficha, entra en
// la selección y de ahí al itinerario y a la colección privada.
//
// El lenguaje visual es el de la colección privada (/v/[token]): versalitas
// Cinzel, cifras Playfair, filetes de oro y el estado dicho con palabras. La
// diferencia es la densidad — esto se usa con el teléfono en la mano.
// ============================================================================

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownWideNarrow,
  BookOpen,
  Building2,
  Link2,
  Loader2,
  Plus,
  Puzzle,
  Send,
} from "lucide-react";
import {
  assignPortalLinks,
  bulkCreatePropertiesFromLinks,
  createBookFromPortalLinks,
  reorderPortalLinks,
  type BulkImportOutcome,
} from "@/app/[country]/(admin)/admin/clientes/portal-links-actions";
import { createClientShortlist } from "@/app/[country]/(admin)/admin/clientes/shortlist-actions";
import {
  compareByPriority,
  countLinks,
  isPendingCall,
  orderByRating,
  reorderIds,
  type PortalLinkWithNotes,
  type StaffRef,
} from "@/lib/portal-links/types";
import {
  COLLECTION_LANGUAGES,
  LANGUAGE_LABELS,
} from "@/lib/viewing-collections/i18n";
import type { Country } from "@/lib/country-config";
import { cn } from "@/lib/utils";
import { AddLinksDialog } from "./add-links-dialog";
import { PortalLinkRow } from "./portal-link-row";
import { Label, Ornament, Rule } from "./portal-links-ui";

type Filter = "all" | "toCall" | "mine" | "toVisit" | "discarded" | "converted";

export function PortalLinksBlock({
  clientId,
  clientName,
  country,
  currentUserId,
  links,
  staff,
  canCreate,
  canEdit,
  canDelete,
}: {
  clientId: string;
  clientName: string;
  country: Country;
  currentUserId: string | null;
  links: PortalLinkWithNotes[];
  staff: StaffRef[];
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>("all");
  const [addOpen, setAddOpen] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [assignee, setAssignee] = useState("");
  const [sendLanguage, setSendLanguage] = useState("es");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Orden optimista: arrastrar tiene que verse al instante, no esperar al
  // round-trip. Se descarta en cuanto el servidor devuelve la lista nueva.
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const linksRef = useRef(links);
  useEffect(() => {
    if (linksRef.current !== links) {
      linksRef.current = links;
      setDraftOrder(null);
    }
  }, [links]);

  /** La lista en orden de prioridad, con el arrastre en curso ya aplicado. */
  const ordered = useMemo(() => {
    const base = [...links].sort(compareByPriority);
    if (!draftOrder) return base;
    const byId = new Map(base.map((l) => [l.id, l]));
    const seen = new Set(draftOrder);
    const out = draftOrder
      .map((id) => byId.get(id))
      .filter((l): l is PortalLinkWithNotes => Boolean(l));
    // Un enlace que haya llegado mientras se arrastraba no debe desaparecer.
    for (const l of base) if (!seen.has(l.id)) out.push(l);
    return out;
  }, [links, draftOrder]);

  const commitOrder = (nextIds: string[]) => {
    setDraftOrder(nextIds);
    setError(null);
    startTransition(async () => {
      const res = await reorderPortalLinks(clientId, nextIds);
      if (!res.ok) {
        setDraftOrder(null);
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  /** Suelta `movedId` justo delante de `beforeId` (null = al final). */
  const dropBefore = (movedId: string, beforeId: string | null) => {
    const next = reorderIds(ordered.map((l) => l.id), movedId, beforeId);
    setDragId(null);
    setOverId(null);
    if (next.join() === ordered.map((l) => l.id).join()) return;
    commitOrder(next);
  };

  /** Flechas: la vía que sí funciona en una tablet. */
  const moveBy = (id: string, direction: -1 | 1) => {
    const ids = ordered.map((l) => l.id);
    const from = ids.indexOf(id);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= ids.length) return;
    // Bajar es "colocarse delante del que va DOS más abajo": si no, moverse
    // delante del vecino inmediato deja la lista igual.
    const beforeId = direction === -1 ? ids[to] : (ids[to + 1] ?? null);
    commitOrder(reorderIds(ids, id, beforeId));
  };

  const counts = useMemo(() => countLinks(links), [links]);
  const mineCount = useMemo(
    () =>
      currentUserId
        ? links.filter(
            (l) => l.assigned_to === currentUserId && isPendingCall(l.status),
          ).length
        : 0,
    [links, currentUserId],
  );

  const visible = useMemo(() => {
    switch (filter) {
      case "toCall":
        return ordered.filter((l) => isPendingCall(l.status));
      case "mine":
        return ordered.filter(
          (l) => l.assigned_to === currentUserId && isPendingCall(l.status),
        );
      case "toVisit":
        return ordered.filter((l) => l.status === "to_visit");
      case "discarded":
        return ordered.filter((l) => l.status === "discarded");
      case "converted":
        return ordered.filter((l) => l.status === "converted");
      default:
        return ordered;
    }
  }, [ordered, filter, currentUserId]);

  /** Quien ya lleva enlaces de este cliente es el candidato natural. */
  const defaultAssignee = useMemo(
    () => links.find((l) => l.assigned_to)?.assigned_to ?? null,
    [links],
  );

  const toggle = (id: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * Manda los marcados al cliente para que los ordene.
   *
   * Antes de crear la selección se crea la FICHA de los que todavía no la
   * tienen (2026-10-08): leyendo solo el anuncio, el cliente veía una foto y
   * nada más, y tenía que decidir a ciegas. Con la ficha ve todas las fotos,
   * las características y la descripción. Lo que no se pueda leer del portal
   * se manda igual, con lo que trajo el anuncio.
   *
   * Crea SIEMPRE una selección nueva, aunque el cliente ya tenga otra abierta.
   * Añadirlos a la anterior mezclaría los anuncios de hoy con lo que se le
   * mandó la semana pasada, y lo que el cliente tiene que ordenar es la tanda
   * que se acaba de ver con él. Cada ronda, su propio enlace.
   *
   * El título lleva la fecha para poder distinguirlas de un vistazo en la
   * ficha. Es interno: el cliente no lo ve.
   */
  const [sentLink, setSentLink] = useState<{ url: string; copied: boolean } | null>(null);
  const sendToClient = async () => {
    setError(null);
    setSentLink(null);
    const ids = [...checked];
    await importMissing(ids, "Mandando al cliente");
    setBusyLabel("Mandando al cliente…");
    try {
      const res = await createClientShortlist(clientId, {
        portalLinkIds: ids,
        language: sendLanguage,
        title: `Anuncios · ${new Date().toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "short",
        })}`,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // El enlace queda copiado para pegarlo donde se hable con el cliente
      // (WhatsApp, correo). Si el navegador no deja copiar —tras minutos
      // creando fichas puede haber perdido el permiso—, el aviso lleva un
      // botón para copiarlo a mano.
      const url = `${window.location.origin}/s/${res.token}`;
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        /* se ofrece el botón */
      }
      setSentLink({ url, copied });
      setChecked(new Set());
    } finally {
      setBusyLabel(null);
      router.refresh();
    }
  };

  /**
   * "Crear book con los seleccionados": un book NUEVO (borrador) con los
   * marcados, en el orden del panel y sin los descartados. Primero se crea la
   * ficha de los que no la tienen —una parada del book exige ficha—. Al
   * terminar se va a la pestaña Visitas, donde está el book.
   */
  const createBook = async () => {
    setError(null);
    const ids = ordered
      .filter((l) => checked.has(l.id) && l.status !== "discarded")
      .map((l) => l.id);
    if (ids.length === 0) {
      setError("Los marcados están descartados: no hay nada que meter en el book.");
      return;
    }
    await importMissing(ids, "Creando el book");
    setBusyLabel("Creando el book…");
    try {
      const res = await createBookFromPortalLinks(clientId, ids, sendLanguage);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const fuera: string[] = [];
      if (res.skippedPending > 0) {
        fuera.push(
          `${res.skippedPending} no se pudieron leer del portal y siguen sin ficha (créalas a mano desde su enlace)`,
        );
      }
      if (res.skippedArchived > 0) fuera.push(`${res.skippedArchived} ya no están disponibles`);
      if (fuera.length > 0) {
        alert(`Book creado con ${res.stops} pisos. No han entrado: ${fuera.join(" y ")}.`);
      }
      setChecked(new Set());
      router.push(`/${country}/admin/clientes/${clientId}?tab=viewings`);
    } finally {
      setBusyLabel(null);
      router.refresh();
    }
  };

  const assign = () => {
    setError(null);
    startTransition(async () => {
      const res = await assignPortalLinks(
        [...checked],
        assignee || null,
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setChecked(new Set());
      router.refresh();
    });
  };

  /**
   * "Enviar a Andrea": la lista para que llame a las agencias.
   *
   * Lleva los marcados o, si no hay ninguno marcado, todos. Los descartados
   * nunca entran. Cada piso conserva SU número del panel: si se descarta el 5,
   * a Andrea le llegan el 4 y el 6, no una lista renumerada que ya no casa
   * con lo que ve el resto del equipo.
   *
   * Solo WhatsApp: NO se le asignan en el CRM. Andrea trabaja con la lista
   * escrita, no con el panel. Se abre su chat de WhatsApp (teléfono de su
   * perfil) con la lista ya redactada, y el texto queda además copiado por si
   * WhatsApp no abre.
   */
  const andrea = useMemo(
    () => staff.find((s) => /^andrea\b/i.test(s.name.trim())) ?? null,
    [staff],
  );
  const [andreaNotice, setAndreaNotice] = useState<string | null>(null);
  const sendToAndrea = () => {
    if (!andrea) return;
    setError(null);
    setAndreaNotice(null);
    const pool = checked.size > 0 ? ordered.filter((l) => checked.has(l.id)) : ordered;
    const items = pool.filter((l) => l.status !== "discarded");
    if (items.length === 0) {
      setError("No hay anuncios para enviar: los marcados están descartados.");
      return;
    }

    const lines = items.map((l) => {
      const n = ordered.indexOf(l) + 1;
      const price =
        l.price_label ||
        (l.price ? `${new Intl.NumberFormat("es-ES").format(l.price)}€` : null);
      const head = [`${n}. ${l.title || "Anuncio"}`, price].filter(Boolean).join(" · ");
      const extra = [
        l.contact_name || l.contact_phone
          ? `Contacto: ${[l.contact_name, l.contact_phone].filter(Boolean).join(" ")}`
          : null,
        l.notes ? `Nota: ${l.notes}` : null,
      ].filter(Boolean);
      return [head, l.url, ...extra].join("\n");
    });
    const text = [
      `*${clientName}* · ${items.length} piso${items.length === 1 ? "" : "s"} para llamar a las agencias`,
      "",
      lines.join("\n\n"),
    ].join("\n");

    // Con su teléfono en el perfil se abre directamente su chat; sin él,
    // WhatsApp pide elegir a quién mandarlo.
    const phone = (andrea.phone ?? "").replace(/\D/g, "");
    window.open(
      `https://wa.me/${phone}?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener",
    );
    void navigator.clipboard?.writeText(text).catch(() => {});
    setAndreaNotice(
      `Lista de ${items.length} piso${items.length === 1 ? "" : "s"} para ${andrea.name} abierta en WhatsApp (y copiada)`,
    );
  };

  /**
   * Crea la ficha de los anuncios que todavía no la tienen. Lo usan "Crear
   * fichas", "Mandar al cliente" y "Crear book". Va uno por uno en el servidor
   * (misma extracción, misma inserción que el importador de siempre): son
   * descargas reales del portal, una detrás de otra a propósito.
   *
   * Los que ya tienen ficha o están descartados no se vuelven a pedir: antes
   * se mandaban igual y volvían como "pendientes", que confundía.
   */
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [bulkResults, setBulkResults] = useState<BulkImportOutcome[] | null>(null);
  const importMissing = async (ids: string[], label: string) => {
    setBulkResults(null);
    const byId = new Map(links.map((l) => [l.id, l]));
    const todo = ids.filter((id) => {
      const l = byId.get(id);
      return l && l.status !== "converted" && !l.property_id && l.status !== "discarded";
    });
    if (todo.length === 0) return;

    // Sin tope de pisos: se manda en tandas pequeñas, una petición corta por
    // tanda. Una sola petición con 40 descargas de Idealista tardaba minutos y
    // se caía por timeout, perdiendo todo el lote.
    const BATCH = 3;
    const all: BulkImportOutcome[] = [];
    setBusyLabel(`${label}: creando fichas… (0/${todo.length})`);
    for (let i = 0; i < todo.length; i += BATCH) {
      const batch = todo.slice(i, i + BATCH);
      let res: Awaited<ReturnType<typeof bulkCreatePropertiesFromLinks>>;
      try {
        res = await bulkCreatePropertiesFromLinks(clientId, batch);
      } catch {
        res = { ok: false, error: "se cortó la conexión con el servidor" };
      }
      if (res.ok) {
        all.push(...res.results);
      } else {
        // Una tanda fallida no tumba el resto: se anota y se sigue.
        all.push(...batch.map((linkId) => ({ linkId, ok: false, detail: res.error })));
      }
      setBusyLabel(
        `${label}: creando fichas… (${Math.min(i + BATCH, todo.length)}/${todo.length})`,
      );
      setBulkResults([...all]);
    }
  };

  const bulkImport = async () => {
    setError(null);
    try {
      await importMissing([...checked], "Fichas");
      setChecked(new Set());
    } finally {
      setBusyLabel(null);
      router.refresh();
    }
  };

  const busy = busyLabel !== null;
  const missingCount = useMemo(
    () =>
      links.filter(
        (l) =>
          checked.has(l.id) &&
          l.status !== "converted" &&
          !l.property_id &&
          l.status !== "discarded",
      ).length,
    [links, checked],
  );

  const filters: Array<[Filter, string, number]> = [
    ["all", "Todos", counts.all],
    ["toCall", "Por llamar", counts.toCall],
    ...(currentUserId ? ([["mine", "Míos", mineCount]] as Array<[Filter, string, number]>) : []),
    ["toVisit", "Para visitar", counts.toVisit],
    ["discarded", "Descartados", counts.discarded],
    ["converted", "Con ficha", counts.converted],
  ];

  return (
    <>
      <span id="portal-links" className="block scroll-mt-28" />
      <section className="overflow-hidden rounded-2xl border border-gold/15 bg-cream-50/85 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
        {/* Cabecera editorial */}
        <header className="px-5 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label tone="gold">Enlaces de portales</Label>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="crm-number text-2xl leading-none text-ink">
                  {String(counts.all).padStart(2, "0")}
                </span>
                <span className="font-sans text-xs text-ink/50">
                  {counts.all === 1 ? "anuncio" : "anuncios"} fuera del CRM
                </span>
              </p>
              <Ornament className="mt-3" />
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {canEdit && andrea && links.length > 0 && (
              <button
                type="button"
                disabled={pending}
                onClick={sendToAndrea}
                title={`Abre WhatsApp con la lista numerada para ${andrea.name}: los marcados, o todos si no hay ninguno marcado, sin los descartados. No cambia nada en el CRM.`}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gold/45 bg-white px-3 py-2 font-sans text-xs font-medium text-gold-dark transition hover:border-gold disabled:opacity-50"
              >
                <Send size={12} strokeWidth={1.75} />
                {checked.size > 0
                  ? `Enviar ${checked.size} a ${andrea.name.split(" ")[0]}`
                  : `Enviar a ${andrea.name.split(" ")[0]}`}
              </button>
            )}
            {canCreate && (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-2 font-sans text-xs font-medium text-cream-50 transition hover:bg-ink-soft"
              >
                <Plus size={12} strokeWidth={2} className="text-gold" />
                Añadir enlaces
              </button>
            )}
            </div>
          </div>

          {counts.all > 0 && (
            <p className="mt-3 font-sans text-xs text-ink/55">
              {counts.toCall > 0 ? (
                <>
                  <strong className="font-medium text-ink">
                    {counts.toCall}
                  </strong>{" "}
                  pendiente{counts.toCall > 1 ? "s" : ""} de llamar
                </>
              ) : (
                "Nada pendiente de llamar"
              )}
              {counts.toVisit > 0 && ` · ${counts.toVisit} para visitar`}
              {counts.converted > 0 && ` · ${counts.converted} ya con ficha`}
              {canEdit && counts.all > 1 && (
                <span className="text-ink/40">
                  {" "}· arrastra para cambiar la prioridad
                </span>
              )}
            </p>
          )}
        </header>

        <div className="px-5 pb-5">
          {links.length === 0 ? (
            <EmptyState clientName={clientName} />
          ) : (
            <>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {filters.map(([key, label, n]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setFilter(key)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 font-sans text-xs font-medium transition",
                      filter === key
                        ? "border-gold/50 bg-gold/15 text-ink"
                        : "border-ink/10 bg-white/60 text-ink/60 hover:border-gold/30",
                    )}
                  >
                    {label} {n}
                  </button>
                ))}
              </div>

              {canEdit && links.some((l) => l.rating > 0) && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => commitOrder(orderByRating(ordered))}
                  title="Reordena la lista poniendo arriba lo que más le gusta al cliente. Después puedes afinar arrastrando."
                  className="mt-2.5 inline-flex items-center gap-1.5 font-sans text-xs font-medium text-ink/55 transition hover:text-gold-dark disabled:opacity-50"
                >
                  <ArrowDownWideNarrow size={12} strokeWidth={1.75} className="text-gold-dark" />
                  Ordenar por valoración
                </button>
              )}

              {error && (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50/85 px-3 py-2 font-sans text-xs text-rose-700">
                  {error}
                </p>
              )}

              <Rule className="mt-3" tone="gold" />

              <ul>
                {visible.map((link, i) => (
                  <PortalLinkRow
                    key={link.id}
                    link={link}
                    clientId={clientId}
                    country={country}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    checked={checked.has(link.id)}
                    onToggle={() => toggle(link.id)}
                    onError={setError}
                    order={ordered.indexOf(link) + 1}
                    isDragging={dragId === link.id}
                    isDropTarget={Boolean(dragId) && overId === link.id && dragId !== link.id}
                    onDragStart={() => setDragId(link.id)}
                    onDragEnter={() => setOverId(link.id)}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                    onDrop={() => dragId && dropBefore(dragId, link.id)}
                    onMove={(direction) => moveBy(link.id, direction)}
                    canMoveUp={i > 0}
                    canMoveDown={i < visible.length - 1}
                  />
                ))}
              </ul>

              {/* Soltar aquí = al final del todo. Sin esta zona no hay forma de
                  mandar un anuncio detrás del último. */}
              {dragId && (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropBefore(dragId, null);
                  }}
                  className="mt-1 rounded-lg border border-dashed border-gold/40 bg-gold/5 py-2 text-center crm-label-sm text-gold-dark"
                >
                  Soltar al final
                </div>
              )}

              {visible.length === 0 && (
                <p className="py-6 text-center font-sans text-xs text-ink/45">
                  Ningún anuncio en este filtro.
                </p>
              )}

              {/* Repartir el trabajo: "estos se los mando a Fabricio". */}
              {canEdit && checked.size > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-gold/25 bg-gold/5 px-4 py-3">
                  <span className="font-sans text-xs font-medium text-ink/75">
                    {checked.size} marcado{checked.size > 1 ? "s" : ""}
                  </span>
                  <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 font-sans text-xs text-ink focus:border-gold/55 focus:outline-none"
                  >
                    <option value="">Sin asignar</option>
                    {staff.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={assign}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 font-sans text-xs font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
                  >
                    {pending && <Loader2 size={11} className="animate-spin" />}
                    Pasar para llamar
                  </button>
                  {andrea && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={sendToAndrea}
                      title={`Abre WhatsApp con la lista numerada de los marcados para ${andrea.name} (sin los descartados). No cambia nada en el CRM.`}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gold/45 bg-white px-3 py-1.5 font-sans text-xs font-medium text-gold-dark transition hover:border-gold disabled:opacity-50"
                    >
                      <Send size={11} strokeWidth={1.75} />
                      Enviar a {andrea.name.split(" ")[0]}
                    </button>
                  )}
                  {canCreate && (
                    <button
                      type="button"
                      disabled={busy || missingCount === 0}
                      onClick={bulkImport}
                      title="Crea la ficha de cada anuncio marcado que todavía no la tiene, leyendo su página completa en el portal (título, precio, todas las fotos, descripción), y la vincula a la selección del cliente."
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gold/45 bg-white px-3 py-1.5 font-sans text-xs font-medium text-gold-dark transition hover:border-gold disabled:opacity-50"
                    >
                      <Building2 size={11} strokeWidth={1.75} />
                      {missingCount === 0
                        ? "Ya tienen ficha"
                        : `Crear ${missingCount} ficha${missingCount > 1 ? "s" : ""}`}
                    </button>
                  )}
                  {canCreate && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={createBook}
                      title="Crea un book nuevo (borrador) con los marcados, en el orden del panel y sin los descartados. Antes crea la ficha de los que no la tienen."
                      className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 font-sans text-xs font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
                    >
                      <BookOpen size={11} strokeWidth={1.75} className="text-gold" />
                      Crear book con {checked.size === 1 ? "el seleccionado" : `los ${checked.size}`}
                    </button>
                  )}
                  {canCreate && (
                    <>
                      <select
                        value={sendLanguage}
                        onChange={(e) => setSendLanguage(e.target.value)}
                        title="Idioma de la selección privada que se le manda al cliente."
                        className="rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 font-sans text-xs text-ink focus:border-gold/55 focus:outline-none"
                      >
                        {COLLECTION_LANGUAGES.map((l) => (
                          <option key={l} value={l}>
                            {LANGUAGE_LABELS[l]}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={pending || busy}
                        onClick={sendToClient}
                        title="Crea una selección privada NUEVA con estos anuncios y copia su enlace para pegarlo en el chat del cliente. No le envía nada: lo mandas tú."
                        className="inline-flex items-center gap-1.5 rounded-lg border border-gold/45 bg-white px-3 py-1.5 font-sans text-xs font-medium text-gold-dark transition hover:border-gold disabled:opacity-50"
                      >
                        <Send size={11} strokeWidth={1.75} />
                        Mandar al cliente
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setChecked(new Set())}
                    className="ml-auto font-sans text-xs text-ink/50 transition hover:text-ink"
                  >
                    Quitar marcas
                  </button>
                </div>
              )}

              {busyLabel && (
                <p className="mt-3 flex items-center gap-2 rounded-xl border border-gold/25 bg-gold/5 px-4 py-2.5 font-sans text-xs text-ink/75">
                  <Loader2 size={12} className="animate-spin text-gold-dark" />
                  {busyLabel}
                  <span className="text-ink/40">· no cierres esta pestaña</span>
                </p>
              )}

              {sentLink && (
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 font-sans text-xs text-emerald-800">
                  <span className="font-medium">
                    {sentLink.copied
                      ? "✓ Selección creada · enlace copiado, pégalo en el chat del cliente"
                      : "✓ Selección creada"}
                  </span>
                  <span className="min-w-0 truncate text-emerald-700/80">{sentLink.url}</span>
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(sentLink.url).catch(() => {});
                      setSentLink({ ...sentLink, copied: true });
                    }}
                    className="ml-auto rounded-lg border border-emerald-300 bg-white px-2.5 py-1 font-medium text-emerald-800 transition hover:border-emerald-500"
                  >
                    Copiar enlace
                  </button>
                </div>
              )}

              {andreaNotice && (
                <p className="mt-3 rounded-xl border border-gold/25 bg-gold/5 px-4 py-2.5 font-sans text-xs text-ink/75">
                  ✓ {andreaNotice}
                </p>
              )}

              {bulkResults && (
                <div className="mt-3 rounded-xl border border-gold/25 bg-gold/5 px-4 py-3">
                  <p className="font-sans text-xs font-medium text-ink/75">
                    {bulkResults.filter((r) => r.ok).length} ficha
                    {bulkResults.filter((r) => r.ok).length === 1 ? "" : "s"} creada
                    {bulkResults.filter((r) => r.ok).length === 1 ? "" : "s"}
                    {bulkResults.some((r) => !r.ok)
                      ? ` · ${bulkResults.filter((r) => !r.ok).length} pendiente${
                          bulkResults.filter((r) => !r.ok).length === 1 ? "" : "s"
                        }`
                      : ""}
                  </p>
                  <ul className="mt-2 space-y-1">
                    {bulkResults.map((r) => (
                      <li
                        key={r.linkId}
                        className={cn(
                          "font-sans text-xs",
                          r.ok ? "text-emerald-700" : "text-rose-700",
                        )}
                      >
                        {r.ok ? "✓" : "✗"} {r.detail}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setBulkResults(null)}
                    className="mt-2 font-sans text-xs text-ink/45 transition hover:text-ink"
                  >
                    Cerrar
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {addOpen && (
        <AddLinksDialog
          clientId={clientId}
          clientName={clientName}
          staff={staff}
          defaultAssignee={defaultAssignee}
          onClose={() => setAddOpen(false)}
        />
      )}
    </>
  );
}

function EmptyState({ clientName }: { clientName: string }) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-7 text-center">
      <p className="font-sans text-xs text-ink/60">
        Aquí van los pisos que ves con {clientName} en Idealista, Fotocasa o en
        la web de otra inmobiliaria, antes de que sean fichas nuestras.
      </p>
      <div className="mt-4 flex flex-col items-center gap-2 font-sans text-xs text-ink/45">
        <span className="inline-flex items-center gap-1.5">
          <Link2 size={12} strokeWidth={1.75} className="text-gold-dark" />
          Pega los enlaces con «Añadir enlaces» — vale una lista entera de golpe
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Puzzle size={12} strokeWidth={1.75} className="text-gold-dark" />
          O márcalos en el propio portal con la extensión de Chrome y llegan
          solos a esta ficha
        </span>
      </div>
    </div>
  );
}
