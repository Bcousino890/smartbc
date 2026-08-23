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
import { LOCATION_MOTION, prefersReducedMotion } from "@/lib/services/location/motion";
import { haversineKm } from "@/lib/geo/poi-distance";
import {
  curatedMarkerHtml,
  discoveredMarkerHtml,
  residenceMarkerHtml,
  searchMarkerHtml,
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

/**
 * La curva de aceleración compartida, traducida a la función `easing` que
 * pide MapLibre (recibe t en 0..1 y devuelve el progreso). Así el mapa y el
 * rail se mueven con el MISMO carácter en vez de parecerse solo de lejos.
 */
function cubicBezier(x1: number, y1: number, x2: number, y2: number) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleDX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    // Newton-Raphson: suficiente para una curva monótona y sin dependencias.
    let t = x;
    for (let i = 0; i < 5; i++) {
      const dx = sampleX(t) - x;
      const d = sampleDX(t);
      if (Math.abs(dx) < 1e-4 || d === 0) break;
      t -= dx / d;
    }
    return ((ay * t + by) * t + cy) * t;
  };
}
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
  const curatedMarkersRef = useRef<any[]>([]);
  const navControlRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const onSelectRef = useRef(onSelectPlace);
  useEffect(() => { onSelectRef.current = onSelectPlace; }, [onSelectPlace]);
  const onSelectCuratedRef = useRef(onSelectCurated);
  useEffect(() => { onSelectCuratedRef.current = onSelectCurated; }, [onSelectCurated]);
  const onProjectorRef = useRef(onProjector);
  useEffect(() => { onProjectorRef.current = onProjector; }, [onProjector]);
  // El handler de clic se registra una vez y lee el estado por ref.
  const interactiveRef = useRef(interactive);
  useEffect(() => { interactiveRef.current = interactive; }, [interactive]);

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
      // Los controles de zoom los pone/quita el efecto de interacción.

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
        // El rótulo se crea SIEMPRE y se oculta al explorar: el marcador es
        // el mismo objeto en los dos estados.
        residence.innerHTML = residenceMarkerHtml(originLabel);
        residenceElRef.current = residence.firstElementChild as HTMLElement;
        new maplibre.Marker({ element: residence, anchor: "center" })
          .setLngLat([origin.lng, origin.lat])
          .addTo(map);

        // ── Cursor de "aquí se puede pulsar" solo sobre features válidas ──
        const setCursor = (v: string) => { map.getCanvas().style.cursor = v; };
        for (const layer of CLICKABLE_LAYER_IDS) {
          if (!map.getLayer(layer)) continue;
          map.on("mouseenter", layer, () => setCursor("pointer"));
          map.on("mouseleave", layer, () => setCursor(""));
        }

        // Aquí vivían dos capas de línea entre la vivienda y el destino.
        // Se han retirado: la conexión la cuenta el rail de conectividad, no
        // una diagonal sobre las calles que se lee como una ruta que no hemos
        // calculado (§16 y §37 del documento de arquitectura).

        setReady(true);
      });

      // ── Clic sobre el mapa: solo capas de la lista blanca ──
      map.on("click", (e: any) => {
        if (!interactiveRef.current) return;
        const layers = CLICKABLE_LAYER_IDS.filter((l) => map.getLayer(l));
        // Tolerancia de acierto: los puntos de POI miden 3px de radio y
        // pedirle al cliente que clave el cursor en ellos convierte la
        // exploración en un juego de puntería. Se consulta una caja alrededor
        // del clic, como hace cualquier mapa que se deje usar.
        const T = 10;
        const box: [[number, number], [number, number]] = [
          [e.point.x - T, e.point.y - T],
          [e.point.x + T, e.point.y + T],
        ];
        const features = layers.length ? map.queryRenderedFeatures(box, { layers }) : [];
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
    // §8 · jerarquía del foco. Con un destino de fuera seleccionado —sobre
    // todo si está lejos— los POIs curados dejan de ser información y pasan a
    // ser ruido: seis universidades de Madrid compitiendo con la que el
    // cliente acaba de buscar. Se apagan, y a distancia regional se retiran.
    const external = focus?.source === "osm_search" || focus?.source === "osm_discovered";
    const farKm = external && focus ? haversineKm(origin.lat, origin.lng, focus.lat, focus.lng) : 0;
    for (const [id, el] of curatedElsRef.current) {
      el.classList.toggle("is-active", focus?.id === id);
      el.classList.toggle("is-dimmed", external && farKm <= 5);
      el.style.display = external && farKm > 5 ? "none" : "";
    }
    residenceElRef.current?.classList.toggle("is-focus", !!focus);

    if (!focus) {
      // En overview la cámara la compone el módulo (encuadra la vivienda con
      // sus destinos); en explorar se vuelve al encuadre de entrada.
      if (interactive) map.easeTo({ center: [origin.lng, origin.lat], zoom: 15.4, duration: LOCATION_MOTION.reset });
      return;
    }

    // Marcador temporal del foco cuando el destino no está ya pintado como
    // POI curado. Lo descubierto va NEUTRO y lo buscado lleva la lupa: en
    // ningún caso se insinúa que BCP lo recomienda. La excepción es una
    // universidad encontrada por búsqueda (dato verificado nuestro): usa el
    // lenguaje de educación aprobado, activado.
    if (!curatedElsRef.current.has(focus.id)) {
      const placeWrap = document.createElement("div");
      // Una universidad encontrada buscando lleva el glifo de educación
      // (§9): sigue sin ser recomendación de BCP —el champán lo gana solo por
      // estar seleccionada— pero se lee como lo que es.
      placeWrap.innerHTML =
        focus.source === "university" || (focus.source === "osm_search" && focus.category === "educacion")
          ? curatedMarkerHtml("educacion")
          : focus.source === "osm_search"
            ? searchMarkerHtml()
            : discoveredMarkerHtml();
      const el = placeWrap.firstElementChild as HTMLElement | null;
      if (el && (focus.source === "university" || focus.category === "educacion")) {
        el.classList.add("is-active");
      }
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
    map.stop();
    // La banda superior se reserva para lo que de verdad va a ocupar sitio:
    // la ficha de exploración (grande) o la placa del destino curado
    // (pequeña). Reservar siempre lo mismo empujaba el mapa por una ficha
    // que en modo curado ya no se dibuja.
    const needsCardBand = focus.source === "osm_discovered" || focus.source === "osm_search";
    map.fitBounds(bounds, {
      padding: { top: needsCardBand ? 172 : 96, bottom: 76, left: 56, right: 56 },
      maxZoom: 17,
      duration: prefersReducedMotion() ? 0 : LOCATION_MOTION.camera,
    });
  }, [focus, ready, origin, makeEl, interactive]);

  // ── Marcadores curados ──
  // Van en su propio efecto porque la lista CAMBIA: en overview está vacía
  // (los dibujan las cápsulas editoriales) y al explorar entran los POIs y
  // las universidades. Con el mapa montado una sola vez, crearlos dentro del
  // `load` los dejaba congelados en el estado inicial.
  useEffect(() => {
    const map = mapRef.current;
    const maplibre = libRef.current;
    if (!map || !maplibre || !ready) return;

    for (const m of curatedMarkersRef.current) m.remove();
    curatedMarkersRef.current = [];
    curatedElsRef.current.clear();

    for (const c of curated) {
      const wrap = document.createElement("div");
      wrap.innerHTML = curatedMarkerHtml(c.category);
      const el = wrap.firstElementChild as HTMLElement;
      el.title = c.name;
      curatedElsRef.current.set(c.id, el);
      if (interactive) {
        el.addEventListener("click", (ev) => {
          ev.stopPropagation();
          (onSelectCuratedRef.current ?? onSelectRef.current)(c);
        });
      } else {
        el.style.pointerEvents = "none";
      }
      if (focus?.id === c.id) el.classList.add("is-active");
      curatedMarkersRef.current.push(
        new maplibre.Marker({ element: wrap, anchor: "center" }).setLngLat([c.lng, c.lat]).addTo(map),
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [curated, ready, interactive]);

  // ── Interacción: overview ⇄ explorar sobre el MISMO mapa ──
  // No se remonta nada (eso recargaría teselas y parpadearía): se sueltan o
  // se atan los gestos, aparecen los controles y se revelan los lugares de
  // OSM. Sin esto, pulsar "Explorar la zona" dejaba un mapa que no se podía
  // mover, porque las opciones del constructor son las del primer render.
  useEffect(() => {
    const map = mapRef.current;
    const maplibre = libRef.current;
    if (!map || !maplibre || !ready) return;

    const handlers = ["dragPan", "scrollZoom", "boxZoom", "dragRotate", "keyboard", "doubleClickZoom", "touchZoomRotate"];
    for (const h of handlers) {
      const handler = (map as any)[h];
      if (!handler) continue;
      if (interactive) handler.enable();
      else handler.disable();
    }
    map.getCanvas().style.cursor = interactive ? "" : "default";

    if (interactive && !navControlRef.current) {
      navControlRef.current = new maplibre.NavigationControl({ showCompass: false });
      map.addControl(navControlRef.current, "top-right");
    } else if (!interactive && navControlRef.current) {
      map.removeControl(navControlRef.current);
      navControlRef.current = null;
    }

    // §5 · los lugares de OSM solo existen al explorar.
    for (const id of CLICKABLE_LAYER_IDS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", interactive ? "visible" : "none");
    }

    // El rótulo del medallón sobra al explorar: ahí se reconoce solo.
    const caption = residenceElRef.current?.querySelector(".bcp-residence-caption") as HTMLElement | null;
    if (caption) caption.style.display = interactive ? "none" : "";
  }, [interactive, ready]);

  // ── Cámara impuesta (overview) ──
  // El módulo compone el encuadre —vivienda + destino, con la banda de la
  // ficha ya reservada— y el mapa obedece. La PRIMERA colocación es un salto
  // seco: al cargar, el overview tiene que estar quieto. A partir de ahí cada
  // cambio se desliza, porque ese movimiento es justo lo que explica la
  // geografía cuando alguien elige un destino en el rail.
  const cameraPlacedRef = useRef(false);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || interactive || !camera) return;
    const target = { center: [camera.lng, camera.lat] as [number, number], zoom: toMapLibreZoom(camera.zoom) };
    if (!cameraPlacedRef.current || prefersReducedMotion()) {
      cameraPlacedRef.current = true;
      map.jumpTo(target);
      return;
    }
    // Interrumpible: si llega otro destino a mitad de vuelo, se corta el
    // anterior en vez de encolar tres movimientos (§40).
    map.stop();
    map.easeTo({
      ...target,
      duration: LOCATION_MOTION.camera,
      easing: cubicBezier(0.22, 1, 0.36, 1),
      delay: LOCATION_MOTION.cameraDelay,
    });
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
