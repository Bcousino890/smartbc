"use client";

import { useState, useMemo } from "react";
import { Car, Train, Bike, Footprints, Search, ArrowUpRight } from "lucide-react";
import dynamic from "next/dynamic";

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
  type: "car" | "metro" | "bike" | "walk";
  minutes: number;
  icon: React.ElementType;
  label: string;
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
];

// Mock data de tiempos de transporte
const getTransportTimes = (university: University): TransportTime[] => {
  const timeMap: Record<string, TransportTime[]> = {
    uam: [
      { type: "car", minutes: 25, icon: Car, label: "EN COCHE" },
      { type: "metro", minutes: 38, icon: Train, label: "TRANSPORTE PÚBLICO" },
      { type: "bike", minutes: 45, icon: Bike, label: "BICICLETA" },
      { type: "walk", minutes: 60, icon: Footprints, label: "A PIE" },
    ],
    ucm: [
      { type: "car", minutes: 20, icon: Car, label: "EN COCHE" },
      { type: "metro", minutes: 32, icon: Train, label: "TRANSPORTE PÚBLICO" },
      { type: "bike", minutes: 40, icon: Bike, label: "BICICLETA" },
      { type: "walk", minutes: 50, icon: Footprints, label: "A PIE" },
    ],
    uc: [
      { type: "car", minutes: 18, icon: Car, label: "EN COCHE" },
      { type: "metro", minutes: 25, icon: Train, label: "TRANSPORTE PÚBLICO" },
      { type: "bike", minutes: 35, icon: Bike, label: "BICICLETA" },
      { type: "walk", minutes: 45, icon: Footprints, label: "A PIE" },
    ],
  };
  return timeMap[university.id] || [
    { type: "car", minutes: 25, icon: Car, label: "EN COCHE" },
    { type: "metro", minutes: 35, icon: Train, label: "TRANSPORTE PÚBLICO" },
    { type: "bike", minutes: 45, icon: Bike, label: "BICICLETA" },
    { type: "walk", minutes: 60, icon: Footprints, label: "A PIE" },
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
  const [searchTerm, setSearchTerm] = useState("");
  const times = getTransportTimes(selected);

  const propertyCoords = CITY_CENTERS[city] || { lat: 40.4168, lng: -3.7038 };

  const filteredUniversities = useMemo(() => {
    return universities.filter(uni =>
      uni.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      uni.shortName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, universities]);

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

      {/* Search and Filter Section */}
      <div className="mb-8 space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-3.5 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Busca tu universidad o selecciona..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-stone-200 rounded-lg bg-white text-sm focus:outline-none focus:border-gold"
          />
        </div>

        {/* University Logos/Tags */}
        <div className="flex flex-wrap gap-3 items-center">
          <span className="text-[11px] tracking-[0.24em] uppercase text-gray-400">Universidades:</span>
          <div className="flex flex-wrap gap-2">
            {universities.slice(0, 6).map((uni) => (
              <button
                key={uni.id}
                onClick={() => setSelected(uni)}
                className={`px-3 py-2 text-xs rounded-lg border transition-all ${
                  selected.id === uni.id
                    ? "border-gold bg-gold/10 text-navy font-semibold"
                    : "border-stone-200 bg-white text-navy/70 hover:border-gold"
                }`}
              >
                {uni.shortName}
              </button>
            ))}
            {universities.length > 6 && (
              <button className="px-3 py-2 text-xs text-gold border border-gold/40 rounded-lg hover:bg-gold/5">
                +{universities.length - 6} más
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Map Section */}
      <div className="rounded-lg overflow-hidden border border-stone-200 shadow-sm mb-8" style={{ height: "450px" }}>
        <MapContainer bounds={bounds} style={{ height: "100%", width: "100%" }}>
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {/* Marcador de propiedad */}
          <Marker position={[propertyCoords.lat, propertyCoords.lng]}>
            <Popup>📍 Propiedad: {address}</Popup>
          </Marker>

          {/* Círculo de área referencial */}
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

      {/* Transport Times - Horizontal Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
        {times.map((time) => {
          const Icon = time.icon;
          return (
            <div key={time.type} className="p-4 rounded-lg border border-stone-200 bg-white hover:border-gold transition-colors text-center">
              <Icon size={24} className="text-gold mx-auto mb-3" />
              <p className="text-[10px] tracking-[0.18em] uppercase text-gray-400 mb-2">
                {time.label}
              </p>
              <p className="font-display text-3xl text-navy">{time.minutes}</p>
              <p className="text-xs text-gray-400">min</p>
            </div>
          );
        })}
      </div>

      {/* Show Route Button */}
      <div className="flex justify-end">
        <a
          href={mapsDirectionsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-navy text-cream px-6 py-3 text-[11px] tracking-[0.28em] uppercase hover:bg-gold hover:text-navy transition-colors rounded-lg font-semibold"
        >
          Show Route <ArrowUpRight size={16} />
        </a>
      </div>

      {/* Info Note */}
      <div className="mt-8 p-4 rounded-lg border border-stone-200 bg-cream-deep">
        <p className="text-xs text-gray-500">
          <span className="font-semibold text-navy">Nota:</span> Los tiempos son aproximados basados en horario de tráfico normal.
          Para obtener información en tiempo real, consulta Google Maps.
        </p>
      </div>
    </section>
  );
}
