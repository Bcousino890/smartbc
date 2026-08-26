"use client";

import { Globe } from "lucide-react";
import Script from "next/script";
import { useEffect, useState } from "react";

// Selector de idioma del enlace temporal de un particular. El destinatario
// puede ser de cualquier nacionalidad (no solo ES/EN, a diferencia del
// selector de app/web/_components/GoogleTranslate.tsx), así que aquí es un
// desplegable con una lista más larga en vez de dos botones fijos. Mismo
// mecanismo por debajo: el widget "Website Translator" de Google (gratis,
// sin API key) traduce el DOM en el navegador leyendo la cookie `googtrans`
// — nosotros solo escribimos la cookie y recargamos.
//
// Deliberadamente independiente del widget de /web: son rutas públicas sin
// relación (ver app/a/[token]/page.tsx), cada una con su propia instancia
// del script de Google.

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

const LANGUAGES: Array<{ code: string; label: string }> = [
  { code: "es", label: "Español" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "it", label: "Italiano" },
  { code: "pt", label: "Português" },
  { code: "ru", label: "Русский" },
  { code: "zh-CN", label: "中文" },
  { code: "ar", label: "العربية" },
];

function readLangFromCookie(): string {
  const match = document.cookie.match(/googtrans=\/es\/([\w-]+)/);
  return LANGUAGES.some((l) => l.code === match?.[1]) ? (match![1] as string) : "es";
}

function setPageLanguage(code: string) {
  const clear = (domain?: string) => {
    const domainPart = domain ? `; domain=${domain}` : "";
    document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/${domainPart}`;
  };
  clear();
  clear(location.hostname);

  if (code !== "es") {
    document.cookie = `googtrans=/es/${code}; path=/`;
    document.cookie = `googtrans=/es/${code}; path=/; domain=${location.hostname}`;
  }
  location.reload();
}

export function LanguageSelect() {
  const [lang, setLang] = useState("es");
  useEffect(() => {
    setLang(readLangFromCookie());
  }, []);

  return (
    <>
      <div id="google_translate_element" style={{ display: "none" }} />
      {/* Oculta la barra/iframe que Google inyecta arriba de la página y su
          propio selector nativo — el idioma se elige con el desplegable de
          abajo, no con la UI por defecto del widget. */}
      <style>{`
        .goog-te-banner-frame.skiptranslate,
        #goog-gt-tt,
        .goog-te-balloon-frame { display: none !important; }
        body { top: 0 !important; }
        .goog-text-highlight { background: none !important; box-shadow: none !important; }
      `}</style>
      <Script
        id="google-translate-init-particular-share"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            function googleTranslateElementInit() {
              new google.translate.TranslateElement(
                { pageLanguage: "es", includedLanguages: "${LANGUAGES.map((l) => l.code).join(",")}", autoDisplay: false },
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

      <div className="notranslate inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white/80 px-2.5 py-2">
        <Globe size={13} strokeWidth={1.75} className="text-gold" />
        <select
          value={lang}
          onChange={(e) => setPageLanguage(e.target.value)}
          className="cursor-pointer appearance-none bg-transparent crm-button text-ink/70 outline-none"
          aria-label="Idioma"
        >
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.label}
            </option>
          ))}
        </select>
      </div>
    </>
  );
}
