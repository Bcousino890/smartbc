"use client";

interface TopPropertiesTableProps {
  properties: Array<{
    propertyId: string;
    totalSessions: number;
    lastViewedAt: string;
  }>;
}

export function TopPropertiesTable({ properties }: TopPropertiesTableProps) {
  if (properties.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No hay datos disponibles</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left p-3 font-semibold text-gray-700">
              Propiedad
            </th>
            <th className="text-right p-3 font-semibold text-gray-700">
              Sesiones
            </th>
            <th className="text-right p-3 font-semibold text-gray-700">
              Última vista
            </th>
          </tr>
        </thead>
        <tbody>
          {properties.map((property, index) => (
            <tr
              key={property.propertyId}
              className={`border-b border-gray-100 hover:bg-gray-50 ${
                index % 2 === 0 ? "bg-white" : "bg-gray-50"
              }`}
            >
              <td className="p-3 font-medium text-gray-900">
                {property.propertyId}
              </td>
              <td className="text-right p-3 text-gray-700">
                {property.totalSessions}
              </td>
              <td className="text-right p-3 text-gray-600">
                {new Date(property.lastViewedAt).toLocaleDateString("es-ES", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
