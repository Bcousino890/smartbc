"use client";

import { useState, useMemo } from "react";
import { Car, Train, Bus } from "lucide-react";
import dynamic from "next/dynamic";
import L from "leaflet";

// Dynamic import to avoid SSR issues with Leaflet
const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false });
const TileLayer = dynamic(() => import("react-leaflet").then(m => m.TileLayer), { ssr: false });
const Marker = dynamic(() => import("react-leaflet").then(m => m.Marker), { ssr: false });
const Popup = dynamic(() => import("react-leaflet").then(m => m.Popup), { ssr: false });
const Polyline = dynamic(() => import("react-leaflet").then(m => m.Polyline), { ssr: false });
const Circle = dynamic(() => import("react-leaflet").then(m => m.Circle), { ssr: false });

interface University {
  id: string;
  name: string;
  shortName: string;
  city: string;
  lat: number;
  lng: number;
}

interface TransportTime {
  type: "car" | "metro" | "bus";
  minutes: number;
  icon: React.ElementType;
}

// Universidades principales en Madrid
const UNIVERSITIES_MADRID: University[] = [
  { id: "uam", name: "Universidad Autónoma de Madrid", shortName: "UAM", city: "Madrid", lat: 40.3489, lng: -3.7327 },
  { id: "ucm", name: "Universidad Complutense de Madrid", shortName: "UCM", city: "Madrid", lat: 40.4532, lng: -3.7321 },
  { id: "upm", name: "Universidad Politécnica de Madrid", shortName: "UPM", city: "Madrid", lat: 40.4533, lng: -3.7296 },
  { id: "uc3m", name: "Universidad Carlos III", shortName: "UC3M", city: "Madrid", lat: 40.3164, lng: -3.6273 },
  { id: "upcomillas", name: "Universidad Pontificia Comillas", shortName: "Comillas", city: "Madrid", lat: 40.4528, lng: -3.6918 },
  { id: "ade", name: "Universidad ADE Madrid", shortName: "ADE", city: "Madrid", lat: 40.4297, lng: -3.6867 },
  { id: "uned", name: "UNED - Universidad Nacional de Educación a Distancia", shortName: "UNED", city: "Madrid", lat: 40.4434, lng: -3.6853 },
  { id: "unir", name: "UNIR - Universidad Internacional de La Rioja", shortName: "UNIR", city: "Madrid", lat: 40.4531, lng: -3.6886 },
  { id: "urjc", name: "Universidad Rey Juan Carlos", shortName: "URJC", city: "Madrid", lat: 40.2584, lng: -3.5059 },
  { id: "ie", name: "IE University", shortName: "IE", city: "Madrid", lat: 40.4469, lng: -3.7132 },
  { id: "esade", name: "ESADE Business School", shortName: "ESADE", city: "Madrid", lat: 40.4421, lng: -3.7156 },
  { id: "iese", name: "IESE Business School", shortName: "IESE", city: "Madrid", lat: 40.4534, lng: -3.6919 },
  { id: "uca", name: "Universidad CEU Cardenal Herrera", shortName: "CEU", city: "Madrid", lat: 40.3832, lng: -3.6289 },
  { id: "uvic", name: "Universidad Villanueva", shortName: "UVillanueva", city: "Madrid", lat: 40.4519, lng: -3.7453 },
  { id: "ucjc", name: "Universidad Camilo José Cela", shortName: "UCJC", city: "Madrid", lat: 40.4109, lng: -3.7282 },
  { id: "uax", name: "Universidad Alfonso X el Sabio", shortName: "UAX", city: "Madrid", lat: 40.3532, lng: -3.6456 },
  { id: "ufv", name: "Universidad Francisco de Vitoria", shortName: "UFV", city: "Madrid", lat: 40.4898, lng: -3.8269 },
  { id: "esp", name: "Escuela Superior Politécnica", shortName: "ESP", city: "Madrid", lat: 40.4533, lng: -3.7296 },
  { id: "euia", name: "EUIA - Escuela Universitaria de Informática Aplicada", shortName: "EUIA", city: "Madrid", lat: 40.4531, lng: -3.6853 },
  { id: "upm-etsist", name: "UPM - Escuela Técnica Superior de Ingeniería de Sistemas", shortName: "UPM-ETSIST", city: "Madrid", lat: 40.4533, lng: -3.7296 },
  { id: "upsa", name: "Universidad Pontificia de Salamanca", shortName: "UPSA", city: "Madrid", lat: 40.4170, lng: -3.7032 },
  { id: "uem", name: "Universidad Europea de Madrid", shortName: "UEM", city: "Madrid", lat: 40.4738, lng: -3.6131 },
];

