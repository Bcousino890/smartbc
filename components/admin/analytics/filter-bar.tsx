"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface FilterBarProps {
  period: string;
  propertyId?: string;
}

export function FilterBar({ period: initialPeriod, propertyId: initialPropertyId }: FilterBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [period, setPeriod] = useState(initialPeriod || "últimos30d");
  const [propertyId, setPropertyId] = useState(initialPropertyId || "");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const handleApplyFilters = () => {
    const params = new URLSearchParams();

    if (period) {
      params.set("period", period);
    }

    if (propertyId) {
      params.set("propertyId", propertyId);
    }

    if (period === "personalizado") {
      if (startDate) params.set("startDate", startDate);
      if (endDate) params.set("endDate", endDate);
    }

    router.push(`/admin/analytics?${params.toString()}`);
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 space-y-4 shadow-sm">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Período
          </label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="últimos30d">Últimos 30 días</option>
            <option value="esteAño">Este año</option>
            <option value="personalizado">Personalizado</option>
          </select>
        </div>

        {period === "personalizado" && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Desde
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hasta
              </label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </>
        )}

        {period !== "personalizado" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Propiedad (opcional)
            </label>
            <input
              type="text"
              placeholder="ID o título"
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        )}
      </div>

      <div className="flex justify-end pt-2">
        <button
          onClick={handleApplyFilters}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          Aplicar filtros
        </button>
      </div>
    </div>
  );
}
