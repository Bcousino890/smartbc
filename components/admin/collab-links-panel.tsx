"use client";

import { Check, ChevronDown, Copy, FileDown, Loader2, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  createCollabLinkAction,
  listCollabLinksAction,
  revokeCollabLinkAction,
} from "@/app/[country]/(admin)/admin/propiedades/[slug]/collab-actions";
import type { CollabLinkRow } from "@/lib/db/queries/collab-links";
import { COLLAB_LINK_TTL_DAYS } from "@/lib/collab/white-label";
import { PORTAL_URL } from "@/lib/portal-url";
import { cn } from "@/lib/utils";

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "short" });

function statusOf(l: CollabLinkRow): { label: string; tone: string } {
  if (l.revokedAt) return { label: "Revocado", tone: "text-rose-600" };
  if (new Date(l.expiresAt) < new Date()) return { label: "Caducado", tone: "text-ink/45" };
  const days = Math.max(1, Math.ceil((new Date(l.expiresAt).getTime() - Date.now()) / 86_400_000));
  return { label: `Activo · caduca en ${days} d`, tone: "text-emerald-700" };
}

/** Enlace temporal y PDF "en blanco": solo "Empresa colaboradora" + referencia. */
export function CollabLinksPanel({ slug }: { slug: string }) {
  const [links, setLinks] = useState<CollabLinkRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  const load = useCallback(async () => {
    const r = await listCollabLinksAction(slug);
    if (r.ok) setLinks(r.links);
    else setError(r.error);
  }, [slug]);

  useEffect(() => {
    load();
  }, [load]);

  const urlOf = (token: string) => `${PORTAL_URL}/colaboracion/${token}`;

  const copy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(urlOf(token));
    } catch {
      setError("No se pudo copiar: selecciona el enlace a mano.");
      return;
    }
    setCopied(token);
    window.setTimeout(() => setCopied(null), 1500);
  };

  const create = () =>
    startBusy(async () => {
      setError(null);
      const r = await createCollabLinkAction(slug);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      await load();
      copy(r.token);
    });

  const revoke = (id: string) =>
    startBusy(async () => {
      setError(null);
      const r = await revokeCollabLinkAction(slug, id);
      if (!r.ok) setError(r.error);
      await load();
    });

  return (
    <div>
      <p className="mt-1 text-xs text-ink/55">
        Para pasar la propiedad a otra empresa sin nada nuestro: sin logo, teléfono ni
        correo, solo «Empresa colaboradora» y la referencia. El enlace dura{" "}
        {COLLAB_LINK_TTL_DAYS} días y registra cada apertura (IP, navegador y procedencia).
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={create}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-4 py-2 text-xs font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Crear enlace en blanco
        </button>
        <a
          href={`/api/admin/properties/${slug}/pdf?blanco=1`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white px-4 py-2 text-xs font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink"
        >
          <FileDown size={13} />
          PDF sin marca
        </a>
      </div>

      {error && <p className="mt-2 text-xs text-rose-600">{error}</p>}

      {links && links.length > 0 && (
        <ul className="mt-4 space-y-2">
          {links.map((l) => {
            const st = statusOf(l);
            const live = !l.revokedAt && new Date(l.expiresAt) >= new Date();
            const bots = l.opens.filter((o) => o.isBot).length;
            return (
              <li key={l.id} className="rounded-lg border border-ink/10 bg-white">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                  <span className={cn("text-xs font-medium", st.tone)}>{st.label}</span>
                  <span className="text-xs text-ink/45">Creado {fmt(l.createdAt)}</span>
                  <span className="text-xs text-ink/70">
                    {l.openedCount} apertura{l.openedCount === 1 ? "" : "s"}
                    {l.lastOpenedAt ? ` · última ${fmt(l.lastOpenedAt)}` : ""}
                  </span>
                  <span className="ms-auto flex items-center gap-1">
                    {live && (
                      <button
                        type="button"
                        onClick={() => copy(l.token)}
                        className="inline-flex items-center gap-1 rounded-md border border-ink/15 px-2 py-1 text-xs text-ink/70 hover:text-ink"
                      >
                        {copied === l.token ? <Check size={12} /> : <Copy size={12} />}
                        {copied === l.token ? "Copiado" : "Copiar"}
                      </button>
                    )}
                    {live && (
                      <button
                        type="button"
                        onClick={() => revoke(l.id)}
                        disabled={busy}
                        className="inline-flex items-center gap-1 rounded-md border border-ink/15 px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                        Revocar
                      </button>
                    )}
                    {l.opens.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setOpen(open === l.id ? null : l.id)}
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink/60 hover:text-ink"
                      >
                        Aperturas
                        <ChevronDown size={12} className={cn(open === l.id && "rotate-180")} />
                      </button>
                    )}
                  </span>
                </div>
                {open === l.id && (
                  <div className="border-t border-ink/10 px-3 py-2">
                    <table className="w-full text-left text-xs text-ink/70">
                      <thead className="text-ink/40">
                        <tr>
                          <th className="py-1 pe-3 font-medium">Fecha</th>
                          <th className="py-1 pe-3 font-medium">IP</th>
                          <th className="py-1 pe-3 font-medium">Navegador</th>
                          <th className="py-1 font-medium">Procedencia</th>
                        </tr>
                      </thead>
                      <tbody>
                        {l.opens.map((o) => (
                          <tr key={o.id} className={cn("border-t border-ink/5", o.isBot && "text-ink/35")}>
                            <td className="py-1 pe-3 whitespace-nowrap">{fmt(o.openedAt)}</td>
                            <td className="py-1 pe-3 whitespace-nowrap">{o.ip ?? "—"}</td>
                            <td className="max-w-[260px] truncate py-1 pe-3" title={o.userAgent ?? ""}>
                              {o.isBot ? "Vista previa / robot · " : ""}
                              {o.userAgent ?? "—"}
                            </td>
                            <td className="max-w-[160px] truncate py-1" title={o.referer ?? ""}>
                              {o.referer ?? "directo"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {bots > 0 && (
                      <p className="mt-1 text-[11px] text-ink/40">
                        Las filas atenuadas son vistas previas de mensajería o robots: no cuentan como apertura.
                      </p>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
