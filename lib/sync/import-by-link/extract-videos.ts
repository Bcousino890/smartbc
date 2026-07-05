import "server-only";
import type { CheerioAPI } from "cheerio";

// Extrae URLs de vídeo de una ficha pública (best-effort). Cubre lo que los
// portales suelen exponer en el HTML: embeds de YouTube/Vimeo, og:video,
// archivos <video>/<source> (mp4/webm) y VideoObject de JSON-LD. Muchos
// portales cargan el vídeo por JS y NO exponen la URL: en ese caso no se saca
// nada. Se guarda el enlace tal cual (no se re-aloja).

const MAX_VIDEOS = 10;
const DIRECT_RE = /^https?:\/\/.+\.(mp4|webm|mov|m3u8)(\?|$)/i;

function ytWatch(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

// Identidad de un vídeo para deduplicar. YouTube/Vimeo ya vienen en URL canónica
// (el id va en la URL), así que se comparan tal cual. Los archivos directos
// (mp4 de Idealista, etc.) llevan token/calidad en la QUERY que cambia en cada
// fetch y por <source>; usamos origen+path para que el mismo vídeo no duplique.
export function videoIdentity(url: string): string {
  const u = (url ?? "").toLowerCase();
  if (/youtube|youtu\.be|vimeo/.test(u)) return u;
  try {
    // Solo la RUTA (sin host: Idealista usa shards st1v/st3v…; ni query: token).
    // Además quitamos el prefijo de CALIDAD del nombre (hd_/sd_/720p_…) para que
    // las variantes del MISMO vídeo (hd_1353826753.mp4 y 1353826753.mp4) cuenten
    // como uno solo.
    const p = new URL(url);
    return p.pathname
      .toLowerCase()
      .replace(/\/+$/, "")
      .replace(/\/(?:hd|sd|hq|lq|uhd|fhd|\d{3,4}p)[_-]([^/]+)$/i, "/$1");
  } catch {
    return u;
  }
}

// Deduplica una lista de URLs de vídeo por identidad (conserva la primera).
export function dedupeVideos(urls: string[]): string[] {
  const byIdent = new Map<string, string>();
  for (const url of urls) {
    if (typeof url !== "string" || !/^https?:\/\//i.test(url)) continue;
    const id = videoIdentity(url);
    if (!byIdent.has(id)) byIdent.set(id, url);
  }
  return [...byIdent.values()].slice(0, MAX_VIDEOS);
}

export function extractVideos($: CheerioAPI): string[] {
  const out = new Set<string>();

  const addYouTube = (raw: string) => {
    const m = raw.match(
      /(?:youtube(?:-nocookie)?\.com\/(?:embed\/|watch\?v=)|youtu\.be\/)([\w-]{6,})/i,
    );
    if (m) out.add(ytWatch(m[1]));
    return !!m;
  };
  const addVimeo = (raw: string) => {
    const m = raw.match(/(?:player\.)?vimeo\.com\/(?:video\/)?(\d{6,})/i);
    if (m) out.add(`https://vimeo.com/${m[1]}`);
    return !!m;
  };

  // 1) iframes incrustados (YouTube / Vimeo)
  $("iframe[src]").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    addYouTube(src) || addVimeo(src);
  });

  // 2) enlaces directos a YouTube/Vimeo
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    addYouTube(href) || addVimeo(href);
  });

  // 3) og:video (y variantes secure_url / url)
  $('meta[property^="og:video"], meta[name^="og:video"]').each((_, el) => {
    const c = $(el).attr("content") ?? "";
    if (/^https?:\/\//i.test(c)) {
      if (!addYouTube(c) && !addVimeo(c)) out.add(c);
    }
  });

  // 4) archivos de vídeo directos: UNA URL por elemento <video>. Idealista y
  //    otros ponen varias <source> del mismo vídeo (calidades/formatos); coger
  //    todas las creaba duplicadas.
  $("video").each((_, el) => {
    const own = $(el).attr("src") ?? "";
    if (DIRECT_RE.test(own)) {
      out.add(own);
      return;
    }
    const source = $(el)
      .find("source[src]")
      .map((__, s) => $(s).attr("src") ?? "")
      .get()
      .find((u) => DIRECT_RE.test(u));
    if (source) out.add(source);
  });

  // 5) JSON-LD VideoObject (contentUrl / embedUrl)
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const parsed = JSON.parse($(el).contents().text());
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const n of nodes) {
        const candidates = [n?.video, n?.["@type"] === "VideoObject" ? n : null]
          .flatMap((v) => (Array.isArray(v) ? v : v ? [v] : []));
        for (const vid of candidates) {
          const u = vid?.contentUrl || vid?.embedUrl || vid?.url;
          if (typeof u === "string" && /^https?:\/\//i.test(u)) {
            if (!addYouTube(u) && !addVimeo(u)) out.add(u);
          }
        }
      }
    } catch {
      // JSON-LD malformado: se ignora
    }
  });

  return dedupeVideos([...out]);
}
