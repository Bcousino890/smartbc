import Link from "next/link";
import { BookOpen, ClipboardList, Home, Users } from "lucide-react";
import { CatalogCover } from "@/components/catalogs/catalog-cover";
import type { CatalogSummary } from "@/lib/catalogs/types";
import { NewCatalogForm } from "./new-catalog-form";

// HOME de Fabricio (BCP-01 T3). Interfaz del admin en Lato (clases crm-*); el
// estilo Boutique solo aparece en las portadas en miniatura de la estantería.

const SHORTCUTS = [
  { href: "/es/admin/clientes", label: "Clientes", icon: Users },
  { href: "/es/admin/propiedades", label: "Propiedades", icon: Home },
  { href: "/es/admin/solicitudes", label: "Solicitudes", icon: ClipboardList },
];

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function HomeView({
  catalogs,
  preparedBy,
  basePath = "/es/admin/mi-espacio",
  mode = "live",
}: {
  catalogs: CatalogSummary[];
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
          <NewCatalogForm basePath={basePath} mode={mode} />
        </div>

        {catalogs.length === 0 ? (
          <div className="mt-5 rounded-xl border border-dashed border-gold/25 bg-white/40 px-4 py-10 text-center text-sm text-ink/55">
            Crea tu primer catálogo y añade propiedades existentes por su referencia BC.
          </div>
        ) : (
          <ul className="mt-6 grid grid-cols-2 gap-x-5 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {catalogs.map((c) => (
              <li key={c.id} className={c.status === "archived" ? "opacity-60" : undefined}>
                <Link href={`${basePath}/catalogos/${c.id}`} className="group block">
                  <div
                    className="aspect-[150/212] w-full overflow-hidden rounded-sm shadow-[0_10px_24px_-14px_rgba(60,40,20,0.45)] transition group-hover:-translate-y-0.5"
                    data-check-overflow="cover"
                  >
                    <CatalogCover
                      data={{
                        title: c.title,
                        subtitle: c.intro,
                        numberLabel: c.numberLabel,
                        edition: c.edition,
                        photoUrl: c.coverPhotoUrl,
                        preparedBy,
                      }}
                    />
                  </div>
                  <p className="crm-body-strong mt-3 line-clamp-2 text-ink">{c.title}</p>
                  <p className="text-xs text-ink/55">
                    {c.status === "archived" ? "Archivado" : "Activo"} · {c.itemCount} propiedad
                    {c.itemCount === 1 ? "" : "es"}
                  </p>
                  <p className="text-xs text-ink/45">Actualizado el {formatDate(c.updatedAt)}</p>
                  <span className="mt-1 inline-block text-xs text-gold underline-offset-2 group-hover:underline">
                    Gestionar
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
