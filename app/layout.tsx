import type { Metadata } from "next";
import Script from "next/script";
import { Cinzel, Inter, Lato, Playfair_Display } from "next/font/google";
import { LanguageProvider } from "@/lib/i18n/provider";
import "./globals.css";

// Recuperación de chunks obsoletos tras un deploy. El VPS hace `npm run build`
// (buildId nuevo, hashes de chunk nuevos) + `pm2 restart` mientras sirve
// tráfico. Si un usuario tenía la página cargada de antes, su HTML pide chunks
// JS/CSS que ya no existen → el servidor responde 400 en TODOS los scripts de
// Next, React nunca hidrata y la página queda muerta ("Application error" o
// congelada) sin nada que el usuario pueda hacer. Este listener (registrado
// antes de que se pidan los chunks) detecta ese fallo y recarga la página una
// sola vez (freno de 10s vía sessionStorage para no entrar en bucle).
const STALE_CHUNK_RECOVERY_SCRIPT = `
(function () {
  try {
    var KEY = "__chunkReloadTs";
    window.addEventListener(
      "error",
      function (event) {
        var target = event && event.target;
        if (!target || (target.tagName !== "SCRIPT" && target.tagName !== "LINK")) return;
        var url = target.src || target.href || "";
        if (url.indexOf("/_next/static/") === -1) return;
        var last = Number(sessionStorage.getItem(KEY) || 0);
        var now = Date.now();
        if (now - last < 10000) return;
        sessionStorage.setItem(KEY, String(now));
        window.location.reload();
      },
      true,
    );
  } catch (e) {}
})();
`;

const cinzel = Cinzel({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-cinzel",
  display: "swap",
});

const playfair = Playfair_Display({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-playfair",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

// Sistema tipográfico EMAAR del CRM interno (ver crm_emaar_typography_rollout_handoff.md).
// Lato = fuente universal de trabajo del admin. SOLO caras reales 300/400/700:
// el sprint prohíbe 500/600 sintéticos (font-medium resuelve a 400 y
// font-semibold a 700 por el algoritmo de font-matching de CSS).
const lato = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  variable: "--font-lato",
  display: "swap",
});

// OPTIMA_LICENSE_REQUIRED ─────────────────────────────────────────────────────
// El display del CRM es Optima 400 (sistema EMAAR), pero NO existe todavía un
// woff2 de Optima con licencia en este repo y está prohibido copiar el de
// EMAAR. Mientras tanto `--crm-font-display` (app/globals.css) cae a un stack
// temporal seguro. Cuando llegue la licencia (Monotype/MyFonts, 1 cara: 400):
//   1. Colocar el fichero en  app/fonts/optima/optima-400.woff2
//   2. Descomentar el bloque de abajo y añadir `optima.variable` al className
//      del <html> más abajo.
//   3. En app/globals.css, anteponer var(--font-optima) en --crm-font-display.
// Nada más: todos los tokens crm-display/page-title/section-title heredan.
//
// import localFont from "next/font/local";
// const optima = localFont({
//   src: "./fonts/optima/optima-400.woff2",
//   weight: "400",
//   style: "normal",
//   variable: "--font-optima",
//   display: "swap", // elegido sobre "optional": en un CRM interno preferimos
//   // que la fuente aparezca siempre (swap) a evitar un swap visual raro en la
//   // primera visita; el fallback métrico de next/font contiene el CLS.
//   fallback: ["Optima", "Candara", "Segoe UI", "sans-serif"],
// });
// ─────────────────────────────────────────────────────────────────────────────

export const metadata: Metadata = {
  title: "Benjamín Cousiño Propiedades — Acceso Privado",
  description:
    "Portal exclusivo de Benjamín Cousiño Propiedades. Servicio de Personal Shopper inmobiliario en Madrid.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="es"
      className={`${cinzel.variable} ${playfair.variable} ${inter.variable} ${lato.variable}`}
    >
      <body>
        <Script id="stale-chunk-recovery" strategy="beforeInteractive">
          {STALE_CHUNK_RECOVERY_SCRIPT}
        </Script>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
