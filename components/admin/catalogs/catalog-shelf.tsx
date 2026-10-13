"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CatalogCover } from "@/components/catalogs/catalog-cover";
import { criteriaSummary } from "@/lib/catalogs/criteria";
import type { CatalogSummary } from "@/lib/catalogs/types";

// Estantería de la HOME con filtros (BCP-01 ampliación X8): anuncio de
// origen, zona, operación, modo y estado, y búsqueda por título o código. Todo
// en el navegador sobre la lista del dueño (son pocos catálogos). Interno.

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

const sel =
  "min-w-0 rounded-lg border border-gold/25 bg-white px-2 py-1.5 text-sm text-ink outline-none focus:border-gold";

export function CatalogShelf({ catalogs, basePath }: { catalogs: CatalogSummary[]; basePath: string }) {
  const [q, setQ] = useState("");
  const [zone, setZone] = useState("");
  const [op, setOp] = useState("");
  const [mode, setMode] = useState("");
  const [status, setStatus] = useState("active");
  const [ad, setAd] = useState("");

  const zones = useMemo(
    () => [...new Set(catalogs.flatMap((c) => c.criteria.zones.map((z) => z.name)))].sort((a, b) => a.localeCompare(b, "es")),
    [catalogs],
  );
  const ads = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of catalogs) for (const a of c.ads) {
      const key = a.code ?? a.reference ?? a.id;
      if (!m.has(key)) m.set(key, [a.reference, a.title ?? (a.code ? `Anuncio ${a.code}` : null)].filter(Boolean).join(" · "));
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1], "es"));
  }, [catalogs]);

  const shown = catalogs.filter((c) => {
    if (status && c.status !== status) return false;
    if (mode && c.mode !== mode) return false;
    if (op && c.criteria.operation !== op) return false;
    if (zone && !c.criteria.zones.some((z) => z.name === zone)) return false;
    if (ad && !c.ads.some((a) => (a.code ?? a.reference ?? a.id) === ad)) return false;
    const t = q.trim().toLowerCase();
    if (t) {
      const hay = [c.title, ...c.ads.flatMap((a) => [a.code, a.reference, a.title, a.note])].filter(Boolean).join(" ").toLowerCase();
      if (!hay.includes(t)) return false;
    }
    return true;
  });

  return (
    <>
      <div className="mt-5 flex flex-wrap items-center gap-2" role="search" aria-label="Filtrar catálogos" data-testid="shelf-filters">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por título o anuncio"
          aria-label="Buscar por título o anuncio"
          className={`${sel} w-full sm:w-56`}
        />
        <select aria-label="Anuncio de origen" value={ad} onChange={(e) => setAd(e.target.value)} className={sel}>
          <option value="">Todos los anuncios</option>
          {ads.map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>
        <select aria-label="Zona" value={zone} onChange={(e) => setZone(e.target.value)} className={sel}>
          <option value="">Todas las zonas</option>
          {zones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </select>
        <select aria-label="Operación" value={op} onChange={(e) => setOp(e.target.value)} className={sel}>
          <option value="">Venta y alquiler</option>
          <option value="sale">Venta</option>
          <option value="rent">Alquiler</option>
          <option value="any">Ambas</option>
        </select>
        <select aria-label="Modo" value={mode} onChange={(e) => setMode(e.target.value)} className={sel}>
          <option value="">Manual y automático</option>
          <option value="manual">Manual</option>
          <option value="auto">Automático</option>
        </select>
        <select aria-label="Estado" value={status} onChange={(e) => setStatus(e.target.value)} className={sel}>
          <option value="active">Activos</option>
          <option value="archived">Archivados</option>
          <option value="">Todos</option>
        </select>
        <span className="text-xs text-ink/55" data-testid="shelf-count">
          {shown.length} de {catalogs.length}
        </span>
      </div>
      {shown.length === 0 ? (
        <p className="mt-6 text-sm text-ink/55">Ningún catálogo coincide con estos filtros.</p>
      ) : (
        <ul className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5" data-testid="shelf">
          {shown.map((c) => (
            <li key={c.id} className={c.status === "archived" ? "opacity-60" : undefined}>
              <Link href={`${basePath}/catalogos/${c.id}`} className="group block">
                <div
                  className="aspect-[150/212] w-full overflow-hidden rounded-sm shadow-[0_10px_24px_-14px_rgba(60,40,20,0.45)] transition group-hover:-translate-y-0.5"
                  data-check-overflow="cover"
                >
                  <CatalogCover
                    data={{
                      title: c.title,
                      subtitle: c.intro,
                      numberLabel: c.numberLabel,
                      edition: c.edition,
                      photoUrl: c.coverPhotoUrl,
                      preparedBy: c.contactName,
                    }}
                  />
                </div>
                <p className="crm-body-strong mt-3 line-clamp-2 text-ink">{c.title}</p>
                <p className="text-xs text-ink/55">
                  {c.status === "archived" ? "Archivado" : "Activo"} · {c.mode === "auto" ? "Automático" : "Manual"} · {c.itemCount} propiedad
                  {c.itemCount === 1 ? "" : "es"}
                </p>
                {criteriaSummary(c.criteria) ? <p className="line-clamp-2 text-xs text-ink/50">{criteriaSummary(c.criteria)}</p> : null}
                {c.ads.length ? (
                  <p className="text-xs text-ink/45">
                    {c.ads.length} anuncio{c.ads.length === 1 ? "" : "s"} de origen
                  </p>
                ) : null}
                <p className="text-xs text-ink/45">Actualizado el {formatDate(c.updatedAt)}</p>
                <span className="mt-1 inline-block text-xs text-gold underline-offset-2 group-hover:underline">Gestionar</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
