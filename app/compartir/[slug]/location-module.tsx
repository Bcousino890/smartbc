"use client";

// ============================================================================
// SMARTLINK 2.0 · LUXURY LOCATION MODULE
// ----------------------------------------------------------------------------
// Composición: DAMAC para el overview y el relato de conectividad, EMAAR para
// la exploración con fichas contextuales, y el color/tipografía de BCP.
//
// Responde en este orden: ¿dónde estoy? · ¿qué tengo alrededor? · ¿cómo de
// conectada está? · ¿quiero explorar más? El mapa NO contesta las cuatro: la
// inteligencia la pone la capa curada de barrios y sus POIs verificados.
//
// Decisión técnica: el visor incrustado del proveedor no podía dar esto — no
// se puede estilar y capturaba la rueda al sobrevolarlo. Se cambia la FORMA
// DE PINTAR, no el proveedor:
//   · overview → mosaico de teselas compuesto por nosotros (tile-math.ts)
//     como <img> con pointer-events:none. Cero JS de mapa, cero gestos
//     capturados, y encima nuestra propia composición.
//   · explorar → Leaflet (ya era dependencia) bajo demanda.
//
// El motor factual no se toca: tiempos, modos y corrección bbox de POIs de
// gran superficie vienen tal cual de lib/geo/poi-distance.ts.
// ============================================================================

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Compass, Dumbbell, GraduationCap, HeartPulse, Landmark, Lock, MapPin,
  Maximize2, Minus, Plus, ShoppingBag, TrainFront, Trees, UtensilsCrossed, X,
} from "lucide-react";
import { buildMosaic, contextZoomForWidth, fitPoints, fitTwoPoints, type Mosaic } from "@/lib/geo/tile-math";
import type { PoiTravel } from "@/lib/geo/poi-distance";
import type { NearbyUniversity } from "@/lib/geo/universities-nearby";

// Basemap: CARTO Voyager sobre datos de OpenStreetMap.
//
// ⚠️ POR QUÉ NO LOS SERVIDORES DE OSM DIRECTAMENTE (2026-08-21): enlazar sus
// teselas desde el navegador incumple su política de uso y acabaron
// devolviendo un 418 "Access blocked". El detalle venenoso es que ese aviso ES
// UN PNG VÁLIDO: se pinta como una tesela más y ninguna comprobación de "¿cargó
// la imagen?" lo detecta. Además su estilo estándar lleva incrustados iconos de
// comercios y bancos que ningún filtro quita y que le roban protagonismo al
// marcador de la vivienda. CARTO sirve los MISMOS datos OSM sin ese ruido, sin
// API key y con @2x. La atribución suma CARTO, como exige su licencia.
const TILE_URL = (z: number, x: number, y: number) =>
  `https://basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}@2x.png`;
