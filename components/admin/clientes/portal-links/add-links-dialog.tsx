"use client";

// ============================================================================
// Alta masiva de enlaces.
//
// Está pensado para el copiar-y-pegar de verdad: se seleccionan diez anuncios
// con el cliente delante, se copian y se sueltan aquí de golpe. Acepta una
// lista, un WhatsApp reenviado o un correo entero — se extraen las URLs de
// donde estén, y el diálogo enseña ANTES de guardar qué ha entendido.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { addPortalLinks } from "@/app/[country]/(admin)/admin/clientes/portal-links-actions";
import {
  extractUrls,
  parsePortalUrl,
  portalLabel,
} from "@/lib/portal-links/portals";
import type { StaffRef } from "@/lib/portal-links/types";
import { Label, Rule } from "./portal-links-ui";

export function AddLinksDialog({
  clientId,
  clientName,
  staff,
  defaultAssignee,
  onClose,
}: {
  clientId: string;
  clientName: string;
  staff: StaffRef[];
  /** Se preselecciona a quien ya tiene enlaces de este cliente, si hay alguien. */
  defaultAssignee: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [note, setNote] = useState("");
  const [assignedTo, setAssignedTo] = useState(defaultAssignee ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Previsualización en vivo: qué URLs se han reconocido y de qué portal.
  const parsed = useMemo(() => {
    const urls = extractUrls(raw);
    const seen = new Set<string>();
    const items: Array<{ url: string; portal: string; ref: string | null }> = [];
    let invalid = 0;
    for (const u of urls) {
      const p = parsePortalUrl(u);
      if (!p) {
        invalid++;
        continue;
      }
      if (seen.has(p.urlKey)) continue;
      seen.add(p.urlKey);
      items.push({ url: p.url, portal: p.portal, ref: p.externalRef });
    }
    return { items, invalid };
  }, [raw]);

  const byPortal = useMemo(() => {
    const counts = new Map<string, number>();
    for (const i of parsed.items) {
      counts.set(i.portal, (counts.get(i.portal) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [parsed.items]);

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const res = await addPortalLinks(
        clientId,
        parsed.items.map((i) => ({
          url: i.url,
          notes: note.trim() || null,
        })),
        { assignedTo: assignedTo || null },
      );
      if (res.ok) {
        router.refresh();
        onClose();
      } else {
        setError(res.error);
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="mt-6 w-full max-w-xl overflow-hidden rounded-2xl border border-gold/20 bg-cream-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gold/15 px-5 py-4">
          <div>
            <Label tone="gold">Enlaces de portales</Label>
            <h3 className="crm-number mt-1 text-[22px] text-ink">
              Añadir anuncios para {clientName}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-ink/45 transition hover:text-ink"
            aria-label="Cerrar"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
          <Label>Pega aquí los enlaces</Label>
          <textarea
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            rows={7}
            autoFocus
            placeholder={
              "https://www.idealista.com/inmueble/106548321/\n" +
              "https://www.fotocasa.es/es/alquiler/vivienda/madrid/…\n\n" +
              "Vale también pegar un correo o un WhatsApp entero: se sacan los enlaces que haya."
            }
            className="mt-1.5 w-full resize-y rounded-xl border border-ink/15 bg-white px-3 py-2.5 font-sans text-xs text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
          />

          {(parsed.items.length > 0 || parsed.invalid > 0) && (
            <>
              <Rule className="my-3" />
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="crm-number text-[22px] leading-none text-ink">
                  {parsed.items.length}
                </span>
                <Label className="text-ink/50">
                  {parsed.items.length === 1
                    ? "anuncio reconocido"
                    : "anuncios reconocidos"}
                </Label>
                {parsed.invalid > 0 && (
                  <span className="font-sans text-xs text-amber-700">
                    {parsed.invalid} descartado{parsed.invalid > 1 ? "s" : ""}{" "}
                    (solo http:// o https://)
                  </span>
                )}
              </div>

              {byPortal.length > 0 && (
                <p className="mt-1.5 font-sans text-xs text-ink/50">
                  {byPortal
                    .map(([portal, n]) => `${portalLabel(portal)} ${n}`)
                    .join(" · ")}
                </p>
              )}

              {parsed.items.length > 0 && (
                <ul className="mt-2.5 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-ink/8 bg-white/60 p-2">
                  {parsed.items.slice(0, 20).map((i) => (
                    <li
                      key={i.url}
                      className="truncate font-sans text-xs text-ink/55"
                    >
                      {portalLabel(i.portal)}
                      {i.ref ? ` · ${i.ref}` : ""} — {i.url}
                    </li>
                  ))}
                  {parsed.items.length > 20 && (
                    <li className="font-sans text-xs text-ink/40">
                      y {parsed.items.length - 20} más…
                    </li>
                  )}
                </ul>
              )}
            </>
          )}

          <Rule className="my-3" />

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Quién los llama</Label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-2.5 py-2 font-sans text-xs text-ink focus:border-gold/55 focus:outline-none"
              >
                <option value="">Sin asignar</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Nota para todos</Label>
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Vistos con el cliente el lunes…"
                className="mt-1.5 w-full rounded-lg border border-ink/15 bg-white px-2.5 py-2 font-sans text-xs text-ink placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50/85 px-3 py-2 font-sans text-xs text-rose-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-gold/15 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-ink/15 bg-white px-3.5 py-2 font-sans text-xs font-medium text-ink/70 transition hover:border-ink/30"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={pending || parsed.items.length === 0}
            onClick={submit}
            className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 font-sans text-xs font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-40"
          >
            {pending && <Loader2 size={12} className="animate-spin" />}
            Añadir {parsed.items.length > 0 ? parsed.items.length : ""}
          </button>
        </div>
      </div>
    </div>
  );
}
