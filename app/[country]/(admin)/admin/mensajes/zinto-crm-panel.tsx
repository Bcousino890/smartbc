"use client";

import { ChevronDown, Loader2, StickyNote, Tag } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { getZintoCrmPanelData, type ZintoCrmPanelData } from "./zinto-crm-actions";

/**
 * Read-only side panel showing cached Zinto CRM context (name, tags, notes)
 * for the phone number of the currently-open WhatsApp conversation. Purely
 * additive to the chat view: collapsed by default, never blocks anything,
 * and degrades gracefully when the cache has no record yet for this number.
 */
export function ZintoCrmPanel({ phone }: { phone: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ZintoCrmPanelData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    setData(null);
    setError(false);
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

  return (
    <div className="border-t border-gold/15 bg-cream-50/60">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2 text-left text-[11px] font-medium text-ink/60 transition hover:text-ink"
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
                <p className="text-[13px] font-semibold text-ink">{data.contact.name}</p>
                {data.contact.email && (
                  <p className="text-[11px] text-ink/55">{data.contact.email}</p>
                )}
              </div>

              {data.contact.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {data.contact.tags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-medium text-ink/70"
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
                      className="rounded-md bg-cream-50/80 px-2.5 py-1.5 text-[11px] text-ink/70"
                    >
                      <p className="whitespace-pre-wrap">{note.content}</p>
                      {note.zintoCreatedAt && (
                        <p className="mt-0.5 text-[10px] text-ink/40">
                          {formatNoteDate(note.zintoCreatedAt)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] italic text-ink/45">Sin notas en el CRM.</p>
              )}

              <p className="text-[9px] text-ink/35">
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
