"use client";

import Script from "next/script";
import { useEffect, useState } from "react";

// Widget "Website Translator" de Google — gratuito y sin API key (a
// diferencia de la Cloud Translation API, que es de pago). Traduce el DOM
// en el navegador; nosotros solo escribimos la cookie `googtrans` que el
// propio widget lee para decidir el idioma, y recargamos la página.

declare global {
  interface Window {
    google?: {
      translate?: {
        TranslateElement: new (
          options: { pageLanguage: string; includedLanguages: string; autoDisplay: boolean },
          elementId: string,
        ) => unknown;
      };
    };
    googleTranslateElementInit?: () => void;
  }
}

export function GoogleTranslate() {
  return (
    <>
      <div id="google_translate_element" style={{ display: "none" }} />
      {/* Oculta la barra/iframe que Google inyecta arriba de la página y el
          propio selector nativo — el idioma se controla con los botones
          ES/EN del header, no con la UI por defecto del widget. */}
      <style>{`
        .goog-te-banner-frame.skiptranslate,
        #goog-gt-tt,
        .goog-te-balloon-frame { display: none !important; }
        body { top: 0 !important; }
        .goog-text-highlight { background: none !important; box-shadow: none !important; }
      `}</style>
      <Script
        id="google-translate-init"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            function googleTranslateElementInit() {
              new google.translate.TranslateElement(
                { pageLanguage: "es", includedLanguages: "es,en", autoDisplay: false },
                "google_translate_element"
              );
            }
          `,
        }}
      />
      <Script
        src="https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit"
        strategy="afterInteractive"
      />
    </>
  );
}

function readLangFromCookie(): "es" | "en" {
  const match = document.cookie.match(/googtrans=\/es\/(\w+)/);
  return match?.[1] === "en" ? "en" : "es";
}

export function setSiteLanguage(lang: "es" | "en") {
  const clear = (domain?: string) => {
    const domainPart = domain ? `; domain=${domain}` : "";
    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/${domainPart}`;
  };
  clear();
  clear(location.hostname);

  if (lang === "en") {
    document.cookie = `googtrans=/es/en; path=/`;
    document.cookie = `googtrans=/es/en; path=/; domain=${location.hostname}`;
  }
  location.reload();
}

export function useSiteLanguage() {
  const [lang, setLang] = useState<"es" | "en">("es");
  useEffect(() => {
    setLang(readLangFromCookie());
  }, []);
  return lang;
}
