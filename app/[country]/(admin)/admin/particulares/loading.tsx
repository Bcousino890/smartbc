/**
 * Estado de carga de /admin/particulares.
 *
 * La página es `force-dynamic`: sin esto el navegador se quedaba en la
 * pantalla anterior sin ningún indicio mientras el servidor resolvía, y
 * pulsar "Particulares" en el menú parecía no hacer nada. Ya no trae los
 * ~10.7k anuncios enteros (ver lib/db/queries/particulares.ts), pero sigue
 * habiendo varias idas a la base — la página, las stats y los conteos de
 * zona — así que el hueco sigue mereciendo un esqueleto.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col px-6 pb-10 lg:px-10">
      <div className="mt-8 h-8 w-64 animate-pulse rounded-lg bg-ink/10" />
      <div className="mt-3 h-4 w-96 animate-pulse rounded bg-ink/5" />

      <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-xl border border-gold/15 bg-white/40"
          />
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="overflow-hidden rounded-xl border border-ink/10 bg-white"
          >
            <div className="aspect-[16/10] w-full animate-pulse bg-ink/10" />
            <div className="flex flex-col gap-2 p-4">
              <div className="h-4 w-2/3 animate-pulse rounded bg-ink/10" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-ink/5" />
            </div>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-sm text-ink/50">
        Cargando anuncios de particulares…
      </p>
    </div>
  );
}
