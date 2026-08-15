"use client";

import { useCallback, useEffect, useState } from "react";
import { Save, RotateCcw } from "lucide-react";
import type { IdealistaScraperConfig } from "@/lib/api/v1/idealista/config";

/**
 * Formulario de frecuencias del scraper.
 *
 * Lo que se guarda aquí lo lee el proveedor externo en
 * `GET /api/v1/idealista/config`: cambiar cada cuánto se refresca un particular
 * (o frenar el gasto a mitad de mes) no necesita que él despliegue nada.
 */

type FieldSpec = {
  key: keyof IdealistaScraperConfig;
  label: string;
  unit: string;
  hint?: string;
};

// Los campos de tiempo se guardan siempre en su unidad base (minutos u
// horas, según field.unit) porque así los espera el scraper — pero teclear
// "31–90 días" como 2160 horas es un embole. TIME_UNITS deja elegir la
// unidad cómoda (min/h/d) solo para mostrar y capturar; la conversión de
// vuelta a la unidad base pasa siempre por minutos como pivote.
type TimeUnit = "min" | "h" | "d";
const MINUTES_PER_UNIT: Record<TimeUnit, number> = { min: 1, h: 60, d: 1440 };
const TIME_UNIT_LABEL: Record<TimeUnit, string> = { min: "min", h: "h", d: "días" };

function isTimeField(unit: string): unit is TimeUnit {
  return unit === "min" || unit === "h";
}

const GROUPS: { title: string; description: string; fields: FieldSpec[] }[] = [
  {
    title: "Descubrimiento",
    description: "Cada cuánto se busca lo nuevo y cada cuánto se barre el mercado entero.",
    fields: [
      { key: "discovery_interval_minutes", label: "Intervalo de descubrimiento", unit: "min" },
      { key: "full_market_sweep_interval_hours", label: "Barrido completo del mercado", unit: "h" },
    ],
  },
  {
    title: "Refresco · Venta",
    description: "Un piso recién publicado cambia mucho más que uno que lleva meses.",
    fields: [
      { key: "sale_0_14_days_refresh_hours", label: "0–14 días", unit: "h" },
      { key: "sale_15_30_days_refresh_hours", label: "15–30 días", unit: "h" },
      { key: "sale_31_90_days_refresh_hours", label: "31–90 días", unit: "h" },
      { key: "sale_over_90_days_refresh_hours", label: "Más de 90 días", unit: "h" },
    ],
  },
  {
    title: "Refresco · Alquiler",
    description: "El alquiler se mueve mucho más rápido que la venta.",
    fields: [
      { key: "rent_0_7_days_refresh_hours", label: "0–7 días", unit: "h" },
      { key: "rent_8_30_days_refresh_hours", label: "8–30 días", unit: "h" },
      { key: "rent_over_30_days_refresh_hours", label: "Más de 30 días", unit: "h" },
    ],
  },
  {
    title: "Refresco · Particulares",
    description:
      "Son el objetivo comercial: cuanto antes se detecte uno nuevo, más margen hay para llamar antes que nadie.",
    fields: [
      { key: "private_first_72h_refresh_hours", label: "Primeras 72 h", unit: "h" },
      { key: "private_day_3_7_refresh_hours", label: "Días 3–7", unit: "h" },
    ],
  },
  {
    title: "Verificaciones",
    description: "Cuánto se espera antes de dar un anuncio por desaparecido o por retirado.",
    fields: [
      { key: "missing_verification_delay_hours", label: "Antes de marcar desaparecido", unit: "h" },
      { key: "off_market_confirmation_delay_hours", label: "Antes de confirmar retirada", unit: "h" },
    ],
  },
  {
    title: "Cuota y carga",
    description: "El techo de gasto del mes y el ritmo máximo al que puede trabajar el scraper.",
    fields: [
      { key: "monthly_request_budget", label: "Presupuesto mensual", unit: "peticiones" },
      {
        key: "monthly_request_reserve",
        label: "Reserva",
        unit: "peticiones",
        hint: "Colchón que no se toca salvo emergencia",
      },
      { key: "max_batch_size", label: "Tamaño máximo de lote", unit: "anuncios" },
      { key: "max_concurrency", label: "Concurrencia máxima", unit: "hilos" },
      { key: "requests_per_minute", label: "Peticiones por minuto", unit: "req/min" },
    ],
  },
  {
    title: "Vigilancia",
    description: "Cuándo el panel considera que el scraper ha dejado de dar señales.",
    fields: [
      {
        key: "heartbeat_stale_minutes",
        label: "Sin heartbeat pasa a «sin señal»",
        unit: "min",
      },
    ],
  },
];

