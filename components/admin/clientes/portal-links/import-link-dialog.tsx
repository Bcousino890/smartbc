"use client";

// ============================================================================
// Importar por link, desde la ficha del cliente.
//
// Se pega UN enlace (Portal Inmobiliario, Idealista, Fotocasa…), el anuncio
// entra en la lista del cliente y se abre el importador ya vinculado a él.
// Al terminar, "Volver a la ficha del cliente" deja pegar el siguiente: pensado
// para ir agregando propiedades una tras otra.
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { addPortalLinkForImport } from "@/app/[country]/(admin)/admin/clientes/portal-links-actions";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { parsePortalUrl, portalLabel } from "@/lib/portal-links/portals";
import { Label } from "./portal-links-ui";

export function ImportLinkDialog({
  clientId,
  clientName,
  country,
  onClose,
}: {
  clientId: string;
  clientName: string;
  country: Country;
  onClose: () => void;
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const parsed = url.trim() ? parsePortalUrl(url.trim()) : null;

  const go = () => {
    setError(null);
    startTransition(async () => {
      const res = await addPortalLinkForImport(clientId, url.trim());
      if (!res.ok) {
        setError(res.error);
        return;
      }
      const prefix = getCountryConfig(country).prefix;
      router.push(
        `${prefix}/propiedades/importar` +
          `?url=${encodeURIComponent(url.trim())}` +
          `&linkId=${encodeURIComponent(res.linkId)}` +
          `&clienteId=${encodeURIComponent(clientId)}`,
      );
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl border border-gold/20 bg-cream-50 p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label tone="gold">Importar propiedad por link</Label>
            <p className="mt-1 font-sans text-xs text-ink/55">Para {clientName}. Pega el enlace del anuncio: lo leemos y te dejamos revisar los datos antes de crear la ficha.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="text-ink/45 hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <input
          autoFocus
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && parsed && !pending) go();
          }}
          placeholder="https://www.portalinmobiliario.com/MLC-..."
          disabled={pending}
          className="mt-4 w-full rounded-lg border border-ink/15 bg-white px-3 py-2.5 font-sans text-sm placeholder:text-ink/35 focus:border-gold/55 focus:outline-none"
        />
        {parsed && <p className="mt-1.5 font-sans text-xs text-ink/50">{portalLabel(parsed.portal)}{parsed.externalRef ? ` · ${parsed.externalRef}` : ""}</p>}
        {error && (
          <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 font-sans text-xs text-red-700">
            {error}
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-ink/15 px-3 py-2 font-sans text-xs font-medium text-ink/70">
            Cancelar
          </button>
          <button
            type="button"
            onClick={go}
            disabled={!parsed || pending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 font-sans text-xs font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
          >
            {pending && <Loader2 size={12} className="animate-spin" />}
            Importar
          </button>
        </div>
      </div>
    </div>
  );
}
