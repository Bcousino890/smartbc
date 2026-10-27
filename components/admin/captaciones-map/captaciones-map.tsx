"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { MapPin, PinTier } from "@/lib/captaciones-map/pins";
import { pinAriaLabel } from "@/lib/captaciones-map/pin-label";
import { buildPinIcon } from "./pin-marker";

type Bbox = { minLng: number; minLat: number; maxLng: number; maxLat: number };

export interface CaptacionesMapProps {
  pins: MapPin[];
  tiers: Map<string, PinTier>;
  scores: Map<string, number>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onBoundsChange: (bbox: Bbox) => void;
  /** Para que el editor de zonas (otra pieza) pinte y dibuje sobre la misma instancia. */
  onMapReady: (map: L.Map) => void;
  theme: "light" | "dark";
}

const MADRID_CENTER: L.LatLngExpression = [40.4168, -3.7038];
/** Por encima de este nº de pines a la vista solo los `match` conservan precio. */
const LABEL_LIMIT = 400;
const BOUNDS_DEBOUNCE_MS = 350;

type Entry = { layer: L.Marker | L.CircleMarker; key: string; selected: boolean; tier: PinTier };

/**
 * Mapa base de captaciones: Leaflet imperativo (sin react-leaflet, como
 * zone-draw-map.tsx). El mapa se crea UNA vez; los cambios de props
 * sincronizan solo los marcadores que difieren (clave por pin), porque
 * reconstruir cientos de iconos en cada selección o cambio de filtro haría
 * saltar el mapa y perder zoom/pan.
 *
 * No pinta polígonos ni tiene editor: entrega la instancia por onMapReady.
 */
export default function CaptacionesMap(props: CaptacionesMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const entriesRef = useRef<Map<string, Entry>>(new Map());
  const syncRef = useRef<() => void>(() => {});
  // Siempre las props más recientes, sin recrear el mapa ni los listeners.
  const propsRef = useRef(props);
  propsRef.current = props;

  // Creación única del mapa.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const map = L.map(el, {
      preferCanvas: true,
      center: MADRID_CENTER,
      zoom: 12,
      zoomAnimation: !reduceMotion,
      markerZoomAnimation: !reduceMotion,
      fadeAnimation: !reduceMotion,
      // El zoom por defecto (arriba a la izquierda) quedaba debajo de la barra
      // de herramientas: se recoloca abajo a la derecha.
      zoomControl: false,
    });
    mapRef.current = map;
    L.control.zoom({ position: "bottomright", zoomInTitle: "Acercar", zoomOutTitle: "Alejar" }).addTo(map);

    // Abrir/cerrar paneles o pasar a móvil cambia el tamaño del contenedor sin
    // que Leaflet se entere: quedarían teselas grises y clics desplazados.
    let resizeRaf = 0;
    const ro = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => {
          cancelAnimationFrame(resizeRaf);
          resizeRaf = requestAnimationFrame(() => map.invalidateSize({ pan: false }));
        })
      : null;
    ro?.observe(el);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    // Velo cálido: un div dentro del mapPane (entre teselas y marcadores) que
    // se recoloca al mover el mapa para cubrir siempre la vista. Así tiñe el
    // mapa pero no los pines.
    const veilPane = map.createPane("cm-veil");
    veilPane.style.zIndex = "250";
    veilPane.style.pointerEvents = "none";
    const veil = L.DomUtil.create("div", "cm-veil", veilPane);
    const placeVeil = () => {
      const size = map.getSize();
      veil.style.width = `${size.x}px`;
      veil.style.height = `${size.y}px`;
      L.DomUtil.setPosition(veil, map.containerPointToLayerPoint([0, 0]));
    };
    map.on("move zoom resize", placeVeil);
    placeVeil();

    map.on("click", () => propsRef.current.onSelect(null));
    // Cambia el nº de pines a la vista → puede cambiar quién conserva precio.
    map.on("moveend", () => syncRef.current());

    let timer: ReturnType<typeof setTimeout> | null = null;
    const emitBounds = () => {
      const b = map.getBounds();
      propsRef.current.onBoundsChange({
        minLng: b.getWest(),
        minLat: b.getSouth(),
        maxLng: b.getEast(),
        maxLat: b.getNorth(),
      });
    };
    // Debounce: durante un arrastre moveend se encadena y cada aviso suele
    // disparar una consulta al servidor.
    map.on("moveend", () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(emitBounds, BOUNDS_DEBOUNCE_MS);
    });

    const entries = entriesRef.current;
    syncRef.current = () => sync(map, entries, propsRef.current, propsRef);
    syncRef.current();
    propsRef.current.onMapReady(map);
    emitBounds();

    return () => {
      ro?.disconnect();
      cancelAnimationFrame(resizeRaf);
      if (timer) clearTimeout(timer);
      syncRef.current = () => {};
      entries.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Cambios de datos, selección o tema: solo se sincronizan los marcadores.
  useEffect(() => {
    syncRef.current();
  }, [props.pins, props.tiers, props.selectedId, props.theme]);

  return (
    <div className={`cm-root ${props.theme === "dark" ? "cm-theme-dark" : ""}`}>
      <div ref={containerRef} className="cm-map font-crm-sans" />
      <style>{CSS}</style>
    </div>
  );
}

