"use client";

// ============================================================================
// SMARTLINK 2.0 · LUXURY LOCATION MODULE
// ----------------------------------------------------------------------------
// Responde, en este orden: ¿dónde estoy? · ¿qué tengo alrededor? · ¿cómo de
// conectada está? · ¿quiero explorar más? El mapa NO contesta las cuatro: la
// inteligencia la pone la capa curada de barrios y sus POIs verificados.
//
// Decisión técnica (§16 del brief): el visor incrustado del proveedor no podía
// dar el resultado — no se puede estilar y capturaba la rueda del ratón en
// cuanto el cursor lo sobrevolaba. Se sustituye la FORMA DE PINTAR, no el
// proveedor: mismos datos OSM, misma atribución, sin API key ni coste nuevo.
//
//   · bloqueado  → mosaico de teselas compuesto por nosotros (tile-math.ts)
//                  como <img> con pointer-events:none. Cero JS de mapa, cero
//                  gestos capturados, y color de lujo desde el primer frame.
//   · explorar   → Leaflet (ya era dependencia) cargado BAJO DEMANDA. Solo
//                  quien pulsa paga los kilobytes.
//
// El motor factual no se toca: tiempos, modos y corrección de POIs de gran
// superficie (bbox) vienen tal cual de lib/geo/poi-distance.ts.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Compass, Lock, MapPin, Plus, Minus } from "lucide-react";
import { buildMosaic, contextZoomForWidth, type Mosaic } from "@/lib/geo/tile-math";
import type { PoiTravel } from "@/lib/geo/poi-distance";

// Basemap: CARTO Voyager sobre datos de OpenStreetMap.
//
// ⚠️ POR QUÉ NO LOS SERVIDORES DE OSM DIRECTAMENTE (2026-08-21): enlazar sus
// teselas desde el navegador incumple su política de uso y sus servidores
// voluntarios acabaron devolviendo un 418 "Access blocked". El detalle
// venenoso es que ese aviso ES UN PNG VÁLIDO: se pinta como una tesela más y
// ninguna comprobación de "¿cargó la imagen?" lo detecta. Además el estilo
// estándar lleva incrustados iconos de comercios, bancos e iglesias que
// ningún filtro de color puede quitar y que le roban el protagonismo al
// marcador de la vivienda.
//
// CARTO sirve los MISMOS datos OSM en un basemap pensado para ser fondo:
// sin ese ruido de iconos, con parques y agua conservados, sin API key y con
// @2x para pantallas retina. Cambia la URL, nada más — y la atribución suma
// a CARTO junto a OpenStreetMap, como exige su licencia.
const TILE_URL = (z: number, x: number, y: number) =>
  `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}@2x.png`;
const TILE_TEMPLATE = "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Etiqueta corta de categoría. Solo se pinta si aporta; nunca "otro". */
const CATEGORY_LABEL: Record<string, string> = {
  parque: "Naturaleza",
  cultura: "Cultura",
  compras: "Compras",
  gastronomia: "Gastronomía",
  transporte: "Transporte",
  educacion: "Educación",
  salud: "Salud",
  deporte: "Deporte",
};

export type LocationNeighborhood = {
  displayName: string;
  district?: string | null;
  municipality?: string | null;
};

