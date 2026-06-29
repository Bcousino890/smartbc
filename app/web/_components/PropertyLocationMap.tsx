"use client";

import dynamic from "next/dynamic";

// Dynamic imports for Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then(m => m.Popup), { ssr: false });
const Circle = dynamic(() => import("react-leaflet").then(m => m.Circle), { ssr: false });

// Approximate city center coordinates
const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  Madrid: { lat: 40.4168, lng: -3.7038 },
  Santiago: { lat: -33.4489, lng: -70.6693 },
};

export function PropertyLocationMap({ address, city, country }: { address: string; city: string; country: string }) {
  const propertyCoords = CITY_CENTERS[city] || { lat: 40.4168, lng: -3.7038 };

  const bounds = [
    [propertyCoords.lat - 0.05, propertyCoords.lng - 0.05],
    [propertyCoords.lat + 0.05, propertyCoords.lng + 0.05],
  ] as [[number, number], [number, number]];

  return (
    <div className="mt-6 space-y-4">
      {/* Mapa Interactivo */}
      <div className="rounded-lg overflow-hidden border border-stone-200 shadow-sm" style={{ height: "300px" }}>
        <MapContainer bounds={bounds} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Círculo de área referencial (500m) */}
          <Circle
            center={[propertyCoords.lat, propertyCoords.lng]}
            radius={500}
            pathOptions={{ color: "#c9a96e", weight: 2, opacity: 0.5, fill: true, fillOpacity: 0.15 }}
          />

          {/* Marcador de propiedad */}
          <Marker position={[propertyCoords.lat, propertyCoords.lng]}>
            <Popup>📍 {address}</Popup>
          </Marker>
        </MapContainer>
      </div>

      {/* Información de ubicación */}
      <div className="border-l-4 border-gold pl-4">
        <p className="font-semibold text-navy">{address}</p>
        <p className="text-sm text-gray-500">{city}, {country}</p>
        <p className="text-xs text-gray-400 mt-2">El círculo muestra un área referencial de 500m alrededor de la propiedad</p>
      </div>

      {/* Link a OpenStreetMap para más detalles */}
      <a
        href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(address + ", " + city + ", " + country)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-[11px] tracking-[0.24em] uppercase text-gold hover:text-navy transition-colors"
      >
        Ver en OpenStreetMap →
      </a>
    </div>
  );
}
