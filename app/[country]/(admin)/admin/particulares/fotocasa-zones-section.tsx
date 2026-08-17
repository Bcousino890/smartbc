"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, MapPin, Loader2, Check } from "lucide-react";
import type { FotocasaDistrict } from "@/lib/sync/particulares/fotocasa-zones";

// Selector de las zonas de Madrid que el scraper de Fotocasa recorre ENTERAS.
//
// Por qué zona a zona y no "todo Madrid": la búsqueda global no deja paginar
// hasta el final, así que la ciudad completa nunca se recorre del todo. Acotando
// por barrio, cada búsqueda cabe dentro de la paginación y sí se cubre al 100%.
//
// Se pueden marcar distritos enteros (Barrio de Salamanca) o barrios sueltos
// (Goya, Recoletos). Al marcar el distrito, sus barrios se deseleccionan: la
// búsqueda del distrito ya los incluye y repetirlos gastaría proxy dos veces.

type Payload = { districts: FotocasaDistrict[]; selected: string[] };

export function FotocasaZonesPanel() {
  // Va dentro del configurador de scrapers, que ya es plegable: aquí no hace
  // falta otra cabecera desplegable, sólo el contenido.
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
        // Se abren los distritos que tienen algún barrio suelto marcado, para
        // que la selección se vea de un vistazo sin tener que ir abriendo.
        setExpanded(
          new Set(
            p.districts
              .filter((d) => d.subZones.some((s) => p.selected.includes(s.slug)))
              .map((d) => d.slug),
          ),
        );
      })
      .catch((e) => setError(e.message));
  }, [data]);

  const totalAnuncios = useMemo(() => {
    if (!data) return 0;
    let n = 0;
    for (const d of data.districts) {
      if (selected.has(d.slug)) n += d.approxListings;
      else for (const s of d.subZones) if (selected.has(s.slug)) n += s.approxListings;
    }
    return n;
  }, [data, selected]);

  function toggleDistrict(d: FotocasaDistrict) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(d.slug)) {
        next.delete(d.slug);
      } else {
        next.add(d.slug);
        // El distrito ya incluye a sus barrios: quitarlos evita scrapear dos veces.
        for (const s of d.subZones) next.delete(s.slug);
      }
      return next;
    });
    setSavedAt(null);
  }

  function toggleSub(district: FotocasaDistrict, slug: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else {
        next.add(slug);
        next.delete(district.slug); // deja de ser "distrito entero"
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

  return (
    <div>
      <div className="flex items-center gap-2">
        <MapPin size={15} className="text-ink/45" />
        <h4 className="font-serif text-sm font-semibold text-ink">Zonas a scrapear</h4>
        {data && (
          <span className="rounded-full bg-ink/5 px-2 py-0.5 text-[11px] text-ink/55">
            {selected.size} seleccionadas
          </span>
        )}
      </div>
      <div className="pt-3">
          <p className="mb-4 max-w-3xl text-xs text-ink/55">
            Cada zona marcada se recorre <strong>entera</strong> (todas sus páginas, alquiler y
            venta). Marca un distrito para cubrirlo completo, o abre su flecha para elegir barrios
            sueltos. El número es una referencia de cuántos anuncios en alquiler tenía la zona.
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
              <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {data.districts.map((d) => {
                  const isOpen = expanded.has(d.slug);
                  const subSelected = d.subZones.filter((s) => selected.has(s.slug)).length;
                  return (
                    <div key={d.slug} className="py-0.5">
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(d.slug)) next.delete(d.slug);
                              else next.add(d.slug);
                              return next;
                            })
                          }
                          className="shrink-0 rounded p-0.5 text-ink/35 hover:bg-ink/5 hover:text-ink/60"
                          aria-label={isOpen ? "Ocultar barrios" : "Ver barrios"}
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
                            checked={selected.has(d.slug)}
                            onChange={() => toggleDistrict(d)}
                            className="h-3.5 w-3.5 rounded border-ink/25 accent-ink"
                          />
                          <span className={selected.has(d.slug) ? "font-medium text-ink" : ""}>
                            {d.label}
                          </span>
                          <span className="text-[11px] text-ink/40">{d.approxListings}</span>
                          {subSelected > 0 && !selected.has(d.slug) && (
                            <span className="rounded-full bg-ink/5 px-1.5 text-[10px] text-ink/55">
                              {subSelected}
                            </span>
                          )}
                        </label>
                      </div>

                      {isOpen && (
                        <div className="ml-6 border-l border-ink/10 pl-3">
                          {d.subZones.map((s) => (
                            <label
                              key={s.slug}
                              className="flex cursor-pointer items-center gap-2 py-0.5 text-[13px] text-ink/70"
                            >
                              <input
                                type="checkbox"
                                checked={selected.has(s.slug) || selected.has(d.slug)}
                                disabled={selected.has(d.slug)}
                                onChange={() => toggleSub(d, s.slug)}
                                className="h-3 w-3 rounded border-ink/25 accent-ink disabled:opacity-40"
                              />
                              <span>{s.label}</span>
                              <span className="text-[11px] text-ink/35">{s.approxListings}</span>
                            </label>
                          ))}
                        </div>
                      )}
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
                  {selected.size} zonas · ~{totalAnuncios.toLocaleString("es-ES")} anuncios en
                  alquiler
                </span>
              </div>
            </>
          )}
      </div>
    </div>
  );
}
