// Esqueletos de carga del admin (CRM-02, E2 · D2 de CRM-01). Se enseñan al
// momento mientras el servidor prepara la página de destino: reconocen el clic
// sin aparentar que los datos ya llegaron. No llevan datos ni nada que dependa
// del usuario: el acceso lo siguen decidiendo el middleware, el layout y cada
// página. Colores solo con los tokens del CRM (cream/ink/gold), así funcionan
// igual en claro y en oscuro.
import { cn } from "@/lib/utils";

const block = "rounded bg-ink/10";

function Shell({ wide = true, children }: { wide?: boolean; children: React.ReactNode }) {
  return (
    <div
      data-crm-skeleton
      aria-busy="true"
      className={cn(
        "mx-auto flex min-h-screen w-full flex-col px-6 pb-10 lg:px-10",
        wide ? "max-w-[1400px]" : "max-w-[1100px]",
      )}
    >
      <span className="sr-only" role="status">
        Cargando…
      </span>
      <div className="animate-pulse">{children}</div>
    </div>
  );
}

function Header() {
  return (
    <>
      <div className={cn(block, "mt-8 h-8 w-64 rounded-lg")} />
      <div className="mt-3 h-4 w-96 max-w-full rounded bg-ink/5" />
    </>
  );
}

function Rows({ n = 6, tall = false }: { n?: number; tall?: boolean }) {
  return (
    <div className="mt-6 flex flex-col gap-3">
      {Array.from({ length: n }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "flex items-center gap-4 rounded-2xl border border-gold/10 bg-cream-50/60 p-3",
            tall ? "h-[120px]" : "h-16",
          )}
        >
          {tall && <div className="h-[88px] w-[118px] shrink-0 rounded-xl bg-ink/10" />}
          <div className="flex-1 space-y-2">
            <div className={cn(block, "h-4 w-1/2")} />
            <div className="h-3 w-1/3 rounded bg-ink/5" />
          </div>
          <div className={cn(block, "hidden h-8 w-20 sm:block")} />
        </div>
      ))}
    </div>
  );
}

/** Genérico: cualquier sección del admin sin esqueleto propio. */
export function AdminPageSkeleton() {
  return (
    <Shell>
      <Header />
      <Rows />
    </Shell>
  );
}

/** Lista de Propiedades: cifras, barra de filtros y filas con portada. */
export function PropertiesListSkeleton() {
  return (
    <Shell>
      <Header />
      <div className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-gold/15 bg-cream-50/60" />
        ))}
      </div>
      <div className="mt-6 rounded-2xl border border-gold/10 bg-cream-50/40 p-4">
        <div className="h-11 rounded-xl bg-ink/5" />
        <div className="mt-3 flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 w-28 rounded-lg bg-ink/5" />
          ))}
        </div>
        <Rows n={5} tall />
      </div>
    </Shell>
  );
}

/** Ficha de una propiedad. */
export function PropertyDetailSkeleton() {
  return (
    <Shell wide={false}>
      <div className="mt-7 h-4 w-32 rounded bg-ink/5" />
      <div className={cn(block, "mt-6 h-8 w-2/3 rounded-lg")} />
      <div className="mt-3 h-4 w-1/2 rounded bg-ink/5" />
      <div className="mt-6 grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="aspect-[4/3] rounded-xl bg-ink/10" />
        ))}
      </div>
      <div className="mt-6 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl border border-gold/10 bg-cream-50/60" />
        ))}
      </div>
    </Shell>
  );
}

/** Listas tabulares (Clientes, Solicitudes…). */
export function TableListSkeleton() {
  return (
    <Shell>
      <Header />
      <div className="mt-6 flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-9 w-32 rounded-lg bg-ink/5" />
        ))}
      </div>
      <Rows n={8} />
    </Shell>
  );
}
