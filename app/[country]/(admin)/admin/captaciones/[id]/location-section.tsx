"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { MapPin, Loader2, Check } from "lucide-react";
import { CAPTACION_PROPERTY_TYPE_LABELS } from "@/lib/types";
import type { CaptacionPropertyType } from "@/lib/types";

const LeafletMap = dynamic(() => import("./leaflet-map"), { ssr: false });

type LocationSectionProps = {
  captacion: {
    id: string;
    property_type: CaptacionPropertyType | null;
    address_verified: boolean;
    latitude: number | null;
    longitude: number | null;
    address_real: string | null;
    rol_propiedad: string | null;
    commune: string | null;
  };
  captacionId: string;
  /** Ya resuelto en el servidor con la regla de `lib/captaciones/access.ts`. */
  canEdit: boolean;
  onUpdate: (data: any) => Promise<void>;
};

export function LocationSection({
  captacion,
  captacionId,
  canEdit,
  onUpdate,
}: LocationSectionProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [geocodingLoading, setGeocodingLoading] = useState(false);
  const [error, setError] = useState("");
  const [geocodingAddress, setGeocodingAddress] = useState("");

  const [locationData, setLocationData] = useState({
    property_type: captacion.property_type || "",
    address_verified: captacion.address_verified || false,
    latitude: captacion.latitude,
    longitude: captacion.longitude,
    address_real: captacion.address_real || "",
    rol_propiedad: captacion.rol_propiedad || "",
    commune: captacion.commune || "",
  });

  async function handleGeocodeFromAddress() {
    if (!geocodingAddress.trim()) return;

    setError("");
    setGeocodingLoading(true);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ address: geocodingAddress }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "No se encontró la dirección");
        return;
      }

      const data = await res.json();
      setLocationData({
        ...locationData,
        latitude: data.latitude,
        longitude: data.longitude,
      });
      setGeocodingAddress("");
    } catch {
      setError("Error al geocodificar");
    } finally {
      setGeocodingLoading(false);
    }
  }

  async function handleReverseGeocode() {
    if (!locationData.latitude || !locationData.longitude) return;

    setError("");
    setGeocodingLoading(true);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/geocode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: locationData.latitude,
          longitude: locationData.longitude,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "No se encontró la ubicación");
        return;
      }

      const data = await res.json();
      // Simplemente mostramos la dirección en el console
      console.log("Dirección encontrada:", data.address);
    } catch {
      setError("Error al reverse geocodificar");
    } finally {
      setGeocodingLoading(false);
    }
  }

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      await onUpdate({
        property_type: locationData.property_type || null,
        address_verified: locationData.address_verified,
        latitude: locationData.latitude,
        longitude: locationData.longitude,
        address_real: locationData.address_real.trim() || null,
        rol_propiedad: locationData.rol_propiedad.trim() || null,
        // El endpoint de update acepta commune de cualquier rol con permiso de
        // edición (la captadora la corrige al verificar la ubicación real).
        commune: locationData.commune.trim() || null,
      });
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  if (!editing) {
    return (
      <div className="rounded-2xl border border-gold/15 bg-white/70 p-6">
        <div className="space-y-4">
          <div>
            <p className="text-xs text-ink/50 uppercase tracking-wide">Tipo de Propiedad</p>
            <p className="mt-0.5 text-sm font-medium text-ink">
              {captacion.property_type
                ? CAPTACION_PROPERTY_TYPE_LABELS[captacion.property_type]
                : <span className="text-ink/35">No especificado</span>}
            </p>
          </div>

          <div>
            <p className="text-xs text-ink/50 uppercase tracking-wide">Rol de la Propiedad (SII)</p>
            <p className="mt-0.5 text-sm font-medium text-ink">
              {captacion.rol_propiedad
                ? captacion.rol_propiedad
                : <span className="text-ink/35">No especificado</span>}
            </p>
          </div>

          <div>
            <p className="text-xs text-ink/50 uppercase tracking-wide">Comuna</p>
            <p className="mt-0.5 text-sm font-medium text-ink">
              {captacion.commune
                ? captacion.commune
                : <span className="text-ink/35">No especificada</span>}
            </p>
          </div>

          <div>
            <p className="text-xs text-ink/50 uppercase tracking-wide">Dirección Real</p>
            <p className="mt-0.5 text-sm font-medium text-ink">
              {captacion.address_real
                ? captacion.address_real
                : <span className="text-ink/35">No especificada</span>}
            </p>
          </div>

          <div>
            <p className="text-xs text-ink/50 uppercase tracking-wide">Dirección Verificada</p>
            <div className="mt-0.5 flex items-center gap-2">
              {captacion.address_verified ? (
                <>
                  <Check size={16} className="text-emerald-600" />
                  <span className="text-sm font-medium text-emerald-600">Sí, verificada</span>
                </>
              ) : (
                <span className="text-sm font-medium text-ink/35">No verificada</span>
              )}
            </div>
          </div>

          {captacion.latitude && captacion.longitude && (
            <div>
              <p className="text-xs text-ink/50 uppercase tracking-wide mb-2">Ubicación</p>
              <LeafletMap
                lat={captacion.latitude}
                lng={captacion.longitude}
                onMove={() => {}}
                readonly
              />
              <a
                href={`https://maps.google.com/?q=${captacion.latitude},${captacion.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-gold hover:underline"
              >
                <MapPin size={12} />
                Ver en Google Maps ({captacion.latitude.toFixed(4)}, {captacion.longitude.toFixed(4)})
              </a>
            </div>
          )}

          {canEdit && (
            <button
              onClick={() => setEditing(true)}
              className="mt-2 rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
            >
              Editar Ubicación
            </button>
          )}
        </div>
      </div>
    );
  }

  // Modo edición
  return (
    <div className="rounded-2xl border border-gold/15 bg-white/70 p-6">
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          handleSave();
        }}
      >
        {/* Tipo de propiedad */}
        <div>
          <label className="block text-sm font-medium text-ink/70 mb-2">
            Tipo de Propiedad
          </label>
          <select
            value={locationData.property_type}
            onChange={(e) =>
              setLocationData({ ...locationData, property_type: e.target.value })
            }
            className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
          >
            <option value="">Selecciona tipo...</option>
            <option value="house">Casa</option>
            <option value="apartment">Departamento</option>
            <option value="land">Terreno</option>
            <option value="office">Oficina</option>
            <option value="commercial">Comercial</option>
            <option value="other">Otro</option>
          </select>
        </div>

        {/* Rol de avalúo SII */}
        <div>
          <label className="block text-sm font-medium text-ink/70 mb-2">
            Rol de la Propiedad (SII)
          </label>
          <input
            type="text"
            value={locationData.rol_propiedad}
            onChange={(e) =>
              setLocationData({ ...locationData, rol_propiedad: e.target.value })
            }
            placeholder="Ej: 1234-56"
            className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
          />
        </div>

        {/* Comuna — editable también por la captadora al verificar la ubicación */}
        <div>
          <label className="block text-sm font-medium text-ink/70 mb-2">
            Comuna
          </label>
          <input
            type="text"
            value={locationData.commune}
            onChange={(e) =>
              setLocationData({ ...locationData, commune: e.target.value })
            }
            placeholder="Ej: Las Condes"
            className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
          />
        </div>

        {/* Dirección real */}
        <div>
          <label className="block text-sm font-medium text-ink/70 mb-2">
            Dirección Real
          </label>
          <input
            type="text"
            value={locationData.address_real}
            onChange={(e) =>
              setLocationData({ ...locationData, address_real: e.target.value })
            }
            placeholder="Av. Providencia 1234, Santiago"
            className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
          />
        </div>

        {/* Dirección verificada */}
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={locationData.address_verified}
            onChange={(e) =>
              setLocationData({ ...locationData, address_verified: e.target.checked })
            }
            className="rounded border border-ink/20"
          />
          <span className="text-sm font-medium text-ink">Dirección verificada</span>
        </label>

        {/* Geocodificación */}
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
          <p className="text-xs font-medium text-amber-900 mb-2">Geocodificación</p>

          <div className="space-y-2 mb-2">
            <input
              type="text"
              value={geocodingAddress}
              onChange={(e) => setGeocodingAddress(e.target.value)}
              placeholder="Ej: Av. Providencia 1234, Santiago, Chile"
              className="w-full rounded-lg border border-amber-200 bg-white px-3 py-1.5 text-xs focus:border-amber-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={handleGeocodeFromAddress}
              disabled={geocodingLoading || !geocodingAddress.trim()}
              className="w-full flex items-center justify-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {geocodingLoading && <Loader2 size={12} className="animate-spin" />}
              Geocodificar Dirección
            </button>
          </div>

          {locationData.latitude && locationData.longitude && (
            <div className="text-xs text-amber-800">
              <p>Lat: {locationData.latitude.toFixed(4)}</p>
              <p>Lng: {locationData.longitude.toFixed(4)}</p>
              <button
                type="button"
                onClick={handleReverseGeocode}
                disabled={geocodingLoading}
                className="mt-1 text-amber-700 hover:underline"
              >
                {geocodingLoading ? "Buscando..." : "Obtener dirección"}
              </button>
            </div>
          )}
        </div>

        {/* Mapa interactivo Leaflet */}
        <LeafletMap
          key={`${locationData.latitude}-${locationData.longitude}`}
          lat={locationData.latitude ?? -33.4569}
          lng={locationData.longitude ?? -70.6483}
          onMove={(lat, lng) =>
            setLocationData({ ...locationData, latitude: lat, longitude: lng })
          }
        />

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex gap-2 pt-1">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
          >
            {saving && <Loader2 size={14} className="animate-spin" />}
            Guardar Ubicación
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
