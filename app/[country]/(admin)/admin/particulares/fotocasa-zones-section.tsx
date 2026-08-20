"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, MapPin, Loader2, Check } from "lucide-react";
import type { FotocasaLocation, FotocasaDistrict } from "@/lib/sync/particulares/fotocasa-zones";

// Selector de las zonas que el scraper de Fotocasa recorre ENTERAS.
//
// Por qué zona a zona y no "todo Madrid": la búsqueda global no deja paginar
// hasta el final, así que la ciudad completa nunca se recorre del todo. Acotando
// por barrio, cada búsqueda cabe dentro de la paginación y sí se cubre al 100%.
//
// Va por LOCALIDADES porque las zonas prime no están todas en Madrid capital:
// Pozuelo de Alarcón y La Moraleja son localidades propias de Fotocasa.
//
// Todo se identifica por el path `localidad/zona`. Al marcar un padre (la
// localidad entera o un distrito), sus hijos se deseleccionan: la búsqueda del
// padre ya los incluye y repetirlos gastaría proxy dos veces.

type Payload = { locations: FotocasaLocation[]; selected: string[] };

const wholePath = (slug: string) => `${slug}/todas-las-zonas`;

export function FotocasaZonesPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (data) return;
    fetch("/api/admin/particulares/fotocasa-zones")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("No autorizado"))))
      .then((p: Payload) => {
        setData(p);
        setSelected(new Set(p.selected));
        // Se abren los distritos con algún barrio suelto marcado, para que la
        // selección se vea de un vistazo sin ir abriendo uno a uno.
        setExpanded(
          new Set(
            p.locations
              .flatMap((l) => l.districts)
              .filter((d) => d.subZones.some((s) => p.selected.includes(s.path)))
              .map((d) => d.path),
          ),
        );
      })
      .catch((e) => setError(e.message));
  }, [data]);

  const totalAnuncios = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    for (const loc of data.locations) {
      if (selected.has(wholePath(loc.slug))) {
        n += loc.approxListings;
        continue;
      }
      for (const d of loc.districts) {
        if (selected.has(d.path)) n += d.approxListings;
        else for (const s of d.subZones) if (selected.has(s.path)) n += s.approxListings;
      }
    }
    return n;
  }, [data, selected]);

  function toggle(path: string, children: string[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else {
        next.add(path);
        for (const c of children) next.delete(c);
      }
      return next;
    });
    setSavedAt(null);
  }

  /** Marca un hijo y desmarca a sus padres (deja de ser "el bloque entero"). */
  function toggleChild(path: string, parents: string[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else {
        next.add(path);
        for (const p of parents) next.delete(p);
      }
      return next;
    });
    setSavedAt(null);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/particulares/fotocasa-zones", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zones: [...selected] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "No se pudo guardar");
      setSelected(new Set(json.zones));
      setSavedAt(new Date().toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  function renderDistrict(loc: FotocasaLocation, d: FotocasaDistrict) {
    const locWhole = wholePath(loc.slug);
    const coveredByLocation = selected.has(locWhole);
    const isOpen = expanded.has(d.path);
    const subSelected = d.subZones.filter((s) => selected.has(s.path)).length;

    return (
      <div key={d.path} className="py-0.5">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() =>
              setExpanded((prev) => {
                const next = new Set(prev);
                if (next.has(d.path)) next.delete(d.path);
                else next.add(d.path);
                return next;
              })
            }
            className="shrink-0 rounded p-0.5 text-ink/35 hover:bg-ink/5 hover:text-ink/60"
            aria-label={isOpen ? "Ocultar zonas" : "Ver zonas"}
            disabled={d.subZones.length === 0}
          >
            {d.subZones.length > 0 ? (
              isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />
            ) : (
              <span className="inline-block w-[14px]" />
            )}
          </button>
          <label className="flex flex-1 cursor-pointer items-center gap-2 py-0.5 text-sm text-ink/80">
            <input
              type="checkbox"
              checked={selected.has(d.path) || coveredByLocation}
              disabled={coveredByLocation}
              onChange={() => toggleChild(d.path, [locWhole])}
              className="h-3.5 w-3.5 rounded border-ink/25 accent-ink disabled:opacity-40"
            />
            <span className={selected.has(d.path) ? "font-medium text-ink" : ""}>{d.label}</span>
            <span className="text-xs text-ink/40">{d.approxListings}</span>
            {subSelected > 0 && !selected.has(d.path) && !coveredByLocation && (
              <span className="rounded-full bg-ink/5 px-1.5 text-xs text-ink/55">
                {subSelected}
              </span>
            )}
          </label>
        </div>

        {isOpen && (
          <div className="ml-6 border-l border-ink/10 pl-3">
            {d.subZones.map((s) => (
              <label
                key={s.path}
                className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-ink/70"
              >
                <input
                  type="checkbox"
                  checked={selected.has(s.path) || selected.has(d.path) || coveredByLocation}
                  disabled={selected.has(d.path) || coveredByLocation}
                  onChange={() => toggleChild(s.path, [d.path, locWhole])}
                  className="h-3 w-3 rounded border-ink/25 accent-ink disabled:opacity-40"
                />
                <span>{s.label}</span>
                <span className="text-xs text-ink/35">{s.approxListings}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <MapPin size={15} className="text-ink/45" />
        <h4 className="text-sm font-bold text-ink">Zonas a scrapear</h4>
        {data && (
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-xs text-ink/55">
            {selected.size} seleccionadas
          </span>
        )}
      </div>

      <div className="pt-3">
        <p className="mb-4 max-w-3xl text-xs text-ink/55">
          Cada zona marcada se recorre <strong>entera</strong> (todas sus páginas, alquiler y venta).
          Marca la localidad o el distrito para cubrirlo completo, o abre su flecha para elegir zonas
          sueltas. El número es una referencia de cuántos anuncios en alquiler tenía.
        </p>

        {error && (
          <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        )}

        {!data && !error && (
          <p className="flex items-center gap-2 text-xs text-ink/50">
            <Loader2 size={14} className="animate-spin" /> Cargando zonas…
          </p>
        )}

        {data && (
          <>
            <div className="space-y-6">
              {data.locations.map((loc) => {
                const locWhole = wholePath(loc.slug);
                const childPaths = loc.districts.flatMap((d) => [
                  d.path,
                  ...d.subZones.map((s) => s.path),
                ]);
                return (
                  <div key={loc.slug}>
                    <label className="mb-1 flex cursor-pointer items-center gap-2 border-b border-ink/10 pb-1.5">
                      <input
                        type="checkbox"
                        checked={selected.has(locWhole)}
                        onChange={() => toggle(locWhole, childPaths)}
                        className="h-3.5 w-3.5 rounded border-ink/25 accent-ink"
                      />
                      <span className="text-sm font-bold text-ink">{loc.label}</span>
                      <span className="text-xs text-ink/40">
                        {loc.approxListings} · entera
                      </span>
                    </label>
                    <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                      {loc.districts.map((d) => renderDistrict(loc, d))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink/10 pt-4">
              <button
                onClick={save}
                disabled={saving}
                className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 disabled:opacity-50"
              >
                {saving ? "Guardando…" : "Guardar zonas"}
              </button>
              {savedAt && (
                <span className="flex items-center gap-1.5 text-xs text-emerald-700">
                  <Check size={14} /> Guardado a las {savedAt}
                </span>
              )}
              <span className="text-xs text-ink/45">
                {selected.size} zonas · ~{totalAnuncios.toLocaleString("es-ES")} anuncios en alquiler
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
