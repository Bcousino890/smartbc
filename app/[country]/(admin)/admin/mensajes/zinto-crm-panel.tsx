"use client";

import { ChevronDown, Loader2, Plus, StickyNote, Tag } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import {
  getZintoCrmPanelData,
  addZintoCrmNote,
  addZintoCrmTag,
  type ZintoCrmPanelData,
} from "./zinto-crm-actions";

/**
 * Side panel showing cached Zinto CRM context (name, tags, notes) for the
 * phone number of the currently-open WhatsApp conversation, with the ability
 * to add notes/tags that write straight to Zinto (see zinto-crm-actions.ts).
 * Purely additive to the chat view: collapsed by default, never blocks
 * anything, and degrades gracefully when the cache has no record yet for
 * this number.
 */
export function ZintoCrmPanel({ phone }: { phone: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ZintoCrmPanelData | null>(null);
  const [error, setError] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [writeError, setWriteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const reload = () => {
    setLoading(true);
    getZintoCrmPanelData(phone)
      .then((result) => setData(result))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setData(null);
    setError(false);
    setWriteError(null);
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getZintoCrmPanelData(phone)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [phone, open]);

  const contactId = data?.contact?.zintoContactId;

  function handleAddNote() {
    if (!contactId || !noteDraft.trim()) return;
    setWriteError(null);
    startTransition(async () => {
      const result = await addZintoCrmNote(contactId, noteDraft.trim());
      if (result.ok) {
        setNoteDraft("");
        reload();
      } else {
        setWriteError(result.error);
      }
    });
  }

  function handleAddTag() {
    if (!contactId || !tagDraft.trim()) return;
    setWriteError(null);
    startTransition(async () => {
      const result = await addZintoCrmTag(contactId, tagDraft.trim());
      if (result.ok) {
        setTagDraft("");
        reload();
      } else {
        setWriteError(result.error);
      }
    });
  }

  return (
    <div className="border-t border-gold/15 bg-cream-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 text-left text-xs font-medium text-ink/60 transition hover:text-ink"
      >
        <span className="flex items-center gap-1.5">
          <StickyNote size={13} strokeWidth={1.75} />
          Contexto CRM (Zinto)
        </span>
        <ChevronDown
          size={14}
          strokeWidth={1.75}
          className={cn("transition-transform", open && "rotate-180")}
        />
      </button>

      {open && (
        <div className="px-4 pb-3">
          {loading && (
            <p className="flex items-center gap-1.5 text-xs text-ink/50">
              <Loader2 size={12} strokeWidth={1.75} className="animate-spin" />
              Cargando datos de CRM…
            </p>
          )}

          {!loading && error && (
            <p className="text-xs text-ink/50">
              No se pudo cargar el contexto de CRM.
            </p>
          )}

          {!loading && !error && data && !data.contact && (
            <p className="text-xs italic text-ink/45">
              Sin datos de CRM sincronizados.
            </p>
          )}

          {!loading && !error && data?.contact && (
            <div className="space-y-2.5 rounded-lg border border-gold/15 bg-white/60 px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-ink">{data.contact.name}</p>
                {data.contact.email && (
                  <p className="text-xs text-ink/55">{data.contact.email}</p>
                )}
              </div>

              {data.contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {data.contact.tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-medium text-ink/70"
                    >
                      <Tag size={9} strokeWidth={2} />
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {data.notes.length > 0 ? (
                <ul className="space-y-1.5">
                  {data.notes.map((note) => (
                    <li
                      key={note.zintoNoteId}
                      className="rounded-md bg-cream-50/80 px-2.5 py-1.5 text-xs text-ink/70"
                    >
                      <p className="whitespace-pre-wrap">{note.content}</p>
                      {note.zintoCreatedAt && (
                        <p className="mt-0.5 text-xs text-ink/40">
                          {formatNoteDate(note.zintoCreatedAt)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs italic text-ink/45">Sin notas en el CRM.</p>
              )}

              <div className="space-y-1.5 border-t border-gold/10 pt-2.5">
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                    placeholder="Agregar tag…"
                    disabled={isPending}
                    className="min-w-0 flex-1 rounded-md border border-gold/20 bg-white/70 px-2 py-1 text-xs text-ink placeholder:text-ink/40 focus:border-gold/40 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleAddTag}
                    disabled={isPending || !tagDraft.trim()}
                    className="flex items-center gap-1 rounded-md bg-gold/20 px-2 py-1 text-xs font-medium text-ink/70 transition hover:bg-gold/30 disabled:opacity-40"
                  >
                    <Plus size={11} strokeWidth={2} />
                    Tag
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    value={noteDraft}
                    onChange={(e) => setNoteDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddNote()}
                    placeholder="Agregar nota…"
                    disabled={isPending}
                    className="min-w-0 flex-1 rounded-md border border-gold/20 bg-white/70 px-2 py-1 text-xs text-ink placeholder:text-ink/40 focus:border-gold/40 focus:outline-none disabled:opacity-50"
                  />
                  <button
                    type="button"
                    onClick={handleAddNote}
                    disabled={isPending || !noteDraft.trim()}
                    className="flex items-center gap-1 rounded-md bg-gold/20 px-2 py-1 text-xs font-medium text-ink/70 transition hover:bg-gold/30 disabled:opacity-40"
                  >
                    <Plus size={11} strokeWidth={2} />
                    Nota
                  </button>
                </div>
                {isPending && (
                  <p className="flex items-center gap-1.5 text-xs text-ink/45">
                    <Loader2 size={10} strokeWidth={1.75} className="animate-spin" />
                    Guardando en Zinto…
                  </p>
                )}
                {writeError && (
                  <p className="text-xs text-red-600/80">{writeError}</p>
                )}
              </div>

              <p className="text-xs text-ink/35">
                Sincronizado {formatNoteDate(data.contact.syncedAt)}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatNoteDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}
