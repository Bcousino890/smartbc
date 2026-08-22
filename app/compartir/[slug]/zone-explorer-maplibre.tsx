"use client";

// ============================================================================
// BCP ZONE EXPLORER · exploración abierta sobre MapLibre + OpenFreeMap
// ----------------------------------------------------------------------------
// Sin clave de API y sin facturación por vistas de mapa: la exploración de
// zona puede ofrecerse en TODOS los SmartLinks sin coste variable, que es
// justo la razón de producto por la que se descartó Google.
//
// Esta es la ÚNICA pieza de la interfaz que conoce MapLibre. Todo lo que sale
// de aquí hacia el resto del módulo es un `LocationDestination` de BCP.
//
// UN SOLO MAPA. Overview y exploración comparten renderer, estilo, cámara,
// marcador de la vivienda y POIs curados: lo único que cambia es el ESTADO DE
// INTERACCIÓN. Antes el pasivo era un mosaico de teselas ráster de CARTO y el
// explorador MapLibre, y el cliente lo notaba ("cuando pulso Explorar se ve
// mejor"). El mosaico sobrevive solo como red de seguridad si MapLibre no
// carga (`onUnavailable`), nunca como experiencia paralela.
//
// En overview el mapa se monta con `interactive: false`: MapLibre no engancha
// un solo gesto, así que no puede secuestrar el scroll de la página.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  bcpLuxuryMadridStyle,
  CLICKABLE_LAYER_IDS,
} from "@/lib/services/location/bcp-map-style";
import { fromOsmFeature, type LocationDestination } from "@/lib/services/location/destination";
import {
  curatedMarkerHtml,
  discoveredMarkerHtml,
  residenceMarkerHtml,
} from "@/lib/services/location/markers";

type LatLng = { lat: number; lng: number };

/** Fuente de la línea vivienda→destino. Una sola, se reescribe al cambiar. */
const LINK_SOURCE = "bcp-link";

/**
 * MapLibre cuenta el zoom sobre teselas de 512px y nuestra geometría (mosaico,
 * fitPoints, contextZoomForWidth) sobre las de 256px del esquema slippy. La
 * misma escala se obtiene UN NIVEL más abajo en MapLibre — medido, no
 * supuesto: a lat 40.43, 0.01º de latitud ocupan 612.3px tanto en slippy z16
 * como en MapLibre z15. Sin esta conversión el overview saldría al doble de
 * escala. Lo vigila `npm run test:zone-explorer`.
 */
export const MAPLIBRE_ZOOM_OFFSET = -1;
export const toMapLibreZoom = (slippyZoom: number) => slippyZoom + MAPLIBRE_ZOOM_OFFSET;
const emptyLine = () => ({ type: "FeatureCollection", features: [] }) as any;

