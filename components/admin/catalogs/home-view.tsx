import Link from "next/link";
import { BookOpen, ClipboardList, Home, Users } from "lucide-react";
import type { CatalogSummary } from "@/lib/catalogs/types";
import { NewCatalogForm } from "./new-catalog-form";
import { CatalogShelf } from "./catalog-shelf";

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
}: {
  catalogs: CatalogSummary[];
  /** Nombre con el que se PRECARGA el contacto de un catálogo nuevo. */
  preparedBy: string;
  basePath?: string;
  /** "demo": datos de prueba en local; no guarda nada. */
  mode?: "live" | "demo";
}) {
  const active = catalogs.filter((c) => c.status === "active").length;
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
          <div className="rounded-xl border border-dashed border-gold/30 bg-white/30 px-4 py-3 text-ink/50">
            <span className="crm-body-strong block">Próximos módulos</span>
            <span className="block text-xs">Se definirán uno a uno</span>
          </div>
        </div>
      </section>

      <section aria-labelledby="hm-catalogos">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="hm-catalogos" className="crm-section-title text-ink">
              Catálogos
            </h2>
            <p className="mt-1 text-sm text-ink/55">
              {catalogs.length === 0
                ? "Todavía no hay catálogos."
                : `${active} activo${active === 1 ? "" : "s"} · ${catalogs.length} en total`}
            </p>
          </div>
          <NewCatalogForm basePath={basePath} mode={mode} defaultContactName={preparedBy} />
        </div>

        {catalogs.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-10 text-center text-sm text-ink/55">
            Crea tu primer catálogo y añade propiedades existentes por su referencia BC.
          </div>
        ) : (
          <CatalogShelf catalogs={catalogs} basePath={basePath} />
        )}
      </section>
    </div>
  );
}
