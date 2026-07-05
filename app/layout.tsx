import type { Metadata } from "next";
import Script from "next/script";
import { Cinzel, Inter, Playfair_Display } from "next/font/google";
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
        <Script id="stale-chunk-recovery" strategy="beforeInteractive">
          {STALE_CHUNK_RECOVERY_SCRIPT}
        </Script>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  );
}
