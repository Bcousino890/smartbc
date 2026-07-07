"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Satélite de Google (sin API key). Google no publica esto como servicio
// soportado, pero es el mismo endpoint que usa Google Maps en el navegador
// y es el truco estándar para tener satélite gratis en Leaflet. Si Google
// llegara a bloquearlo, cambiar a Esri World Imagery (100% gratuito y
// soportado, aunque con menos detalle en Chile).
const SATELLITE_TILE_URL = "https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}";
const SATELLITE_SUBDOMAINS = ["mt0", "mt1", "mt2", "mt3"];
const STREET_TILE_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

const markerIcon =
  typeof window !== "undefined"
    ? L.divIcon({
        className: "",
        html: `<svg width="28" height="42" viewBox="0 0 28 42" xmlns="http://www.w3.org/2000/svg">
  <path d="M14 0C6.27 0 0 6.27 0 14C0 22 14 42 14 42S28 22 28 14C28 6.27 21.73 0 14 0Z" fill="#D97706"/>
  <circle cx="14" cy="14" r="6" fill="white"/>
</svg>`,
        iconSize: [28, 42],
        iconAnchor: [14, 42],
        popupAnchor: [0, -42],
      })
    : undefined;

function MapClickHandler({
  onMove,
  readonly,
}: {
  onMove: (lat: number, lng: number) => void;
  readonly?: boolean;
}) {
  useMapEvents({
    click(e) {
      if (!readonly) onMove(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function MapRecenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng]);
  }, [lat, lng, map]);
  return null;
}

type LeafletMapProps = {
  lat: number;
  lng: number;
  onMove: (lat: number, lng: number) => void;
  readonly?: boolean;
};

export default function LeafletMap({ lat, lng, onMove, readonly }: LeafletMapProps) {
  const [satellite, setSatellite] = useState(false);

  return (
    <div>
      <div
        className="relative rounded-lg overflow-hidden border border-gold/15"
        style={{ height: 300, width: "100%" }}
      >
        <div className="absolute top-2 right-2 z-[1000] flex overflow-hidden rounded-md border border-ink/15 bg-white text-xs shadow-sm">
          <button
            type="button"
            onClick={() => setSatellite(false)}
            className={`px-2.5 py-1 font-medium transition ${
              !satellite ? "bg-ink text-white" : "text-ink/70 hover:bg-ink/5"
            }`}
          >
            Mapa
          </button>
          <button
            type="button"
            onClick={() => setSatellite(true)}
            className={`px-2.5 py-1 font-medium transition ${
              satellite ? "bg-ink text-white" : "text-ink/70 hover:bg-ink/5"
            }`}
          >
            Satélite
          </button>
        </div>
        <MapContainer
          center={[lat, lng]}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
          {satellite ? (
            <TileLayer
              key="satellite"
              attribution='&copy; Google'
              url={SATELLITE_TILE_URL}
              subdomains={SATELLITE_SUBDOMAINS}
              maxZoom={20}
            />
          ) : (
            <TileLayer
              key="street"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url={STREET_TILE_URL}
            />
          )}
          {markerIcon && (
            <Marker
              position={[lat, lng]}
              icon={markerIcon}
              draggable={!readonly}
              eventHandlers={{
                dragend(e) {
                  const pos = (e.target as L.Marker).getLatLng();
                  onMove(pos.lat, pos.lng);
                },
              }}
            />
          )}
          <MapClickHandler onMove={onMove} readonly={readonly} />
          <MapRecenter lat={lat} lng={lng} />
        </MapContainer>
      </div>
      {!readonly && (
        <p className="mt-1.5 text-[11px] text-ink/50">
          Haz clic o arrastra el pin para ajustar la ubicación
        </p>
      )}
    </div>
  );
}
