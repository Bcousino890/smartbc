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
import { ArrowDownWideNarrow, Link2, Loader2, Plus, Puzzle, Send } from "lucide-react";
import {
  assignPortalLinks,
  reorderPortalLinks,
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
   * Manda los marcados al cliente para que los ordene, SIN crearles ficha
   * antes: media lista se va a caer en la primera llamada y no tiene sentido
   * importar quince anuncios para eso. El shortlist los acepta tal cual.
   */
  const sendToClient = () => {
    setError(null);
    startTransition(async () => {
      const res = await createClientShortlist(clientId, {
        portalLinkIds: [...checked],
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setChecked(new Set());
      router.refresh();
    });
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
      <span id="portal-links" className="scroll-mt-24" />
      <section className="overflow-hidden rounded-2xl border border-gold/15 bg-cream-50/85 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
        {/* Cabecera editorial */}
        <header className="px-5 pt-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label tone="gold">Enlaces de portales</Label>
              <p className="mt-2 flex items-baseline gap-2">
                <span className="font-serif text-[26px] leading-none vc-nums text-ink">
                  {String(counts.all).padStart(2, "0")}
                </span>
                <span className="font-sans text-[12px] text-ink/50">
                  {counts.all === 1 ? "anuncio" : "anuncios"} fuera del CRM
                </span>
              </p>
              <Ornament className="mt-3" />
            </div>

            {canCreate && (
              <button
                type="button"
                onClick={() => setAddOpen(true)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-ink px-3 py-2 font-sans text-[11.5px] font-medium text-cream-50 transition hover:bg-ink-soft"
              >
                <Plus size={12} strokeWidth={2} className="text-gold" />
                Añadir enlaces
              </button>
            )}
          </div>

          {counts.all > 0 && (
            <p className="mt-3 font-sans text-[12px] text-ink/55">
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
                      "rounded-full border px-2.5 py-1 font-sans text-[11px] font-medium transition",
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
                  className="mt-2.5 inline-flex items-center gap-1.5 font-sans text-[11.5px] font-medium text-ink/55 transition hover:text-gold-dark disabled:opacity-50"
                >
                  <ArrowDownWideNarrow size={12} strokeWidth={1.75} className="text-gold-dark" />
                  Ordenar por valoración
                </button>
              )}

              {error && (
                <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50/85 px-3 py-2 font-sans text-[12px] text-rose-700">
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
                  className="mt-1 rounded-lg border border-dashed border-gold/40 bg-gold/5 py-2 text-center font-display text-[9.5px] uppercase vc-tracked-sm text-gold-dark"
                >
                  Soltar al final
                </div>
              )}

              {visible.length === 0 && (
                <p className="py-6 text-center font-sans text-[12px] text-ink/45">
                  Ningún anuncio en este filtro.
                </p>
              )}

              {/* Repartir el trabajo: "estos se los mando a Fabricio". */}
              {canEdit && checked.size > 0 && (
                <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-gold/25 bg-gold/5 px-4 py-3">
                  <span className="font-sans text-[12px] font-medium text-ink/75">
                    {checked.size} marcado{checked.size > 1 ? "s" : ""}
                  </span>
                  <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 font-sans text-[11.5px] text-ink focus:border-gold/55 focus:outline-none"
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
                    className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 font-sans text-[11.5px] font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
                  >
                    {pending && <Loader2 size={11} className="animate-spin" />}
                    Pasar para llamar
                  </button>
                  {canCreate && (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={sendToClient}
                      title="Crea una selección privada con estos anuncios para que el cliente los ordene. No hace falta crearles ficha antes."
                      className="inline-flex items-center gap-1.5 rounded-lg border border-gold/45 bg-white px-3 py-1.5 font-sans text-[11.5px] font-medium text-gold-dark transition hover:border-gold disabled:opacity-50"
                    >
                      {pending ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Send size={11} strokeWidth={1.75} />
                      )}
                      Mandar al cliente
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setChecked(new Set())}
                    className="ml-auto font-sans text-[11.5px] text-ink/50 transition hover:text-ink"
                  >
                    Quitar marcas
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
      <p className="font-sans text-[12.5px] text-ink/60">
        Aquí van los pisos que ves con {clientName} en Idealista, Fotocasa o en
        la web de otra inmobiliaria, antes de que sean fichas nuestras.
      </p>
      <div className="mt-4 flex flex-col items-center gap-2 font-sans text-[11.5px] text-ink/45">
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
