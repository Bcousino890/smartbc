/**
 * Qué carpeta del buzón es Enviados / Papelera / SPAM / Archivo… (puro, sin
 * imapflow: lo usan imap.ts y `npm run test:mailbox`).
 *
 * Una carpeta puede ser "especial" porque el servidor lo declara
 * (SPECIAL-USE), porque imapflow lo deduce de su nombre, o por nuestros
 * patrones. A veces dos carpetas compiten por el mismo uso — en cPanel es
 * habitual tener `Junk` (la del servidor) y `spam` (la que crea Exim/
 * SpamAssassin): sin desempate el panel enseñaba dos "SPAM" idénticas. Gana
 * una por uso (la declarada por el servidor antes que la deducida) y la otra
 * queda con su nombre real, para no esconder correo.
 */

export type FolderLike = {
  path: string;
  name: string;
  specialUse?: string | undefined;
  specialUseSource?: "user" | "extension" | "name" | undefined;
  flags?: Set<string> | undefined;
};

const NAME_HINTS: Array<[RegExp, string]> = [
  [/^(sent|sent items|sent messages|enviados?|elementos enviados)$/i, "\\Sent"],
  [/^(trash|deleted|deleted items|deleted messages|papelera|eliminados)$/i, "\\Trash"],
  [/^(drafts?|borradores?)$/i, "\\Drafts"],
  [/^(junk|spam|correo no deseado)$/i, "\\Junk"],
  [/^(archive|archivo|archivados)$/i, "\\Archive"],
];

/** Mayor = más fiable. */
function claim(box: FolderLike): { use: string; strength: number } | null {
  if (box.path.toUpperCase() === "INBOX") return { use: "\\Inbox", strength: 100 };
  if (box.specialUse) {
    const strength = box.specialUseSource === "extension" ? 3 : box.specialUseSource === "user" ? 3 : 2;
    return { use: box.specialUse, strength };
  }
  for (const [re, use] of NAME_HINTS) if (re.test(box.name)) return { use, strength: 1 };
  return null;
}

/** path → uso especial, con UNA sola carpeta por uso. */
export function resolveSpecialUses(boxes: FolderLike[]): Map<string, string> {
  const winners = new Map<string, { path: string; strength: number }>();
  for (const box of boxes) {
    if (box.flags?.has("\\Noselect") || box.flags?.has("\\NonExistent")) continue;
    const c = claim(box);
    if (!c) continue;
    const cur = winners.get(c.use);
    // Más fiable gana; a igualdad, la de ruta más corta (la raíz, no una subcarpeta).
    if (!cur || c.strength > cur.strength || (c.strength === cur.strength && box.path.length < cur.path.length)) {
      winners.set(c.use, { path: box.path, strength: c.strength });
    }
  }
  return new Map([...winners].map(([use, w]) => [w.path, use]));
}
