"use client";

import { useState } from "react";
import { MapPin, Clock, Car, Train, Bus } from "lucide-react";

interface University {
  id: string;
  name: string;
  city: string;
  lat: number;
  lng: number;
}

interface TransportTime {
  type: "car" | "metro" | "bus";
  minutes: number;
  icon: React.ElementType;
  label: string;
}

// Universidades principales en Madrid
const UNIVERSITIES_MADRID: University[] = [
  { id: "uam", name: "Universidad Autónoma de Madrid", city: "Madrid", lat: 40.3489, lng: -3.7327 },
  { id: "ucm", name: "Universidad Complutense de Madrid", city: "Madrid", lat: 40.4532, lng: -3.7321 },
  { id: "upm", name: "Universidad Politécnica de Madrid", city: "Madrid", lat: 40.4533, lng: -3.7296 },
  { id: "uc3m", name: "Universidad Carlos III", city: "Madrid", lat: 40.3164, lng: -3.6273 },
  { id: "upcomillas", name: "Universidad Pontificia Comillas", city: "Madrid", lat: 40.4528, lng: -3.6918 },
];

// Universidades principales en Santiago
const UNIVERSITIES_SANTIAGO: University[] = [
  { id: "uc", name: "Pontificia Universidad Católica", city: "Santiago", lat: -33.4489, lng: -70.6693 },
  { id: "uchile", name: "Universidad de Chile", city: "Santiago", lat: -33.4575, lng: -70.6671 },
  { id: "usach", name: "Universidad de Santiago de Chile", city: "Santiago", lat: -33.5007, lng: -70.5589 },
  { id: "unab", name: "Universidad Andrés Bello", city: "Santiago", lat: -33.3997, lng: -70.6091 },
];

// Mock data de tiempos de transporte (en una app real, vendría de Google Maps API)
const getTransportTimes = (university: University): TransportTime[] => {
  const timeMap: Record<string, TransportTime[]> = {
    uam: [
      { type: "car", minutes: 25, icon: Car, label: "EN COCHE" },
      { type: "metro", minutes: 38, icon: Train, label: "EN METRO" },
      { type: "bus", minutes: 49, icon: Bus, label: "EN AUTOBÚS" },
    ],
    ucm: [
      { type: "car", minutes: 20, icon: Car, label: "EN COCHE" },
      { type: "metro", minutes: 32, icon: Train, label: "EN METRO" },
      { type: "bus", minutes: 41, icon: Bus, label: "EN AUTOBÚS" },
    ],
    upm: [
      { type: "car", minutes: 22, icon: Car, label: "EN COCHE" },
      { type: "metro", minutes: 35, icon: Train, label: "EN METRO" },
      { type: "bus", minutes: 44, icon: Bus, label: "EN AUTOBÚS" },
    ],
    uc3m: [
      { type: "car", minutes: 18, icon: Car, label: "EN COCHE" },
      { type: "metro", minutes: 28, icon: Train, label: "EN METRO" },
      { type: "bus", minutes: 38, icon: Bus, label: "EN AUTOBÚS" },
    ],
    upcomillas: [
      { type: "car", minutes: 21, icon: Car, label: "EN COCHE" },
      { type: "metro", minutes: 33, icon: Train, label: "EN METRO" },
      { type: "bus", minutes: 45, icon: Bus, label: "EN AUTOBÚS" },
    ],
    uc: [
      { type: "car", minutes: 18, icon: Car, label: "EN COCHE" },
      { type: "metro", minutes: 25, icon: Train, label: "EN METRO" },
      { type: "bus", minutes: 32, icon: Bus, label: "EN AUTOBÚS" },
    ],
  };
  return timeMap[university.id] || [
    { type: "car", minutes: 25, icon: Car, label: "EN COCHE" },
    { type: "metro", minutes: 35, icon: Train, label: "EN METRO" },
    { type: "bus", minutes: 45, icon: Bus, label: "EN AUTOBÚS" },
  ];
};

export function CampusDistance({ city, address }: { city: string; address: string }) {
  const universities = city === "Santiago" ? UNIVERSITIES_SANTIAGO : UNIVERSITIES_MADRID;
  const [selected, setSelected] = useState<University>(universities[0]);
  const times = getTransportTimes(selected);

  const mapsUrl = `https://www.google.com/maps/dir/${encodeURIComponent(address)},${encodeURIComponent(city)}/${selected.lat},${selected.lng}`;

  return (
    <section className="mt-16">
      <h2 className="font-display text-3xl text-navy">Distancia al campus</h2>
      <p className="mt-2 text-sm text-gray-500">
        Selecciona tu universidad para ver la ruta y los tiempos aproximados desde {address.split(",")[0]}.
      </p>

      <div className="mt-6 grid lg:grid-cols-3 gap-8">
        {/* Selector y mapa */}
        <div className="lg:col-span-2">
          <div className="mb-6">
            <label className="text-[11px] tracking-[0.24em] uppercase text-gray-400 block mb-3">
              Universidad / Escuela
            </label>
            <select
              value={selected.id}
              onChange={(e) => {
                const uni = universities.find((u) => u.id === e.target.value);
                if (uni) setSelected(uni);
              }}
              className="w-full border border-stone-200 bg-white px-4 py-3 text-navy rounded-lg focus:border-gold outline-none"
            >
              {universities.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>

          {/* Mapa placeholder - en producción usar Google Maps Embed */}
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block aspect-[4/3] rounded-lg overflow-hidden border border-stone-200 bg-gradient-to-br from-stone-100 to-stone-50 flex items-center justify-center hover:from-stone-50 hover:to-stone-100 transition-colors group"
          >
            <div className="text-center">
              <MapPin size={40} className="text-gold mx-auto group-hover:scale-110 transition-transform" />
              <p className="mt-3 text-navy font-display font-semibold">{selected.name}</p>
              <p className="text-xs text-gold mt-2 tracking-wide uppercase group-hover:text-navy">Ver ruta en Google Maps →</p>
            </div>
          </a>
        </div>

        {/* Tiempos de transporte */}
        <div className="space-y-3">
          {times.map((time) => {
            const Icon = time.icon;
            return (
              <div
                key={time.type}
                className="rounded-lg border border-stone-200 bg-white p-4 hover:border-gold hover:bg-gold/2 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Icon size={18} className="text-gold flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-display text-2xl text-navy leading-tight">{time.minutes}</p>
                    <p className="text-[10px] tracking-[0.18em] uppercase text-gray-400 mt-1">
                      {time.label}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-8 p-4 rounded-lg border border-stone-200 bg-cream-deep">
        <p className="text-xs text-gray-500">
          <span className="font-semibold text-navy">Nota:</span> Los tiempos son aproximados basados en horario de tráfico normal.
          Haz clic en "Ver ruta en Google Maps" para obtener direcciones detalladas y tiempos en tiempo real.
        </p>
      </div>
    </section>
  );
}
