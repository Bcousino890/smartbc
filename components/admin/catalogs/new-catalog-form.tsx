"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createCatalogAction } from "@/app/[country]/(admin)/admin/mi-espacio/actions";
import { CONTACT_DEFAULT_PHONE, CONTACT_DEFAULT_ROLE, formatContactPhone, type ContactRole } from "@/lib/catalogs/contact-format";
import { ContactFields } from "./contact-fields";

export function NewCatalogForm({
  basePath,
  mode = "live",
  defaultContactName,
}: {
  basePath: string;
  mode?: "live" | "demo";
  /** Precarga del nombre visible (el del dueño). Se puede cambiar antes de crear. */
  defaultContactName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [contactName, setContactName] = useState(defaultContactName);
  const [contactPhone, setContactPhone] = useState(formatContactPhone(CONTACT_DEFAULT_PHONE) ?? "");
  const [contactRole, setContactRole] = useState<ContactRole>(CONTACT_DEFAULT_ROLE);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg border border-gold/60 bg-gold/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gold"
      >
        Nuevo catálogo
      </button>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === "demo") {
      setError("Vista de prueba: aquí no se guarda nada.");
      return;
    }
    start(async () => {
      const res = await createCatalogAction({
        title,
        intro,
        contact: { name: contactName, phone: contactPhone, role: contactRole },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`${basePath}/catalogos/${res.id}`);
    });
  }

  return (
    <form
      onSubmit={submit}
      className="w-full max-w-xl space-y-3 rounded-xl border border-gold/20 bg-white/70 p-4"
    >
      <label className="block">
        <span className="crm-label-sm text-ink/70">Título</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          required
          className="mt-1 w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
          placeholder="Por ejemplo: Salamanca y Chamberí"
        />
      </label>
      <label className="block">
        <span className="crm-label-sm text-ink/70">Introducción (opcional)</span>
        <textarea
          value={intro}
          onChange={(e) => setIntro(e.target.value)}
          maxLength={2000}
          rows={3}
          className="mt-1 w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold"
        />
      </label>
      <ContactFields
        idPrefix="nc"
        name={contactName}
        phone={contactPhone}
        role={contactRole}
        onName={setContactName}
        onPhone={setContactPhone}
        onRole={setContactRole}
      />
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-gold/90 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gold disabled:opacity-60"
        >
          {pending ? "Creando…" : "Crear catálogo"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-gold/30 px-4 py-2 text-sm text-ink/70"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
