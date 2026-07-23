"use client";

import dynamic from "next/dynamic";

// Dynamic imports for Leaflet components to avoid SSR issues
const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then(m => m.Popup), { ssr: false });
const Circle = dynamic(() => import("react-leaflet").then(m => m.Circle), { ssr: false });

// Approximate city center coordinates — only used as a last-resort fallback
// when the property has no cached geocoding yet.
const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  Madrid: { lat: 40.4168, lng: -3.7038 },
  Santiago: { lat: -33.4489, lng: -70.6693 },
};

export function PropertyLocationMap({
  zone,
  city,
  country,
  latitude,
  longitude,
}: {
  zone: string;
  city: string;
  country: string;
  latitude?: number | null;
  longitude?: number | null;
}) {
  // Prefer the property's own geocoded coordinates (cached on `properties`
  // via the same pipeline used by the SmartLink share view) — falling back
  // to the city center only means "we don't have precise coords yet", it is
  // not the property's real location.
  const hasPreciseCoords = latitude != null && longitude != null;
  const cityCenter = CITY_CENTERS[city] ?? CITY_CENTERS.Santiago;
  const coords = hasPreciseCoords ? { lat: latitude!, lng: longitude! } : cityCenter;
  const delta = hasPreciseCoords ? 0.01 : 0.05;

  const bounds = [
    [coords.lat - delta, coords.lng - delta],
    [coords.lat + delta, coords.lng + delta],
  ] as [[number, number], [number, number]];

  // La dirección exacta (calle/número/depto) es un dato privado del cliente —
  // en el mapa público solo mostramos la zona/comuna, nunca la dirección.
  return (
    <div className="mt-6 space-y-4">
      {/* Mapa Interactivo */}
      <div className="rounded-lg overflow-hidden border border-stone-200 shadow-sm" style={{ height: "300px" }}>
        <MapContainer bounds={bounds} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Círculo de área referencial */}
          <Circle
            center={[coords.lat, coords.lng]}
            radius={hasPreciseCoords ? 500 : 3000}
            pathOptions={{ color: "#c9a96e", weight: 2, opacity: 0.5, fill: true, fillOpacity: 0.15 }}
          />

          {hasPreciseCoords && (
            <Marker position={[coords.lat, coords.lng]}>
              <Popup>📍 {zone}</Popup>
            </Marker>
          )}
        </MapContainer>
      </div>

      {/* Información de ubicación */}
      <div className="border-l-4 border-gold pl-4">
        <p className="font-semibold text-navy">{zone}</p>
        <p className="text-sm text-gray-500">{city}, {country}</p>
        <p className="text-xs text-gray-400 mt-2">
          {hasPreciseCoords
            ? "El círculo muestra un área referencial de 500m alrededor de la propiedad. La dirección exacta se comparte al coordinar una visita."
            : "Ubicación aproximada de la zona. La dirección exacta se comparte al coordinar una visita."}
        </p>
      </div>

      {/* Link a OpenStreetMap para más detalles — usa solo coordenadas/zona,
          nunca la dirección exacta, para no exponerla públicamente */}
      <a
        href={
          hasPreciseCoords
            ? `https://www.openstreetmap.org/?mlat=${coords.lat}&mlon=${coords.lng}#map=15/${coords.lat}/${coords.lng}`
            : `https://www.openstreetmap.org/search?query=${encodeURIComponent(zone + ", " + city + ", " + country)}`
        }
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-[11px] tracking-[0.24em] uppercase text-gold hover:text-navy transition-colors"
      >
        Ver en OpenStreetMap →
      </a>
    </div>
  );
}
