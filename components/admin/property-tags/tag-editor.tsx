"use client";

import { Loader2, Plus } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useToast } from "@/components/ui/toast";
import {
  DEFAULT_TAG_COLOR,
  canCreateTag,
  findTagByName,
  normalizeTagName,
  suggestTags,
  type PropertyTag,
} from "@/lib/properties/tags";
import { assignTags, createTag } from "./tag-api";
import { TagChip } from "./tag-chip";

// Editor de etiquetas de una propiedad (ficha): chips con ×, autocompletar y
// "Crear «x»" al vuelo. Guarda al instante (no depende del botón Guardar).
export function PropertyTagEditor({
  slug,
  country,
  allTags,
  initialIds,
  onCatalogChange,
}: {
  slug: string;
  country: string;
  allTags: PropertyTag[];
  initialIds: string[];
  onCatalogChange?: (tags: PropertyTag[]) => void;
}) {
  const { toast } = useToast();
  const [catalog, setCatalog] = useState(allTags);
  const [ids, setIds] = useState(initialIds);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const assigned = useMemo(
    () => ids.map((id) => catalog.find((t) => t.id === id)).filter(Boolean) as PropertyTag[],
    [ids, catalog],
  );
  const suggestions = suggestTags(catalog, query, ids);
  const showCreate = canCreateTag(catalog, query);

  const attach = async (tag: PropertyTag) => {
    setBusy(true);
    const r = await assignTags([slug], [tag.id], []);
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    setIds((p) => (p.includes(tag.id) ? p : [...p, tag.id]));
    setQuery("");
    inputRef.current?.focus();
  };

  const detach = async (tag: PropertyTag) => {
    setBusy(true);
    const r = await assignTags([slug], [], [tag.id]);
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    setIds((p) => p.filter((x) => x !== tag.id));
  };

  const createAndAttach = async () => {
    const name = normalizeTagName(query);
    setBusy(true);
    const r = await createTag(name, DEFAULT_TAG_COLOR, country);
    if (!r.ok) {
      setBusy(false);
      return toast(r.error, "error");
    }
    const next = findTagByName(catalog, r.data.name) ? catalog : [...catalog, r.data];
    setCatalog(next);
    onCatalogChange?.(next);
    await attach(r.data);
  };

  const onEnter = () => {
    if (suggestions[0] && (!showCreate || suggestions[0].name.toLowerCase() === query.trim().toLowerCase()))
      attach(suggestions[0]);
    else if (showCreate) createAndAttach();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {assigned.length === 0 && (
          <span className="text-xs text-ink/45">Sin etiquetas todavía.</span>
        )}
        {assigned.map((t) => (
          <TagChip key={t.id} name={t.name} color={t.color} onRemove={() => detach(t)} />
        ))}
        {busy && <Loader2 size={13} className="animate-spin text-ink/40" />}
      </div>
      <div className="relative mt-2 max-w-sm">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onEnter();
            }
          }}
          maxLength={40}
          placeholder="Añadir etiqueta… (escribe para buscar o crear)"
          className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/40 focus:border-gold/55 focus:outline-none"
        />
        {open && (suggestions.length > 0 || showCreate) && (
          <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-gold/20 bg-cream-50 py-1 shadow-[0_15px_40px_-15px_rgba(40,28,10,0.4)]">
            {suggestions.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => attach(t)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-gold/10"
                >
                  <TagChip name={t.name} color={t.color} />
                </button>
              </li>
            ))}
            {showCreate && (
              <li>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={createAndAttach}
                  className="flex w-full items-center gap-2 border-t border-gold/10 px-3 py-2 text-left text-sm text-gold-dark transition hover:bg-gold/10"
                >
                  <Plus size={13} />
                  <span>Crear «{normalizeTagName(query)}»</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
