import "server-only";
import type { CheerioAPI } from "cheerio";

// Extrae URLs de vídeo de una ficha pública (best-effort). Cubre lo que los
// portales suelen exponer en el HTML: embeds de YouTube/Vimeo, og:video,
// archivos <video>/<source> (mp4/webm) y VideoObject de JSON-LD. Muchos
// portales cargan el vídeo por JS y NO exponen la URL: en ese caso no se saca
// nada. Se guarda el enlace tal cual (no se re-aloja).

const MAX_VIDEOS = 10;

function ytWatch(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
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

  // 4) archivos de vídeo directos <video>/<source>
  $("video[src], video source[src]").each((_, el) => {
    const src = $(el).attr("src") ?? "";
    if (/^https?:\/\/.+\.(mp4|webm|mov|m3u8)(\?|$)/i.test(src)) out.add(src);
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

  return [...out].slice(0, MAX_VIDEOS);
}
