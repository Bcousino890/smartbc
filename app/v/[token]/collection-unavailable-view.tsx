import Image from "next/image";
import { Lock } from "lucide-react";

/**
 * Vista terminal de una colección no accesible.
 *
 * ⚠️ NO recibe props a propósito. Sin datos de entrada es estructuralmente
 * incapaz de filtrar nada, y las cinco situaciones terminales —caducada,
 * revocada, token inexistente, itinerario cancelado/archivado y módulo
 * desactivado— quedan idénticas byte a byte. No debe distinguirse cuál es.
 */
export function CollectionUnavailableView() {
  return (
    <div className="flex min-h-screen flex-col bg-cream-50">
      <header className="border-b border-gold/15 bg-cream-50/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center px-5 py-4 md:px-8">
          <Image
            src="/logo.png"
            alt="Benjamín Cousiño Propiedades"
            width={140}
            height={Math.round(140 * (519 / 3282))}
            priority
            className="h-auto w-[130px] select-none md:w-[140px]"
          />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full border border-gold/25 bg-gold/10 text-gold-dark">
          <Lock size={26} strokeWidth={1.5} />
        </span>

        <h1 className="mt-7 font-serif text-2xl font-semibold text-ink md:text-3xl">
          Esta colección ya no está disponible
        </h1>

        <p className="mt-4 text-[15px] leading-relaxed text-ink/65">
          Si necesitas acceder de nuevo, ponte en contacto con nosotros y te
          enviaremos un enlace actualizado.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 text-sm">
          <a
            href="mailto:contacto@bcousinoprop.com"
            className="font-medium text-ink transition hover:text-gold-dark"
          >
            contacto@bcousinoprop.com
          </a>
          <a
            href="tel:+34694209763"
            className="font-medium text-ink transition hover:text-gold-dark"
          >
            +34 694 20 97 63
          </a>
        </div>
      </main>

      <footer className="border-t border-gold/15 px-6 py-6 text-center">
        <p className="text-[11px] uppercase tracking-[0.16em] text-ink/45">
          Benjamín Cousiño Propiedades
        </p>
      </footer>
    </div>
  );
}
