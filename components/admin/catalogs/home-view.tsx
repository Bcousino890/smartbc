import Link from "next/link";
import { ClipboardList, Home, Users } from "lucide-react";
import type { ActionResult } from "@/lib/catalogs/access";
import { EMPTY_GROUPS, type GroupsState } from "@/lib/catalogs/groups";
import type { CatalogSummary } from "@/lib/catalogs/types";
import { HomeCatalogs } from "./home-catalogs";
import type { GroupActions } from "./groups/types";
import type { CreateCatalogInput } from "./new-catalog-form";
import st from "./studio/studio.module.css";

// HOME de Fabricio (BCP-01 T3). Rediseño «Lista editorial» (expediente
// 2026-10-23-bcp-01-gestor-rediseno, D3): la estantería va primero; la
// biblioteca (Textos aprobados, Plantillas de zona) vive en la cabecera de la
// estantería y los accesos a otras pantallas del CRM, compactos, debajo.

const SHORTCUTS = [
  { href: "/es/admin/clientes", label: "Clientes", icon: Users },
  { href: "/es/admin/propiedades", label: "Propiedades", icon: Home },
  { href: "/es/admin/solicitudes", label: "Solicitudes", icon: ClipboardList },
];

export function HomeView({
  catalogs,
  preparedBy,
  basePath = "/es/admin/mi-espacio",
  mode = "live",
  groups = { ...EMPTY_GROUPS, available: false },
  groupActions = null,
  createCatalog,
  initialGroupParam = null,
  ownerKey = "",
  country = "es",
}: {
  catalogs: CatalogSummary[];
  /** Nombre con el que se PRECARGA el contacto de un catálogo nuevo. */
  preparedBy: string;
  basePath?: string;
  /** "demo": datos de prueba en local; no guarda nada. */
  mode?: "live" | "demo";
  /** HOME · grupos: estado inicial, acciones y ?grupo de la URL. Sin ellos, la
   *  estantería de siempre. */
  groups?: GroupsState;
  groupActions?: GroupActions | null;
  createCatalog?: (i: CreateCatalogInput) => Promise<ActionResult<{ id: string }>>;
  initialGroupParam?: string | null;
  /** Dueño y país: la clave de lo recordado en este navegador (C3). */
  ownerKey?: string;
  country?: string;
}) {
  return (
    <div className="mt-6 space-y-10">
      <HomeCatalogs
        catalogs={catalogs}
        basePath={basePath}
        mode={mode}
        preparedBy={preparedBy}
        initialGroups={groups}
        groupActions={groupActions}
        createCatalog={createCatalog}
        initialGroupParam={initialGroupParam}
        ownerKey={ownerKey}
        country={country}
      />

      <nav aria-label="Accesos" className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-[color:var(--st-line)] pt-4 text-sm" data-testid="home-shortcuts">
        <span className="w-full text-ink/60 sm:w-auto">Accesos</span>
        {SHORTCUTS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={`${st.link} inline-flex items-center gap-1.5`}>
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
