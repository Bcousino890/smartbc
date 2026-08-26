"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";
import type { ZonePolygon } from "@/lib/zone-polygon";

interface ZoneDrawMapProps {
  /** Semilla al montar (p.ej. reabrir el modal con un filtro ya activo). Solo
   *  se lee una vez — no es un valor controlado, ver el comentario del efecto
   *  de abajo. */
  initialPolygons: ZonePolygon[];
  /** Se dispara con el conjunto COMPLETO de polígonos tras cualquier cambio
   *  (crear/editar/borrar), no solo con la figura recién dibujada. */
  onChange: (polygons: ZonePolygon[]) => void;
}

const MADRID_CENTER: L.LatLngExpression = [40.4168, -3.7038];

/**
 * Mismo patrón que components/admin/clientes/map-component.tsx (Leaflet +
 * leaflet-draw imperativo, sin react-leaflet) recentrado en Madrid para el
 * filtro de zona dibujada de particulares. Esa versión de clientes solo
 * escucha "draw:created"/"draw:edited"; aquí además "draw:deleted" —
 * necesario porque el control de edición de leaflet-draw (`edit.remove`)
 * deja borrar una figura directamente en el mapa, y sin ese listener el
 * polígono borrado seguiría "vivo" en el estado del padre hasta el próximo
 * remount.
 */
export default function ZoneDrawMap({ initialPolygons, onChange }: ZoneDrawMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const drawnItems = useRef<L.FeatureGroup | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = L.map(mapContainer.current).setView(MADRID_CENTER, 12);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map.current);

    drawnItems.current = new L.FeatureGroup();
    map.current.addLayer(drawnItems.current);

    const drawControl = new L.Control.Draw({
      position: "topleft",
      draw: {
        polygon: {
          allowIntersection: false,
          drawError: {
            color: "#e1e100",
            message: "<strong>¡Error!</strong> Los polígonos no pueden cruzarse",
          },
          shapeOptions: {
            color: "#bada55",
            fillOpacity: 0.3,
          },
        },
        polyline: false,
        rectangle: false,
        circle: false,
        marker: false,
        circlemarker: false,
      },
      edit: {
        featureGroup: drawnItems.current,
        remove: true,
      },
    });
    map.current.addControl(drawControl);

    // Recalcula el conjunto completo de anillos a partir de las capas que
    // hay AHORA MISMO en drawnItems — un solo punto de verdad tras crear,
    // editar o borrar, en vez de reportar solo el delta de cada evento.
    function reportChange() {
      const polygons: ZonePolygon[] = [];
      drawnItems.current!.eachLayer((layer) => {
        if (layer instanceof L.Polygon) {
          // getLatLngs() de un L.Polygon SIEMPRE viene anidado un nivel
          // (LatLng[][]: el anillo exterior, aunque sea el único) — nunca
          // plano. Tratarlo como LatLng[] directo (como hacía antes esta
          // función, copiando el mismo supuesto erróneo de
          // map-component.tsx) hace que `ll` sea en realidad el array del
          // anillo: `ll.lng`/`ll.lat` salen `undefined`, y
          // JSON.stringify(undefined) dentro de un array se convierte en
          // `null` — el polígono se guardaba con puros `null` y
          // decodeZonePolygons lo descartaba entero en el servidor (el
          // filtro parecía "no guardarse"). La herramienta simple de
          // leaflet-draw nunca genera agujeros ni multi-polígonos, así que
          // basta con el primer (único) anillo.
          const rings = layer.getLatLngs() as unknown as L.LatLng[][];
          const ring = rings[0] ?? [];
          polygons.push(ring.map((ll): [number, number] => [ll.lng, ll.lat]));
        }
      });
      onChange(polygons);
    }

    map.current.on("draw:created", (e: any) => {
      drawnItems.current!.addLayer(e.layer);
      reportChange();
    });
    map.current.on("draw:edited", reportChange);
    map.current.on("draw:deleted", reportChange);

    // Cargar los polígonos con los que se abrió el mapa.
    for (const ring of initialPolygons) {
      const latlngs = ring.map(([lng, lat]) => [lat, lng]) as L.LatLngExpression[];
      const polyLayer = L.polygon(latlngs, { color: "#bada55", fillOpacity: 0.3 });
      drawnItems.current!.addLayer(polyLayer);
    }

    return () => {
      map.current?.remove();
      map.current = null;
    };
    // Solo se ejecuta al montar: `initialPolygons` es la semilla, no un valor
    // controlado. El padre (draw-zone-filter.tsx) desmonta/remonta este
    // componente completo cada vez que se abre el modal — meter
    // `initialPolygons`/`onChange` en las deps recrearía el mapa entero en
    // cada trazo del usuario (perdiendo zoom/pan a mitad de dibujo), ya que
    // `onChange` reasigna el mismo estado que disparó el efecto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={mapContainer}
      className="h-[420px] w-full rounded-lg border border-gold/10 overflow-hidden"
      style={{ minHeight: "420px" }}
    />
  );
}
