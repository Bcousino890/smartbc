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
  Car, Compass, Dumbbell, Footprints, GraduationCap, HeartPulse, Landmark, Lock, MapPin,
  Maximize2, Minus, Plus, ShoppingBag, TrainFront, Trees, UtensilsCrossed, X,
} from "lucide-react";
import { buildMosaic, clampPointInView, contextZoomForWidth, fitPoints, fitTwoPoints, shiftViewVertically, type Mosaic } from "@/lib/geo/tile-math";
import type { PoiTravel } from "@/lib/geo/poi-distance";
import type { NearbyUniversity } from "@/lib/geo/universities-nearby";
import { ZoneExplorerMapLibre } from "./zone-explorer-maplibre";
import { residenceMarkerHtml } from "@/lib/services/location/markers";
import { LOCATION_EASING, LOCATION_MOTION, prefersReducedMotion } from "@/lib/services/location/motion";
import { fromCuratedPoi, fromUniversity, type LocationDestination } from "@/lib/services/location/destination";

/** Una universidad se distingue de un POI curado por su campus: es el único
 *  campo que el catálogo de universidades añade sobre `PoiTravel`. */
function isUniversity(p: PoiTravel): p is NearbyUniversity {
  return "campusLabel" in p;
}

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
/** Banda superior reservada a la ficha contextual (alto de la ficha + aire). */
const CARD_BAND_PX = 168;

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
  mapProvider = "maplibre",
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
  /** Proveedor del explorador de zona. */
  mapProvider?: "maplibre" | "osm-static";
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
  // Rail de conectividad: el indicador de viaje viaja hasta el nodo elegido.
  const railRef = useRef<HTMLUListElement | null>(null);
  const indicatorRef = useRef<HTMLSpanElement | null>(null);
  const railAnimRef = useRef<Animation | null>(null);
  /** El indicador no se coloca hasta la primera selección: al cargar, el
   *  overview tiene que estar quieto (§41 — nada de viajes automáticos). */
  const [indicatorReady, setIndicatorReady] = useState(false);
  const activePoi = focus?.name ?? null;
  // Lugar DESCUBIERTO por el cliente en el basemap. Se guarda aparte de los
  // POIs curados: nunca se mezclan ni se presenta como recomendación de BCP.
  const [placeFocus, setPlaceFocus] = useState<LocationDestination | null>(null);
  // El mapa no cargó → se vuelve al mosaico estático: nunca un hueco roto.
  const [mapDown, setMapDown] = useState(false);
  const useVectorMap = mapProvider === "maplibre" && !mapDown;

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

  // ── Indicador de viaje ──
  // Se anima hasta el CENTRO REAL del nodo activo, medido en el DOM: con
  // etiquetas de ancho variable y un rail que en móvil hace scroll, calcular
  // la posición por porcentaje se desalinea. Y se mide dentro del sistema de
  // coordenadas del propio rail, no del viewport.
  const railIndex = focus ? rail.findIndex((p) => p.name === focus.name) : -1;
  useEffect(() => {
    const railEl = railRef.current;
    const indicator = indicatorRef.current;
    if (!railEl || !indicator) return;
    if (railIndex < 0) return; // sin selección el indicador no existe todavía

    const node = railEl.querySelector<HTMLElement>(`[data-rail-node="${railIndex}"]`);
    if (!node) return;
    const nodeRect = node.getBoundingClientRect();
    const railRect = railEl.getBoundingClientRect();
    const toX = nodeRect.left - railRect.left + nodeRect.width / 2;

    // Interrumpible: si se pulsa otro destino a mitad de recorrido, el viaje
    // anterior se cancela en seco en vez de encolarse (§40).
    railAnimRef.current?.cancel();

    const reduced = prefersReducedMotion();
    const previous = indicator.style.getPropertyValue("--x");
    const fromX = previous ? Number.parseFloat(previous) : toX;
    indicator.style.setProperty("--x", `${toX}`);

    if (reduced || !indicatorReady) {
      // Sin animación: aparece ya colocado. La información es la misma.
      indicator.style.transform = `translateX(${toX}px) translateX(-50%)`;
      setIndicatorReady(true);
      return;
    }
    railAnimRef.current = indicator.animate(
      [
        { transform: `translateX(${fromX}px) translateX(-50%)` },
        { transform: `translateX(${toX}px) translateX(-50%)` },
      ],
      { duration: LOCATION_MOTION.rail, easing: LOCATION_EASING, fill: "forwards" },
    );

    // En móvil el rail hace scroll: el nodo elegido tiene que quedar a la vista.
    node.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "nearest", inline: "center" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [railIndex]);

  useEffect(() => () => railAnimRef.current?.cancel(), []);

  // ── Vista del mapa ──
  const view = useMemo(() => {
    if (!size) return { lat: center.lat, lng: center.lng, zoom: 15 };
    if (focus && hasPreciseCoords) {
      // Se RESERVA una banda superior para la ficha contextual: se encuadra
      // en un lienzo más bajo y luego se baja el contenido. En móvil la ficha
      // ocupa casi todo el ancho, así que ese hueco es la única forma de que
      // no tape a la vivienda ni al destino.
      const BAND = CARD_BAND_PX;
      const padding = Math.max(48, Math.round(Math.min(size.w, size.h - BAND) * 0.12));
      const fitted = fitTwoPoints({
        a: { lat: center.lat, lng: center.lng },
        b: { lat: focus.latitude, lng: focus.longitude },
        width: size.w, height: Math.max(140, size.h - BAND), padding, maxZoom: 16,
      });
      return shiftViewVertically(fitted, -BAND / 2);
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
    // Si los destinos caen todos al mismo lado, el encuadre empuja la vivienda
    // contra el borde y en móvil el medallón se corta. Se recentra lo justo.
    return clampPointInView(
      fitted,
      { lat: center.lat, lng: center.lng },
      size.w,
      size.h,
      Math.max(64, Math.round(size.w * 0.16)),
    );
  }, [size, center.lat, center.lng, hasPreciseCoords, fallbackCoords.zoom, focus, mapPois]);

  const mosaic: Mosaic | null = useMemo(() => {
    if (!size) return null;
    return buildMosaic({ lat: view.lat, lng: view.lng, zoom: view.zoom, width: size.w, height: size.h });
  }, [size, view]);

  // Proyección de las capas HTML (medallón, cápsulas, área de foco, curva).
  // Con el mapa vectorial la da MAPLIBRE: dos matemáticas distintas para el
  // mismo encuadre acabarían desalineándose. El mosaico solo proyecta cuando
  // es él quien pinta (fallback).
  const projectorRef = useRef<((lat: number, lng: number) => { left: number; top: number }) | null>(null);
  const [projVersion, setProjVersion] = useState(0);
  const handleProjector = useCallback(
    (fn: ((lat: number, lng: number) => { left: number; top: number }) | null) => {
      projectorRef.current = fn;
      setProjVersion((v) => v + 1);
    },
    [],
  );
  const project = useMemo(() => {
    if (useVectorMap && projectorRef.current) return projectorRef.current;
    return mosaic ? mosaic.project : null;
    // projVersion fuerza el recálculo cuando el mapa publica un proyector nuevo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useVectorMap, mosaic, projVersion]);

  const propertyPt = project && hasPreciseCoords ? project(center.lat, center.lng) : null;
  const focusPt = project && focus ? project(focus.latitude, focus.longitude) : null;

  // ── Modo explorar (Leaflet bajo demanda) ──

  /** ÚNICO punto de entrada del DESTINATION FOCUS. */
  const selectPoi = useCallback(
    (p: PoiTravel) => {
      // El encuadre lo calcula `view` (fitTwoPoints con la banda de la ficha
      // reservada) y lo aplica la cámara del mapa: una sola geometría para
      // overview y exploración.
      setFocus((prev) => (prev?.name === p.name ? prev : p));
      onPoiClick(p.name, p.category);
    },
    [onPoiClick],
  );

  const enterLive = useCallback(() => {
    // Un solo renderer: "explorar" ya no monta otro mapa, solo desbloquea la
    // interacción del que ya está pintado.
    setLive(true);
    onExplore();
  }, [onExplore]);

  const exitLive = useCallback(() => {
    setLive(false);
    setFocus(null);
    setPlaceFocus(null);
  }, []);

  useEffect(() => {
    onExternalOpenRef.current = (name) => onPoiClick(name, "external_osm");
    return () => { onExternalOpenRef.current = null; };
  }, [onPoiClick]);

  /** Vuelta al overview. Una sola puerta: rail, mapa, ficha y listas a la vez. */
  const restoreOverview = useCallback(() => {
    // El indicador se retira con el mismo carácter con el que llegó; el
    // encuadre vuelve solo porque `view` se recalcula sin foco.
    railAnimRef.current?.cancel();
    setFocus(null);
    setPlaceFocus(null);
    onRestore();
  }, [onRestore]);

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
  // Con la banda superior reservada por el encuadre, la ficha va arriba y
  // centrada: es la posición más legible y ya no puede pisar a nadie.
  const cardPos = { side: "top" as const, align: "center" as const };

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
          <div className="bcp-rail-scroll mt-5 -mx-6 overflow-x-auto px-6 pb-1 md:mx-0 md:overflow-visible md:px-0">
            <ul ref={railRef} className="relative flex min-w-[32rem] items-start gap-1 md:min-w-0">
              {/* Hilo continuo detrás de los hitos, a la altura de los puntos. */}
              <span
                aria-hidden
                className="pointer-events-none absolute left-[10%] right-[10%] top-[5px] h-px bg-gradient-to-r from-transparent via-gold/45 to-transparent"
              />
              {/* INDICADOR DE VIAJE · viaja por el rail hasta el destino
                  elegido. Es narrativa de tiempo, no un vehículo sobre un
                  mapa: por eso vive en el rail y no en la geografía. Su
                  glifo cambia con el modo (a pie / en coche). */}
              {railIndex >= 0 && (
                <span
                  ref={indicatorRef}
                  aria-hidden
                  className="bcp-travel-indicator pointer-events-none absolute left-0 top-[5px] z-[2] -translate-y-1/2"
                >
                  {focus?.mode === "walk" ? (
                    <Footprints size={13} strokeWidth={1.75} />
                  ) : (
                    <Car size={13} strokeWidth={1.75} />
                  )}
                </span>
              )}
              {rail.map((p, i) => {
                const isActive = activePoi === p.name;
                const { Icon } = categoryOf(p.category);
                return (
                  <li key={p.name} className="bcp-rise relative flex-1 scroll-mx-6" style={{ animationDelay: `${90 + i * 70}ms` }}>
                    <button
                      type="button"
                      onClick={() => selectPoi(p)}
                      data-rail-poi={p.name}
                      data-active={isActive ? "true" : "false"}
                      className="group flex w-full flex-col items-center px-1 text-center"
                    >
                      {/* El nodo activo se distingue por relleno Y por peso de
                          la etiqueta, nunca solo por color (§44). */}
                      <span
                        data-rail-node={i}
                        className={`relative z-[1] block h-[11px] w-[11px] rounded-full border transition ${
                          isActive
                            ? "border-gold-dark bg-gold shadow-[0_0_0_4px_rgba(212,175,127,0.28)]"
                            : "border-gold/60 bg-white group-hover:border-gold-dark"
                        }`}
                      />
                      <span
                        className={`crm-number mt-3 block text-lg leading-none transition ${
                          isActive ? "font-medium text-ink" : "text-ink/75"
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
        data-map-provider={mapProvider}
        className={`bcp-map-stage relative mt-6 w-full overflow-hidden ${
          live ? "bcp-map-live h-[64vh] min-h-[420px]" : "h-[52vh] min-h-[340px] md:h-[540px]"
        }`}
      >
        {/* UN SOLO MAPA para overview y exploración: mismo renderer, mismo
            estilo, misma cámara, mismos marcadores. Lo único que cambia es el
            estado de interacción. El mosaico de teselas ráster queda como red
            de seguridad si MapLibre no carga. */}
        {useVectorMap ? (
          <ZoneExplorerMapLibre
            origin={{ lat: center.lat, lng: center.lng }}
            originLabel="La vivienda"
            interactive={live}
            // En overview la cámara la compone el módulo; al explorar el mapa
            // se gobierna solo.
            camera={live ? null : view}
            // En overview los POIs curados los dibujan las cápsulas
            // editoriales (con nombre, máximo cuatro y con comprobación de
            // colisión); al explorar pasan a marcadores de glifo, que es lo
            // que aguanta la densidad.
            curated={
              live
                ? [...mapPois.map(fromCuratedPoi), ...universities.map(fromUniversity)]
                : []
            }
            focus={
              placeFocus ??
              (focus
                ? isUniversity(focus)
                  ? fromUniversity(focus)
                  : fromCuratedPoi(focus)
                : null)
            }
            onSelectPlace={(d) => {
              setPlaceFocus(d);
              setFocus(null);
              onPoiClick(d.name, d.category);
            }}
            onSelectCurated={(d) => {
              // El mapa devuelve un destino; la máquina de estados sigue
              // hablando en POIs del catálogo, así que se busca el original.
              const original = [...mapPois, ...universities].find((p) => p.name === d.name);
              if (original) selectPoi(original);
            }}
            onProjector={handleProjector}
            onUnavailable={() => setMapDown(true)}
          />
        ) : (
          /* Mosaico de respaldo: son <img>, así que pasar el ratón por encima
             NUNCA intercepta el scroll de la página. */
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
        )}

        {live ? (
          <>
            {placeFocus ? (
              <ContextCard
                place={placeFocus}
                onClose={() => { setPlaceFocus(null); restoreOverview(); }}
                side="top" align="center" live
              />
            ) : focus ? (
              <ContextCard poi={focus} onClose={restoreOverview} side={cardPos.side} align={cardPos.align} live />
            ) : null}
            {/* Control secundario, en esquina: no compite con el mapa. */}
            <button type="button" onClick={focus ? restoreOverview : exitLive}
              className="crm-meta absolute bottom-11 left-3 z-[500] inline-flex items-center gap-1.5 rounded-full bg-ink/95 md:bottom-3 px-3 py-1.5 text-cream-50 shadow-[0_10px_24px_-14px_rgba(40,28,10,0.9)] transition hover:bg-ink">
              {focus ? <Maximize2 size={11} strokeWidth={2} /> : <Lock size={11} strokeWidth={2} />}
              {focus ? "Ver zona completa" : "Salir de la zona"}
            </button>
          </>
        ) : (
          <>
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

            {/* Aquí iba una curva discontinua entre la vivienda y el destino.
                Se ha quitado a propósito: por fina que fuera, leía como
                software de medición y era lo único que impedía que el mapa se
                viese como un lugar. La relación ya la cuentan el rail (tiempo),
                la cámara (geografía) y la ficha (contexto). */}

            {/* CÁPSULAS DE POI en overview: el lifestyle se entiende SIN
                bajar a la lista. Son los marcadores curados de este estado —
                misma familia visual que los glifos del explorador (marfil,
                carbón, filo champán), pero con nombre. Como máximo cuatro, y
                solo las que caben (§4). */}
            {project && hasPreciseCoords && !focus &&
              mapPois.map((p, i) => {
                const pt = project(p.latitude, p.longitude);
                if (!capsuleVisible(pt)) return null;
                const { Icon } = categoryOf(p.category);
                return (
                  <button
                    key={p.name}
                    type="button"
                    onClick={() => selectPoi(p)}
                    data-capsule={p.name}
                    className="bcp-capsule absolute z-[3] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-gold/45 bg-cream-50/95 px-2.5 py-1 text-[11px] text-ink/85 shadow-[0_6px_18px_-10px_rgba(40,28,10,0.55)] transition hover:border-gold hover:bg-white"
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

            {/* LA VIVIENDA · con el mapa vectorial el medallón lo pinta el
                propio mapa (un solo marcador para overview y explorar); este
                overlay solo existe para el mosaico de respaldo. */}
            {propertyPt && (
              <span className="absolute z-[6]" style={{ left: propertyPt.left, top: propertyPt.top }} aria-hidden>
                {!focus && !useVectorMap && (
                  <span className="bcp-marker-halo absolute left-0 top-0 block h-16 w-16 rounded-full bg-gold/40" />
                )}
                {!useVectorMap && (
                  <span
                    className="absolute left-0 top-0"
                    dangerouslySetInnerHTML={{ __html: residenceMarkerHtml("La vivienda") }}
                  />
                )}
              </span>
            )}

            {/* Sin coordenadas: círculo de zona, jamás un pin falso. */}
            {!hasPreciseCoords && (
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
              {focus ? "Ver zona completa" : "Explorar la zona"}
            </button>

            {/* Con el mapa vectorial la atribución la pone MapLibre; esta
                solo acompaña al mosaico de respaldo (teselas de CARTO). */}
            {!useVectorMap && (
              <span className="absolute bottom-1 right-1.5 z-[7] rounded bg-white/80 px-1.5 py-0.5 text-[10px] leading-tight text-ink/55">
                ©{" "}
                <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">OpenStreetMap</a>{" "}
                ©{" "}
                <a href="https://carto.com/attributions" target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">CARTO</a>
              </span>
            )}
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
 *  el popup por defecto del proveedor. Sirve por igual a un POI curado por BCP
 *  y a un sitio que el cliente ha descubierto en Google — con una diferencia
 *  deliberada: el de Google enseña dirección y enlace externo, y NUNCA se
 *  presenta como recomendación de BCP. */
function ContextCard({
  poi, place, onClose, side = "top", align = "center", live,
}: {
  poi?: PoiTravel;
  place?: LocationDestination;
  onClose: () => void;
  side?: "top" | "bottom"; align?: "center" | "left" | "right"; live?: boolean;
}) {
  const name = place?.name ?? poi?.name ?? "";
  const categoryKey = place?.category ?? poi?.category ?? "";
  const { label, Icon } = categoryOf(categoryKey);
  const subtitle = place?.subtitle ?? null;
  const eta = place?.eta ?? (poi ? { minutes: poi.minutes, mode: poi.mode } : null);
  const isDiscovered = place?.source === "osm_discovered";
  // Enlace a OSM solo si el id es REAL (no el generado desde coordenadas):
  // preferimos no ofrecer enlace a ofrecer uno que lleve a ninguna parte.
  const osmId = place?.id.replace(/^osm:/, "") ?? "";
  const osmUrl = isDiscovered && /^\d+$/.test(osmId)
    ? `https://www.openstreetmap.org/node/${osmId}`
    : isDiscovered
      ? `https://www.openstreetmap.org/?mlat=${place!.lat}&mlon=${place!.lng}#map=18/${place!.lat}/${place!.lng}`
      : null;

  return (
    <div
      data-side={side}
      data-align={align}
      role="dialog"
      aria-label={name}
      // En escritorio flota arriba y centrada, sobre la banda que el encuadre
      // ya reserva para ella. En móvil NO se intenta anclar una ficha de 300px
      // sobre un marcador en 390px de ancho: se convierte en una tarjeta
      // inferior dentro del propio mapa (§35), que deja ver el mapa y no
      // secuestra el scroll de la página.
      className={`bcp-context-card bcp-context-card--mobile-sheet absolute z-[600] rounded-2xl border border-gold/25 bg-cream-50/95 p-4 shadow-[0_22px_50px_-20px_rgba(40,28,10,0.6)] backdrop-blur-sm md:w-[min(21rem,calc(100%-1.5rem))] ${
        side === "top" ? "md:top-3.5" : "md:bottom-14"
      } ${
        align === "center" ? "md:left-1/2 md:-translate-x-1/2" : align === "left" ? "md:left-3.5" : "md:right-3.5"
      }`}
    >
      <button
        type="button" onClick={onClose} aria-label="Cerrar"
        className="absolute right-2.5 top-2.5 rounded-full p-1 text-ink/35 transition hover:bg-ink/5 hover:text-ink"
      >
        <X size={13} strokeWidth={2} />
      </button>
      <p className="crm-label-sm pr-6 text-ink">{name}</p>
      {(subtitle || label) && (
        <p className="crm-meta mt-1 flex items-center gap-1.5 text-ink/50">
          <Icon size={11} strokeWidth={1.75} className="text-gold-dark" />
          {subtitle || label}
        </p>
      )}
      {place?.address && <p className="crm-meta mt-1.5 text-ink/45">{place.address}</p>}
      {eta ? (
        <>
          <p className="crm-number mt-2.5 text-xl leading-none text-ink">
            ≈ {eta.minutes}
            <span className="crm-meta ml-1.5 text-ink/50">min {modeLabel(eta.mode as PoiTravel["mode"])}</span>
          </p>
          <p className="crm-meta mt-1 text-ink/40">Desde la vivienda</p>
        </>
      ) : (
        // Sin tiempo verificado NO se inventa uno: se dice lo que se sabe.
        <p className="crm-meta mt-2.5 text-ink/45">En la zona de la vivienda</p>
      )}
      {osmUrl && (
        <a
          href={osmUrl} target="_blank" rel="noopener noreferrer"
          onClick={() => onExternalOpenRef.current?.(name)}
          className="crm-meta mt-3 inline-block text-gold-dark underline-offset-2 hover:underline"
        >
          Ver en OpenStreetMap ↗
        </a>
      )}
    </div>
  );
}

/** Callback de "Ver en Google Maps" para analítica, sin acoplar la ficha. */
const onExternalOpenRef: { current: ((name: string) => void) | null } = { current: null };

