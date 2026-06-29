"use client";

import { MapContainer, TileLayer, Circle, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect } from "react";

// Fix default marker icons broken by webpack
function useLeafletIcons() {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
      iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
      shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    });
  }, []);
}

export default function LeafletMap({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  useLeafletIcons();

  const bounds: [[number, number], [number, number]] = [
    [lat - 0.02, lng - 0.02],
    [lat + 0.02, lng + 0.02],
  ];

  return (
    <MapContainer bounds={bounds} style={{ height: "100%", width: "100%" }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <Circle
        center={[lat, lng]}
        radius={500}
        pathOptions={{ color: "#c9a96e", weight: 2, opacity: 0.5, fill: true, fillOpacity: 0.15 }}
      />
      <Marker position={[lat, lng]}>
        <Popup>📍 {label}</Popup>
      </Marker>
    </MapContainer>
  );
}
