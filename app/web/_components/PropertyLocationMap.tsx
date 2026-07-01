"use client";

import dynamic from "next/dynamic";

// Single dynamic import wrapping the entire map to avoid SSR/hydration issues
const LeafletMap = dynamic(() => import("./LeafletMap"), { ssr: false, loading: () => <div style={{ height: "300px" }} className="bg-cream-deep flex items-center justify-center border border-stone-200 rounded-lg"><span className="text-sm text-gray-400">Cargando mapa…</span></div> });

// Zone/neighborhood coordinates for Madrid and Santiago areas
const ZONE_COORDS: Record<string, { lat: number; lng: number }> = {
  // Madrid barrios
  "Salamanca": { lat: 40.4275, lng: -3.6830 },
  "Barrio Salamanca": { lat: 40.4275, lng: -3.6830 },
  "Chamberí": { lat: 40.4347, lng: -3.7030 },
  "Chamberi": { lat: 40.4347, lng: -3.7030 },
  "Chamartín": { lat: 40.4560, lng: -3.6773 },
  "Chamartin": { lat: 40.4560, lng: -3.6773 },
  "Centro": { lat: 40.4168, lng: -3.7038 },
  "La Moraleja": { lat: 40.5050, lng: -3.6250 },
  "Pozuelo de Alarcón": { lat: 40.4370, lng: -3.8140 },
  "Pozuelo": { lat: 40.4370, lng: -3.8140 },
  "Marbella Golden Mile": { lat: 36.5095, lng: -4.9330 },
  "Marbella": { lat: 36.5095, lng: -4.9330 },
  "Retiro": { lat: 40.4097, lng: -3.6844 },
  "Almagro": { lat: 40.4310, lng: -3.6960 },
  "Goya": { lat: 40.4249, lng: -3.6748 },
  "Serrano": { lat: 40.4275, lng: -3.6830 },
  // Santiago / Chile comunas
  "Lo Barnechea": { lat: -33.3533, lng: -70.5218 },
  "Las Condes": { lat: -33.4173, lng: -70.5784 },
  "Vitacura": { lat: -33.3928, lng: -70.5782 },
  "Providencia": { lat: -33.4325, lng: -70.6108 },
  "Zapallar": { lat: -32.5545, lng: -71.4642 },
  "Cachagua": { lat: -32.5800, lng: -71.4580 },
  "Concón": { lat: -32.9251, lng: -71.5353 },
  "Viña del Mar": { lat: -33.0245, lng: -71.5518 },
  // City defaults
  "Madrid": { lat: 40.4168, lng: -3.7038 },
  "Santiago": { lat: -33.4489, lng: -70.6693 },
};

function resolveCoords(address: string, city: string): { lat: number; lng: number } {
  // Try matching the address against known zones (case-insensitive)
  const addrLower = address.toLowerCase();
  for (const [key, coords] of Object.entries(ZONE_COORDS)) {
    if (addrLower.includes(key.toLowerCase())) return coords;
  }
  // Fall back to city
  return ZONE_COORDS[city] ?? { lat: 40.4168, lng: -3.7038 };
}

export function PropertyLocationMap({ address, city, country, zone }: { address: string; city: string; country: string; zone?: string }) {
  const propertyCoords = resolveCoords(zone || address, city);

  const displayName = zone || address;

  return (
    <div className="mt-6 space-y-4">
      <div className="rounded-lg overflow-hidden border border-stone-200 shadow-sm" style={{ height: "300px" }}>
        <LeafletMap lat={propertyCoords.lat} lng={propertyCoords.lng} label={address} />
      </div>

      <div className="border-l-4 border-gold pl-4">
        <p className="font-semibold text-navy">{displayName}</p>
        <p className="text-sm text-gray-500">{city}, {country}</p>
        <p className="text-xs text-gray-400 mt-2">El círculo muestra un área referencial de 500m alrededor de la propiedad</p>
      </div>

      <a
        href={`https://www.openstreetmap.org/search?query=${encodeURIComponent(displayName + ", " + city + ", " + country)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-[11px] tracking-[0.24em] uppercase text-gold hover:text-navy transition-colors"
      >
        Ver en OpenStreetMap →
      </a>
    </div>
  );
}
