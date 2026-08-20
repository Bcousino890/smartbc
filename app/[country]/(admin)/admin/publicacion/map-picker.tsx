"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import type { LeafletEventHandlerFnMap } from "leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Fix leaflet's broken default icons in Next.js
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

function makePin(color: string) {
  return L.divIcon({
    className: "",
    html: `<div style="
      width:22px;height:22px;
      border-radius:50% 50% 50% 0;
      background:${color};
      border:2.5px solid white;
      transform:rotate(-45deg);
      box-shadow:0 2px 6px rgba(0,0,0,.35);
    "></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 22],
    popupAnchor: [0, -22],
  });
}

const bluePin = makePin("#3b82f6");
const greenPin = makePin("#22c55e");

function RecenterOnce({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  const didCenter = useRef(false);
  useEffect(() => {
    if (lat && lng && !didCenter.current) {
      map.setView([lat, lng], 16);
      didCenter.current = true;
    }
  }, [lat, lng, map]);
  return null;
}

function ClickHandler({ onSelect }: { onSelect: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onSelect(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// Centro de fallback cuando la propiedad no tiene coordenadas: capital de
// cada país, para no arrancar el mapa en Madrid al editar una propiedad en Chile.
const DEFAULT_CENTER: Record<string, [number, number]> = {
  es: [40.4168, -3.7038], // Madrid
  cl: [-33.4489, -70.6693], // Santiago
};

export default function MapPicker({
  lat,
  lng,
  onChange,
  realLat,
  realLng,
  country = "es",
}: {
  lat: number;
  lng: number;
  onChange: (lat: number, lng: number) => void;
  realLat?: number;
  realLng?: number;
  country?: string;
}) {
  const hasGreen = lat !== 0 || lng !== 0;
  const hasBlue = (realLat !== undefined && realLat !== 0) || (realLng !== undefined && realLng !== 0);
  const [fallbackLat, fallbackLng] = DEFAULT_CENTER[country] ?? DEFAULT_CENTER.es;
  const centerLat = hasGreen ? lat : hasBlue ? realLat! : fallbackLat;
  const centerLng = hasGreen ? lng : hasBlue ? realLng! : fallbackLng;

  const handleDragEnd = (e: L.LeafletEvent) => {
    const { lat: newLat, lng: newLng } = (e.target as L.Marker).getLatLng();
    onChange(newLat, newLng);
  };

  return (
    <div>
      <MapContainer
        center={[centerLat, centerLng]}
        zoom={hasGreen || hasBlue ? 16 : 6}
        style={{ height: "320px", width: "100%", borderRadius: "12px" }}
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <ClickHandler onSelect={onChange} />
        <RecenterOnce lat={centerLat} lng={centerLng} />

        {/* Pin azul: ubicación geocodificada (dirección real, no editable) */}
        {hasBlue && (
          <Marker
            position={[realLat!, realLng!]}
            icon={bluePin}
          />
        )}

        {/* Pin verde: coordenadas que se envían a Idealista (draggable) */}
        {hasGreen && (
          <Marker
            position={[lat, lng]}
            icon={greenPin}
            draggable
            eventHandlers={{ dragend: handleDragEnd } as LeafletEventHandlerFnMap}
          />
        )}
      </MapContainer>

      {(hasBlue || hasGreen) && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-ink/50">
          {hasBlue && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-blue-500" />
              Dirección real (geocodificada)
            </span>
          )}
          {hasGreen && (
            <span className="flex items-center gap-1">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-green-500" />
              Ubicación enviada a Idealista
              <span className="text-ink/35">(arrastrable · clic en mapa)</span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
