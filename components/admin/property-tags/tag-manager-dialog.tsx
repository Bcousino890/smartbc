"use client";

import { Check, Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { useState } from "react";
import { Modal } from "@/components/ui/modal";
import { useToast } from "@/components/ui/toast";
import {
  DEFAULT_TAG_COLOR,
  SUGGESTED_TAGS,
  findTagByName,
  validateTagName,
  type PropertyTag,
} from "@/lib/properties/tags";
import { createTag, deleteTag, updateTag } from "./tag-api";
import { TagChip } from "./tag-chip";
import { TagColorPicker } from "./tag-color-picker";

// Gestor de etiquetas: crear, renombrar, recolorear y borrar.
export function TagManagerDialog({
  open,
  onClose,
  tags,
  country,
  canDelete,
  onTagsChange,
  onTagDeleted,
}: {
  open: boolean;
  onClose: () => void;
  tags: PropertyTag[];
  country: string;
  canDelete: boolean;
  onTagsChange: (next: PropertyTag[]) => void;
  onTagDeleted?: (id: string) => void;
}) {
  const { toast } = useToast();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(DEFAULT_TAG_COLOR);
  const [busy, setBusy] = useState<string | null>(null);

  const sorted = tags.slice().sort((a, b) => a.name.localeCompare(b.name, "es"));
  const missingSuggested = SUGGESTED_TAGS.filter((s) => !findTagByName(tags, s.name));

  const replace = (t: PropertyTag) =>
    onTagsChange(tags.map((x) => (x.id === t.id ? t : x)));

  const add = async (name: string, color: string) => {
    const v = validateTagName(name);
    if (!v.ok) return toast(v.error, "error");
    setBusy("new");
    const r = await createTag(v.name, color, country);
    setBusy(null);
    if (!r.ok) return toast(r.error, "error");
    if (!findTagByName(tags, r.data.name)) onTagsChange([...tags, r.data]);
    setNewName("");
  };

  const addSuggested = async () => {
    setBusy("sug");
    const created: PropertyTag[] = [];
    for (const s of missingSuggested) {
      const r = await createTag(s.name, s.color, country);
      if (r.ok) created.push(r.data);
    }
    setBusy(null);
    onTagsChange([...tags, ...created]);
    toast(`${created.length} etiquetas añadidas`, "success");
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      isPending={busy !== null}
      title="Gestionar etiquetas"
      subtitle="Crea, renombra, cambia el color o borra las etiquetas de propiedades."
      size="lg"
    >
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-gold/15 bg-white/60 p-3">
          <p className="crm-label-sm mb-2 text-ink/50">Nueva etiqueta</p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  add(newName, newColor);
                }
              }}
              maxLength={40}
              placeholder="Nombre (ej. Exclusiva)"
              className="crm-input min-w-[180px] flex-1 rounded-lg border border-ink/15 bg-white px-3 py-2 text-sm focus:border-gold/55 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => add(newName, newColor)}
              disabled={busy !== null || !newName.trim()}
              className="crm-button inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
            >
              {busy === "new" ? (
                <Loader2 size={12} className="animate-spin" />
              ) : (
                <Plus size={12} className="text-gold" />
              )}
              <span>Crear</span>
            </button>
          </div>
          <div className="mt-2">
            <TagColorPicker value={newColor} onChange={setNewColor} />
          </div>
        </div>

        {missingSuggested.length > 0 && (
          <button
            type="button"
            onClick={addSuggested}
            disabled={busy !== null}
            className="crm-button inline-flex items-center justify-center gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-gold-dark transition hover:bg-gold/20 disabled:opacity-50"
          >
            <Sparkles size={12} />
            <span>
              Añadir sugeridas ({missingSuggested.map((s) => s.name).join(", ")})
            </span>
          </button>
        )}

        {sorted.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink/55">
            Aún no hay etiquetas. Crea la primera arriba.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {sorted.map((t) => (
              <TagRow
                key={t.id}
                tag={t}
                canDelete={canDelete}
                onSaved={replace}
                onDeleted={() => {
                  onTagsChange(tags.filter((x) => x.id !== t.id));
                  onTagDeleted?.(t.id);
                }}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}

function TagRow({
  tag,
  canDelete,
  onSaved,
  onDeleted,
}: {
  tag: PropertyTag;
  canDelete: boolean;
  onSaved: (t: PropertyTag) => void;
  onDeleted: () => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState(tag.name);
  const [color, setColor] = useState(tag.color);
  const [busy, setBusy] = useState(false);
  const dirty = name.trim() !== tag.name || color.toLowerCase() !== tag.color.toLowerCase();

  const save = async () => {
    const v = validateTagName(name);
    if (!v.ok) return toast(v.error, "error");
    setBusy(true);
    const r = await updateTag(tag.id, { name: v.name, color });
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    onSaved(r.data);
    setName(r.data.name);
    toast("Etiqueta actualizada", "success");
  };

  const remove = async () => {
    if (
      !window.confirm(
        `¿Borrar la etiqueta «${tag.name}»? Se quitará de todas las propiedades que la tengan.`,
      )
    )
      return;
    setBusy(true);
    const r = await deleteTag(tag.id);
    setBusy(false);
    if (!r.ok) return toast(r.error, "error");
    onDeleted();
  };

  return (
    <li className="rounded-xl border border-gold/10 bg-white/70 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <TagChip name={name.trim() || "…"} color={color} />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          aria-label={`Nombre de la etiqueta ${tag.name}`}
          className="crm-input min-w-[140px] flex-1 rounded-lg border border-ink/15 bg-white px-2.5 py-1.5 text-sm focus:border-gold/55 focus:outline-none"
        />
        {dirty && (
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="crm-button inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-1.5 text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="text-gold" />}
            <span>Guardar</span>
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={remove}
            disabled={busy}
            aria-label={`Borrar etiqueta ${tag.name}`}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-ink/15 bg-white text-ink/60 transition hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
          >
            <Trash2 size={13} strokeWidth={1.75} />
          </button>
        )}
      </div>
      <div className="mt-2">
        <TagColorPicker value={color} onChange={setColor} />
      </div>
    </li>
  );
}