// Universidades principales en Santiago
const UNIVERSITIES_SANTIAGO: University[] = [
  { id: "uc", name: "Pontificia Universidad Católica de Chile", shortName: "UC", city: "Santiago", lat: -33.4489, lng: -70.6693 },
  { id: "uchile", name: "Universidad de Chile", shortName: "UChile", city: "Santiago", lat: -33.4575, lng: -70.6671 },
  { id: "usach", name: "Universidad de Santiago de Chile", shortName: "USACH", city: "Santiago", lat: -33.5007, lng: -70.5589 },
  { id: "unab", name: "Universidad Andrés Bello", shortName: "UNAB", city: "Santiago", lat: -33.3997, lng: -70.6091 },
  { id: "udp", name: "Universidad Diego Portales", shortName: "UDP", city: "Santiago", lat: -33.4408, lng: -70.6394 },
  { id: "umayor", name: "Universidad Mayor", shortName: "UMayor", city: "Santiago", lat: -33.4200, lng: -70.6500 },
  { id: "uaconcagua", name: "Universidad de Aconcagua", shortName: "UAConcagua", city: "Santiago", lat: -33.4500, lng: -70.6700 },
  { id: "utem", name: "Universidad Tecnológica Metropolitana", shortName: "UTEM", city: "Santiago", lat: -33.4761, lng: -70.6789 },
  { id: "ubo", name: "Universidad Bernardo O'Higgins", shortName: "UBO", city: "Santiago", lat: -33.4891, lng: -70.6891 },
  { id: "upla", name: "Universidad de Playa Ancha", shortName: "UPLA", city: "Santiago", lat: -33.4700, lng: -70.6800 },
  { id: "uvm", name: "Universidad Viña del Mar", shortName: "UVM", city: "Santiago", lat: -33.0160, lng: -71.5500 },
  { id: "duoc", name: "DuocUC", shortName: "Duoc", city: "Santiago", lat: -33.4400, lng: -70.6200 },
  { id: "ipchile", name: "Instituto Profesional AIEP", shortName: "AIEP", city: "Santiago", lat: -33.4450, lng: -70.6650 },
  { id: "inacap", name: "Instituto Nacional de Capacitación", shortName: "INACAP", city: "Santiago", lat: -33.4500, lng: -70.6750 },
  { id: "utalca", name: "Universidad de Talca", shortName: "UTalca", city: "Santiago", lat: -33.4600, lng: -70.6850 },
  { id: "uct", name: "Universidad Católica de Temuco", shortName: "UCT", city: "Santiago", lat: -33.4350, lng: -70.6550 },
  { id: "uniacc", name: "Universidad de Artes, Ciencias y Comunicación", shortName: "UNIACC", city: "Santiago", lat: -33.4550, lng: -70.6700 },
  { id: "unab-peñalolén", name: "Universidad Andrés Bello - Peñalolén", shortName: "UNAB-PE", city: "Santiago", lat: -33.3904, lng: -70.5610 },
  { id: "uc-oriente", name: "Universidad Católica - Campus Oriente", shortName: "UC-Oriente", city: "Santiago", lat: -33.4100, lng: -70.5500 },
  { id: "uchile-norte", name: "Universidad de Chile - Campus Juan Gómez Millas", shortName: "UChile-Norte", city: "Santiago", lat: -33.4575, lng: -70.6671 },
  { id: "udec", name: "Universidad de Concepción", shortName: "UDec", city: "Santiago", lat: -33.4600, lng: -70.6900 },
];

// Mock data de tiempos de transporte
const getTransportTimes = (university: University): TransportTime[] => {
  const timeMap: Record<string, TransportTime[]> = {
    uam: [
      { type: "car", minutes: 25, icon: Car },
      { type: "metro", minutes: 38, icon: Train },
      { type: "bus", minutes: 49, icon: Bus },
    ],
    ucm: [
      { type: "car", minutes: 20, icon: Car },
      { type: "metro", minutes: 32, icon: Train },
      { type: "bus", minutes: 41, icon: Bus },
    ],
    upm: [
      { type: "car", minutes: 22, icon: Car },
      { type: "metro", minutes: 35, icon: Train },
      { type: "bus", minutes: 44, icon: Bus },
    ],
    uc3m: [
      { type: "car", minutes: 18, icon: Car },
      { type: "metro", minutes: 28, icon: Train },
      { type: "bus", minutes: 38, icon: Bus },
    ],
    upcomillas: [
      { type: "car", minutes: 21, icon: Car },
      { type: "metro", minutes: 33, icon: Train },
      { type: "bus", minutes: 45, icon: Bus },
    ],
    uc: [
      { type: "car", minutes: 18, icon: Car },
      { type: "metro", minutes: 25, icon: Train },
      { type: "bus", minutes: 32, icon: Bus },
    ],
  };
  return timeMap[university.id] || [
    { type: "car", minutes: 25, icon: Car },
    { type: "metro", minutes: 35, icon: Train },
    { type: "bus", minutes: 45, icon: Bus },
  ];
};

