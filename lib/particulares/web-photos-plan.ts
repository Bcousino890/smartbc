// Plan PURO del reemplazo automático de fotos con marca por las limpias de la web de la agencia
// (lib/particulares/web-photos.ts hace la parte con BD y red). Sin imports de servidor.

/** Huella estable de la galería de la web (FNV-1a de 32 bits ×2 sobre las URLs en orden). */
export function photosSig(urls: string[]): string {
  let a = 0x811c9dc5;
  let b = 0x01000193;
  for (const ch of urls.join("|")) {
    const c = ch.charCodeAt(0);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b + c, 0x85ebca6b) >>> 0;
  }
  return `${urls.length}-${a.toString(16)}${b.toString(16)}`;
}

export type PhotoPlanInput = {
  property_id: string;
  slug: string;
  /** `properties.photos_source`: `web_clean` (ya limpias) · `restored` (alguien las devolvió a mano) · null. */
  photos_source: string | null;
  photos_source_sig: string | null;
  /** Agencia colaboradora de sindicación (informativo: con web Mobilia verificada también se reemplazan; el dueño lo confirmó). */
  collab: boolean | null;
  /** La web leída y VERIFICADA con originales limpias (Mobilia) y fotos; null si no hay. */
  web: { sig: string; n: number } | null;
};

export type PhotoPlanItem = {
  property_id: string;
  slug: string;
  action: "replace" | "skip";
  reason: "replace" | "ya_limpias" | "restaurada_a_mano" | "sin_web_verificada";
  sig?: string;
};

export function planWebPhotoReplacements(inputs: PhotoPlanInput[]): PhotoPlanItem[] {
  return inputs.map((i): PhotoPlanItem => {
    const base = { property_id: i.property_id, slug: i.slug };
    if (!i.web) return { ...base, action: "skip", reason: "sin_web_verificada" };
    if (i.photos_source === "restored") return { ...base, action: "skip", reason: "restaurada_a_mano" };
    if (i.photos_source === "web_clean" && i.photos_source_sig === i.web.sig) return { ...base, action: "skip", reason: "ya_limpias", sig: i.web.sig };
    return { ...base, action: "replace", reason: "replace", sig: i.web.sig };
  });
}
