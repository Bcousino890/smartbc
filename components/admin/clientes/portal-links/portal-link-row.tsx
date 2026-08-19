"use client";

// ============================================================================
// Una fila del panel: un anuncio de portal, con su hilo de llamadas.
//
// Colapsada dice lo justo para decidir a quién se llama; abierta es la
// herramienta de la llamada: el teléfono arriba, el historial delante y los
// atajos de resultado a un clic ("no acepta más de 11 meses" es literalmente
// un botón).
// ============================================================================

import { useState, useTransition } from "react";
import Link from "next/link";
import {
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  Loader2,
  Phone,
  Trash2,
} from "lucide-react";
import { addPropertyToSelection } from "@/app/[country]/(admin)/admin/clientes/viewing-collections-actions";
import {
  addPortalLinkNote,
  deletePortalLink,
  setPortalLinkRating,
  updatePortalLink,
  updatePortalLinkStatus,
} from "@/app/[country]/(admin)/admin/clientes/portal-links-actions";
import {
  LINK_STATUS_HINT,
  SELECTABLE_LINK_STATUSES,
  LINK_STATUS_LABEL,
  type PortalLinkStatus,
  type PortalLinkWithNotes,
} from "@/lib/portal-links/types";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { cn } from "@/lib/utils";
import {
  Figure,
  Label,
  PortalTag,
  RatingStars,
  Rule,
  StatusWord,
  formatAgo,
  formatVisitMoment,
  initialsOf,
  telHref,
} from "./portal-links-ui";

/**
 * Los desenlaces que se repiten en cada llamada. Rellenan la nota y señalan el
 * estado que les corresponde, pero NO la envían: casi siempre hay que matizar
 * ("no acepta más de 11 meses" → "…pero acepta 10 con dos meses de fianza").
 */
const QUICK_NOTES: Array<{ text: string; status: PortalLinkStatus }> = [
  { text: "No acepta contrato de menos de 11 meses", status: "discarded" },
  { text: "Ya está alquilado / vendido", status: "discarded" },
  { text: "No cogen el teléfono", status: "no_answer" },
  { text: "Quedan en llamarme ellos", status: "callback" },
  { text: "Acepta visita — cuadrar hora", status: "to_visit" },
  { text: "Podemos verlo mañana", status: "to_visit" },
];

