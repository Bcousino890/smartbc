"use client";

import { History, Loader2, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

type Offer = {
  available: boolean;
  agency_name?: string | null;
  domain?: string;
  web_url?: string;
  photos: string[];
  current: Array<{ url: string; is_cover: boolean }>;
  backup: { batch_id: string; count: number; at: string } | null;
};

const fmtDate = (iso: string) => new Date(iso).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/**
 * «Reemplazar por fotos sin marca de agua (web de <agencia>)»: solo aparece si la propiedad tiene una web de agencia
 * Mobilia ya leída y verificada. Pide confirmación con antes/después y deja las fotos actuales como copia recuperable.
 */
export function PropertyPhotosFromWeb({
  slug,
  onChanged,
}: {
  slug: string;
  /** Galería ya cambiada (para refrescar el diálogo sin cerrarlo). */
  onChanged: (photos: Array<{ url: string; isCover: boolean }>) => void;
}) {
  const router = useRouter();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<"apply" | "restore" | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/properties/${encodeURIComponent(slug)}/photos-from-web`, { cache: "no-store" });
      if (res.ok) setOffer((await res.json()) as Offer);
    } catch {
      /* sin conexión: no se ofrece nada */
    }
  }, [slug]);
  useEffect(() => {
    load();
  }, [load]);

  const run = async (mode: "apply" | "restore") => {
    setBusy(mode);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/properties/${encodeURIComponent(slug)}/photos-from-web`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; count?: number; error?: string };
      if (!res.ok || !j.ok) {
        setMsg({ ok: false, text: j.error ?? "No se pudo completar el cambio." });
      } else {
        setMsg({ ok: true, text: mode === "apply" ? `${j.count} fotos sin marca de agua puestas. Las anteriores quedan como copia recuperable.` : `${j.count} fotos anteriores restauradas.` });
        setConfirming(false);
        const fresh = await fetch(`/api/admin/properties/${encodeURIComponent(slug)}/photos-from-web`, { cache: "no-store" }).then((r) => r.json() as Promise<Offer>);
        setOffer(fresh);
        onChanged(fresh.current.map((p) => ({ url: p.url, isCover: p.is_cover })));
        router.refresh();
      }
    } catch {
      setMsg({ ok: false, text: "Sin conexión con el servidor." });
    } finally {
      setBusy(null);
    }
  };

  if (!offer || (!offer.available && !offer.backup)) return null;
  const who = offer.agency_name?.trim() || offer.domain || "la agencia";

  return (
    <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50/50 p-3">
      {offer.available && !confirming && (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          disabled={busy !== null}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-teal-300 bg-white px-3 text-sm font-semibold text-teal-900 hover:bg-teal-50 disabled:opacity-50"
        >
          <ShieldCheck size={16} aria-hidden /> Reemplazar por fotos sin marca de agua (web de {who})
        </button>
      )}
      {offer.available && confirming && (
        <div>
          <p className="text-sm font-semibold text-ink">
            Se sustituirán las {offer.current.length} fotos actuales por las {offer.photos.length} originales de la web de {who}, sin marca de agua.
          </p>
          <p className="mt-0.5 text-xs text-ink/65">El orden y la portada pasan a ser los de la web (la primera foto es la portada). Las fotos actuales se guardan como copia y se pueden restaurar.</p>
          <div className="mt-2 grid gap-3 sm:grid-cols-2">
            {([
              ["Antes (con marca)", offer.current.map((p) => p.url), offer.current.length],
              ["Después (sin marca)", offer.photos, offer.photos.length],
            ] as const).map(([label, urls, n]) => (
              <div key={label}>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink/60">
                  {label} · {n}
                </p>
                <div className="grid grid-cols-3 gap-1">
                  {urls.slice(0, 6).map((u) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={u} src={u} alt="" loading="lazy" className="aspect-[4/3] w-full rounded-md object-cover" />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => run("apply")}
              disabled={busy !== null}
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-ink px-3 text-sm font-semibold text-cream-50 hover:opacity-90 disabled:opacity-50"
            >
              {busy === "apply" && <Loader2 size={14} className="animate-spin" />} Sí, reemplazar {offer.photos.length} fotos
            </button>
            <button type="button" onClick={() => setConfirming(false)} disabled={busy !== null} className="min-h-10 rounded-lg border border-ink/20 px-3 text-sm font-medium text-ink/80">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {offer.backup && !confirming && (
        <button
          type="button"
          onClick={() => run("restore")}
          disabled={busy !== null}
          className={cn("inline-flex min-h-9 items-center gap-2 rounded-lg px-2 text-xs font-medium text-ink/75 hover:underline disabled:opacity-50", offer.available && "ml-2")}
        >
          {busy === "restore" ? <Loader2 size={12} className="animate-spin" /> : <History size={12} aria-hidden />} Restaurar las {offer.backup.count} fotos anteriores ({fmtDate(offer.backup.at)})
        </button>
      )}
      {msg && <p className={cn("mt-2 text-xs font-medium", msg.ok ? "text-teal-800" : "text-red-700")}>{msg.text}</p>}
    </div>
  );
}
