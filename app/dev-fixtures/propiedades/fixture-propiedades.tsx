"use client";

import { PropertiesAdminClient } from "@/app/[country]/(admin)/admin/propiedades/properties-admin-client";
import { ToastProvider } from "@/components/ui/toast";
import { FIXTURE_TAGS, fixtureAdminProperties } from "./fixture-data";

export function FixturePropiedades() {
  return (
    <ToastProvider>
      <PropertiesAdminClient
        properties={fixtureAdminProperties()}
        agencies={[]}
        currentRole="owner"
        country="es"
        initialTags={FIXTURE_TAGS}
      />
    </ToastProvider>
  );
}
