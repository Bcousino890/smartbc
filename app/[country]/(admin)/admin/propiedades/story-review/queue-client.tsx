"use client";

// SmartLink 2.0 · Cola de enriquecimiento — lista compacta con filtros.
// Herramienta interna: filas legibles, botones obvios, sin UI experimental.

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Camera, FileText, Layers, ShieldAlert } from "lucide-react";
import { Panel, Pill, TextInput } from "@/components/admin/ui/primitives";
import { QUEUE_BUCKETS, type QueueBucket } from "@/lib/services/story/gate";
import type { QueueCounters, QueueRow } from "@/lib/db/queries/story-review";

const BUCKET_ORDER: Array<QueueBucket | "all"> = ["short", "conflict", "chapters", "photos", "other", "all"];

const BUCKET_ICON: Record<string, React.ReactNode> = {
  short: <FileText size={13} />,
  conflict: <ShieldAlert size={13} />,
  chapters: <Layers size={13} />,
  photos: <Camera size={13} />,
};

export function QueueClient({
  country,
  rows,
  counters,
  initialBucket,
}: {
  country: string;
  rows: QueueRow[];
  counters: QueueCounters;
  initialBucket: string;
}) {
  const [bucket, setBucket] = useState<QueueBucket | "all">(
    (BUCKET_ORDER.includes(initialBucket as QueueBucket) ? initialBucket : "short") as QueueBucket | "all",
  );
  const [q, setQ] = useState("");
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [op, setOp] = useState<"all" | "sale" | "rent">("all");
  const [zone, setZone] = useState("all");

  const zones = useMemo(
    () => [...new Set(rows.map((r) => r.zone))].sort((a, b) => a.localeCompare(b, "es")),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (bucket !== "all" && !r.buckets.includes(bucket)) return false;
      if (onlyAvailable && !r.available) return false;
      if (op !== "all" && r.operation !== op) return false;
      if (zone !== "all" && r.zone !== zone) return false;
      if (needle && !`${r.ref} ${r.title} ${r.zone}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, bucket, onlyAvailable, op, zone, q]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="crm-label-sm text-gold">Catálogo</p>
          <h1 className="crm-page-title mt-1 text-ink">Enriquecimiento de stories</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/55">
            Propiedades con story en borrador que aún no supera el quality gate.
            Los contadores se calculan en cada carga desde producción.
          </p>
        </div>
        <Link
          href={`/${country}/admin/propiedades`}
          className="text-sm text-ink/55 hover:text-ink"
        >
          ← Volver a propiedades
        </Link>
      </header>

      {/* Contadores por bucket = filtros */}
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-6">
        {BUCKET_ORDER.map((b) => {
          const isAll = b === "all";
          const count = isAll ? counters.total : counters[b as QueueBucket];
          const label = isAll ? "Todas pendientes" : QUEUE_BUCKETS[b as QueueBucket].label;
          const active = bucket === b;
          return (
            <button
              key={b}
              type="button"
              onClick={() => setBucket(b)}
              className={`rounded-lg border px-3 py-3 text-left transition ${
                active
                  ? "border-gold bg-gold/10"
                  : "border-ink/10 bg-white hover:border-gold/40"
              }`}
            >
              <span className="crm-label-sm flex items-center gap-1.5 text-ink/55">
                {BUCKET_ICON[b as string]}
                {label}
              </span>
              <span className="crm-number mt-1 block text-2xl text-ink">{count}</span>
            </button>
          );
        })}
      </div>

      {/* Filtros secundarios */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <TextInput
          placeholder="Buscar por referencia, título o barrio…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={op}
          onChange={(e) => setOp(e.target.value as typeof op)}
          className="crm-input rounded-md border border-ink/15 bg-white px-2.5 py-1.5 text-ink"
        >
          <option value="all">Venta y alquiler</option>
          <option value="sale">Solo venta</option>
          <option value="rent">Solo alquiler</option>
        </select>
        <select
          value={zone}
          onChange={(e) => setZone(e.target.value)}
          className="crm-input rounded-md border border-ink/15 bg-white px-2.5 py-1.5 text-ink"
        >
          <option value="all">Todos los barrios</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink/75">
          <input
            type="checkbox"
            checked={onlyAvailable}
            onChange={(e) => setOnlyAvailable(e.target.checked)}
            className="h-3.5 w-3.5 accent-[#8a6d3b]"
          />
          Solo disponibles
        </label>
        <span className="crm-meta ml-auto text-ink/45">
          {filtered.length} propiedad{filtered.length === 1 ? "" : "es"}
        </span>
      </div>

      {/* Cola */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[1100px] border-separate border-spacing-y-1.5 text-left text-sm">
          <thead>
            <tr className="crm-table-header text-ink/50">
              <th className="px-3 pb-2">Ref.</th>
              <th className="px-3 pb-2">Propiedad</th>
              <th className="px-3 pb-2">Barrio</th>
              <th className="px-3 pb-2">Op.</th>
              <th className="px-3 pb-2 text-center">Fotos</th>
              <th className="px-3 pb-2 text-center">Caps.</th>
              <th className="px-3 pb-2">Motivo del gate</th>
              <th className="px-3 pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-ink/45">
                  No hay propiedades en este filtro.
                </td>
              </tr>
            )}
            {filtered.map((r) => (
              <tr key={r.propertyId} className="crm-table-body bg-white">
                <td className="rounded-l-lg px-3 py-3">
                  <span className="font-mono text-xs font-bold tracking-wider text-gold-dark">
                    {r.ref}
                  </span>
                </td>
                <td className="max-w-[280px] px-3 py-3">
                  <span className="block truncate font-bold text-ink" title={r.title}>
                    {r.title}
                  </span>
                  <span className="crm-meta flex items-center gap-1.5">
                    {r.state === "published_partial" && (
                      <span className="text-emerald-700">
                        PUBLICADA — PARCIAL · {r.pendingBlocks} bloque
                        {r.pendingBlocks === 1 ? "" : "s"} pendiente
                        {r.pendingBlocks === 1 ? "" : "s"} de revisión
                      </span>
                    )}
                    {r.state === "published_complete" && (
                      <span className="text-emerald-700">PUBLICADA — COMPLETA</span>
                    )}
                    {/* FACTS-LED no es un error: el SmartLink 2.0 está activo
                        (hero, key facts, detalles, barrio, mapa) y solo falta
                        el enriquecimiento editorial de la Property Story. */}
                    {(r.state === "fallback" || r.state === "blocked") && (
                      <span className="text-sky-700">
                        FACTS-LED · SmartLink 2.0 activo · pendiente de enriquecimiento editorial
                      </span>
                    )}
                    {!r.available && <span className="text-rose-600">· No disponible</span>}
                  </span>
                </td>
                <td className="px-3 py-3 text-ink/70">{r.zone}</td>
                <td className="px-3 py-3 text-ink/70">
                  {r.operation === "rent" ? "Alquiler" : "Venta"}
                </td>
                <td className="crm-number px-3 py-3 text-center text-ink/75">{r.photoCount}</td>
                <td className="crm-number px-3 py-3 text-center text-ink/75">
                  {r.narrativeChapters}
                </td>
                <td className="px-3 py-3">
                  <div className="flex flex-wrap gap-1.5">
                    {r.failures.slice(0, 3).map((f) => (
                      <Pill
                        key={f.code}
                        tone={f.code === "conflict" ? "critical" : f.code === "too_short" ? "warning" : "neutral"}
                      >
                        {f.label}
                        {f.detail ? ` · ${f.detail}` : ""}
                      </Pill>
                    ))}
                  </div>
                </td>
                <td className="rounded-r-lg px-3 py-3 text-right">
                  <Link
                    href={`/${country}/admin/propiedades/${r.slug}/story?from=queue&bucket=${bucket}`}
                    className="crm-button inline-flex items-center gap-1.5 rounded-md bg-ink px-3 py-2 text-cream-50 transition hover:bg-ink-soft"
                  >
                    Resolver <ArrowRight size={13} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(bucket === "chapters" || bucket === "photos") && (
        <Panel title="Qué hacer con estas" className="mt-6">
          <p className="text-sm text-ink/70">
            {bucket === "chapters"
              ? "Estas propiedades tienen menos de 3 capítulos narrativos porque su descripción de origen aporta poco material. No se arreglan editando: necesitan una descripción mejor y volver a generar el story."
              : "Estas propiedades tienen menos de 8 fotos. No es un problema editorial: necesitan reportaje fotográfico antes de poder ilustrar capítulos."}
          </p>
        </Panel>
      )}
    </div>
  );
}