/** Cambia el estado seleccionado sin recrear el marcador (conserva el foco de teclado). */
function applySelection(e: Entry, selected: boolean, theme: "light" | "dark") {
  if (e.layer instanceof L.Marker) {
    e.layer.getElement()?.classList.toggle("cm-sel", selected);
    e.layer.setZIndexOffset(selected ? 2000 : e.tier === "match" ? 1000 : 0);
  } else {
    e.layer.setRadius(selected ? 7 : 5);
    e.layer.setStyle({
      weight: selected ? 3 : 1.5,
      color: selected ? "#c9a96e" : theme === "dark" ? "#15130f" : "#ffffff",
    });
    if (selected) e.layer.bringToFront();
  }
}

/** Reconcilia los marcadores del mapa con las props (añade, actualiza y retira solo lo que difiere). */
function sync(
  map: L.Map,
  entries: Map<string, Entry>,
  p: CaptacionesMapProps,
  latest: { current: CaptacionesMapProps },
) {
  const bounds = map.getBounds();
  let visible = 0;
  for (const pin of p.pins) if (bounds.contains([pin.lat, pin.lng])) visible++;
  const dense = visible > LABEL_LIMIT;

  const seen = new Set<string>();
  for (const pin of p.pins) {
    seen.add(pin.id);
    const tier = p.tiers.get(pin.id) ?? "partial";
    const selected = p.selectedId === pin.id;
    const showLabel = !dense;
    // La selección NO entra en la clave: cambiarla reconstruiría el marcador y
    // el foco de teclado se perdería. Se aplica en sitio (ver más abajo).
    const key = [
      tier,
      p.theme,
      showLabel ? 1 : 0,
      pin.price,
      pin.operation,
      pin.isNew ? 1 : 0,
      pin.isAgency ? 1 : 0,
      pin.lat,
      pin.lng,
    ].join("|");
    const prev = entries.get(pin.id);
    if (prev && prev.key === key) {
      if (prev.selected !== selected) {
        applySelection(prev, selected, p.theme);
        prev.selected = selected;
      }
      continue;
    }
    if (prev) prev.layer.remove();

    const label = pinAriaLabel(pin);
    const icon = buildPinIcon(pin, tier, p.theme, selected, showLabel);
    let layer: L.Marker | L.CircleMarker;
    if (icon) {
      const marker = L.marker([pin.lat, pin.lng], {
        icon,
        title: label,
        alt: label,
        keyboard: true,
        // El seleccionado por encima de los vecinos; los match por encima del resto.
        zIndexOffset: selected ? 2000 : tier === "match" ? 1000 : 0,
      });
      // Leaflet no pone rol/nombre accesible a los DivIcon: se añade al crear el elemento.
      marker.on("add", () => {
        const el = marker.getElement();
        el?.setAttribute("role", "button");
        el?.setAttribute("aria-label", label);
      });
      layer = marker;
    } else {
      // Fuera de zona: punto de canvas (preferCanvas), sin DOM por pin.
      layer = L.circleMarker([pin.lat, pin.lng], {
        radius: selected ? 7 : 5,
        weight: selected ? 3 : 1.5,
        color: selected ? "#c9a96e" : p.theme === "dark" ? "#15130f" : "#ffffff",
        fillColor: p.theme === "dark" ? "#3a352f" : "#d8cfba",
        fillOpacity: 1,
        bubblingMouseEvents: false,
      });
    }
    // Siempre el callback vigente: este cierre vive más que el render que lo creó.
    layer.on("click", () => latest.current.onSelect(pin.id));
    layer.addTo(map);
    entries.set(pin.id, { layer, key, selected, tier });
  }
  for (const [id, e] of entries) {
    if (!seen.has(id)) {
      e.layer.remove();
      entries.delete(id);
    }
  }
}

/*
 * Estilos del mapa y de los pines (maqueta v4 aprobada). Los hex propios del
 * mapa (pines, lienzo) viven aquí; la tipografía y el dorado vienen del CRM.
 * El tema oscuro es un filtro CSS sobre las teselas (no hay estilo oscuro de
 * OSM) más un velo dorado; el claro apaga el rosa/amarillo de OSM como el
 * tratamiento --bcp-map-treatment de globals.css.
 */
