import Link from "next/link";
import { ExternalLink } from "lucide-react";

/** Pestaña «Particulares»: explica el crawler y lleva a la lista; la configuración está en las otras pestañas. */
export function ParticularesCrawlerPanel() {
  const card = "rounded-2xl border border-ink/10 bg-white p-4 md:p-5";
  return (
    <div className="space-y-5">
      <section className={card}>
        <h3 className="text-base font-bold text-ink">Crawler de particulares</h3>
        <p className="mt-1 max-w-3xl text-sm text-ink/75">
          El crawler (instalado en el servidor) recorre los portales solo en las zonas marcadas, detecta anuncios de particulares, sus bajas y
          reactivaciones, y los envía a la lista de Particulares. Una zona sin marcar no se escanea y no gasta créditos de Crawio.
        </p>
        <ul className="mt-3 grid gap-2 text-sm text-ink/80 sm:grid-cols-2">
          <li className="rounded-xl bg-cream-50/60 p-3 ring-1 ring-ink/10">
            <strong>Qué se escanea:</strong> zonas, interruptores por portal y operación (venta/alquiler) en{" "}
            <Link href="?tab=portales" className="underline underline-offset-2">Portales inmobiliarios</Link>.
          </li>
          <li className="rounded-xl bg-cream-50/60 p-3 ring-1 ring-ink/10">
            <strong>Cuánto cuesta y si funciona:</strong> créditos, semáforo y estadísticas en{" "}
            <Link href="?tab=salud" className="underline underline-offset-2">Salud y actividad</Link>.
          </li>
        </ul>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="/es/admin/particulares"
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-ink px-4 text-sm font-semibold text-cream-50 hover:bg-ink/90"
          >
            <ExternalLink size={15} aria-hidden /> Ver anuncios de particulares
          </Link>
          <Link
            href="/es/admin/particulares?retired=1"
            className="inline-flex h-11 items-center rounded-xl border border-ink/15 bg-white px-4 text-sm font-medium text-ink hover:bg-ink/[0.04]"
          >
            Ver anuncios retirados
          </Link>
        </div>
      </section>
    </div>
  );
}
