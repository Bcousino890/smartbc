"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Trash2, Copy, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

const MapComponent = dynamic(() => import("./map-component"), { ssr: false });

interface PolygonData {
  id: string;
  name: string;
  coordinates: number[][][]; // GeoJSON-style coordinates
  description?: string;
}

interface MapPolygonSelectorProps {
  selectedPolygons: PolygonData[];
  onChange: (polygons: PolygonData[]) => void;
  className?: string;
}

export function MapPolygonSelector({
  selectedPolygons,
  onChange,
  className,
}: MapPolygonSelectorProps) {
  const [showMap, setShowMap] = useState(false);
  const [newPolygonName, setNewPolygonName] = useState("");

  const addPolygonFromMap = (coordinates: number[][][], name?: string) => {
    const id = `polygon_${Date.now()}`;
    const newPolygon: PolygonData = {
      id,
      name: name || `Zona ${selectedPolygons.length + 1}`,
      coordinates,
    };
    onChange([...selectedPolygons, newPolygon]);
    setNewPolygonName("");
  };

  const removePolygon = (id: string) => {
    onChange(selectedPolygons.filter((p) => p.id !== id));
  };

  const duplicatePolygon = (polygon: PolygonData) => {
    const newPolygon = {
      ...polygon,
      id: `polygon_${Date.now()}`,
      name: `${polygon.name} (copia)`,
    };
    onChange([...selectedPolygons, newPolygon]);
  };

  const updatePolygonName = (id: string, name: string) => {
    onChange(
      selectedPolygons.map((p) => (p.id === id ? { ...p, name } : p))
    );
  };

  return (
    <div className={cn("space-y-3", className)}>
      <p className="text-[10px] font-medium text-ink/60">
        Zonas de interés (Polígonos)
      </p>

      {/* Mapa */}
      {showMap ? (
        <div className="rounded-xl border border-gold/15 bg-white/40 p-3 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-ink/70">
              Dibuja polígonos en el mapa (haz clic en el ícono de dibujo)
            </span>
            <button
              type="button"
              onClick={() => setShowMap(false)}
              className="text-[11px] text-ink/45 hover:text-ink/70 transition"
            >
              Cerrar mapa
            </button>
          </div>

          <MapComponent
            onPolygonDrawn={addPolygonFromMap}
            existingPolygons={selectedPolygons}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowMap(true)}
          className="flex items-center gap-2 w-full rounded-lg border border-gold/30 bg-white/70 px-3 py-2 text-[12px] font-medium text-ink transition hover:border-gold/55 hover:bg-white"
        >
          <MapPin size={14} strokeWidth={2} />
          <span>Abrir mapa para dibujar zonas</span>
        </button>
      )}

      {/* Lista de polígonos */}
      {selectedPolygons.length > 0 && (
        <div className="space-y-1.5 rounded-lg border border-ink/10 bg-white/50 p-2">
          {selectedPolygons.map((polygon) => (
            <div
              key={polygon.id}
              className="flex items-center justify-between gap-2 rounded-md bg-white/70 px-2 py-1.5 text-[11px]"
            >
              <input
                type="text"
                value={polygon.name}
                onChange={(e) => updatePolygonName(polygon.id, e.target.value)}
                className="flex-1 bg-transparent text-ink font-medium focus:outline-none border-b border-transparent hover:border-gold/30 focus:border-gold/55"
              />
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => duplicatePolygon(polygon)}
                  className="p-1 hover:bg-white/80 rounded transition text-ink/60 hover:text-ink"
                  title="Duplicar"
                >
                  <Copy size={12} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={() => removePolygon(polygon.id)}
                  className="p-1 hover:bg-red-50 rounded transition text-ink/60 hover:text-red-600"
                  title="Eliminar"
                >
                  <Trash2 size={12} strokeWidth={2} />
                </button>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-ink/45 px-2 py-1">
            {selectedPolygons.length} zona{selectedPolygons.length !== 1 ? "s" : ""} de interés
          </p>
        </div>
      )}
    </div>
  );
}
