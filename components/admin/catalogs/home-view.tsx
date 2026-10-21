import Link from "next/link";
import { BookOpen, ClipboardList, Home, Users } from "lucide-react";
import type { ActionResult } from "@/lib/catalogs/access";
import { EMPTY_GROUPS, type GroupsState } from "@/lib/catalogs/groups";
import type { CatalogSummary } from "@/lib/catalogs/types";
import { HomeCatalogs } from "./home-catalogs";
import type { GroupActions } from "./groups/types";
import type { CreateCatalogInput } from "./new-catalog-form";

// HOME de Fabricio (BCP-01 T3). Interfaz del admin en Lato (clases crm-*); el
// estilo Boutique solo aparece en las portadas en miniatura de la estantería.

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
    <div className="mt-8 space-y-10">
      <section aria-labelledby="hm-accesos">
        <h2 id="hm-accesos" className="crm-label-sm text-ink/55">
          Accesos
        </h2>
        <nav className="mt-3 grid gap-3 sm:grid-cols-3">
          {SHORTCUTS.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-3 rounded-xl border border-gold/20 bg-white/55 px-4 py-3 transition hover:border-gold/45 hover:bg-white/80"
            >
              <Icon className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
              <span className="min-w-0">
                <span className="crm-body-strong block text-ink">{label}</span>
                <span className="block text-xs text-ink/55">Abre la pantalla actual</span>
              </span>
            </Link>
          ))}
        </nav>
      </section>

      <section aria-labelledby="hm-modulos">
        <h2 id="hm-modulos" className="crm-label-sm text-ink/55">
          Módulos
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex items-center gap-3 rounded-xl border border-gold/45 bg-white/70 px-4 py-3">
            <BookOpen className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
            <span>
              <span className="crm-body-strong block text-ink">Catálogos</span>
              <span className="block text-xs text-ink/55">Selecciones editoriales para compartir</span>
            </span>
          </div>
          <Link
            href={`${basePath}/textos-aprobados`}
            className="flex items-center gap-3 rounded-xl border border-gold/25 bg-white/55 px-4 py-3 transition hover:border-gold/45 hover:bg-white/80"
            data-testid="home-copy-library"
          >
            <BookOpen className="h-5 w-5 shrink-0 text-gold" aria-hidden="true" />
            <span>
              <span className="crm-body-strong block text-ink">Textos aprobados</span>
              <span className="block text-xs text-ink/55">Títulos y descripciones que se reutilizan en catálogos nuevos</span>
            </span>
          </Link>
          <div className="rounded-xl border border-dashed border-gold/30 bg-white/30 px-4 py-3 text-ink/50">
            <span className="crm-body-strong block">Próximos módulos</span>
            <span className="block text-xs">Se definirán uno a uno</span>
          </div>
        </div>
      </section>

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
    </div>
  );
}
