"use client";

import { useMemo } from "react";
import { HomeView } from "@/components/admin/catalogs/home-view";
import type { GroupsState } from "@/lib/catalogs/groups";
import type { CatalogSummary } from "@/lib/catalogs/types";
import { fixtureCreateCatalog, fixtureGroupActions } from "./fixture-group-actions";

// SOLO DESARROLLO LOCAL (HOME · grupos): la HOME de fixtures con grupos y
// creación de catálogos contra el almacén sintético.
export function FixtureHome({ catalogs, groups, grupo }: { catalogs: CatalogSummary[]; groups: GroupsState; grupo: string | null }) {
  const actions = useMemo(() => fixtureGroupActions(), []);
  return (
    <HomeView
      catalogs={catalogs}
      preparedBy="Fabricio Andree"
      basePath="/dev-fixtures/mi-espacio"
      mode="demo"
      groups={groups}
      groupActions={actions}
      createCatalog={fixtureCreateCatalog}
      initialGroupParam={grupo}
      ownerKey="fixture-owner"
      country="es"
    />
  );
}