const inputCls =
  "w-full rounded-xl border border-ink/10 bg-cream-50 px-3 py-2 text-sm text-ink outline-none transition focus:border-gold/50";

export function ScraperConfigForm({ initial }: { initial: IdealistaScraperConfig }) {
  const [config, setConfig] = useState<IdealistaScraperConfig>(initial);
  const [draft, setDraft] = useState<Record<string, string | boolean>>(() => toDraft(initial));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  // Unidad que se está mostrando ahora mismo para cada campo de tiempo —
  // puramente de UI, el valor guardado (draft/config) sigue en la unidad
  // base. Arranca en la unidad base de cada campo (min o h).
  const [timeUnits, setTimeUnits] = useState<Record<string, TimeUnit>>(() => {
    const u: Record<string, TimeUnit> = {};
    for (const group of GROUPS) {
      for (const f of group.fields) if (isTimeField(f.unit)) u[f.key] = f.unit;
    }
    return u;
  });

  function toDraft(c: IdealistaScraperConfig): Record<string, string | boolean> {
    const d: Record<string, string | boolean> = { scraping_enabled: c.scraping_enabled };
    for (const group of GROUPS) {
      for (const f of group.fields) d[f.key] = String(c[f.key] ?? "");
    }
    d.notes = c.notes ?? "";
    return d;
  }

  useEffect(() => {
    setDraft(toDraft(config));
  }, [config]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(toDraft(config));

  const save = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const payload: Record<string, unknown> = { scraping_enabled: draft.scraping_enabled };
      for (const group of GROUPS) {
        for (const f of group.fields) payload[f.key] = Number(draft[f.key]);
      }
      payload.notes = draft.notes || null;

      const res = await fetch("/api/admin/idealista/scraper/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo guardar");

      setConfig(data.config as IdealistaScraperConfig);
      setMessage({
        kind: "ok",
        text: `Guardado. El scraper aplicará estos valores en su siguiente consulta (versión ${data.config.version}).`,
      });
    } catch (err) {
      setMessage({ kind: "error", text: err instanceof Error ? err.message : "Error al guardar" });
    } finally {
      setSaving(false);
    }
  }, [draft]);

  return (
    <div className="space-y-5">
      {/* Interruptor general */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-ink/10 bg-cream-50/70 p-5">
        <div>
          <div className="font-serif text-base font-semibold text-ink">Scraping activo</div>
          <p className="mt-0.5 text-sm text-ink/60">
            Al desactivarlo, el scraper para en su siguiente consulta. No se pierde nada de lo ya
            capturado.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={draft.scraping_enabled === true}
          onClick={() => setDraft((d) => ({ ...d, scraping_enabled: !d.scraping_enabled }))}
          className={`relative h-7 w-12 shrink-0 rounded-full transition ${
            draft.scraping_enabled ? "bg-emerald-500" : "bg-ink/25"
          }`}
        >
          <span
            className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${
              draft.scraping_enabled ? "left-6" : "left-1"
            }`}
          />
        </button>
      </div>

      {GROUPS.map((group) => (
        <div key={group.title} className="rounded-2xl border border-ink/10 bg-cream-50/70 p-5">
          <h3 className="font-serif text-base font-semibold text-ink">{group.title}</h3>
          <p className="mt-0.5 mb-4 text-sm text-ink/60">{group.description}</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {group.fields.map((field) => {
              if (!isTimeField(field.unit)) {
                return (
                  <label key={field.key} className="block">
                    <span className="mb-1 block text-xs font-medium text-ink/70">{field.label}</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={0}
                        value={String(draft[field.key] ?? "")}
                        onChange={(e) => setDraft((d) => ({ ...d, [field.key]: e.target.value }))}
                        className={inputCls}
                      />
                      <span className="shrink-0 text-xs text-ink/50">{field.unit}</span>
                    </div>
                    {field.hint ? (
                      <span className="mt-1 block text-[11px] text-ink/45">{field.hint}</span>
                    ) : null}
                  </label>
                );
              }

              const baseUnit = field.unit as TimeUnit;
              const chosenUnit = timeUnits[field.key] ?? baseUnit;
              const baseValue = Number(draft[field.key] ?? 0);
              const displayValue =
                (baseValue * MINUTES_PER_UNIT[baseUnit]) / MINUTES_PER_UNIT[chosenUnit];
              // Redondea a 2 decimales para que no aparezcan colas de coma
              // flotante (p.ej. 168h / 1440 = 0.11666...6 días).
              const displayRounded = Math.round(displayValue * 100) / 100;

              return (
                <label key={field.key} className="block">
                  <span className="mb-1 block text-xs font-medium text-ink/70">{field.label}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={String(displayRounded)}
                      onChange={(e) => {
                        const entered = Number(e.target.value);
                        if (!Number.isFinite(entered)) return;
                        const newBase = Math.round(
                          (entered * MINUTES_PER_UNIT[chosenUnit]) / MINUTES_PER_UNIT[baseUnit],
                        );
                        setDraft((d) => ({ ...d, [field.key]: String(Math.max(0, newBase)) }));
                      }}
                      className={inputCls}
                    />
                    <select
                      value={chosenUnit}
                      onChange={(e) =>
                        setTimeUnits((u) => ({ ...u, [field.key]: e.target.value as TimeUnit }))
                      }
                      className="shrink-0 rounded-xl border border-ink/10 bg-cream-50 px-2 py-2 text-xs text-ink/70 outline-none focus:border-gold/50"
                    >
                      {(["min", "h", "d"] as TimeUnit[]).map((u) => (
                        <option key={u} value={u}>
                          {TIME_UNIT_LABEL[u]}
                        </option>
                      ))}
                    </select>
                  </div>
                  {field.hint ? (
                    <span className="mt-1 block text-[11px] text-ink/45">{field.hint}</span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </div>
      ))}

      <div className="rounded-2xl border border-ink/10 bg-cream-50/70 p-5">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink/70">
            Notas para el proveedor
          </span>
          <textarea
            rows={3}
            value={String(draft.notes ?? "")}
            onChange={(e) => setDraft((d) => ({ ...d, notes: e.target.value }))}
            placeholder="Se devuelven en GET /api/v1/idealista/config — útil para avisos puntuales."
            className={inputCls}
          />
        </label>
      </div>

      {message ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.kind === "ok"
              ? "border-emerald-200 bg-emerald-50 text-emerald-800"
              : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={() => void save()}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Save size={16} />
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
        {dirty ? (
          <button
            onClick={() => setDraft(toDraft(config))}
            className="inline-flex items-center gap-2 rounded-xl border border-ink/15 px-4 py-2.5 text-sm text-ink/70 transition hover:bg-ink/5"
          >
            <RotateCcw size={15} />
            Descartar
          </button>
        ) : null}
        <span className="text-xs text-ink/45">
          Versión {config.version} · el scraper la compara para saber si debe releer
        </span>
      </div>
    </div>
  );
}
