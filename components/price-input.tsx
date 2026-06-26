"use client";

import { useEffect, useState } from "react";

export type PriceValue = {
  clp?: number;
  uf?: number;
  currency: "CLP" | "UF";
};

interface PriceInputProps {
  value: PriceValue;
  onChange: (value: PriceValue) => void;
  disabled?: boolean;
  minValue?: number;
  maxValue?: number;
  label?: string;
}

// Tasa de cambio CLP a UF (aproximada, debería ser actualizada dinámicamente)
// Para MVP usaremos una tasa fija; en producción, obtenerla de una API
const DEFAULT_CLP_TO_UF_RATE = 34500;

export function PriceInput({
  value,
  onChange,
  disabled = false,
  minValue,
  maxValue,
  label = "Precio",
}: PriceInputProps) {
  const [exchangeRate, setExchangeRate] = useState(DEFAULT_CLP_TO_UF_RATE);
  const [loading, setLoading] = useState(false);

  // Cargar tasa de cambio actual (simulado para MVP)
  useEffect(() => {
    const loadExchangeRate = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/exchange-rate?from=CLP&to=UF");
        if (res.ok) {
          const data = await res.json();
          setExchangeRate(data.rate || DEFAULT_CLP_TO_UF_RATE);
        }
      } catch (err) {
        // Usar tasa por defecto si hay error
        console.warn("Failed to load exchange rate, using default");
      } finally {
        setLoading(false);
      }
    };

    loadExchangeRate();
  }, []);

  const handleClpChange = (clpValue: string) => {
    const clp = clpValue ? parseInt(clpValue, 10) : undefined;
    if (clp === undefined) {
      onChange({ currency: "CLP" });
      return;
    }

    const uf = clp / exchangeRate;
    onChange({
      clp,
      uf: Math.round(uf * 100) / 100, // Redondear a 2 decimales
      currency: "CLP",
    });
  };

  const handleUfChange = (ufValue: string) => {
    const uf = ufValue ? parseFloat(ufValue) : undefined;
    if (uf === undefined) {
      onChange({ currency: "UF" });
      return;
    }

    const clp = Math.round(uf * exchangeRate);
    onChange({
      uf,
      clp,
      currency: "UF",
    });
  };

  const toggleCurrency = () => {
    onChange({
      ...value,
      currency: value.currency === "CLP" ? "UF" : "CLP",
    });
  };

  return (
    <div className="space-y-3">
      {label && (
        <label className="block text-sm font-medium text-gray-700">
          {label}
        </label>
      )}

      <div className="flex gap-2">
        {value.currency === "CLP" ? (
          <div className="flex-1">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                $
              </span>
              <input
                type="number"
                value={value.clp || ""}
                onChange={(e) => handleClpChange(e.target.value)}
                placeholder="0"
                disabled={disabled}
                min={minValue}
                max={maxValue}
                className="w-full rounded-lg border border-gray-300 bg-white pl-8 pr-4 py-2.5 text-gray-900 placeholder-gray-400 transition-colors hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
          </div>
        ) : (
          <div className="flex-1">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                UF
              </span>
              <input
                type="number"
                value={value.uf || ""}
                onChange={(e) => handleUfChange(e.target.value)}
                placeholder="0.00"
                disabled={disabled}
                step="0.01"
                className="w-full rounded-lg border border-gray-300 bg-white pl-8 pr-4 py-2.5 text-gray-900 placeholder-gray-400 transition-colors hover:border-gray-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
          </div>
        )}

        <button
          onClick={toggleCurrency}
          disabled={disabled || loading}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2.5 font-medium text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20 disabled:bg-gray-50 disabled:text-gray-500"
          title="Cambiar moneda"
        >
          {value.currency}
        </button>
      </div>

      {/* Mostrar conversión */}
      {(value.clp || value.uf) && (
        <div className="rounded-lg bg-blue-50 p-3 text-sm text-gray-600">
          {value.currency === "CLP" ? (
            <>
              {value.clp?.toLocaleString("es-CL")} CLP = {value.uf?.toLocaleString("es-CL")} UF
            </>
          ) : (
            <>
              {value.uf?.toLocaleString("es-CL")} UF = ${value.clp?.toLocaleString("es-CL")} CLP
            </>
          )}
          {loading && <span className="ml-2 text-xs text-gray-400">(actualizando...)</span>}
        </div>
      )}

      {exchangeRate && exchangeRate !== DEFAULT_CLP_TO_UF_RATE && (
        <p className="text-xs text-gray-500">
          Tasa de cambio: 1 UF = ${exchangeRate.toLocaleString("es-CL")} CLP
        </p>
      )}
    </div>
  );
}
