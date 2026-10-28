"use client";

// Estado de la ficha del CRM asociada a un anuncio publicado por la API de
// Idealista (docs/changes/2026-10-28-idealista-api-crm-sync/). Nada de esto
// llama a Idealista para escribir: «Reintentar», «Revisar» y «Recuperar id»
// van a /api/admin/idealista/crm-sync; «Comprobar en Idealista» es la lectura
// de solo consulta que ya existía (refresh-state).
import { useState } from "react";
import { Check, Copy, ExternalLink, Loader2, RefreshCw, Search } from "lucide-react";

export interface CrmSyncCandidate {
  id: string;
  slug: string;
  title: string;
  bcReference: string | null;
}

export interface CrmSyncState {
  status: string;
  environment: "sandbox" | "production";
  origin: "generated" | "existing" | null;
  propertySlug: string | null;
  smartlinkPath: string | null;
  reviewReason: string | null;
  candidates: CrmSyncCandidate[];
  lastError: string | null;
  lastErrorCode: string | null;
}

export type CrmSyncAction =
  | { action: "retry" }
  | { action: "recover_api_id" }
  | { action: "release_containment" }
  | { action: "resolve_review"; choice: "use_existing" | "generate"; propertyId?: string };

const REVIEW_REASON: Record<string, string> = {
  source_url_match: "coincide con una propiedad existente por su URL de origen",
  property_deleted: "la propiedad asociada se borró",
  explicit_link_changed: "la ficha apunta ahora a otra propiedad",
  manual_status: "la ficha de referencia cambió de estado a mano",
  external_withdrawal_or_quality: "Idealista la dio de baja sin que lo pidiéramos (calidad, caducidad…)",
  contained: "en contención (archivada antes de una vuelta atrás del código)",
};

