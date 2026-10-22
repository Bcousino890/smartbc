import path from "node:path";
import type { NextConfig } from "next";

// Corrección local del motor de PDF (BCP-01 ampliación, PR5, decisión D1).
// Hoy Next deja @react-pdf/renderer FUERA del bundle del servidor (su lista
// por defecto de serverExternalPackages), así que la corrección la aplica un
// hook de carga de Node que instalan instrumentation.ts (proceso) y
// lib/pdf/catalog/render-worker.ts (hilo del PDF). Este loader es la RESERVA:
// si algún día Next compila @react-pdf dentro del bundle, la misma corrección
// se aplica al compilar, y si la versión no es la revisada el build falla.
// Next carga este archivo como CommonJS (__dirname existe); las pruebas en Node
// lo importan como ESM desde la raíz del repositorio.
const CONFIG_DIR = typeof __dirname === "string" ? __dirname : process.cwd();
const PDF_ENGINE_PATCH_LOADER = path.join(CONFIG_DIR, "lib", "pdf", "engine-patch", "webpack-loader.cjs");
const PDF_ENGINE_FILES = /[\\/]@react-pdf[\\/](?:textkit[\\/]lib[\\/]textkit|render[\\/]lib[\\/]index)\.js$/;

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // distDir configurable por env para permitir builds ATÓMICOS en el deploy: el
  // auto-deploy del VPS compila a `.next.new` (NEXT_BUILD_DIR) y solo lo
  // intercambia por `.next` si el build tuvo ÉXITO. Así un build que muere a
  // medias (p.ej. OOM en el VPS) nunca corrompe el `.next` que el proceso en
  // producción está sirviendo. `next start` (sin la env) siempre lee `.next`.
  distDir: process.env.NEXT_BUILD_DIR || ".next",
  experimental: {
    serverActions: {
      // Por defecto Next limita el body de las server actions a 1MB, lo que
      // rompía "Subir video (.mp4)" y la subida de planos/fotos grandes.
      // El límite máximo de la app para videos es 5GB.
      bodySizeLimit: "5gb",
    },
  },
  // Estos paquetes usan `require()` dinámico y APIs nativas (binarios de
  // Chromium) que Next.js no puede bundlear. Los marcamos como externos
  // del server runtime para que se carguen tal cual en Node.js.
  serverExternalPackages: [
    "playwright",
    "playwright-extra",
    "puppeteer-extra-plugin-stealth",
    "puppeteer-extra-plugin",
    "merge-deep",
    "clone-deep",
    // Correo corporativo (/admin/correo): imapflow arrastra pino y mailparser
    // iconv/encodings — mejor cargarlos tal cual que bundlearlos.
    "imapflow",
    "mailparser",
  ],
  // PDF del catálogo en un hilo (expediente 2026-10-17-bcp-01-pdf-worker): en
  // el SERVIDOR, webpack resuelve `new Worker(new URL(…))` como
  // publicPath + chunk respecto a `.next/server/chunks/`; con el publicPath de
  // Next ("/_next/", pensado para el navegador) apuntaba a `file:///_next/…` y
  // el hilo no arrancaba. "./" = el chunk del hilo junto a los demás chunks,
  // con una ruta calculada al ejecutar desde __dirname (aguanta el renombrado
  // .next.new → .next y mover la app de sitio). "" no sirve: webpack lo trata
  // como «sin valor» y vuelve al publicPath. Solo afecta a los hilos del servidor.
  webpack(config, { isServer }) {
    if (isServer) config.output = { ...config.output, workerPublicPath: "./" };
    // PR5 (D1), reserva: ver PDF_ENGINE_PATCH_LOADER arriba. `enforce: "pre"`:
    // el loader recibe el código tal cual lo publica el paquete.
    config.module.rules.push({ test: PDF_ENGINE_FILES, enforce: "pre", use: [{ loader: PDF_ENGINE_PATCH_LOADER }] });
    return config;
  },
  async redirects() {
    // "Particulares" pasa a llamarse "Captaciones" (España): las URLs antiguas
    // (marcadores, enlaces de correos) siguen funcionando.
    return [
      {
        source: "/es/admin/particulares",
        destination: "/es/admin/captaciones",
        permanent: false,
      },
      {
        source: "/es/admin/particulares/:path*",
        destination: "/es/admin/captaciones/:path*",
        permanent: false,
      },
    ];
  },
  async headers() {
    return [
      {
        // Viewing Collections: colección privada de un cliente. Además del
        // `robots` de generateMetadata, la cabecera cubre a los crawlers que
        // no ejecutan JS ni leen el <head>.
        source: "/v/:token*",
        headers: [
          {
            key: "X-Robots-Tag",
            value: "noindex, nofollow, noarchive, nosnippet",
          },
        ],
      },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
      {
        // Backend self-host en Hetzner (Supabase Storage). Las fotos
        // sincronizadas con watermark se sirven desde aquí. Dominio único
        // desde 2026-10-22: crm.bcousinoprop.com se dejó de usar (sin DNS
        // público, certificado caducado) y la 0224 reescribió sus URLs.
        protocol: "https",
        hostname: "portal.bcousinoprop.com",
        pathname: "/storage/v1/object/public/**",
      },
      {
        // Dominio antiguo: se mantiene por si queda alguna URL sin migrar.
        protocol: "https",
        hostname: "crm.bcousinoprop.com",
        pathname: "/storage/v1/object/public/**",
      },
      // Import-by-link: al crear, las fotos de la GALERÍA se guardan primero con
      // su URL de ORIGEN y se re-alojan a nuestro storage en segundo plano.
      // Durante esa ventana, la galería del admin (next/image) necesita poder
      // cargar el origen de los portales que soportamos. (La PORTADA se procesa
      // síncrona, así que el catálogo siempre apunta a nuestro storage.)
      {
        // Clikalia sirve sus fotos desde este bucket.
        protocol: "https",
        hostname: "storage.googleapis.com",
      },
      {
        // UrbantecHome.
        protocol: "https",
        hostname: "urbantechome.com",
      },
    ],
  },
};

export default nextConfig;
