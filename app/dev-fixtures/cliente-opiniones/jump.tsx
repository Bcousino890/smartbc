"use client";

import { CatalogFeedbackCard } from "@/components/admin/clientes/catalog-feedback-block";
import type { ClientCatalogFeedback } from "@/lib/catalogs/feedback-rules";

// SOLO DESARROLLO LOCAL: la tarjeta de Resumen salta al bloque.
export function FixtureCardJump({ data }: { data: ClientCatalogFeedback }) {
  return <CatalogFeedbackCard data={data} locale="es-ES" onGo={() => document.getElementById("catalog-feedback")?.scrollIntoView({ block: "start" })} />;
}