async function postCrmSync(listingId: string, body: CrmSyncAction): Promise<{ ok: boolean; message: string }> {
  try {
    const res = await fetch("/api/admin/idealista/crm-sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listingId, ...body }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
    return { ok: !!data.ok, message: data.message ?? data.error ?? (res.ok ? "Hecho" : "No se pudo completar") };
  } catch {
    return { ok: false, message: "Error de red" };
  }
}

export function IdealistaCrmSyncBadge({
  listingId,
  country,
  state,
  hasApiPropertyId,
  onCheck,
  onDone,
  run = postCrmSync,
  portalOrigin,
}: {
  listingId: string;
  country: string;
  state: CrmSyncState | null;
  hasApiPropertyId: boolean;
  /** Lectura de solo consulta en Idealista (refresh-state). */
  onCheck: () => void;
  onDone: () => void;
  /** Inyectable para /dev-fixtures. */
  run?: (listingId: string, body: CrmSyncAction) => Promise<{ ok: boolean; message: string }>;
  portalOrigin?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  if (!state && hasApiPropertyId) return null; // anuncio anterior a la sincronización (D10)
  if (!state) return null;

  const act = async (body: CrmSyncAction) => {
    setBusy(true);
    const r = await run(listingId, body);
    setNote(r);
    setBusy(false);
    if (r.ok) onDone();
  };

  const adminHref = state.propertySlug ? `/${country}/admin/propiedades/${state.propertySlug}` : null;
  const smartlink = state.smartlinkPath ? `${portalOrigin ?? ""}${state.smartlinkPath}` : null;
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium";
  const button =
    "inline-flex items-center gap-1 rounded-md border border-ink/15 bg-white/60 px-2 py-0.5 text-xs font-semibold text-ink/70 transition hover:bg-ink/5 disabled:opacity-50 dark:bg-transparent";

  let label: React.ReactNode;
  let tone = "bg-ink/5 text-ink/60";
  const actions: React.ReactNode[] = [];

  switch (state.status) {
    case "synced":
      tone = "bg-emerald-100 text-emerald-700";
      label = state.origin === "generated" ? "CRM: ficha de referencia · RESERVADO" : "CRM: propiedad existente · RESERVADO";
      break;
    case "failed":
      tone = "bg-red-100 text-red-600";
      label =
        state.lastErrorCode === "tag_missing"
          ? "CRM: falta la etiqueta «RESERVADO» de este país — no se ha creado nada; créala y reintenta"
          : `CRM: falló${state.lastError ? ` — ${state.lastError}` : ""}`;
      actions.push(
        <button key="retry" className={button} disabled={busy} onClick={() => act({ action: "retry" })}>
          <RefreshCw size={11} /> Reintentar
        </button>,
      );
      break;
    case "needs_review":
      tone = "bg-amber-100 text-amber-700";
      label = `CRM: revisar — ${REVIEW_REASON[state.reviewReason ?? ""] ?? state.reviewReason ?? "hace falta una decisión"}`;
      if (state.reviewReason === "source_url_match") {
        for (const c of state.candidates) {
          actions.push(
            <button key={c.id} className={button} disabled={busy}
              onClick={() => act({ action: "resolve_review", choice: "use_existing", propertyId: c.id })}
              title={`Usar ${c.bcReference ?? ""} ${c.title} como propiedad existente (solo se le añade la etiqueta)`}>
              Usar {c.bcReference ?? c.title}
            </button>,
          );
        }
        actions.push(
          <button key="gen" className={button} disabled={busy} onClick={() => act({ action: "resolve_review", choice: "generate" })}>
            Crear ficha de referencia
          </button>,
        );
      } else if (state.reviewReason === "contained") {
        actions.push(
          <button key="release" className={button} disabled={busy} onClick={() => act({ action: "release_containment" })}
            title="Solo se libera si el último estado del anuncio es «publicado», es cierto y ya está aplicado">
            <RefreshCw size={11} /> Liberar contención
          </button>,
        );
      } else {
        actions.push(
          <button key="retry" className={button} disabled={busy} onClick={() => act({ action: "retry" })}>
            <RefreshCw size={11} /> Volver a mirar
          </button>,
        );
      }
      break;
    case "uncertain":
      tone = "bg-amber-100 text-amber-700";
      label = "CRM: estado incierto en Idealista — no se toca el CRM hasta comprobarlo";
      actions.push(
        <button key="check" className={button} disabled={busy} onClick={onCheck} title="Lectura de solo consulta en Idealista (no cambia el anuncio)">
          <Search size={11} /> Comprobar en Idealista
        </button>,
      );
      break;
    case "uncertain_create":
      tone = "bg-amber-100 text-amber-700";
      label = "CRM: alta incierta — usa «Reconciliar anuncios» en Configuración → Idealista; no vuelvas a publicar";
      break;
    case "disabled":
      label = "CRM: sincronización apagada (la operación queda registrada)";
      break;
    case "sandbox":
      label = "CRM: sandbox — no se sincroniza";
      break;
    case "stale":
    case "pending":
    default:
      label = "CRM: pendiente";
      actions.push(
        <button key="retry" className={button} disabled={busy} onClick={() => act({ action: "retry" })}>
          <RefreshCw size={11} /> Sincronizar
        </button>,
      );
  }

  if (!hasApiPropertyId && state.status !== "uncertain_create") {
    actions.push(
      <button key="recover" className={button} disabled={busy} onClick={() => act({ action: "recover_api_id" })}
        title="Copia a la ficha el id de un alta que Idealista ya confirmó (no llama a Idealista)">
        Recuperar id
      </button>,
    );
  }
  if (smartlink && state.origin === "generated") {
    actions.push(
      <button key="copy" className={button}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(smartlink);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* sin portapapeles: el enlace sigue visible en el título */
          }
        }}
        title={smartlink}>
        {copied ? <Check size={11} /> : <Copy size={11} />} {copied ? "Copiado" : "Copiar SmartLink"}
      </button>,
    );
  }
  if (adminHref) {
    actions.push(
      <a key="admin" className={button} href={adminHref} title="Abrir la ficha en el CRM (personal)">
        <ExternalLink size={11} /> Ficha CRM
      </a>,
    );
  }

  return (
    <span className="flex min-w-0 max-w-full flex-wrap items-center gap-1.5" data-crm-sync-status={state.status}>
      <span className={`${base} ${tone} min-w-0 max-w-full whitespace-normal break-words rounded-xl sm:max-w-[40rem]`} title={typeof label === "string" ? label : undefined}>
        {busy ? <Loader2 size={11} className="animate-spin" /> : null}
        {label}
      </span>
      {actions}
      {note && (
        <span className={`${base} ${note.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>{note.message}</span>
      )}
    </span>
  );
}