export function ZoneExplorerMapLibre({
  origin,
  originLabel,
  curated,
  focus,
  interactive = true,
  camera,
  onSelectPlace,
  onSelectCurated,
  onProjector,
  onUnavailable,
}: {
  origin: LatLng;
  originLabel: string;
  /** POIs curados de BCP: champán y de marca, distintos de lo descubierto. */
  curated: LocationDestination[];
  focus: LocationDestination | null;
  /** false = overview: sin gestos, sin controles y sin descubrimiento OSM. */
  interactive?: boolean;
  /** Cámara impuesta desde fuera (composición del overview). El zoom va en
   *  convenio SLIPPY (256px), como el resto de la geometría del módulo. */
  camera?: { lat: number; lng: number; zoom: number } | null;
  onSelectPlace: (d: LocationDestination) => void;
  /** Selección de un POI curado desde el propio mapa (modo explorar). */
  onSelectCurated?: (d: LocationDestination) => void;
  /** Proyector lat/lng → píxeles del contenedor, para las capas HTML del
   *  módulo (cápsulas, área de foco, curva). Se entrega al montar y cada vez
   *  que la cámara se mueve. */
  onProjector?: (project: ((lat: number, lng: number) => { left: number; top: number }) | null) => void;
  /** El mapa no cargó: el módulo vuelve al renderer actual sin romper nada. */
  onUnavailable: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const libRef = useRef<any>(null);
  const discoveredMarkerRef = useRef<any>(null);
  /** Elementos de los marcadores curados, por id: para marcar el activo. */
  const curatedElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const residenceElRef = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);

  const onSelectRef = useRef(onSelectPlace);
  useEffect(() => { onSelectRef.current = onSelectPlace; }, [onSelectPlace]);
  const onSelectCuratedRef = useRef(onSelectCurated);
  useEffect(() => { onSelectCuratedRef.current = onSelectCurated; }, [onSelectCurated]);
  const onProjectorRef = useRef(onProjector);
  useEffect(() => { onProjectorRef.current = onProjector; }, [onProjector]);

  const makeEl = useCallback((className: string, html?: string) => {
    const el = document.createElement("span");
    el.className = className;
    if (html) el.innerHTML = html;
    return el;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let maplibre: any;
      try {
        // ⚠️ v5, no v6: la v6 se distribuye SOLO como ESM y su web worker se
        // construye con la URL de la propia página bajo el bundling de Next.
        // El resultado era un mapa que se monta, pinta controles… y no carga
        // una sola tesela, porque el worker que las parsea nunca arranca.
        maplibre = (await import("maplibre-gl")).default;
        // El CSS también bajo demanda: no lastra a quien nunca explora.
        if (!document.getElementById("maplibre-css")) {
          const link = document.createElement("link");
          link.id = "maplibre-css";
          link.rel = "stylesheet";
          link.href = "https://unpkg.com/maplibre-gl@5.24.0/dist/maplibre-gl.css";
          document.head.appendChild(link);
        }
      } catch {
        onUnavailable();
        return;
      }
      if (cancelled || !hostRef.current) return;
      libRef.current = maplibre;

      let map: any;
      try {
        map = new maplibre.Map({
          container: hostRef.current,
          style: bcpLuxuryMadridStyle(),
          center: [camera?.lng ?? origin.lng, camera?.lat ?? origin.lat],
          zoom: camera ? toMapLibreZoom(camera.zoom) : 15.4,
          attributionControl: false,
          // En overview NINGÚN gesto se engancha (`interactive: false`), así
          // que el mapa no puede robar el scroll de la página. En explorar sí,
          // porque el cliente ya ha pedido explorar de forma explícita.
          interactive,
          cooperativeGestures: false,
          maxZoom: 18,
          minZoom: 11,
        });
      } catch {
        onUnavailable();
        return;
      }
      mapRef.current = map;

      // Atribución obligatoria, compacta pero presente.
      map.addControl(new maplibre.AttributionControl({ compact: true }), "bottom-right");
      // Los controles de zoom solo tienen sentido donde se puede mover.
      if (interactive) map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

      map.on("error", (e: any) => {
        // Un fallo de teselas no debe tumbar el módulo; se registra y ya.
        if (e?.error?.status && e.error.status >= 500) {
          console.warn("[zone-explorer] teselas no disponibles");
        }
      });

      map.on("load", () => {
        if (cancelled) return;

        // ── LA VIVIENDA: el origen, siempre dominante ──
        const residence = document.createElement("div");
        // En overview el medallón lleva rótulo; en explorar se reconoce solo,
        // que es justo lo que se le pide al marcador (§3).
        residence.innerHTML = residenceMarkerHtml(interactive ? undefined : originLabel);
        residenceElRef.current = residence.firstElementChild as HTMLElement;
        new maplibre.Marker({ element: residence, anchor: "center" })
          .setLngLat([origin.lng, origin.lat])
          .addTo(map);

        // ── POIs curados de BCP: marca champán ──
        for (const c of curated) {
          const wrap = document.createElement("div");
          wrap.innerHTML = curatedMarkerHtml(c.category);
          const el = wrap.firstElementChild as HTMLElement;
          el.title = c.name;
          curatedElsRef.current.set(c.id, el);
          // En overview los marcadores son composición, no interfaz: quien
          // manda es el rail editorial. En explorar sí se pueden pulsar.
          if (interactive) {
            el.addEventListener("click", (ev) => {
              ev.stopPropagation();
              (onSelectCuratedRef.current ?? onSelectRef.current)(c);
            });
          } else {
            el.style.pointerEvents = "none";
          }
          new maplibre.Marker({ element: wrap, anchor: "center" })
            .setLngLat([c.lng, c.lat])
            .addTo(map);
        }

        // §5 · en overview los lugares de OSM NO compiten: se apagan del todo.
        if (!interactive) {
          for (const id of CLICKABLE_LAYER_IDS) {
            if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
          }
        }

        // ── Cursor de "aquí se puede pulsar" solo sobre features válidas ──
        const setCursor = (v: string) => { map.getCanvas().style.cursor = v; };
        for (const layer of CLICKABLE_LAYER_IDS) {
          if (!map.getLayer(layer)) continue;
          map.on("mouseenter", layer, () => setCursor("pointer"));
          map.on("mouseleave", layer, () => setCursor(""));
        }

        // ── Conexión vivienda → destino ──
        // Una línea editorial, no una ruta: el cliente tiene que entender de
        // un vistazo QUÉ ha elegido y a qué distancia está de la casa, sin
        // que le vendamos un cálculo de trayecto que no hemos hecho.
        map.addSource(LINK_SOURCE, { type: "geojson", data: emptyLine() });
        map.addLayer({
          id: "bcp-link-halo",
          type: "line",
          source: LINK_SOURCE,
          layout: { "line-cap": "round" },
          paint: { "line-color": "#ffffff", "line-width": 5, "line-opacity": 0.85 },
        });
        map.addLayer({
          id: "bcp-link",
          type: "line",
          source: LINK_SOURCE,
          layout: { "line-cap": "round" },
          paint: {
            "line-color": "#8a6d3b",
            "line-width": 2,
            "line-dasharray": [1.6, 1.7],
            "line-opacity": 0.95,
          },
        });

        // Proyector para las capas HTML del módulo (cápsulas, área de foco,
        // curva). Se toma DE MAPLIBRE en vez de recalcular la proyección por
        // nuestra cuenta: así no hay dos matemáticas que puedan desalinearse.
        const publishProjector = () => {
          onProjectorRef.current?.((lat: number, lng: number) => {
            const p = map.project([lng, lat]);
            return { left: p.x, top: p.y };
          });
        };
        publishProjector();
        map.on("move", publishProjector);
        map.on("resize", publishProjector);

        setReady(true);
      });

      // ── Clic sobre el mapa: solo capas de la lista blanca ──
      if (interactive) map.on("click", (e: any) => {
        const layers = CLICKABLE_LAYER_IDS.filter((l) => map.getLayer(l));
        const features = layers.length
          ? map.queryRenderedFeatures(e.point, { layers })
          : [];
        if (!features.length) {
          // Geometría vacía: NO se inventa un lugar ni se deja marcador
          // fantasma. Simplemente se cierra lo que hubiera seleccionado.
          discoveredMarkerRef.current?.remove();
          discoveredMarkerRef.current = null;
          return;
        }
        // Se elige la feature de mayor prioridad: menor `rank` en OpenMapTiles
        // significa más relevante.
        const best = [...features].sort(
          (a, b) => (Number(a.properties?.rank ?? 99) - Number(b.properties?.rank ?? 99)),
        )[0];
        const coords = best.geometry?.type === "Point" ? best.geometry.coordinates : null;
        const destination = fromOsmFeature({
          id: best.id ?? best.properties?.id ?? null,
          properties: best.properties ?? {},
          lat: coords ? Number(coords[1]) : e.lngLat.lat,
          lng: coords ? Number(coords[0]) : e.lngLat.lng,
        });
        // fromOsmFeature devuelve null si la categoría no es pulsable o si la
        // feature no tiene nombre: en ese caso no se abre ficha alguna.
        if (destination) onSelectRef.current(destination);
      });
    })();

    return () => {
      cancelled = true;
      onProjectorRef.current?.(null);
      try { mapRef.current?.remove(); } catch { /* ya desmontado */ }
      mapRef.current = null;
    };
    // Montaje único; el foco se gestiona en su propio efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Encuadre vivienda + destino y marcador del lugar descubierto ──
  useEffect(() => {
    const map = mapRef.current;
    const maplibre = libRef.current;
    if (!map || !maplibre || !ready) return;

    discoveredMarkerRef.current?.remove();
    discoveredMarkerRef.current = null;

    // Estado activo del POI curado: el seleccionado se agranda y se llena;
    // los demás vuelven a su estado de reposo. Una sola clase, un solo
    // estado — el mismo principio que la máquina de selección del módulo.
    for (const [id, el] of curatedElsRef.current) {
      el.classList.toggle("is-active", focus?.id === id);
    }
    residenceElRef.current?.classList.toggle("is-focus", !!focus);

    const link = map.getSource(LINK_SOURCE);
    if (!focus) {
      link?.setData(emptyLine());
      // En overview la cámara la compone el módulo (encuadra la vivienda con
      // sus destinos); en explorar se vuelve al encuadre de entrada.
      if (interactive) map.easeTo({ center: [origin.lng, origin.lat], zoom: 15.4, duration: 600 });
      return;
    }
    link?.setData({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [[origin.lng, origin.lat], [focus.lng, focus.lat]],
      },
      properties: {},
    });

    // Lo descubierto lleva marcador NEUTRO: nunca se insinúa que BCP lo
    // recomienda. Solo lo curado va en champán.
    if (focus.source === "osm_discovered") {
      const placeWrap = document.createElement("div");
      placeWrap.innerHTML = discoveredMarkerHtml();
      discoveredMarkerRef.current = new maplibre.Marker({
        element: placeWrap,
        anchor: "center",
      })
        .setLngLat([focus.lng, focus.lat])
        .addTo(map);
    }

    // El encuadre lo decide quien manda en la cámara: en overview es el
    // módulo (que además reserva la banda de la ficha en su propio cálculo),
    // en explorar es el mapa.
    if (!interactive) return;
    const bounds = new maplibre.LngLatBounds([origin.lng, origin.lat], [origin.lng, origin.lat]);
    bounds.extend([focus.lng, focus.lat]);
    map.fitBounds(bounds, {
      // Banda superior reservada a la ficha contextual, igual que en el
      // overview: nunca puede tapar a la vivienda ni al destino.
      padding: { top: 172, bottom: 76, left: 56, right: 56 },
      maxZoom: 17,
      duration: 700,
    });
  }, [focus, ready, origin, makeEl, interactive]);

  // ── Cámara impuesta (overview) ──
  // El módulo compone el encuadre con la vivienda y sus destinos; el mapa se
  // limita a obedecer. Sin animación: en pasivo un vuelo llamaría la atención
  // sobre el mapa justo cuando debe estar callado.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || interactive || !camera) return;
    map.jumpTo({ center: [camera.lng, camera.lat], zoom: toMapLibreZoom(camera.zoom) });
  }, [camera?.lat, camera?.lng, camera?.zoom, ready, interactive]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 h-full w-full"
      role="application"
      aria-label={`Explorador de la zona alrededor de ${originLabel}`}
    />
  );
}
