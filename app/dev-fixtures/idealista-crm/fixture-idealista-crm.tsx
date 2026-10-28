"use client";

// SOLO DESARROLLO LOCAL. Ver page.tsx.
import { IdealistaCrmSyncBadge, type CrmSyncState } from "@/components/admin/idealista-crm-sync-badge";

const base: CrmSyncState = {
  status: "synced", environment: "production", origin: "generated", propertySlug: "piso-luminoso-en-chamberi-x7k2m9q4wzab",
  smartlinkPath: "/compartir/bc0042-piso-luminoso-en-chamberi-x7k2m9q4wzab", reviewReason: null, candidates: [],
  lastError: null, lastErrorCode: null,
};
const ROWS: Array<{ title: string; state: CrmSyncState; apiId: boolean }> = [
  { title: "Ficha de referencia sincronizada", state: base, apiId: true },
  { title: "Propiedad existente (enlace explícito)", state: { ...base, origin: "existing", smartlinkPath: null, propertySlug: "piso-real-e1" }, apiId: true },
  { title: "Falta la etiqueta RESERVADO", state: { ...base, status: "failed", lastErrorCode: "tag_missing", lastError: "tag_missing", origin: null, propertySlug: null, smartlinkPath: null }, apiId: true },
  { title: "Copia de fotos sin tiempo", state: { ...base, status: "failed", lastErrorCode: "media_timeout", lastError: "Sin tiempo para copiar 12 archivo(s); reintenta." }, apiId: true },
  { title: "Coincide por URL de origen", state: { ...base, status: "needs_review", reviewReason: "source_url_match", origin: null, propertySlug: null, smartlinkPath: null,
      candidates: [{ id: "c1", slug: "piso-real-e1", title: "Piso real importado", bcReference: "BC-1501" }] }, apiId: true },
  { title: "Baja que no pedimos (calidad)", state: { ...base, status: "needs_review", reviewReason: "external_withdrawal_or_quality" }, apiId: true },
  { title: "Estado incierto en Idealista", state: { ...base, status: "uncertain" }, apiId: true },
  { title: "Alta incierta (sin id)", state: { ...base, status: "uncertain_create", origin: null, propertySlug: null, smartlinkPath: null }, apiId: false },
  { title: "Alta confirmada con el id sin guardar", state: { ...base, status: "pending", origin: null, propertySlug: null, smartlinkPath: null }, apiId: false },
  { title: "Sincronización apagada", state: { ...base, status: "disabled", origin: null, propertySlug: null, smartlinkPath: null }, apiId: true },
  { title: "Sandbox", state: { ...base, status: "sandbox", environment: "sandbox", origin: null, propertySlug: null, smartlinkPath: null }, apiId: true },
];

export function FixtureIdealistaCrm() {
  return (
    <div className="space-y-3">
      <h1 className="font-display text-2xl text-ink">Idealista → CRM · estados de la ficha</h1>
      {ROWS.map((r, i) => (
        <div key={i} className="rounded-xl border border-ink/10 bg-white/70 p-3 dark:bg-white/5">
          <p className="mb-2 text-sm font-medium text-ink/80">{r.title}</p>
          <IdealistaCrmSyncBadge
            listingId={`00000000-0000-4000-8000-${String(i).padStart(12, "0")}`}
            country="es"
            state={r.state}
            hasApiPropertyId={r.apiId}
            onCheck={() => alert("(fixture) Comprobar en Idealista")}
            onDone={() => {}}
            run={async () => ({ ok: true, message: "(fixture) hecho" })}
            portalOrigin="https://portal.bcousinoprop.com"
          />
        </div>
      ))}
    </div>
  );
}
