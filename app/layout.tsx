import type { Metadata } from "next";
import Script from "next/script";
import { Cinzel, Inter, Playfair_Display } from "next/font/google";
import { LanguageProvider } from "@/lib/i18n/provider";
import "./globals.css";

// El deploy en el VPS hace `npm run build` (buildId nuevo) + `pm2 restart`
// mientras la app sigue sirviendo tráfico. Si un usuario tenía la página
// cargada justo antes/durante ese rebuild, el HTML referencia chunks JS con
// hashes que dejaron de existir: el navegador recibe 400 en TODOS los
// scripts de Next (webpack/main-app/layout/page), React nunca hidrata, y la
// página queda muerta (ningún botón ni filtro responde) sin ningún error
// visible para el usuario. `beforeInteractive` garantiza que este listener
// se registre antes de que se pidan esos chunks, así que puede detectar el
// fallo y recargar solo, en vez de dejar al admin con una página congelada.
const STALE_CHUNK_RECOVERY_SCRIPT = `
(function () {
  try {
    var KEY = "__chunkReloadTs";
    window.addEventListener(
      "error",
      function (event) {
        var target = event && event.target;
        if (!target || target.tagName !== "SCRIPT") return;
        var src = target.src || "";
        if (src.indexOf("/_next/static/") === -1) return;
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
      className={`${cinzel.variable} ${playfair.variable} ${inter.variable}`}
    >
      <body>
        <Script
          id="stale-chunk-recovery"
          strategy="beforeInteractive"
        >
          {STALE_CHUNK_RECOVERY_SCRIPT}
        </Script>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