export function PortalLinkRow({
  link,
  clientId,
  country,
  canEdit,
  canDelete,
  checked,
  onToggle,
  onError,
  order,
  isDragging,
  isDropTarget,
  onDragStart,
  onDragEnter,
  onDragEnd,
  onDrop,
  onMove,
  canMoveUp,
  canMoveDown,
}: {
  link: PortalLinkWithNotes;
  clientId: string;
  country: Country;
  canEdit: boolean;
  canDelete: boolean;
  checked: boolean;
  onToggle: () => void;
  onError: (message: string | null) => void;
  /** Puesto en la lista de prioridad, 1-based. */
  order: number;
  isDragging: boolean;
  isDropTarget: boolean;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDragEnd: () => void;
  onDrop: () => void;
  onMove: (direction: -1 | 1) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const config = getCountryConfig(country);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();

  const specs = [
    link.zone,
    // bedrooms=0 es un dato real (estudio de un ambiente): no se toca.
    link.bedrooms != null ? `${link.bedrooms} hab` : null,
    // bathrooms=0 y square_meters=0 no existen en un piso real: es lo que la
    // extensión no pudo capturar, guardado como 0 en vez de NULL. Se trata
    // igual que un null: se omite en vez de enseñar un "0 baños" falso.
    link.bathrooms != null && link.bathrooms !== 0
      ? `${link.bathrooms} baños`
      : null,
    link.square_meters != null && link.square_meters !== 0
      ? `${link.square_meters} m²`
      : null,
  ].filter(Boolean);

  // El portal casi siempre da el precio ya escrito ("1.500 €/mes"); si no,
  // lo componemos con el formato del país.
  const priceText =
    link.price_label ??
    (link.price != null
      ? config.formatPrice(link.price, null, link.operation)
      : null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    onError(null);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) onError(res.error ?? "No se pudo completar la acción.");
    });
  };

  const applyStatus = (status: PortalLinkStatus) => {
    const body = note.trim();
    run(async () => {
      const res = await updatePortalLinkStatus(link.id, status, body || undefined);
      if (res.ok) setNote("");
      return res;
    });
  };

  return (
    <li
      // El arrastre nativo de HTML5 no pide dependencias, pero no existe en
      // táctil: por eso las flechas de al lado no son un adorno, son la única
      // forma de reordenar desde una tablet.
      draggable={canEdit}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", link.id);
        onDragStart();
      }}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group -mx-1 px-1 transition-colors",
        checked && "bg-gold/5",
        pending && "opacity-60",
        link.status === "discarded" && !open && "opacity-60",
        isDragging && "opacity-40",
        isDropTarget && "border-t-2 border-gold",
      )}
    >
      <div className="flex items-start gap-3 py-3.5">
        {canEdit && (
          <div className="mt-0.5 flex shrink-0 flex-col items-center">
            <button
              type="button"
              disabled={!canMoveUp}
              onClick={() => onMove(-1)}
              aria-label="Subir en la prioridad"
              className="text-ink/25 transition hover:text-gold-dark disabled:opacity-0"
            >
              <ChevronUp size={13} strokeWidth={2} />
            </button>
            <span
              className="cursor-grab font-serif text-[11px] leading-none vc-nums text-ink/35 active:cursor-grabbing"
              title="Arrastra para cambiar la prioridad"
            >
              {String(order).padStart(2, "0")}
            </span>
            <button
              type="button"
              disabled={!canMoveDown}
              onClick={() => onMove(1)}
              aria-label="Bajar en la prioridad"
              className="text-ink/25 transition hover:text-gold-dark disabled:opacity-0"
            >
              <ChevronDown size={13} strokeWidth={2} />
            </button>
          </div>
        )}
        {canEdit && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={checked ? "Desmarcar" : "Marcar"}
            className={cn(
              "mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border transition",
              checked
                ? "border-gold bg-gold text-white"
                : "border-ink/20 bg-white/70 hover:border-gold/60",
            )}
          >
            {checked && <Check size={11} strokeWidth={3} />}
          </button>
        )}

        {link.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={link.image_url}
            alt=""
            loading="lazy"
            referrerPolicy="no-referrer"
            className="h-14 w-[76px] shrink-0 rounded-md object-cover"
          />
        ) : (
          <div className="flex h-14 w-[76px] shrink-0 items-center justify-center rounded-md bg-ink/5 text-ink/20">
            <Building2 size={16} strokeWidth={1.5} />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <PortalTag portal={link.portal} externalRef={link.external_ref} />
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer noopener"
                className="mt-1 block truncate font-serif text-[15px] leading-snug text-ink transition-colors hover:text-gold-dark"
                title={link.title ?? link.url}
              >
                {link.title ?? link.url.replace(/^https?:\/\//, "")}
              </a>
              {specs.length > 0 && (
                <p className="mt-0.5 truncate font-sans text-[11.5px] text-ink/45">
                  {specs.join(" · ")}
                </p>
              )}
            </div>

            <div className="shrink-0 text-right">
              {priceText && <Figure className="text-[17px]">{priceText}</Figure>}
              <div className="mt-1.5 flex items-center justify-end gap-2">
                <RatingStars
                  value={link.rating}
                  disabled={!canEdit || pending}
                  onChange={
                    canEdit
                      ? (next) =>
                          run(() => setPortalLinkRating(link.id, next))
                      : undefined
                  }
                />
                <StatusWord status={link.status} />
              </div>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {link.contact_phone && (
              <a
                href={telHref(link.contact_phone)}
                className="inline-flex items-center gap-1.5 font-sans text-[12px] font-medium text-ink/75 transition hover:text-gold-dark"
              >
                <Phone size={12} strokeWidth={1.75} className="text-gold-dark" />
                {link.contact_phone}
                {link.contact_name ? (
                  <span className="text-ink/40">· {link.contact_name}</span>
                ) : null}
              </a>
            )}

            {link.assignedTo && (
              <span
                className="inline-flex items-center gap-1.5 font-sans text-[11.5px] text-ink/50"
                title={`Asignado a ${link.assignedTo.name}`}
              >
                <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-ink text-[8.5px] font-semibold text-cream-50">
                  {initialsOf(link.assignedTo.name)}
                </span>
                {link.assignedTo.name}
              </span>
            )}

            {link.proposed_visit_at && (
              <span className="font-sans text-[11.5px] text-gold-dark">
                Visita: {formatVisitMoment(link.proposed_visit_at)}
              </span>
            )}

            {link.notes_thread.length > 0 && (
              <span className="font-sans text-[11.5px] text-ink/40">
                {link.notes_thread.length} nota
                {link.notes_thread.length > 1 ? "s" : ""} ·{" "}
                {formatAgo(link.notes_thread[0].created_at)}
              </span>
            )}

            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="ml-auto inline-flex items-center gap-1 font-display text-[9.5px] font-medium uppercase vc-tracked-sm text-ink/45 transition hover:text-ink"
            >
              {open ? "Cerrar" : "Llamada"}
              <ChevronDown
                size={12}
                strokeWidth={2}
                className={cn("transition-transform", open && "rotate-180")}
              />
            </button>
          </div>

          {open && (
            <LinkDetail
              link={link}
              clientId={clientId}
              country={country}
              canEdit={canEdit}
              canDelete={canDelete}
              note={note}
              setNote={setNote}
              pending={pending}
              onApplyStatus={applyStatus}
              onRun={run}
            />
          )}
        </div>
      </div>
      <Rule />
    </li>
  );
}

function LinkDetail({
  link,
  clientId,
  country,
  canEdit,
  canDelete,
  note,
  setNote,
  pending,
  onApplyStatus,
  onRun,
}: {
  link: PortalLinkWithNotes;
  clientId: string;
  country: Country;
  canEdit: boolean;
  canDelete: boolean;
  note: string;
  setNote: (v: string) => void;
  pending: boolean;
  onApplyStatus: (status: PortalLinkStatus) => void;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>) => void;
}) {
  const config = getCountryConfig(country);
  const [suggested, setSuggested] = useState<PortalLinkStatus | null>(null);
  const [phone, setPhone] = useState(link.contact_phone ?? "");
  const [contact, setContact] = useState(link.contact_name ?? "");
  const [visitAt, setVisitAt] = useState(toLocalInput(link.proposed_visit_at));

  // La ficha se crea con el importador por enlace, que ya sabe leer Idealista,
  // Fotocasa y compañía. Se le pasa el enlace y de qué cliente viene para que
  // al confirmar quede vinculado y en su selección.
  const importHref =
    `${config.prefix}/propiedades/importar` +
    `?url=${encodeURIComponent(link.url)}` +
    `&linkId=${encodeURIComponent(link.id)}` +
    `&clienteId=${encodeURIComponent(clientId)}`;

  return (
    <div className="mt-3 rounded-xl border border-gold/15 bg-white/55 p-3.5">
      {/* Hilo de llamadas */}
      <Label tone="gold">Registro de llamadas</Label>
      {link.notes_thread.length === 0 ? (
        <p className="mt-2 font-sans text-[12px] text-ink/45">
          Todavía no ha llamado nadie. {LINK_STATUS_HINT[link.status]}.
        </p>
      ) : (
        <ol className="mt-2 space-y-2">
          {link.notes_thread.map((n) => (
            <li key={n.id} className="border-l-2 border-gold/25 pl-2.5">
              <p className="font-sans text-[12.5px] leading-snug text-ink/80">
                {n.body}
              </p>
              <p className="mt-0.5 font-sans text-[10.5px] text-ink/40">
                {n.authorName ?? "—"} · {formatAgo(n.created_at)}
                {n.status_after
                  ? ` · ${LINK_STATUS_LABEL[n.status_after]}`
                  : ""}
              </p>
            </li>
          ))}
        </ol>
      )}

      {canEdit && (
        <>
          <Rule className="my-3" />

          <Label tone="gold">Resultado de la llamada</Label>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {QUICK_NOTES.map((q) => (
              <button
                key={q.text}
                type="button"
                onClick={() => {
                  setNote(q.text);
                  setSuggested(q.status);
                }}
                className="rounded-full border border-ink/10 bg-white px-2.5 py-1 font-sans text-[11px] text-ink/60 transition hover:border-gold/50 hover:text-ink"
              >
                {q.text}
              </button>
            ))}
          </div>

          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              if (!e.target.value.trim()) setSuggested(null);
            }}
            rows={2}
            placeholder="Qué han dicho: condiciones, disponibilidad, con quién has hablado…"
            className="mt-2 w-full resize-y rounded-lg border border-ink/15 bg-white px-3 py-2 font-sans text-[12.5px] text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
          />

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {SELECTABLE_LINK_STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                disabled={pending}
                onClick={() => {
                  setSuggested(null);
                  onApplyStatus(s);
                }}
                className={cn(
                  "rounded-lg border px-2.5 py-1.5 font-display text-[9.5px] font-medium uppercase vc-tracked-sm transition disabled:opacity-50",
                  link.status === s
                    ? "border-gold/55 bg-gold/15 text-ink"
                    : "border-ink/12 bg-white text-ink/60 hover:border-gold/45 hover:text-ink",
                  // El atajo que se acaba de pulsar señala dónde hay que
                  // rematar la llamada, sin decidir por el agente.
                  suggested === s && "ring-2 ring-gold/45",
                )}
                title={LINK_STATUS_HINT[s]}
              >
                {LINK_STATUS_LABEL[s]}
              </button>
            ))}
            <button
              type="button"
              disabled={pending || !note.trim()}
              onClick={() =>
                onRun(async () => {
                  const res = await addPortalLinkNote(link.id, note, "note");
                  if (res.ok) setNote("");
                  return res;
                })
              }
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 font-sans text-[11.5px] font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-40"
            >
              {pending ? (
                <Loader2 size={11} className="animate-spin" />
              ) : null}
              Solo guardar nota
            </button>
          </div>

          <Rule className="my-3" />

          {/* Datos de contacto y hora propuesta */}
          <div className="grid gap-2.5 sm:grid-cols-3">
            <Field label="Teléfono del anuncio">
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                onBlur={() => {
                  if ((link.contact_phone ?? "") === phone) return;
                  onRun(() => updatePortalLink(link.id, { contactPhone: phone }));
                }}
                placeholder="+34 …"
                className={fieldClass}
              />
            </Field>
            <Field label="Con quién se habla">
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                onBlur={() => {
                  if ((link.contact_name ?? "") === contact) return;
                  onRun(() => updatePortalLink(link.id, { contactName: contact }));
                }}
                placeholder="Agencia, propietario…"
                className={fieldClass}
              />
            </Field>
            <Field label="Visita propuesta">
              <input
                type="datetime-local"
                value={visitAt}
                onChange={(e) => setVisitAt(e.target.value)}
                onBlur={() => {
                  const current = toLocalInput(link.proposed_visit_at);
                  if (current === visitAt) return;
                  onRun(() =>
                    updatePortalLink(link.id, {
                      // datetime-local no lleva zona: se interpreta como hora
                      // local del navegador, que es la del agente.
                      proposedVisitAt: visitAt
                        ? new Date(visitAt).toISOString()
                        : null,
                    }),
                  );
                }}
                className={fieldClass}
              />
            </Field>
          </div>
        </>
      )}

      <Rule className="my-3" />

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <a
          href={link.url}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-1.5 font-sans text-[11.5px] font-medium text-ink/65 transition hover:text-ink"
        >
          <ExternalLink size={12} strokeWidth={1.75} className="text-gold-dark" />
          Ver anuncio
        </a>

        {link.property ? (
          <>
            <Link
              href={`${config.prefix}/propiedades/${link.property.slug}`}
              className="inline-flex items-center gap-1.5 font-sans text-[11.5px] font-medium text-gold-dark transition hover:text-gold"
            >
              <Building2 size={12} strokeWidth={1.75} />
              Ver ficha creada
            </Link>
            {link.property.inSelection ? (
              <span className="inline-flex items-center gap-1 font-sans text-[11.5px] text-emerald-700">
                <Check size={11} strokeWidth={2.5} />
                En la selección del cliente
              </span>
            ) : (
              canEdit && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    onRun(() =>
                      addPropertyToSelection(
                        clientId,
                        link.property!.id,
                        "manual",
                      ),
                    )
                  }
                  className="font-sans text-[11.5px] font-medium text-gold-dark transition hover:text-gold disabled:opacity-50"
                >
                  Añadir a la selección
                </button>
              )
            )}
          </>
        ) : (
          canEdit && (
            <Link
              href={importHref}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 font-sans text-[11.5px] font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink"
            >
              <Building2 size={12} strokeWidth={1.75} className="text-gold-dark" />
              Crear ficha desde el anuncio
            </Link>
          )
        )}

        {canDelete && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              if (!confirm("¿Quitar este enlace de la ficha del cliente?")) return;
              onRun(() => deletePortalLink(link.id));
            }}
            className="ml-auto inline-flex items-center gap-1 font-sans text-[11.5px] text-ink/40 transition hover:text-rose-600 disabled:opacity-50"
          >
            <Trash2 size={11} strokeWidth={1.75} />
            Quitar
          </button>
        )}
      </div>
    </div>
  );
}

const fieldClass =
  "w-full rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 font-sans text-[12px] text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <Label className="mb-1">{label}</Label>
      {children}
    </label>
  );
}

/**
 * ISO → valor de `<input type="datetime-local">` en hora LOCAL. `toISOString()`
 * daría UTC y el agente vería una hora distinta de la que escribió.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
