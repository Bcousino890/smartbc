"use client";

interface GeoChartProps {
  data: Array<{
    country: string;
    countryCode: string;
    count: number;
  }>;
}

export function GeoChart({ data }: GeoChartProps) {
  if (data.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500">No hay datos disponibles</p>
      </div>
    );
  }

  const totalCount = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left p-3 font-semibold text-gray-700">País</th>
            <th className="text-right p-3 font-semibold text-gray-700">
              Sesiones
            </th>
            <th className="text-right p-3 font-semibold text-gray-700">%</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, index) => {
            const percentage = ((row.count / totalCount) * 100).toFixed(1);
            return (
              <tr
                key={row.countryCode}
                className={`border-b border-gray-100 hover:bg-gray-50 ${
                  index % 2 === 0 ? "bg-white" : "bg-gray-50"
                }`}
              >
                <td className="p-3 font-medium text-gray-900">
                  <span className="flex items-center gap-2">
                    <span className="text-lg">
                      {getCountryFlag(row.countryCode)}
                    </span>
                    {row.country}
                  </span>
                </td>
                <td className="text-right p-3 text-gray-700">
                  {row.count.toLocaleString()}
                </td>
                <td className="text-right p-3 text-gray-600">{percentage}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function getCountryFlag(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