export function LocationModule({
  zone,
  lat,
  lng,
  pois,
  neighborhood,
  fallbackCoords,
  onView,
  onPoiClick,
  onExplore,
}: {
  zone: string;
  lat: number | null;
  lng: number | null;
  pois: PoiTravel[];
  neighborhood?: LocationNeighborhood | null;
  /** Centro aproximado del barrio cuando la propiedad no está geocodificada. */
  fallbackCoords: { lat: number; lng: number; zoom: number };
  onView: () => void;
  onPoiClick: (name: string) => void;
  onExplore: () => void;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [live, setLive] = useState(false);
  const [activePoi, setActivePoi] = useState<string | null>(null);

  const hasPreciseCoords = lat != null && lng != null;
  const center = hasPreciseCoords
    ? { lat: lat as number, lng: lng as number }
    : { lat: fallbackCoords.lat, lng: fallbackCoords.lng };

  // ── Analítica de sección (una vez) ──
  const seen = useRef(false);
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !seen.current) {
          seen.current = true;
          onView();
          obs.disconnect();
        }
      },
      { threshold: 0.3 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [onView]);

  // ── Medida del escenario: el zoom se adapta al ancho real para que móvil y
  //    escritorio enseñen una porción de ciudad comparable. ──
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSize({ w: Math.round(r.width), h: Math.round(r.height) });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoom = useMemo(() => {
    if (!size) return 15;
    // Sin coordenadas exactas mostramos el barrio, no un portal concreto.
    const z = contextZoomForWidth(size.w, center.lat);
    return hasPreciseCoords ? z : Math.min(z, fallbackCoords.zoom);
  }, [size, center.lat, hasPreciseCoords, fallbackCoords.zoom]);

  const mosaic: Mosaic | null = useMemo(() => {
    if (!size) return null;
    return buildMosaic({ lat: center.lat, lng: center.lng, zoom, width: size.w, height: size.h });
  }, [size, center.lat, center.lng, zoom]);

  // ── Destinos: el rail toma los de mayor prioridad (ya vienen ordenados y
  //    calculados con el modelo de distancia vigente, bbox incluido). ──
  const rail = pois.slice(0, 5);
  const mapPois = pois.slice(0, 5);

  // ── Modo explorar: Leaflet solo aquí, y solo al pulsar. ──
  const leafletRef = useRef<any>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);
  const poiLayerRef = useRef<Map<string, any>>(new Map());

  const enterLive = useCallback(async () => {
    setLive(true);
    onExplore();
    const L = (await import("leaflet")).default;
    // El CSS de Leaflet también bajo demanda: no lastra a quien no explora.
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    // El nodo se monta en el mismo tick que setLive: esperamos al layout.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const host = mapElRef.current;
    if (!host || leafletRef.current) return;

    const map = L.map(host, {
      center: [center.lat, center.lng],
      zoom,
      zoomControl: false,
      attributionControl: true,
      // Ya estamos en modo explorar: aquí SÍ queremos los gestos.
      scrollWheelZoom: true,
    });
    L.tileLayer(TILE_TEMPLATE, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);

    const bcpIcon = L.divIcon({
      className: "",
      html: `<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#2c2113;border:3px solid #d4af7f;box-shadow:0 6px 18px -6px rgba(40,28,10,.7)"></span>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
    L.marker([center.lat, center.lng], { icon: bcpIcon, keyboard: false }).addTo(map);

    for (const p of mapPois) {
      const icon = L.divIcon({
        className: "",
        html: `<span style="display:block;width:10px;height:10px;border-radius:9999px;background:rgba(255,255,255,.95);border:2px solid #8a6d3b"></span>`,
        iconSize: [10, 10],
        iconAnchor: [5, 5],
      });
      const mk = L.marker([p.latitude, p.longitude], { icon, title: p.name }).addTo(map);
      poiLayerRef.current.set(p.name, mk);
    }
    leafletRef.current = { L, map };
  }, [center.lat, center.lng, zoom, mapPois, onExplore]);

  const exitLive = useCallback(() => {
    const inst = leafletRef.current;
    if (inst) {
      inst.map.remove();
      leafletRef.current = null;
      poiLayerRef.current.clear();
    }
    setLive(false);
    setActivePoi(null);
  }, []);

  useEffect(() => () => leafletRef.current?.map?.remove(), []);

  const selectPoi = useCallback(
    (p: PoiTravel) => {
      setActivePoi(p.name);
      onPoiClick(p.name);
      const inst = leafletRef.current;
      if (!inst) return;
      // Encaje suave propiedad + destino. NUNCA se dibuja una línea entre
      // ambos: no tenemos geometría de ruta real y fingirla sería mentir.
      const bounds = inst.L.latLngBounds(
        [center.lat, center.lng],
        [p.latitude, p.longitude],
      );
      inst.map.flyToBounds(bounds, { padding: [56, 56], duration: 0.7, maxZoom: 17 });
    },
    [center.lat, center.lng, onPoiClick],
  );

  // ── Subtítulo editorial: SOLO dato administrativo verificado (columnas
  //    district/municipality de la capa curada). Si no lo hay, no se inventa
  //    una frase: no se pinta nada. ──
  const editorialLine = useMemo(() => {
    if (!neighborhood) return null;
    const { district, municipality, displayName } = neighborhood;
    if (district && municipality && district !== displayName) {
      return `Distrito de ${district} · ${municipality}`;
    }
    if (municipality && municipality !== displayName) return municipality;
    return null;
  }, [neighborhood]);

  const title = neighborhood?.displayName ?? zone;
  const externalLink = `https://www.openstreetmap.org/?mlat=${center.lat}&mlon=${center.lng}#map=${zoom}/${center.lat}/${center.lng}`;

  return (
    <section
      ref={sectionRef}
      className="mt-5 overflow-hidden rounded-2xl border border-gold/20 bg-white/85 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm"
    >
      {/* ── A · CABECERA EDITORIAL ─────────────────────────────────────── */}
      <div className="px-6 pt-6 md:px-8 md:pt-8">
        <h2 className="crm-section-title text-ink">Ubicación · {title}</h2>
        {editorialLine && (
          <p className="crm-label-sm mt-1.5 text-gold-dark">{editorialLine}</p>
        )}
        <p className="mt-1 text-xs text-ink/55">
          {hasPreciseCoords
            ? "Ubicación exacta de la propiedad."
            : "Zona aproximada del barrio. Te pasaremos la dirección exacta al coordinar la visita."}
        </p>
      </div>

      {/* ── B · RAIL DE CONECTIVIDAD ───────────────────────────────────── */}
      {rail.length > 0 && (
        <div className="mt-5 px-6 md:px-8">
          <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto pb-1 md:mx-0 md:grid md:grid-cols-5 md:gap-3 md:overflow-visible">
            {rail.map((p, i) => {
              const isActive = activePoi === p.name;
              return (
                <li
                  key={p.name}
                  className="bcp-rise min-w-[9.5rem] shrink-0 snap-start px-1 md:min-w-0 md:px-0"
                  style={{ animationDelay: `${90 + i * 70}ms` }}
                >
                  <button
                    type="button"
                    onClick={() => (live ? selectPoi(p) : onPoiClick(p.name))}
                    className={`h-full w-full rounded-xl border px-3 py-3 text-left transition ${
                      isActive
                        ? "border-gold bg-gold/10"
                        : "border-ink/10 bg-white/70 hover:border-gold/50"
                    }`}
                  >
                    <span className="crm-number block text-xl leading-none text-ink">
                      ≈ {p.minutes}
                      <span className="crm-meta ml-1 text-ink/50">min</span>
                    </span>
                    <span className="crm-meta mt-1 block text-ink/45">
                      {p.mode === "walk" ? "a pie" : "en coche"}
                    </span>
                    <span className="mt-1.5 block truncate text-sm text-ink/80" title={p.name}>
                      {p.name}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── C · ESCENARIO DEL MAPA ─────────────────────────────────────── */}
      <div
        ref={stageRef}
        className={`bcp-map-stage relative mt-5 w-full overflow-hidden ${
          live ? "bcp-map-live h-[62vh] min-h-[380px]" : "h-[46vh] min-h-[280px] md:h-[520px]"
        }`}
      >
        {live ? (
          <>
            <div ref={mapElRef} className="absolute inset-0 h-full w-full" />
            {/* Controles mínimos: dos botones, integrados en la composición. */}
            <div className="pointer-events-auto absolute right-3 top-3 z-[500] flex flex-col gap-1.5">
              <button
                type="button"
                aria-label="Acercar"
                onClick={() => leafletRef.current?.map.zoomIn()}
                className="rounded-lg bg-white/95 p-2 text-ink shadow-[0_8px_20px_-12px_rgba(40,28,10,0.6)] transition hover:bg-white"
              >
                <Plus size={15} strokeWidth={2} />
              </button>
              <button
                type="button"
                aria-label="Alejar"
                onClick={() => leafletRef.current?.map.zoomOut()}
                className="rounded-lg bg-white/95 p-2 text-ink shadow-[0_8px_20px_-12px_rgba(40,28,10,0.6)] transition hover:bg-white"
              >
                <Minus size={15} strokeWidth={2} />
              </button>
            </div>
            <button
              type="button"
              onClick={exitLive}
              className="crm-button pointer-events-auto absolute bottom-3 left-1/2 z-[500] inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink/95 px-4 py-2.5 text-cream-50 shadow-[0_12px_30px_-14px_rgba(40,28,10,0.9)] backdrop-blur-sm transition hover:bg-ink"
            >
              <Lock size={13} strokeWidth={1.75} />
              Volver al recorrido
            </button>
          </>
        ) : (
          <>
            {/* Mosaico de teselas: son <img>, así que el scroll de la página
                NUNCA se ve interceptado por pasar el ratón por encima. */}
            <div className="absolute inset-0" style={{ isolation: "isolate" }} aria-hidden>
            <div className="bcp-map-tiles absolute inset-0">
              {mosaic?.tiles.map((t) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${t.z}/${t.x}/${t.y}`}
                  src={TILE_URL(t.z, t.x, t.y)}
                  alt=""
                  width={256}
                  height={256}
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className="absolute max-w-none"
                  style={{ left: t.left, top: t.top, width: 256, height: 256 }}
                />
              ))}
            </div>
              <div className="bcp-map-wash absolute inset-0" />
            </div>

            {/* Destinos discretos sobre el mapa: contexto, no chinchetas. */}
            {mosaic && hasPreciseCoords &&
              mapPois.map((p) => {
                const pt = mosaic.project(p.latitude, p.longitude);
                if (pt.left < 8 || pt.top < 8 || !size || pt.left > size.w - 8 || pt.top > size.h - 8) {
                  return null;
                }
                return (
                  <span
                    key={p.name}
                    aria-hidden
                    className="absolute z-[2] h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold-dark bg-white shadow-[0_2px_8px_-2px_rgba(40,28,10,0.6)]"
                    style={{ left: pt.left, top: pt.top }}
                  />
                );
              })}

            {/* Marcador BCP: máxima prioridad visual, sin pin de dibujos. */}
            {mosaic && hasPreciseCoords && (
              <span
                className="absolute z-[3]"
                style={{ left: (size?.w ?? 0) / 2, top: (size?.h ?? 0) / 2 }}
                aria-hidden
              >
                <span className="bcp-marker-halo absolute left-0 top-0 block h-14 w-14 rounded-full bg-gold/50" />
                <span className="bcp-marker absolute left-0 top-0 block">
                  <span className="block h-[22px] w-[22px] -translate-x-1/2 translate-y-1/2 rounded-full bg-ink shadow-[0_10px_26px_-8px_rgba(40,28,10,0.95)] ring-[3px] ring-gold ring-offset-[3px] ring-offset-white" />
                </span>
              </span>
            )}
            {/* Sin coordenadas: círculo de zona, jamás un pin falso. */}
            {mosaic && !hasPreciseCoords && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 z-[2] h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold/75 bg-gold/15 shadow-[0_0_0_4px_rgba(212,175,127,0.16)] md:h-40 md:w-40"
              />
            )}

            {/* Activación EXPLÍCITA. Nunca por hover. */}
            <button
              type="button"
              onClick={enterLive}
              className="crm-button group absolute bottom-4 left-1/2 z-[4] inline-flex -translate-x-1/2 items-center gap-2 rounded-full bg-ink/95 px-5 py-2.5 text-cream-50 shadow-[0_12px_30px_-14px_rgba(40,28,10,0.9)] backdrop-blur-sm transition hover:bg-ink"
            >
              <Compass size={14} strokeWidth={1.75} />
              Explorar mapa
            </button>

            {/* Atribución obligatoria también en estado bloqueado. */}
            <span className="absolute bottom-1 right-1.5 z-[4] rounded bg-white/80 px-1.5 py-0.5 text-[10px] leading-tight text-ink/55">
              ©{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                OpenStreetMap
              </a>{" "}
              ©{" "}
              <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">
                CARTO
              </a>
            </span>
          </>
        )}
      </div>

      {/* ── E · DESTINOS CURADOS ───────────────────────────────────────── */}
      {pois.length > 0 && (
        <div className="px-6 pb-2 pt-5 md:px-8">
          <p className="crm-label-sm text-gold-dark">Cerca de la vivienda</p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {pois.map((p, i) => {
              const cat = CATEGORY_LABEL[p.category];
              const isActive = activePoi === p.name;
              return (
                <li key={p.name} className="bcp-rise" style={{ animationDelay: `${140 + i * 55}ms` }}>
                  <button
                    type="button"
                    onClick={() => (live ? selectPoi(p) : onPoiClick(p.name))}
                    className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left transition ${
                      isActive
                        ? "border-gold bg-gold/10"
                        : "border-transparent hover:border-gold/30 hover:bg-gold/5"
                    }`}
                  >
                    <span className="flex min-w-0 items-baseline gap-2">
                      <MapPin size={13} strokeWidth={1.75} className="shrink-0 translate-y-0.5 text-gold-dark" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink/85">{p.name}</span>
                        {cat && <span className="crm-meta block text-ink/40">{cat}</span>}
                      </span>
                    </span>
                    <span className="crm-meta shrink-0 whitespace-nowrap text-ink/55">
                      ≈ {p.minutes} min {p.mode === "walk" ? "a pie" : "en coche"}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="px-6 py-3 md:px-8">
        <a
          href={externalLink}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gold-dark hover:underline"
        >
          Ver mapa en pantalla completa ↗
        </a>
      </div>
    </section>
  );
}
