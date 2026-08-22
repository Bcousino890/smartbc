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
// El estado PASIVO no monta nada de esto: sigue con el mosaico de teselas
// propio, que ya está validado y no captura el scroll. MapLibre se carga al
// pulsar "Explorar la zona", nunca al abrir el SmartLink (está bajo el
// pliegue y la mayoría de visitas no exploran).
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import {
  bcpLuxuryMadridStyle,
  CLICKABLE_LAYER_IDS,
  MAP_ATTRIBUTION,
} from "@/lib/services/location/bcp-map-style";
import { fromOsmFeature, type LocationDestination } from "@/lib/services/location/destination";

type LatLng = { lat: number; lng: number };

/** Fuente de la línea vivienda→destino. Una sola, se reescribe al cambiar. */
const LINK_SOURCE = "bcp-link";
const emptyLine = () => ({ type: "FeatureCollection", features: [] }) as any;

export function ZoneExplorerMapLibre({
  origin,
  originLabel,
  curated,
  focus,
  onSelectPlace,
  onUnavailable,
}: {
  origin: LatLng;
  originLabel: string;
  /** POIs curados de BCP: champán y de marca, distintos de lo descubierto. */
  curated: LocationDestination[];
  focus: LocationDestination | null;
  onSelectPlace: (d: LocationDestination) => void;
  /** El mapa no cargó: el módulo vuelve al renderer actual sin romper nada. */
  onUnavailable: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const libRef = useRef<any>(null);
  const discoveredMarkerRef = useRef<any>(null);
  /** Elementos de los marcadores curados, por id: para marcar el activo. */
  const curatedElsRef = useRef<Map<string, HTMLElement>>(new Map());
  const [ready, setReady] = useState(false);

  const onSelectRef = useRef(onSelectPlace);
  useEffect(() => { onSelectRef.current = onSelectPlace; }, [onSelectPlace]);

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
          center: [origin.lng, origin.lat],
          zoom: 15.4,
          attributionControl: false,
          // El zoom con rueda se habilita porque YA estamos en exploración
          // explícita; en pasivo no existe mapa que pueda capturar nada.
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
      map.addControl(new maplibre.AttributionControl({ compact: true, customAttribution: MAP_ATTRIBUTION }), "bottom-right");
      map.addControl(new maplibre.NavigationControl({ showCompass: false }), "top-right");

      map.on("error", (e: any) => {
        // Un fallo de teselas no debe tumbar el módulo; se registra y ya.
        if (e?.error?.status && e.error.status >= 500) {
          console.warn("[zone-explorer] teselas no disponibles");
        }
      });

      map.on("load", () => {
        if (cancelled) return;

        // ── LA VIVIENDA: el origen, siempre dominante ──
        new maplibre.Marker({
          element: makeEl(
            "bcp-live-home",
            `<span class="bcp-live-home-dot"></span><span class="bcp-live-home-label">${originLabel}</span>`,
          ),
          anchor: "center",
        })
          .setLngLat([origin.lng, origin.lat])
          .addTo(map);

        // ── POIs curados de BCP: marca champán ──
        for (const c of curated) {
          // Las universidades llevan marca propia: son una categoría, no un
          // POI de lifestyle más.
          const el = makeEl(c.category === "educacion" ? "bcp-live-poi bcp-live-poi-uni" : "bcp-live-poi");
          el.title = c.name;
          curatedElsRef.current.set(c.id, el);
          el.addEventListener("click", (ev) => {
            ev.stopPropagation();
            onSelectRef.current(c);
          });
          new maplibre.Marker({ element: el, anchor: "center" })
            .setLngLat([c.lng, c.lat])
            .addTo(map);
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

        setReady(true);
      });

      // ── Clic sobre el mapa: solo capas de la lista blanca ──
      map.on("click", (e: any) => {
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

    const link = map.getSource(LINK_SOURCE);
    if (!focus) {
      link?.setData(emptyLine());
      map.easeTo({ center: [origin.lng, origin.lat], zoom: 15.4, duration: 600 });
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
      discoveredMarkerRef.current = new maplibre.Marker({
        element: makeEl("bcp-live-place"),
        anchor: "center",
      })
        .setLngLat([focus.lng, focus.lat])
        .addTo(map);
    }

    const bounds = new maplibre.LngLatBounds([origin.lng, origin.lat], [origin.lng, origin.lat]);
    bounds.extend([focus.lng, focus.lat]);
    map.fitBounds(bounds, {
      // Banda superior reservada a la ficha contextual, igual que en el
      // overview: nunca puede tapar a la vivienda ni al destino.
      padding: { top: 172, bottom: 76, left: 56, right: 56 },
      maxZoom: 17,
      duration: 700,
    });
  }, [focus, ready, origin, makeEl]);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 h-full w-full"
      role="application"
      aria-label={`Explorador de la zona alrededor de ${originLabel}`}
    />
  );
}
