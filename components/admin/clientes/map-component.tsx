"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw/dist/leaflet.draw.css";
import "leaflet-draw";

interface PolygonData {
  id: string;
  name: string;
  coordinates: number[][][];
  description?: string;
}

interface MapComponentProps {
  onPolygonDrawn: (coordinates: number[][][], name?: string) => void;
  existingPolygons?: PolygonData[];
}

export default function MapComponent({
  onPolygonDrawn,
  existingPolygons = [],
}: MapComponentProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const drawnItems = useRef<L.FeatureGroup>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Inicializar mapa centrado en Santiago, Chile
    map.current = L.map(mapContainer.current).setView([-33.8688197, -51.5305628], 12);

    // Capa base de OpenStreetMap
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map.current);

    // Grupo de elementos dibujados
    drawnItems.current = new L.FeatureGroup();
    map.current.addLayer(drawnItems.current);

    // Leaflet Draw
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

    // Event listeners para dibujo
    map.current.on("draw:created", function (e: any) {
      const layer = e.layer;
      drawnItems.current!.addLayer(layer);

      if (layer instanceof L.Polygon) {
        const coords = layer.getLatLngs() as L.LatLng[];
        const coordinates = [
          coords.map((latlng) => [latlng.lng, latlng.lat]),
        ];
        onPolygonDrawn(coordinates);
      }
    });

    map.current.on("draw:edited", function (e: any) {
      const layers = e.layers;
      layers.eachLayer(function (layer: any) {
        if (layer instanceof L.Polygon) {
          const coords = layer.getLatLngs() as L.LatLng[];
          const coordinates = [
            coords.map((latlng) => [latlng.lng, latlng.lat]),
          ];
          onPolygonDrawn(coordinates);
        }
      });
    });

    // Cargar polígonos existentes
    existingPolygons.forEach((polygon) => {
      if (polygon.coordinates.length > 0) {
        const latlngs = polygon.coordinates[0].map(([lng, lat]) => [lat, lng]);
        const polyLayer = L.polygon(latlngs as L.LatLngExpression[], {
          color: "#ff7800",
          fillOpacity: 0.2,
        });
        drawnItems.current!.addLayer(polyLayer);
      }
    });

    // Limpiar en desmontaje
    return () => {
      if (map.current) {
        map.current.remove();
        map.current = null;
      }
    };
  }, [onPolygonDrawn, existingPolygons]);

  return (
    <div
      ref={mapContainer}
      className="h-96 w-full rounded-lg border border-gold/10 overflow-hidden"
      style={{ minHeight: "400px" }}
    />
  );
}
