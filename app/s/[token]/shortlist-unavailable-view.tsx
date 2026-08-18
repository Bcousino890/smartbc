import Image from "next/image";

/**
 * Vista terminal de una selección no accesible.
 *
 * ⚠️ NO recibe props, igual que la del Private Book: sin datos de entrada es
 * estructuralmente incapaz de distinguir caducada, revocada o inexistente.
 *
 * Bilingüe por el mismo motivo que allí: en este punto no se conoce el idioma
 * del cliente, y averiguarlo exigiría leer la selección.
 */
export function ShortlistUnavailableView() {
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

        <h1
          lang="en"
          className="mt-10 font-serif text-[27px] font-normal vc-tight text-cream-50 md:text-[36px]"
        >
          This private selection
          <br />
          is no longer available
        </h1>
        <p
          lang="es"
          className="mt-4 font-serif text-[19px] font-normal vc-tight text-cream-50/60 md:text-[24px]"
        >
          Esta selección privada
          <br />
          ya no está disponible
        </p>

        <span aria-hidden className="mt-9 block h-px w-10 bg-cream-50/20" />

        <p
          lang="en"
          className="mt-8 max-w-[40ch] font-sans text-[13.5px] leading-relaxed text-cream-50/55 md:text-[14.5px]"
        >
          Write to us and we will send you an updated link.
        </p>
        <p
          lang="es"
          className="mt-2 max-w-[40ch] font-sans text-[13px] leading-relaxed text-cream-50/40"
        >
          Escríbenos y te enviaremos un enlace actualizado.
        </p>

        <div className="mt-11 flex flex-col items-stretch gap-2.5 sm:flex-row sm:gap-3">
          <a
            href="mailto:contacto@bcousinoprop.com"
            className="vc-focus border border-cream-50/30 px-7 py-3.5 text-center font-display text-[10.5px] font-medium uppercase vc-tracked text-cream-50 transition-colors duration-500 hover:border-cream-50"
          >
            contacto@bcousinoprop.com
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
