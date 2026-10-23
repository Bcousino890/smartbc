"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { createCatalogAction } from "@/app/[country]/(admin)/admin/mi-espacio/actions";
import type { ActionResult } from "@/lib/catalogs/access";
import { CONTACT_DEFAULT_PHONE, CONTACT_DEFAULT_ROLE, formatContactPhone, type ContactRole } from "@/lib/catalogs/contact-format";
import { ContactFields } from "./contact-fields";
import st from "./studio/studio.module.css";

export type CreateCatalogInput = Parameters<typeof createCatalogAction>[0];

// HOME · grupos (D10, C1): con un grupo elegido en la estantería, una casilla
// DESMARCADA ofrece ponerlo también en ese grupo. Crear y asignar son una sola
// operación (catalog_create_in_group): si la asignación falla no se crea nada
// y lo escrito se conserva. Un segundo envío mientras se crea (doble clic,
// Intro repetido) se ignora, y tras crear con éxito el formulario sigue
// bloqueado hasta salir: un envío crea como mucho un catálogo.
// Rediseño 2026-10-23: con `open`/`onOpenChange` la estantería pone el botón
// en su cabecera y el formulario debajo (la lógica de creación no cambia).

export function NewCatalogForm({
  basePath,
  mode = "live",
  defaultContactName,
  group = null,
  create,
  open: openProp,
  onOpenChange,
}: {
  basePath: string;
  mode?: "live" | "demo";
  /** Precarga del nombre visible (el del dueño). Se puede cambiar antes de crear. */
  defaultContactName: string;
  /** Grupo elegido en la estantería (para la casilla opcional). */
  group?: { id: string; label: string } | null;
  /** Solo las fixtures: crear en el almacén sintético. */
  create?: (i: CreateCatalogInput) => Promise<ActionResult<{ id: string }>>;
  /** Abierto desde fuera (la estantería pinta su propio botón). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const router = useRouter();
  const [openState, setOpenState] = useState(false);
  const controlled = openProp !== undefined;
  const open = controlled ? openProp : openState;
  const setOpen = (v: boolean) => (controlled ? onOpenChange?.(v) : setOpenState(v));
  const [title, setTitle] = useState("");
  const [intro, setIntro] = useState("");
  const [contactName, setContactName] = useState(defaultContactName);
  const [contactPhone, setContactPhone] = useState(formatContactPhone(CONTACT_DEFAULT_PHONE) ?? "");
  const [contactRole, setContactRole] = useState<ContactRole>(CONTACT_DEFAULT_ROLE);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [inGroup, setInGroup] = useState(false);
  const [done, setDone] = useState(false);
  const sending = useRef(false);
  // Otro grupo elegido: la casilla vuelve a estar desmarcada (nunca se asigna solo).
  useEffect(() => setInGroup(false), [group?.id]);

  if (!open) {
    if (controlled) return null;
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${st.btnPrimary} text-sm`}>
        Nuevo catálogo
      </button>
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending.current) return;
    setError(null);
    if (mode === "demo" && !create) {
      setError("Vista de prueba: aquí no se guarda nada.");
      return;
    }
    sending.current = true;
    const groupId = group && inGroup ? group.id : null;
    start(async () => {
      try {
        const res = await (create ?? createCatalogAction)({
          title,
          intro,
          contact: { name: contactName, phone: contactPhone, role: contactRole },
          ...(groupId ? { groupId } : {}),
        });
        if (!res.ok) {
          sending.current = false;
          setError(res.error);
          return;
        }
        setDone(true);
        router.push(`${basePath}/catalogos/${res.id}`);
      } catch {
        sending.current = false;
        setError("No sé si se ha creado: se ha perdido la conexión. Comprueba la estantería antes de volver a intentarlo.");
      }
    });
  }

  return (
    <form
      onSubmit={submit}
      className={`${st.panel} w-full max-w-xl space-y-3 p-4`}
      aria-labelledby="nc-heading"
      data-testid="new-catalog-form"
    >
      <h2 id="nc-heading" className="text-base font-medium text-ink">
        Nuevo catálogo
      </h2>
      <label className="block">
        <span className="crm-label-sm text-ink/70">Título</span>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          required
          className={`${st.input} mt-1 w-full text-sm`}
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
          className={`${st.input} mt-1 w-full text-sm`}
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
      {group ? (
        <label className="flex items-start gap-2 text-sm text-ink/80" data-testid="new-catalog-group">
          <input type="checkbox" checked={inGroup} onChange={(e) => setInGroup(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#856329]" />
          <span>
            Ponerlo también en «{group.label}»
            <span className="block text-xs text-ink/55">Opcional. Solo ordena tu HOME: no cambia qué propiedades entran.</span>
          </span>
        </label>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending || done}
          className={`${st.btnPrimary} text-sm`}
          data-testid="new-catalog-submit"
        >
          {pending || done ? "Creando…" : "Crear catálogo"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={`${st.btnQuiet} text-sm`}
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
