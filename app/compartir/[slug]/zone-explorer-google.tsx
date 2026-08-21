"use client";

// ============================================================================
// BCP ZONE EXPLORER · exploración abierta sobre Google Maps
// ----------------------------------------------------------------------------
// Solo se monta cuando el cliente pulsa "Explorar la zona" Y existen las dos
// credenciales de Google. El estado PASIVO sigue siendo el mosaico de teselas
// propio: es gratis, ya está validado y no captura el scroll. Así no se paga
// un mapa dinámico por cada visita que nunca llega a explorar (§25).
//
// Esta es la ÚNICA pieza de la interfaz que conoce a Google. Todo lo que sale
// de aquí hacia el resto del módulo es un `LocationDestination` de BCP (§38).
//
// ⚠️ SIN VALIDAR CONTRA CREDENCIALES REALES: no hay clave en el proyecto, así
// que este renderer no se ha podido ejecutar ni una sola vez. Es prototipo
// hasta que exista un preview con credenciales — no darlo por bueno.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from "react";
import { loadGoogleMaps, type GMap, type GMapMouseEvent } from "@/lib/services/location/google-maps-loader";
import {
  fromGooglePlace,
  PLACE_DETAIL_FIELDS,
  type LocationDestination,
} from "@/lib/services/location/destination";

type LatLng = { lat: number; lng: number };

export function ZoneExplorerGoogle({
  apiKey,
  mapId,
  origin,
  originLabel,
  curated,
  focus,
  onSelectPlace,
  onUnavailable,
}: {
  apiKey: string;
  mapId: string;
  origin: LatLng;
  originLabel: string;
  /** POIs curados de BCP: champán y de marca, distintos de los de Google. */
  curated: LocationDestination[];
  /** Destino enfocado, venga de donde venga. */
  focus: LocationDestination | null;
  onSelectPlace: (d: LocationDestination) => void;
  /** Google no cargó: el módulo vuelve al renderer actual, sin romper nada. */
  onUnavailable: () => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<GMap | null>(null);
  const apiRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const placeMarkerRef = useRef<any>(null);
  const [ready, setReady] = useState(false);

  const onSelectRef = useRef(onSelectPlace);
  useEffect(() => { onSelectRef.current = onSelectPlace; }, [onSelectPlace]);

  // ── Montaje del mapa ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const maps = await loadGoogleMaps(apiKey);
      if (cancelled) return;
      if (!maps || !hostRef.current) { onUnavailable(); return; }
      apiRef.current = maps;

      const map = new maps.Map(hostRef.current, {
        center: origin,
        zoom: 16,
        mapId, // el estilo de marca vive en Cloud Console, no en el código
        // §20: gestos cooperativos — la rueda sola hace scroll de PÁGINA;
        // para hacer zoom hay que usar ⌘/Ctrl. Nunca se atrapa el scroll.
        gestureHandling: "cooperative",
        disableDefaultUI: true,
        zoomControl: true,
        keyboardShortcuts: true, // §31: accesible por teclado
        clickableIcons: true,    // los POIs del basemap deben poder pulsarse
      }) as GMap;
      mapRef.current = map;

      // Marcador de LA VIVIENDA: siempre el origen, siempre distinguible de
      // cualquier sitio de Google (§8).
      try {
        const markerLib: any = await maps.importLibrary?.("marker");
        if (markerLib?.AdvancedMarkerElement) {
          const el = document.createElement("span");
          el.className = "bcp-live-home";
          el.innerHTML = `<span class="bcp-live-home-dot"></span><span class="bcp-live-home-label">${originLabel}</span>`;
          new markerLib.AdvancedMarkerElement({ map, position: origin, content: el, zIndex: 1000 });

          for (const c of curated) {
            const dot = document.createElement("span");
            dot.className = "bcp-live-poi";
            dot.title = c.name;
            const mk = new markerLib.AdvancedMarkerElement({
              map, position: { lat: c.lat, lng: c.lng }, content: dot,
            });
            mk.addListener?.("click", () => onSelectRef.current(c));
            markersRef.current.push(mk);
          }
        }
      } catch {
        // Sin marcadores avanzados el mapa sigue siendo utilizable.
      }

      // ── Clic en un sitio real del basemap (§9) ──
      map.addListener("click", async (e: GMapMouseEvent) => {
        if (!e.placeId) {
          // Geometría vacía: NO se inventa un sitio ni se deja un marcador
          // fantasma. Simplemente no pasa nada.
          return;
        }
        // Se suprime la tarjeta genérica de Google: la nuestra es la
        // experiencia (§7).
        e.stop?.();
        try {
          const placesLib: any = await apiRef.current?.importLibrary?.("places");
          if (!placesLib?.Place) return;
          const place = new placesLib.Place({ id: e.placeId });
          // Lista blanca de campos: la facturación depende de lo que se pide.
          await place.fetchFields({ fields: [...PLACE_DETAIL_FIELDS] });
          const loc = place.location;
          const destination = fromGooglePlace({
            id: place.id,
            displayName: typeof place.displayName === "string" ? place.displayName : place.displayName?.text ?? null,
            formattedAddress: place.formattedAddress ?? null,
            location: loc ? { lat: typeof loc.lat === "function" ? loc.lat() : loc.lat, lng: typeof loc.lng === "function" ? loc.lng() : loc.lng } : null,
            primaryTypeDisplayName:
              typeof place.primaryTypeDisplayName === "string"
                ? place.primaryTypeDisplayName
                : place.primaryTypeDisplayName?.text ?? null,
            types: place.types ?? null,
          });
          // fromGooglePlace devuelve null si el sitio no es utilizable: en ese
          // caso no se muestra nada, nunca una ficha a medias.
          if (destination) onSelectRef.current(destination);
        } catch {
          // §34: si Places falla, el mapa sigue funcionando y no hay ficha.
        }
      });

      setReady(true);
    })();
    return () => { cancelled = true; };
    // Montaje único: reencuadres y selección se gestionan en efectos aparte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Encuadre vivienda + destino, y marcador del sitio seleccionado ──
  useEffect(() => {
    const map = mapRef.current;
    const maps = apiRef.current;
    if (!map || !maps || !ready) return;

    placeMarkerRef.current?.setMap?.(null);
    placeMarkerRef.current = null;

    if (!focus) {
      map.panTo(origin);
      map.setZoom(16);
      return;
    }

    // Un sitio descubierto en Google recibe marcador NEUTRO hasta que se
    // selecciona: nunca se insinúa que BCP lo recomienda (§10).
    if (focus.source === "google_place") {
      (async () => {
        try {
          const markerLib: any = await maps.importLibrary?.("marker");
          if (!markerLib?.AdvancedMarkerElement) return;
          const el = document.createElement("span");
          el.className = "bcp-live-place";
          placeMarkerRef.current = new markerLib.AdvancedMarkerElement({
            map, position: { lat: focus.lat, lng: focus.lng }, content: el, zIndex: 900,
          });
        } catch { /* sin marcador, el encuadre ya comunica */ }
      })();
    }

    const bounds = new maps.LatLngBounds();
    bounds.extend(origin);
    bounds.extend({ lat: focus.lat, lng: focus.lng });
    map.fitBounds(bounds, { top: 168, bottom: 72, left: 56, right: 56 });
  }, [focus, ready, origin]);

  useEffect(() => () => { markersRef.current = []; mapRef.current = null; }, []);

  return (
    <div
      ref={hostRef}
      className="absolute inset-0 h-full w-full"
      role="application"
      aria-label={`Explorador de la zona alrededor de ${originLabel}`}
    />
  );
}