const TILE_TEMPLATE = "https://basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Lenguaje visual por categoría: MISMA familia para todas — mismo tamaño,
// mismo trazo, mismo color. Se distinguen por icono y etiqueta, nunca por
// color: el champán queda reservado a la SELECCIÓN.
const CATEGORY: Record<string, { label: string; Icon: typeof MapPin }> = {
  parque: { label: "Naturaleza", Icon: Trees },
  cultura: { label: "Cultura", Icon: Landmark },
  compras: { label: "Compras", Icon: ShoppingBag },
  gastronomia: { label: "Gastronomía", Icon: UtensilsCrossed },
  transporte: { label: "Transporte", Icon: TrainFront },
  educacion: { label: "Educación", Icon: GraduationCap },
  salud: { label: "Salud", Icon: HeartPulse },
  deporte: { label: "Deporte", Icon: Dumbbell },
};
const categoryOf = (c: string) => CATEGORY[c] ?? { label: "", Icon: MapPin };
const modeLabel = (m: PoiTravel["mode"]) => (m === "walk" ? "a pie" : "en coche");

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
  universities = [],
  neighborhood,
  fallbackCoords,
  onView,
  onPoiClick,
  onExplore,
  onRestore,
}: {
  zone: string;
  lat: number | null;
  lng: number | null;
  pois: PoiTravel[];
  universities?: NearbyUniversity[];
  neighborhood?: LocationNeighborhood | null;
  /** Centro aproximado del barrio cuando la propiedad no está geocodificada. */
  fallbackCoords: { lat: number; lng: number; zoom: number };
  onView: () => void;
  onPoiClick: (name: string, category: string) => void;
  onExplore: () => void;
  onRestore: () => void;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const [live, setLive] = useState(false);
  // DESTINATION FOCUS: un ÚNICO estado alimenta el rail editorial, las
  // cápsulas del mapa, la lista inferior y las universidades. Una sola
  // máquina de estados, no cuatro implementaciones.
  const [focus, setFocus] = useState<PoiTravel | null>(null);
  const activePoi = focus?.name ?? null;

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

  // ── Medida del escenario ──
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

  // ── Destinos ──
  // El rail es una progresión temporal, así que se lee de menos a más minutos.
  // El modo se etiqueta cuando NO es a pie, para que 12 en coche no se
  // confundan con 12 andando.
  const ordered = useMemo(() => [...pois].sort((a, b) => a.minutes - b.minutes), [pois]);
  const rail = ordered.slice(0, 5);
  const mapPois = ordered.slice(0, 4);

  // ── Vista del mapa ──
  const view = useMemo(() => {
    if (!size) return { lat: center.lat, lng: center.lng, zoom: 15 };
    if (focus && hasPreciseCoords) {
      const padding = Math.max(64, Math.round(Math.min(size.w, size.h) * 0.15));
      return fitTwoPoints({
        a: { lat: center.lat, lng: center.lng },
        b: { lat: focus.latitude, lng: focus.longitude },
        width: size.w, height: size.h, padding, maxZoom: 16,
      });
    }
    const z = contextZoomForWidth(size.w, center.lat);
    if (!hasPreciseCoords) return { lat: center.lat, lng: center.lng, zoom: Math.min(z, fallbackCoords.zoom) };
    // El overview enmarca la vivienda CON sus destinos más cercanos: si el
    // mapa no los abarca, sus cápsulas no caben y se pierde el contexto de
    // lifestyle que el módulo promete sin bajar a la lista. El zoom queda
    // acotado para no acabar enseñando media ciudad por un destino lejano.
    const anchors = [{ lat: center.lat, lng: center.lng }, ...mapPois.slice(0, 3).map((p) => ({ lat: p.latitude, lng: p.longitude }))];
    if (anchors.length === 1) return { lat: center.lat, lng: center.lng, zoom: z };
    const fitted = fitPoints({
      points: anchors, width: size.w, height: size.h,
      padding: Math.max(56, Math.round(Math.min(size.w, size.h) * 0.16)),
      minZoom: Math.max(13, z - 2), maxZoom: z,
    });
    return fitted;
  }, [size, center.lat, center.lng, hasPreciseCoords, fallbackCoords.zoom, focus, mapPois]);

  const mosaic: Mosaic | null = useMemo(() => {
    if (!size) return null;
    return buildMosaic({ lat: view.lat, lng: view.lng, zoom: view.zoom, width: size.w, height: size.h });
  }, [size, view]);

  const propertyPt = mosaic && hasPreciseCoords ? mosaic.project(center.lat, center.lng) : null;
  const focusPt = mosaic && focus ? mosaic.project(focus.latitude, focus.longitude) : null;

  // ── Modo explorar (Leaflet bajo demanda) ──
  const leafletRef = useRef<any>(null);
  const mapElRef = useRef<HTMLDivElement | null>(null);

  /** ÚNICO punto de entrada del DESTINATION FOCUS. */
  const selectPoi = useCallback(
    (p: PoiTravel) => {
      setFocus((prev) => (prev?.name === p.name ? prev : p));
      onPoiClick(p.name, p.category);
      const inst = leafletRef.current;
      if (!inst) return; // bloqueado: el encuadre lo resuelve el mosaico
      const bounds = inst.L.latLngBounds([center.lat, center.lng], [p.latitude, p.longitude]);
      inst.map.flyToBounds(bounds, { padding: [70, 70], duration: 0.7, maxZoom: 16 });
    },
    [center.lat, center.lng, onPoiClick],
  );
  // Los marcadores de Leaflet se crean una vez: leen el handler por ref para
  // no quedarse con una versión obsoleta en su closure.
  const selectPoiRef = useRef(selectPoi);
  useEffect(() => { selectPoiRef.current = selectPoi; }, [selectPoi]);

  const enterLive = useCallback(async () => {
    setLive(true);
    onExplore();
    const L = (await import("leaflet")).default;
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    const host = mapElRef.current;
    if (!host || leafletRef.current) return;

    const map = L.map(host, {
      center: [view.lat, view.lng], zoom: view.zoom,
      zoomControl: false, attributionControl: true, scrollWheelZoom: true,
    });
    L.tileLayer(TILE_TEMPLATE, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);

    L.marker([center.lat, center.lng], {
      keyboard: false,
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: "",
        html: `<span class="bcp-live-home"><span class="bcp-live-home-dot"></span><span class="bcp-live-home-label">La vivienda</span></span>`,
        iconSize: [0, 0], iconAnchor: [0, 0],
      }),
    }).addTo(map);

    // Los POIs son pulsables en el mapa vivo: exploración a la EMAAR, con
    // NUESTRA ficha contextual, nunca el tooltip por defecto de Leaflet.
    for (const p of [...mapPois, ...universities.slice(0, 3)]) {
      const mk = L.marker([p.latitude, p.longitude], {
        title: p.name,
        icon: L.divIcon({
          className: "",
          html: `<span class="bcp-live-poi"></span>`,
          iconSize: [12, 12], iconAnchor: [6, 6],
        }),
      }).addTo(map);
      mk.on("click", () => selectPoiRef.current?.(p));
    }
    leafletRef.current = { L, map };
  }, [center.lat, center.lng, view.lat, view.lng, view.zoom, mapPois, universities, onExplore]);

  const exitLive = useCallback(() => {
    leafletRef.current?.map.remove();
    leafletRef.current = null;
    setLive(false);
    setFocus(null);
  }, []);

  useEffect(() => () => leafletRef.current?.map?.remove(), []);

  const restoreOverview = useCallback(() => {
    setFocus(null);
    onRestore();
    const inst = leafletRef.current;
    inst?.map.flyTo([center.lat, center.lng], contextZoomForWidth(size?.w ?? 900, center.lat), {
      duration: 0.6,
    });
  }, [center.lat, center.lng, size?.w, onRestore]);

  // ── Cabecera editorial: SOLO dato administrativo verificado. ──
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
  const externalLink = `https://www.openstreetmap.org/?mlat=${center.lat}&mlon=${center.lng}#map=${view.zoom}/${center.lat}/${center.lng}`;
  const focusAreaPx = size ? Math.round(Math.min(size.w, size.h) * 0.46) : 0;

  // La ficha contextual se coloca en la banda LIBRE del escenario. Anclarla
  // siempre arriba tapaba el pill de "La vivienda" —y en móvil lo tapaba
  // entero—, que es justo el marcador que nunca debe perderse de vista.
  const cardPos = useMemo(() => {
    const W = 304, H = 150, M = 14;
    if (!size || !propertyPt || !focusPt) return { side: "top" as const, align: "center" as const };
    // Cuatro posiciones candidatas. Se elige la primera que NO pise ni a la
    // vivienda ni al destino: anclar siempre al centro escondía el pill de
    // "La vivienda", que es el marcador que nunca debe perderse de vista.
    const marks = [propertyPt, focusPt];
    const hits = (x: number, y: number) =>
      marks.some((m) => m.left > x - 60 && m.left < x + W + 60 && m.top > y - 46 && m.top < y + H + 46);
    const candidates: Array<{ side: "top" | "bottom"; align: "center" | "left" | "right"; x: number; y: number }> = [
      { side: "top", align: "center", x: (size.w - W) / 2, y: M },
      { side: "bottom", align: "center", x: (size.w - W) / 2, y: size.h - H - 54 },
      { side: "top", align: "left", x: M, y: M },
      { side: "top", align: "right", x: size.w - W - M, y: M },
      { side: "bottom", align: "right", x: size.w - W - M, y: size.h - H - 54 },
      { side: "bottom", align: "left", x: M, y: size.h - H - 54 },
    ];
    const free = candidates.find((c) => c.x >= 0 && !hits(c.x, c.y));
    return free ?? { side: "top" as const, align: "center" as const };
  }, [size, propertyPt, focusPt]);

  // Cápsula de POI: se oculta si su punto cae fuera del lienzo o si pisa al
  // marcador de la vivienda — mejor un destino menos que un amontonamiento.
  const capsuleVisible = (pt: { left: number; top: number }) => {
    if (!size || !propertyPt) return false;
    const margin = 46;
    if (pt.left < margin || pt.top < margin || pt.left > size.w - margin || pt.top > size.h - margin) return false;
    return Math.hypot(pt.left - propertyPt.left, pt.top - propertyPt.top) > 74;
  };

  return (
    <section
      ref={sectionRef}
      className="mt-5 overflow-hidden rounded-2xl border border-gold/20 bg-white/85 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.35)] backdrop-blur-sm"
    >
      {/* ── CABECERA ──────────────────────────────────────────────────── */}
      <div className="px-6 pt-6 md:px-8 md:pt-8">
        <h2 className="crm-section-title text-ink">Ubicación · {title}</h2>
        {editorialLine && <p className="crm-label-sm mt-1.5 text-gold-dark">{editorialLine}</p>}
        <p className="mt-1 text-xs text-ink/55">
          {hasPreciseCoords
            ? "Ubicación exacta de la propiedad."
            : "Zona aproximada del barrio. Te pasaremos la dirección exacta al coordinar la visita."}
        </p>
      </div>

      {/* ── CONECTADA CON MADRID · pieza editorial, no cards de dashboard.
             Una línea fina con hitos: se lee como una progresión, no como
             un panel de control. ────────────────────────────────────────── */}
      {rail.length > 0 && (
        <div className="mt-7 px-6 md:px-8">
          <p className="crm-label-sm text-gold-dark">Conectada con Madrid</p>
          <div className="mt-5 -mx-6 overflow-x-auto px-6 pb-1 md:mx-0 md:overflow-visible md:px-0">
            <ul className="relative flex min-w-[32rem] items-start gap-1 md:min-w-0">
              {/* Hilo continuo detrás de los hitos, a la altura de los puntos. */}
              <span
                aria-hidden
                className="pointer-events-none absolute left-[10%] right-[10%] top-[5px] h-px bg-gradient-to-r from-transparent via-gold/45 to-transparent"
              />
              {rail.map((p, i) => {
                const isActive = activePoi === p.name;
                const { Icon } = categoryOf(p.category);
                return (
                  <li key={p.name} className="bcp-rise relative flex-1" style={{ animationDelay: `${90 + i * 70}ms` }}>
                    <button
                      type="button"
                      onClick={() => selectPoi(p)}
                      data-rail-poi={p.name}
                      data-active={isActive ? "true" : "false"}
                      className="group flex w-full flex-col items-center px-1 text-center"
                    >
                      <span
                        className={`relative z-[1] block h-[11px] w-[11px] rounded-full border transition ${
                          isActive
                            ? "border-gold-dark bg-gold shadow-[0_0_0_4px_rgba(212,175,127,0.28)]"
                            : "border-gold/60 bg-white group-hover:border-gold-dark"
                        }`}
                      />
                      <span
                        className={`crm-number mt-3 block text-lg leading-none transition ${
                          isActive ? "text-ink" : "text-ink/75"
                        }`}
                      >
                        {p.minutes}
                        <span className="crm-meta ml-1 text-ink/45">min</span>
                      </span>
                      {p.mode !== "walk" && (
                        <span className="crm-meta mt-0.5 block text-ink/40">en coche</span>
                      )}
                      <span
                        className={`mt-1.5 flex items-center justify-center gap-1 text-[12px] leading-snug transition ${
                          isActive ? "text-ink" : "text-ink/60"
                        }`}
                      >
                        <Icon size={11} strokeWidth={1.75} className="shrink-0 text-gold-dark" />
                        <span className="line-clamp-2">{p.name}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      {/* ── ESCENARIO DEL MAPA ────────────────────────────────────────── */}
      <div
        ref={stageRef}
        data-focus={focus ? "true" : "false"}
        className={`bcp-map-stage relative mt-6 w-full overflow-hidden ${
          live ? "bcp-map-live h-[64vh] min-h-[420px]" : "h-[52vh] min-h-[340px] md:h-[540px]"
        }`}
      >
        {live ? (
          <>
            <div ref={mapElRef} className="absolute inset-0 h-full w-full" />
            <div className="absolute right-3 top-3 z-[500] flex flex-col gap-1.5">
              <button type="button" aria-label="Acercar" onClick={() => leafletRef.current?.map.zoomIn()}
                className="rounded-lg bg-white/95 p-2 text-ink shadow-[0_8px_20px_-12px_rgba(40,28,10,0.6)] transition hover:bg-white">
                <Plus size={15} strokeWidth={2} />
              </button>
              <button type="button" aria-label="Alejar" onClick={() => leafletRef.current?.map.zoomOut()}
                className="rounded-lg bg-white/95 p-2 text-ink shadow-[0_8px_20px_-12px_rgba(40,28,10,0.6)] transition hover:bg-white">
                <Minus size={15} strokeWidth={2} />
              </button>
            </div>
            {focus && <ContextCard poi={focus} onClose={restoreOverview} side={cardPos.side} align={cardPos.align} live />}
            {/* Control secundario, en esquina: no compite con el mapa. */}
            <button type="button" onClick={focus ? restoreOverview : exitLive}
              className="crm-meta absolute bottom-3 left-3 z-[500] inline-flex items-center gap-1.5 rounded-full bg-ink/95 px-3 py-1.5 text-cream-50 shadow-[0_10px_24px_-14px_rgba(40,28,10,0.9)] transition hover:bg-ink">
              {focus ? <Maximize2 size={11} strokeWidth={2} /> : <Lock size={11} strokeWidth={2} />}
              {focus ? "Ver zona completa" : "Salir del mapa"}
            </button>
          </>
        ) : (
          <>
            {/* Mosaico: son <img>, así que pasar el ratón por encima NUNCA
                intercepta el scroll de la página. */}
            <div className="absolute inset-0" style={{ isolation: "isolate" }} aria-hidden>
              <div className="bcp-map-tiles absolute inset-0">
                {mosaic?.tiles.map((t) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={`${t.z}/${t.x}/${t.y}`}
                    src={TILE_URL(t.z, t.x, t.y)}
                    alt="" width={256} height={256} loading="lazy" decoding="async" draggable={false}
                    className="absolute max-w-none"
                    style={{ left: t.left, top: t.top, width: 256, height: 256 }}
                  />
                ))}
              </div>
              <div className="bcp-map-wash absolute inset-0" />
            </div>

            {/* ÁREA DE FOCO de la vivienda. Es una HERRAMIENTA DE COMPOSICIÓN
                para anclar la mirada — NO representa un radio de viaje, no
                lleva minutos dentro y no es una isócrona. */}
            {propertyPt && !focus && focusAreaPx > 0 && (
              <span
                aria-hidden
                className="bcp-focus-area pointer-events-none absolute z-[1] rounded-full"
                style={{
                  left: propertyPt.left, top: propertyPt.top,
                  width: focusAreaPx, height: focusAreaPx,
                  marginLeft: -focusAreaPx / 2, marginTop: -focusAreaPx / 2,
                }}
              />
            )}

            {/* CONEXIÓN vivienda → destino: curva, fina y MUY secundaria.
                Representa proximidad; jamás un recorrido por calles, porque
                no tenemos geometría de routing real. */}
            {focusPt && propertyPt && size && (
              <svg className="pointer-events-none absolute inset-0 z-[2]" width={size.w} height={size.h} aria-hidden>
                <path
                  className="bcp-connection"
                  d={curveBetween(propertyPt, focusPt)}
                  fill="none" stroke="#c9a86a" strokeWidth={1.25}
                  strokeLinecap="round" strokeDasharray="3 7" opacity={0.55}
                />
              </svg>
            )}

            {/* CÁPSULAS DE POI en overview: el lifestyle se entiende SIN
                bajar a la lista. Como máximo cuatro, y solo las que caben. */}
            {mosaic && hasPreciseCoords && !focus &&
              mapPois.map((p, i) => {
                const pt = mosaic.project(p.latitude, p.longitude);
                if (!capsuleVisible(pt)) return null;
                const { Icon } = categoryOf(p.category);
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => selectPoi(p)}
                    data-capsule={p.name}
                    className="bcp-capsule absolute z-[3] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-ink/10 bg-cream-50/95 px-2.5 py-1 text-[11px] text-ink/85 shadow-[0_6px_18px_-10px_rgba(40,28,10,0.55)] transition hover:border-gold hover:bg-white"
                    style={{ left: pt.left, top: pt.top, animationDelay: `${260 + i * 90}ms` }}
                  >
                    <Icon size={11} strokeWidth={1.75} className="shrink-0 text-gold-dark" />
                    <span className="max-w-[9rem] truncate">{p.name}</span>
                  </button>
                );
              })}

            {/* MARCADOR DEL DESTINO: jerarquía por encima de todo salvo la
                vivienda, con su ficha contextual anclada. */}
            {focusPt && (
              <span className="absolute z-[5]" style={{ left: focusPt.left, top: focusPt.top }} aria-hidden>
                <span className="bcp-dest absolute left-0 top-0 block">
                  <span className="block h-[26px] w-[26px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold shadow-[0_12px_28px_-8px_rgba(40,28,10,0.95)] ring-[4px] ring-white" />
                </span>
              </span>
            )}

            {/* LA VIVIENDA: identidad de marca, siempre reconocible. */}
            {propertyPt && (
              <span className="absolute z-[6]" style={{ left: propertyPt.left, top: propertyPt.top }} aria-hidden>
                {!focus && <span className="bcp-marker-halo absolute left-0 top-0 block h-16 w-16 rounded-full bg-gold/40" />}
                <span className="bcp-marker absolute left-0 top-0 flex -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full bg-ink px-2 py-[5px] pr-3 shadow-[0_12px_30px_-10px_rgba(10,10,10,0.95)] ring-1 ring-gold/60">
                  <span className="block h-2.5 w-2.5 shrink-0 rounded-full bg-gold" />
                  <span className="crm-meta whitespace-nowrap text-cream-50">La vivienda</span>
                </span>
              </span>
            )}

            {/* Sin coordenadas: círculo de zona, jamás un pin falso. */}
            {mosaic && !hasPreciseCoords && (
              <span aria-hidden
                className="pointer-events-none absolute left-1/2 top-1/2 z-[2] h-32 w-32 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-gold/75 bg-gold/15 shadow-[0_0_0_4px_rgba(212,175,127,0.16)] md:h-40 md:w-40" />
            )}

            {focus && <ContextCard poi={focus} onClose={restoreOverview} side={cardPos.side} align={cardPos.align} />}

            {/* Activación EXPLÍCITA, nunca por hover, y como control
                secundario en esquina: la escena manda, no el botón. */}
            <button
              type="button"
              onClick={focus ? restoreOverview : enterLive}
              className="crm-meta absolute bottom-3 left-3 z-[7] inline-flex items-center gap-1.5 rounded-full bg-ink/95 px-3 py-1.5 text-cream-50 shadow-[0_10px_24px_-14px_rgba(40,28,10,0.9)] backdrop-blur-sm transition hover:bg-ink"
            >
              {focus ? <Maximize2 size={11} strokeWidth={2} /> : <Compass size={11} strokeWidth={2} />}
              {focus ? "Ver zona completa" : "Explorar mapa"}
            </button>

            <span className="absolute bottom-1 right-1.5 z-[7] rounded bg-white/80 px-1.5 py-0.5 text-[10px] leading-tight text-ink/55">
              ©{" "}
              <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">OpenStreetMap</a>{" "}
              ©{" "}
              <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">CARTO</a>
            </span>
          </>
        )}
      </div>

      {/* ── CERCA DE LA VIVIENDA · información complementaria ─────────── */}
      {pois.length > 0 && (
        <div className="px-6 pb-2 pt-6 md:px-8">
          <p className="crm-label-sm text-gold-dark">Cerca de la vivienda</p>
          <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {ordered.map((p, i) => (
              <DestinationRow key={p.name} poi={p} active={activePoi === p.name} delay={140 + i * 50} onSelect={selectPoi} />
            ))}
          </ul>
        </div>
      )}

      {/* ── UNIVERSIDADES · mismo catálogo, mismo cálculo, mismo focus ── */}
      {universities.length > 0 && (
        <div className="px-6 pb-2 pt-5 md:px-8">
          <p className="crm-label-sm text-gold-dark">Universidades cercanas</p>
          <ul className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
            {universities.map((u, i) => (
              <DestinationRow
                key={u.name} poi={u} active={activePoi === u.name}
                delay={160 + i * 50} onSelect={selectPoi} sublabel={u.campusLabel}
              />
            ))}
          </ul>
        </div>
      )}

      <div className="px-6 py-3 md:px-8">
        <a href={externalLink} target="_blank" rel="noopener noreferrer" className="text-xs text-gold-dark hover:underline">
          Ver mapa en pantalla completa ↗
        </a>
      </div>
    </section>
  );
}

/** Fila de destino. La usan "Cerca de la vivienda" y las universidades: una
 *  sola pieza, un solo estado activo, la misma interacción. */
function DestinationRow({
  poi, active, delay, onSelect, sublabel,
}: {
  poi: PoiTravel; active: boolean; delay: number;
  onSelect: (p: PoiTravel) => void; sublabel?: string | null;
}) {
  const { label, Icon } = categoryOf(poi.category);
  return (
    <li className="bcp-rise" style={{ animationDelay: `${delay}ms` }}>
      <button
        type="button"
        onClick={() => onSelect(poi)}
        data-row-poi={poi.name}
        data-active={active ? "true" : "false"}
        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
          active ? "border-gold bg-gold/10" : "border-transparent hover:border-gold/25 hover:bg-gold/5"
        }`}
      >
        <span className="flex min-w-0 items-baseline gap-2.5">
          <Icon size={13} strokeWidth={1.75} className="shrink-0 translate-y-0.5 text-gold-dark" />
          <span className="min-w-0">
            <span className="block truncate text-sm text-ink/85">{poi.name}</span>
            {(sublabel || label) && (
              <span className="crm-meta block truncate text-ink/40">{sublabel || label}</span>
            )}
          </span>
        </span>
        <span className="crm-meta shrink-0 whitespace-nowrap text-ink/55">
          ≈ {poi.minutes} min {modeLabel(poi.mode)}
        </span>
      </button>
    </li>
  );
}

/** Ficha contextual del destino (principio EMAAR): componente NUESTRO, nunca
 *  el popup por defecto de Leaflet. Se ancla arriba para no taparse con el
 *  control de la esquina inferior ni salirse en móvil. */
function ContextCard({
  poi, onClose, side = "top", align = "center", live,
}: {
  poi: PoiTravel; onClose: () => void;
  side?: "top" | "bottom"; align?: "center" | "left" | "right"; live?: boolean;
}) {
  const { label, Icon } = categoryOf(poi.category);
  return (
    <div
      data-side={side}
      data-align={align}
      className={`bcp-context-card absolute z-[600] w-[min(19rem,calc(100%-1.5rem))] rounded-2xl border border-gold/25 bg-cream-50/95 p-4 shadow-[0_22px_50px_-20px_rgba(40,28,10,0.6)] backdrop-blur-sm ${
        side === "top" ? "top-3.5" : "bottom-14"
      } ${
        align === "center" ? "left-1/2 -translate-x-1/2" : align === "left" ? "left-3.5" : "right-3.5"
      }`}
    >
      <button
        type="button" onClick={onClose} aria-label="Cerrar"
        className="absolute right-2.5 top-2.5 rounded-full p-1 text-ink/35 transition hover:bg-ink/5 hover:text-ink"
      >
        <X size={13} strokeWidth={2} />
      </button>
      <p className="crm-label-sm pr-6 text-ink">{poi.name}</p>
      {label && (
        <p className="crm-meta mt-1 flex items-center gap-1.5 text-ink/50">
          <Icon size={11} strokeWidth={1.75} className="text-gold-dark" />
          {label}
        </p>
      )}
      <p className="crm-number mt-2.5 text-xl leading-none text-ink">
        ≈ {poi.minutes}
        <span className="crm-meta ml-1.5 text-ink/50">min {modeLabel(poi.mode)}</span>
      </p>
      <p className="crm-meta mt-1 text-ink/40">Desde la vivienda</p>
    </div>
  );
}

/** Curva suave entre dos puntos: se comba perpendicular al segmento para que
 *  se lea como un gesto de conexión y no como el trazado de una calle. */
function curveBetween(a: { left: number; top: number }, b: { left: number; top: number }): string {
  const dx = b.left - a.left;
  const dy = b.top - a.top;
  const dist = Math.hypot(dx, dy) || 1;
  const bow = Math.min(46, dist * 0.16);
  const mx = (a.left + b.left) / 2 - (dy / dist) * bow;
  const my = (a.top + b.top) / 2 + (dx / dist) * bow;
  return `M ${a.left} ${a.top} Q ${mx} ${my} ${b.left} ${b.top}`;
}