// Approximate city center coordinates
const CITY_CENTERS: Record<string, { lat: number; lng: number }> = {
  Madrid: { lat: 40.4168, lng: -3.7038 },
  Santiago: { lat: -33.4489, lng: -70.6693 },
};

export function CampusDistance({ city, address }: { city: string; address: string }) {
  const universities = city === "Santiago" ? UNIVERSITIES_SANTIAGO : UNIVERSITIES_MADRID;
  const [selected, setSelected] = useState<University>(universities[0]);
  const times = getTransportTimes(selected);

  // Approximate property location (city center for now)
  const propertyCoords = CITY_CENTERS[city] || { lat: 40.4168, lng: -3.7038 };

  // Calculate bounds to fit both markers with some padding
  const bounds = useMemo(() => {
    const lats = [propertyCoords.lat, selected.lat];
    const lngs = [propertyCoords.lng, selected.lng];
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const padding = 0.03;
    return [
      [minLat - padding, minLng - padding],
      [maxLat + padding, maxLng + padding],
    ] as [[number, number], [number, number]];
  }, [propertyCoords, selected]);

  const mapsDirectionsUrl = `https://www.google.com/maps/dir/${encodeURIComponent(address + "," + city)}/${selected.lat},${selected.lng}`;

  return (
    <section className="mt-16">
      <h2 className="font-display text-3xl text-navy mb-8">Distancia al campus</h2>

      <div className="grid lg:grid-cols-2 gap-12">
        {/* Selector de universidad y mapa */}
        <div>
          <label className="text-[11px] tracking-[0.24em] uppercase text-gray-400 block mb-4">
            Selecciona tu universidad
          </label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-8">
            {universities.map((uni) => (
              <button
                key={uni.id}
                onClick={() => setSelected(uni)}
                className={`p-2 rounded-lg border-2 transition-all text-center text-xs ${
                  selected.id === uni.id
                    ? "border-gold bg-gold/10 text-navy font-semibold"
                    : "border-stone-200 bg-white text-navy/70 hover:border-gold hover:text-navy"
                }`}
                title={uni.name}
              >
                <p className="text-[11px] font-display leading-tight">{uni.shortName}</p>
              </button>
            ))}
          </div>

          {/* Mapa Interactivo Leaflet */}
          <div className="rounded-lg overflow-hidden border border-stone-200 shadow-sm" style={{ height: "400px" }}>
            <MapContainer bounds={bounds} style={{ height: "100%", width: "100%" }}>
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Marcador de propiedad */}
              <Marker position={[propertyCoords.lat, propertyCoords.lng]}>
                <Popup>📍 Propiedad: {address}</Popup>
              </Marker>

              {/* Círculo de área referencial alrededor de la propiedad */}
              <Circle
                center={[propertyCoords.lat, propertyCoords.lng]}
                radius={500}
                pathOptions={{ color: "#c9a96e", weight: 2, opacity: 0.3, fill: true, fillOpacity: 0.1 }}
              />

              {/* Marcador de universidad */}
              <Marker position={[selected.lat, selected.lng]}>
                <Popup>🎓 {selected.name}</Popup>
              </Marker>

              {/* Línea de ruta */}
              <Polyline
                positions={[[propertyCoords.lat, propertyCoords.lng], [selected.lat, selected.lng]]}
                pathOptions={{ color: "#c9a96e", weight: 2, opacity: 0.7, dashArray: "5, 5" }}
              />
            </MapContainer>
          </div>

          <div className="mt-4 flex justify-center">
            <a
              href={mapsDirectionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] tracking-[0.24em] uppercase text-gold hover:text-navy transition-colors"
            >
              Ver ruta detallada en Google Maps →
            </a>
          </div>
        </div>

        {/* Tiempos de transporte */}
        <div>
          <p className="text-[11px] tracking-[0.24em] uppercase text-gray-400 mb-4">
            Tiempos aproximados desde {address.split(",")[0]}
          </p>
          <div className="space-y-4">
            {times.map((time) => {
              const Icon = time.icon;
              return (
                <div key={time.type} className="flex items-center gap-6 p-5 rounded-lg border border-stone-200 bg-white hover:border-gold hover:bg-gold/2 transition-colors">
                  <Icon size={24} className="text-gold flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-[10px] tracking-[0.18em] uppercase text-gray-400">
                      {time.type === "car" && "EN COCHE"}
                      {time.type === "metro" && "EN METRO"}
                      {time.type === "bus" && "EN AUTOBÚS"}
                    </p>
                    <p className="font-display text-3xl text-navy mt-1">{time.minutes}</p>
                    <p className="text-xs text-gray-400">minutos</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-8 p-4 rounded-lg border border-stone-200 bg-cream-deep">
        <p className="text-xs text-gray-500">
          <span className="font-semibold text-navy">Nota:</span> Los tiempos son aproximados basados en horario de tráfico normal.
          Para obtener información en tiempo real, consulta Google Maps.
        </p>
      </div>
    </section>
  );
}
