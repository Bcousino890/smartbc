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
import { registerDiscoveryIcons } from "@/lib/services/location/discovery-icons";
import {
  curatedMarkerHtml,
  discoveredMarkerHtml,
  plaqueMarkerHtml,
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
  const plaqueMarkerRef = useRef<any>(null);
  /** Feature de OSM bajo el puntero y feature seleccionada: viven como
   *  estado del mapa (feature-state), no de React. */
  const hoveredRef = useRef<string | number | null>(null);
  const selectedFeatureRef = useRef<string | number | null>(null);
  /** Reescribe el filtro de la capa que rotula el lugar enfocado. Es la única
   *  vía: `feature-state` no se admite en propiedades de layout, y el nombre
   *  es una de ellas. */
  const showFocusLabel = useCallback((map: any, id: string | number | null) => {
    if (!map?.getLayer?.("poi-label-focus")) return;
    map.setFilter("poi-label-focus", ["==", ["id"], id ?? -1]);
  }, []);
  /** Elementos de los marcadores curados, por id: para marcar el activo. */
  const curatedElsRef = useRef<Map<string, HTMLElement>>(new Map());
  /** Nombre → id del nodo que se queda con el rótulo, e ids ya descartados. */
  const labelWinnersRef = useRef<Map<string, string | number>>(new Map());
  const labelHiddenRef = useRef<Set<string | number>>(new Set());
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

        // Los iconos de la capa de descubrimiento se dibujan y se registran
        // aquí: mismos trazos que los marcadores del módulo, sin sprite que
        // hospedar ni una segunda familia de iconos que mantener.
        registerDiscoveryIcons(map);

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
          // `hover` revela el nombre del lugar y realza su icono. Se lleva
          // con feature-state, que es estado del MAPA: nada que sincronizar
          // desde React y nada que se quede desfasado.
          map.on("mousemove", layer, (e: any) => {
            setCursor("pointer");
            const f = e.features?.[0];
            if (!f || f.id === hoveredRef.current) return;
            if (hoveredRef.current != null) {
              map.setFeatureState({ source: "openmaptiles", sourceLayer: "poi", id: hoveredRef.current }, { hover: false });
            }
            hoveredRef.current = f.id;
            if (f.id != null) {
              map.setFeatureState({ source: "openmaptiles", sourceLayer: "poi", id: f.id }, { hover: true });
            }
            showFocusLabel(map, selectedFeatureRef.current ?? f.id);
          });
          map.on("mouseleave", layer, () => {
            setCursor("");
            if (hoveredRef.current != null) {
              map.setFeatureState({ source: "openmaptiles", sourceLayer: "poi", id: hoveredRef.current }, { hover: false });
              hoveredRef.current = null;
            }
            showFocusLabel(map, selectedFeatureRef.current);
          });
        }

        // Proyector para las capas HTML del módulo (cápsulas, área de foco y
        // el respaldo del mosaico). Se toma DE MAPLIBRE para no mantener dos
        // matemáticas en paralelo.
        //
        // ⚠️ Esto se perdió al retirar las capas de la línea diagonal y el
        // resultado fue que esas capas se quedaban clavadas en la pantalla
        // mientras el mapa se movía debajo. Con freno de fotograma: publicar
        // en cada evento `move` provocaba un render de React por frame.
        let queued = false;
        const publishProjector = () => {
          if (queued) return;
          queued = true;
          requestAnimationFrame(() => {
            queued = false;
            onProjectorRef.current?.((lat: number, lng: number) => {
              const p = map.project([lng, lat]);
              return { left: p.x, top: p.y };
            });
          });
        };
        publishProjector();
        map.on("move", publishProjector);
        map.on("resize", publishProjector);

        // ── Un lugar, un nombre ──
        // OSM parte un mismo sitio en varios nodos (tres para ESDIP en
        // Chamberí: cada edificio el suyo), y el mapa los rotulaba todos: el
        // mismo nombre repetido dos y tres veces a pocos metros. No se puede
        // resolver en el estilo —una expresión no ve las otras features—, así
        // que se resuelve como el rótulo del foco: reescribiendo el filtro.
        // El ganador de cada nombre se recuerda, así que el conjunto de
        // ocultos solo crece y el rótulo no parpadea al mover el mapa.
        const labelBaseFilter = map.getFilter("poi-label-major");
        const dedupeLabels = () => {
          if (!map.getLayer("poi-label-major")) return;
          let nuevos = false;
          for (const f of map.queryRenderedFeatures({ layers: ["poi-label-major"] })) {
            const name = f.properties?.name;
            if (!name || f.id == null) continue;
            const ganador = labelWinnersRef.current.get(name);
            if (ganador === undefined) { labelWinnersRef.current.set(name, f.id); continue; }
            if (ganador !== f.id && !labelHiddenRef.current.has(f.id)) {
              labelHiddenRef.current.add(f.id);
              nuevos = true;
            }
          }
          if (!nuevos) return;
          map.setFilter("poi-label-major", [
            "all",
            labelBaseFilter,
            ["!", ["in", ["id"], ["literal", [...labelHiddenRef.current]]]],
          ]);
        };
        // OJO: NO se engancha a `idle`. Medido en producción: no llega a
        // dispararse ni una vez (0 en 3 s tras mover el mapa), así que la
        // deduplicación no se ejecutaba nunca. `moveend` y el fin de carga de
        // la fuente sí llegan siempre.
        let dedupePend: ReturnType<typeof setTimeout> | null = null;
        const dedupeSoon = () => {
          if (dedupePend) return;
          dedupePend = setTimeout(() => { dedupePend = null; dedupeLabels(); }, 250);
        };
        map.on("moveend", dedupeSoon);
        map.on("sourcedata", (e: any) => { if (e.isSourceLoaded) dedupeSoon(); });
        dedupeSoon();

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
        // Un icono pequeño no puede significar un objetivo pequeño (§14): en
        // táctil el dedo pide más margen que el ratón.
        const T = window.matchMedia("(pointer: coarse)").matches ? 18 : 10;
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
        selectedFeatureRef.current != null &&
          map.setFeatureState(
            { source: "openmaptiles", sourceLayer: "poi", id: selectedFeatureRef.current },
            { selected: false },
          );
        selectedFeatureRef.current = best.id ?? null;
        showFocusLabel(map, selectedFeatureRef.current);
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
    plaqueMarkerRef.current?.remove();
    plaqueMarkerRef.current = null;

    // Estado activo del POI curado: el seleccionado se agranda y se llena;
    // los demás vuelven a su estado de reposo. Una sola clase, un solo
    // estado — el mismo principio que la máquina de selección del módulo.
    applyFocusHierarchy(focus);
    residenceElRef.current?.classList.toggle("is-focus", !!focus);

    if (!focus && selectedFeatureRef.current != null) {
      selectedFeatureRef.current = null;
      showFocusLabel(map, null);
    }
    if (!focus) {
      // En overview la cámara la compone el módulo (encuadra la vivienda con
      // sus destinos); en explorar se vuelve al encuadre de entrada.
      if (interactive) map.easeTo({ center: [origin.lng, origin.lat], zoom: 15.4, duration: LOCATION_MOTION.reset });
      return;
    }

    // Destino CURADO: su placa con nombre, anclada por MapLibre a la
    // coordenada. Antes era una capa HTML del módulo y dependía de que
    // alguien le recalculase los píxeles en cada fotograma.
    // Placa para lo que BCP ya presenta; marcador para lo que no. Las dos
    // ramas son COMPLEMENTARIAS a propósito: nunca se ven la placa y el
    // marcador (con su ficha) sobre el mismo sitio. Ojo con la pertenencia a
    // `curatedElsRef`: solo hay marcadores curados al explorar, así que en el
    // overview no sirve para decidir — decide el origen del destino.
    const esCurado = focus.source === "bcp_curated" || focus.source === "university";
    if (esCurado) {
      const plaqueWrap = document.createElement("div");
      plaqueWrap.innerHTML = plaqueMarkerHtml(focus.category, focus.name);
      plaqueMarkerRef.current = new maplibre.Marker({ element: plaqueWrap, anchor: "center" })
        .setLngLat([focus.lng, focus.lat])
        .addTo(map);
    }

    // Marcador temporal del foco cuando el destino no está ya pintado como
    // POI curado. Lo descubierto va NEUTRO y lo buscado lleva la lupa: en
    // ningún caso se insinúa que BCP lo recomienda. La excepción es una
    // universidad encontrada por búsqueda (dato verificado nuestro): usa el
    // lenguaje de educación aprobado, activado.
    if (!esCurado && !curatedElsRef.current.has(focus.id)) {
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

  /**
   * §8 · jerarquía del foco sobre los POIs curados. Con un destino de fuera
   * seleccionado dejan de ser información y pasan a ser ruido: se apagan, y a
   * distancia regional se retiran del todo. Vive en una función porque hay
   * que aplicarla en DOS momentos —al cambiar el foco y al (re)crear los
   * marcadores—: al entrar en explorar la lista de curados pasa de vacía a
   * llena, los marcadores nacen de nuevo y sin esto nacían a plena luz.
   */
  const applyFocusHierarchy = useCallback(
    (current: LocationDestination | null) => {
      // "Externo" no es una cuestión de FUENTE sino de si ese destino está
      // entre los curados que hay pintados: UCJC sale de nuestro catálogo de
      // universidades (source `university`) pero no es una de las cercanas de
      // esta vivienda, así que compite con ellas igual que un resultado de
      // OSM. Mirar la fuente dejaba los diez marcadores encendidos.
      const external = !!current && !curatedElsRef.current.has(current.id);
      const farKm = external && current ? haversineKm(origin.lat, origin.lng, current.lat, current.lng) : 0;
      for (const [id, el] of curatedElsRef.current) {
        el.classList.toggle("is-active", current?.id === id);
        el.classList.toggle("is-dimmed", external && farKm <= 5);
        el.style.display = external && farKm > 5 ? "none" : "";
      }
    },
    [origin.lat, origin.lng],
  );

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
      curatedMarkersRef.current.push(
        new maplibre.Marker({ element: wrap, anchor: "center" }).setLngLat([c.lng, c.lat]).addTo(map),
      );
    }
    // Los marcadores acaban de nacer: heredan el estado del foco vigente.
    applyFocusHierarchy(focus);
    // `focus` a propósito fuera de las dependencias: aquí solo se hereda el
    // estado al crear; los cambios de foco los aplica su propio efecto.
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
