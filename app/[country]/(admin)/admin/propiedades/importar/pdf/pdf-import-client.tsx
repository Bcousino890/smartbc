"use client";

import { useSearchParams } from "next/navigation";
import { PdfImport } from "@/components/admin/imports/pdf-import";
import { getCountryConfig, type Country } from "@/lib/country-config";

export function PdfImportClient({ country }: { country: Country }) {
  const sp = useSearchParams();
  const prefix = getCountryConfig(country).prefix;
  return <PdfImport country={country} catalogId={sp.get("catalogo")} reviewHref={(id) => `${prefix}/propiedades/importar?borrador=${encodeURIComponent(id)}`} />;
}
