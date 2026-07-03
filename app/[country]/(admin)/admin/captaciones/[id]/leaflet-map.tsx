"use client";

import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

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
  return (
    <div>
      <div
        className="rounded-lg overflow-hidden border border-gold/15"
        style={{ height: 300, width: "100%" }}
      >
        <MapContainer
          center={[lat, lng]}
          zoom={15}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
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
