import Image from "next/image";

/**
 * Vista terminal de una colección no accesible.
 *
 * ⚠️ NO recibe props a propósito. Sin datos de entrada es estructuralmente
 * incapaz de filtrar nada, y las cinco situaciones terminales —caducada,
 * revocada, token inexistente, itinerario cancelado/archivado y módulo
 * desactivado— quedan idénticas byte a byte. No debe distinguirse cuál es.
 *
 * En tinta, como la portada y el colofón: aunque no haya colección que
 * mostrar, la marca se comporta igual.
 */
export function CollectionUnavailableView() {
  return (
    <div className="flex min-h-[100svh] flex-col bg-ink text-cream-50">
      <header className="flex justify-center px-6 pt-12 md:pt-16">
        <div className="flex flex-col items-center">
          <Image
            src="/logo.png"
            alt="Benjamín Cousiño Propiedades"
            width={150}
            height={Math.round(150 * (519 / 3282))}
            priority
            className="h-auto w-[128px] select-none brightness-0 invert md:w-[150px]"
          />
          <span className="mt-3 font-display text-[9.5px] font-medium uppercase vc-tracked text-cream-50/55 md:text-[10.5px]">
            Private Client Services
          </span>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-20 text-center">
        <span aria-hidden className="block h-px w-10 bg-cream-50/30" />

        <h1 className="mt-10 font-serif text-[27px] font-normal vc-tight text-cream-50 md:text-[36px]">
          Esta colección
          <br />
          ya no está disponible
        </h1>

        <p className="mt-7 max-w-[38ch] font-sans text-[13.5px] leading-relaxed text-cream-50/55 md:text-[14.5px]">
          Si deseas consultarla de nuevo, escríbenos y te enviaremos un enlace
          actualizado.
        </p>

        <div className="mt-11 flex flex-col items-stretch gap-2.5 sm:flex-row sm:gap-3">
          <a
            href="mailto:contacto@bcousinoprop.com"
            className="vc-focus border border-cream-50/30 px-7 py-3.5 text-center font-display text-[10.5px] font-medium uppercase vc-tracked text-cream-50 transition-colors duration-500 hover:border-cream-50"
          >
            Escribir
          </a>
          <a
            href="tel:+34694209763"
            className="vc-focus border border-cream-50/30 px-7 py-3.5 text-center font-display text-[10.5px] font-medium uppercase vc-tracked text-cream-50 transition-colors duration-500 hover:border-cream-50"
          >
            +34 694 20 97 63
          </a>
        </div>
      </main>

      <footer className="px-6 pb-12 text-center md:pb-16">
        <p className="font-display text-[9px] font-medium uppercase vc-tracked text-cream-50/25">
          Benjamín Cousiño Propiedades
        </p>
      </footer>
    </div>
  );
}
