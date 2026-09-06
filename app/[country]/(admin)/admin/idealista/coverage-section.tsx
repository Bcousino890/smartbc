// ============================================================================
// COBERTURA — ¿está llegando todo al CRM?
// ============================================================================
//
// Server Component: no hay estado ni interacción, solo hechos. Lo que hasta
// ahora era una sospecha ("me consta que contactaron y no me aparecen") aquí
// tiene número y nombre.
//
// El orden responde a cómo se investiga de verdad: primero si la CAPTURA está
// trayéndolo todo (si ahí se pierde, lo demás no importa), después qué leads
// llegaron pero no encontraron su ficha, después qué fichas están mal marcadas
// —que es la causa más común de lo anterior— y al final qué anuncios no
// reciben nada.
// ============================================================================

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Inbox, TriangleAlert } from "lucide-react";
import type { IdealistaCoverage } from "@/lib/db/queries/idealista-coverage";
import type { Country } from "@/lib/country-config";
import { getCountryConfig } from "@/lib/country-config";

function Stat({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: "neutral" | "warning" | "good";
}) {
  const color =
    tone === "warning" ? "text-amber-700" : tone === "good" ? "text-emerald-700" : "text-ink";
  return (
    <div className="rounded-lg border border-ink/10 bg-white/70 px-3 py-2.5">
      <p className="text-xs text-ink/50">{label}</p>
      <p className={`mt-0.5 text-xl font-semibold tabular-nums ${color}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs leading-snug text-ink/45">{hint}</p>}
    </div>
  );
}

function Block({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-5">
      <h4 className="text-sm font-semibold text-ink">{title}</h4>
      {note && <p className="mt-0.5 text-xs leading-relaxed text-ink/50">{note}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

export function CoverageSection({
  coverage,
  country,
}: {
  coverage: IdealistaCoverage;
  country: Country;
}) {
  const { totals, byOperation, silentListings, suspiciousListings, orphanLeads, lastRun } = coverage;
  const config = getCountryConfig(country);
  const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("es-ES"));

  return (
    <div className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <div className="mb-1 flex items-center gap-2">
        <Inbox size={20} className="text-gold" />
        <h2 className="crm-section-title text-ink">Cobertura de contactos</h2>
      </div>
      <p className="mb-5 text-sm text-ink/60">
        Si un contacto escribe por Idealista y no aparece en Solicitudes, la respuesta está
        aquí: o no llegó a capturarse, o llegó y no encontró su ficha.
      </p>

      {/* ── 1 · La captura ── */}
      <Block
        title="El último recorrido de la extensión"
        note='"Capturar todas" cuenta ahora las conversaciones que el CRM CONFIRMÓ, no las que visitó. Antes sumaba igual aunque el envío fallara, así que el cartel podía decir 150 habiendo llegado 90.'
      >
        {!lastRun ? (
          <p className="rounded-lg border border-dashed border-ink/15 px-3 py-3 text-xs text-ink/50">
            Todavía no se ha guardado ningún recorrido. El próximo &laquo;Capturar todas&raquo; desde
            el inbox de Idealista dejará aquí su parte.
          </p>
        ) : (
          <div className="flex flex-wrap items-start gap-3">
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Enviadas y confirmadas" value={lastRun.sent} tone="good" />
              <Stat
                label="Se quedaron fuera"
                value={lastRun.failed}
                tone={lastRun.failed > 0 ? "warning" : "neutral"}
              />
              <Stat
                label="Cuándo"
                value={new Date(lastRun.finishedAt).toLocaleDateString(config.locale, {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              />
            </div>
            <div className="min-w-[220px] flex-1 rounded-lg border border-ink/10 bg-white/70 px-3 py-2.5">
              <p className="flex items-center gap-1.5 text-xs font-medium text-ink/70">
                {lastRun.failed > 0 ? (
                  <TriangleAlert size={13} className="text-amber-600" />
                ) : (
                  <CheckCircle2 size={13} className="text-emerald-600" />
                )}
                Paró por: {lastRun.stopReason ?? "—"}
              </p>
              {lastRun.failedIds.length > 0 && (
                <p className="mt-1.5 break-words text-xs text-ink/50">
                  Sin enviar:{" "}
                  {lastRun.failedIds.slice(0, 10).map((id, i) => (
                    <span key={id}>
                      {i > 0 && ", "}
                      <a
                        href={`https://www.idealista.com/inbox/${
                          id.startsWith("call_") ? `CALL_${id.slice(5)}` : `CONVERSATION_${id}`
                        }`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-ink/25 hover:text-ink"
                      >
                        {id}
                      </a>
                    </span>
                  ))}
                  {lastRun.failedIds.length > 10 && ` y ${lastRun.failedIds.length - 10} más`}
                  . Ábrelas y vuelve a capturarlas.
                </p>
              )}
            </div>
          </div>
        )}
      </Block>

      {/* ── 2 · El emparejamiento ── */}
      <Block
        title="Contactos que llegaron pero no encontraron ficha"
        note="Huérfano es el que no tiene NI ficha propia NI anuncio de Idealista. La bandeja los contaba solo por ficha propia, y por eso el número parecía mucho peor de lo que es."
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Contactos" value={totals.leads} />
          <Stat label="Con ficha propia" value={totals.withProperty} />
          <Stat label="Con anuncio de Idealista" value={totals.withListing} />
          <Stat
            label="Huérfanos de verdad"
            value={totals.orphans}
            tone={totals.orphans > 0 ? "warning" : "good"}
            hint={
              totals.lookedOrphan > totals.orphans
                ? `${totals.lookedOrphan} lo parecían mirando solo la ficha propia`
                : undefined
            }
          />
        </div>

        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Venta" value={byOperation.sale} />
          <Stat label="Alquiler" value={byOperation.rent} />
          <Stat label="Venta y alquiler" value={byOperation.mixed} />
          <Stat
            label="Sin determinar"
            value={byOperation.unknown}
            hint="el precio del anuncio no dice de qué operación se habla"
          />
        </div>

        {orphanLeads.length > 0 && (
          <ul className="mt-3 divide-y divide-ink/8 overflow-hidden rounded-lg border border-ink/10 bg-white/70">
            {orphanLeads.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span className="w-32 shrink-0 truncate font-medium text-ink/80">
                  {l.name || "Sin nombre"}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink/55">{l.title ?? "—"}</span>
                <span className="shrink-0 tabular-nums text-ink/45">{l.price ?? "—"}</span>
                <Link
                  href={`${config.prefix}/solicitudes?view=all&lead=${l.id}`}
                  className="shrink-0 rounded border border-ink/12 px-2 py-0.5 font-medium text-ink/60 transition hover:border-gold/50 hover:text-ink"
                >
                  Emparejar
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Block>

      {/* ── 3 · La causa más común ── */}
      {suspiciousListings.length > 0 && (
        <Block
          title="Fichas con la operación mal marcada"
          note="Están como ALQUILER pero no tienen precio de alquiler y sí de venta: nadie dijo que fueran de alquiler, se quedaron con el valor por defecto. Al emparejar por dirección aportan un precio 0, así que sus contactos de venta se quedan huérfanos. Corrígelas en la ficha y vuelve a lanzar el emparejamiento."
        >
          <ul className="divide-y divide-ink/8 overflow-hidden rounded-lg border border-amber-300/50 bg-amber-50/40">
            {suspiciousListings.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <AlertTriangle size={13} className="shrink-0 text-amber-600" />
                <span className="w-24 shrink-0 truncate font-medium text-ink/80">
                  {l.reference ?? "—"}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink/55">{l.title ?? "—"}</span>
                <span className="shrink-0 tabular-nums text-ink/60">{fmt(l.price)} €</span>
                <span className="w-20 shrink-0 text-end text-ink/45">
                  {l.leads} contacto{l.leads === 1 ? "" : "s"}
                </span>
              </li>
            ))}
          </ul>
        </Block>
      )}

      {/* ── 4 · Rendimiento ── */}
      <Block
        title="Anuncios que no han recibido ni un contacto"
        note="Antes de retirar uno, comprueba arriba que no sea de los que tienen la operación mal marcada: esos reciben contactos que no se le atribuyen a nadie."
      >
        {silentListings.length === 0 ? (
          <p className="rounded-lg border border-dashed border-ink/15 px-3 py-3 text-xs text-ink/50">
            Todos los anuncios vivos han recibido al menos un contacto.
          </p>
        ) : (
          <ul className="divide-y divide-ink/8 overflow-hidden rounded-lg border border-ink/10 bg-white/70">
            {silentListings.map((l) => (
              <li key={l.id} className="flex items-center gap-3 px-3 py-2 text-xs">
                <span className="w-24 shrink-0 truncate font-medium text-ink/80">
                  {l.reference ?? "—"}
                </span>
                <span className="min-w-0 flex-1 truncate text-ink/55">{l.title ?? "—"}</span>
                <span className="w-20 shrink-0 text-ink/45">
                  {l.operation === "rent" ? "Alquiler" : "Venta"}
                </span>
                <span className="shrink-0 tabular-nums text-ink/60">{fmt(l.price)} €</span>
              </li>
            ))}
          </ul>
        )}
      </Block>
    </div>
  );
}
