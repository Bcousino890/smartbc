"use client";

// SOLO DESARROLLO LOCAL. Ver page.tsx.
import { IdealistaCrmSyncBadge, type CrmSyncState } from "@/components/admin/idealista-crm-sync-badge";
import { REFERENCE_ONLY_MESSAGE } from "@/lib/properties/reference-only";
import { CrmSyncSwitchSection } from "@/app/[country]/(admin)/admin/idealista/configuracion/crm-sync-switch-section";
import type { SwitchStatus } from "@/lib/services/idealista/crm-sync/switch";

const GREEN = Array.from({ length: 112 }, (_, i) => ({ check: `comprobación sintética ${i + 1}`, expected: "x", found: "x", ok: true }));
function fakeSwitch(missingTag: boolean) {
  let enabled = false;
  const status = (): SwitchStatus => {
    const checks = missingTag
      ? [{ check: "una sola «RESERVADO» en es", expected: "1", found: "0", ok: false }, ...GREEN]
      : GREEN;
    return { available: true, enabled, checks, allOk: checks.every((c) => c.ok),
      lastChange: enabled ? { enabled: true, at: "2026-10-29T10:00:00Z", by: "Fabricio (fixture)" } : null };
  };
  return {
    load: async () => status(),
    save: async (next: boolean) => {
      if (next && missingTag) return { ok: false, failing: ["una sola «RESERVADO» en es"], error: "checks_failing" };
      enabled = next;
      return { ok: true, enabled };
    },
  };
}
const SWITCH_MISSING = fakeSwitch(true);
const SWITCH_OK = fakeSwitch(false);

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
  { title: "En contención (antes de una vuelta atrás del código)", state: { ...base, status: "needs_review", reviewReason: "contained" }, apiId: true },
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
      <h2 className="pt-4 font-display text-xl text-ink">Configuración → Idealista · interruptor</h2>
      <div data-fixture="switch-missing"><CrmSyncSwitchSection load={SWITCH_MISSING.load} save={SWITCH_MISSING.save} /></div>
      <div data-fixture="switch-ok"><CrmSyncSwitchSection load={SWITCH_OK.load} save={SWITCH_OK.save} /></div>
      <div className="rounded-xl border border-ink/10 bg-white/70 p-3 dark:bg-white/5">
        <p className="mb-2 text-sm font-medium text-ink/80">Mensaje al personal al intentar añadir una ficha de referencia a un catálogo o colección</p>
        <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{REFERENCE_ONLY_MESSAGE}</p>
      </div>
    </div>
  );
}