const CSS = `
.cm-root{position:relative;width:100%;height:100%;min-height:320px}
.cm-map{position:absolute;inset:0;background:#efe9dd;font-family:inherit}
.cm-theme-dark .cm-map{background:#1c1915}
.cm-map .leaflet-tile-pane{filter:saturate(.35) sepia(.22) brightness(1.06) contrast(.82) hue-rotate(-5deg)}
.cm-theme-dark .cm-map .leaflet-tile-pane{filter:grayscale(.5) invert(1) hue-rotate(180deg) sepia(.3) saturate(.7) brightness(.8) contrast(.9)}
.cm-veil{background:rgba(239,233,221,.30)}
.cm-theme-dark .cm-veil{background:rgba(201,169,110,.10)}
.cm-map .leaflet-control-attribution{font-size:10px}
.cm-map .leaflet-control-zoom{border:1px solid rgba(255,255,255,.7);border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(40,30,10,.16)}
.cm-map .leaflet-control-zoom a{background:rgba(255,255,255,.86);color:#0a0a0a;border-bottom-color:#e8e0d0}
.cm-map .leaflet-control-zoom a:focus-visible{outline:2px solid #c9a96e;outline-offset:-2px}
.cm-theme-dark .cm-map .leaflet-control-zoom{border-color:rgba(255,255,255,.09)}
.cm-theme-dark .cm-map .leaflet-control-zoom a{background:rgba(24,22,19,.82);color:#f3eee6;border-bottom-color:rgba(255,255,255,.09)}
.cm-theme-dark .cm-map .leaflet-control-attribution{background:rgba(21,19,15,.7);color:#a39b8f}
.cm-theme-dark .cm-map .leaflet-control-attribution a{color:#c9a96e}

.cm-pin{background:none;border:0;font:700 11px Lato,Arial,sans-serif;outline:none}
.cm-pill>span{position:absolute;left:0;right:0;top:0;height:24px;line-height:22px;text-align:center;border-radius:12px;
  box-sizing:border-box;white-space:nowrap;border:1px solid transparent;transition:box-shadow .15s}
.cm-pill::after{content:"";position:absolute;left:50%;top:23px;margin-left:-5px;border:5px solid transparent;border-bottom:0;border-top-width:7px}
/* match: negro (dorado en oscuro) */
.cm-match>span{background:#0a0a0a;border-color:#0a0a0a;color:#fff;box-shadow:0 3px 8px rgba(0,0,0,.35)}
.cm-match::after{border-top-color:#0a0a0a}
.cm-match.cm-dark>span{background:#c9a96e;border-color:#c9a96e;color:#0a0a0a}
.cm-match.cm-dark::after{border-top-color:#c9a96e}
/* partial: blanco con borde dorado */
.cm-partial.cm-pill>span{background:#fff;border:1.5px solid #c9a96e;color:#0a0a0a;line-height:21px}
.cm-partial.cm-pill::after{border-top-color:#c9a96e}
.cm-partial.cm-pill.cm-dark>span{background:#26221d;color:#f3eee6}
.cm-agency:not(.cm-match)>span{border-style:dashed}
/* punto: no encaja (o partial cuando hay demasiados pines) */
.cm-dot>b{position:absolute;inset:0;border-radius:50%;box-sizing:border-box;background:#9a917f;border:1.5px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.25)}
.cm-dot.cm-partial>b{background:#fff;border:2px solid #c9a96e}
.cm-dot.cm-dark>b{background:#6b645b;border-color:#15130f}
.cm-dot.cm-dark.cm-partial>b{background:#26221d;border-color:#c9a96e}
.cm-dot.cm-agency>b{border-style:dashed}
/* punto dorado: anuncio nuevo */
.cm-new{position:absolute;right:-3px;top:-3px;width:10px;height:10px;border-radius:50%;box-sizing:border-box;background:#c9a96e;border:1.5px solid #fff}
.cm-dark .cm-new{border-color:#15130f}
.cm-dot .cm-new{right:-4px;top:-4px}
/* seleccionado: anillo dorado; el foco de teclado lo comparte */
.cm-sel>span,.cm-pin:focus-visible>span{box-shadow:0 0 0 3px #c9a96e,0 4px 10px rgba(0,0,0,.35)}
.cm-sel>b,.cm-pin:focus-visible>b{box-shadow:0 0 0 3px #c9a96e}
@media (prefers-reduced-motion:reduce){.cm-pill>span{transition:none}}
`;
