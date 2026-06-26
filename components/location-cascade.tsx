"use client";

import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

export type LocationCascadeValue = {
  regionCode?: string;
  communeCode?: string;
  sectorCode?: string;
};

type Region = {
  regionCode: string;
  regionName: string;
};

type Commune = {
  communeCode: string;
  communeName: string;
};

type Sector = {
  sectorCode: string;
  sectorName: string;
};

interface LocationCascadeProps {
  countryCode: string;
  value: LocationCascadeValue;
  onChange: (value: LocationCascadeValue) => void;
  includeAllLevels?: boolean;
  disabled?: boolean;
}

export function LocationCascade({
  countryCode,
  value,
  onChange,
  includeAllLevels = false,
  disabled = false,
}: LocationCascadeProps) {
  const [regions, setRegions] = useState<Region[]>([]);
  const [communes, setCommunes] = useState<Commune[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Cargar regiones cuando el país cambia
  useEffect(() => {
    const loadRegions = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/locations/regions?country=${countryCode}`
        );
        if (!res.ok) throw new Error("Failed to load regions");
        const data = await res.json();
        setRegions(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading regions");
      } finally {
        setLoading(false);
      }
    };

    if (countryCode) {
      loadRegions();
    }
  }, [countryCode]);

  // Cargar comunas cuando la región cambia
  useEffect(() => {
    const loadCommunes = async () => {
      if (!value.regionCode) {
        setCommunes([]);
        setSectors([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/locations/communes?country=${countryCode}&region=${value.regionCode}`
        );
        if (!res.ok) throw new Error("Failed to load communes");
        const data = await res.json();
        setCommunes(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading communes");
      } finally {
        setLoading(false);
      }
    };

    loadCommunes();
  }, [value.regionCode, countryCode]);

  // Cargar sectores cuando la comuna cambia
  useEffect(() => {
    const loadSectors = async () => {
      if (!value.communeCode || !value.regionCode) {
        setSectors([]);
        return;
      }

      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/locations/sectors?country=${countryCode}&region=${value.regionCode}&commune=${value.communeCode}`
        );
        if (!res.ok) throw new Error("Failed to load sectors");
        const data = await res.json();
        setSectors(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error loading sectors");
      } finally {
        setLoading(false);
      }
    };

    loadSectors();
  }, [value.communeCode, value.regionCode, countryCode]);

  const handleRegionChange = (regionCode: string) => {
    onChange({
      regionCode: regionCode || undefined,
      communeCode: undefined,
      sectorCode: undefined,
    });
  };

  const handleCommuneChange = (communeCode: string) => {
    onChange({
      ...value,
      communeCode: communeCode || undefined,
      sectorCode: undefined,
    });
  };

  const handleSectorChange = (sectorCode: string) => {
    onChange({
      ...value,
      sectorCode: sectorCode || undefined,
    });
  };

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Región */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          Región
        </label>
        <div className="relative">
          <select
            value={value.regionCode || ""}
            onChange={(e) => handleRegionChange(e.target.value)}
            disabled={disabled || loading || regions.length === 0}
            className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-10 text-gray-900 transition-colors hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 disabled:bg-gray-50 disabled:text-gray-500"
          >
            <option value="">Selecciona una región</option>
            {regions.map((region) => (
              <option key={region.regionCode} value={region.regionCode}>
                {region.regionName}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        </div>
      </div>

      {/* Comuna */}
      {value.regionCode && (
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Comuna
          </label>
          <div className="relative">
            <select
              value={value.communeCode || ""}
              onChange={(e) => handleCommuneChange(e.target.value)}
              disabled={disabled || loading || communes.length === 0}
              className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-10 text-gray-900 transition-colors hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="">Selecciona una comuna</option>
              {communes.map((commune) => (
                <option key={commune.communeCode} value={commune.communeCode}>
                  {commune.communeName}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
      )}

      {/* Sector */}
      {value.communeCode && value.regionCode && (
        <div>
          <label className="mb-2 block text-sm font-medium text-gray-700">
            Sector
          </label>
          <div className="relative">
            <select
              value={value.sectorCode || ""}
              onChange={(e) => handleSectorChange(e.target.value)}
              disabled={disabled || loading || sectors.length === 0}
              className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-2.5 pr-10 text-gray-900 transition-colors hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="">Selecciona un sector</option>
              {sectors.map((sector) => (
                <option key={sector.sectorCode} value={sector.sectorCode}>
                  {sector.sectorName}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          </div>
        </div>
      )}
    </div>
  );
}
