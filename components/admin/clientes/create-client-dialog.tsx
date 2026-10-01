"use client";

// ============================================================================
// NUEVO CLIENTE (España) — los datos de contacto + EL ENCARGO.
//
// El encargo es el mismo formulario que "El encargo del cliente" de la ficha
// (components/admin/clientes/encargo/encargo-form.tsx) y se guarda con la
// misma función. Antes este diálogo preguntaba otras cosas: un "Sector" que
// no se guardaba, la estancia también en venta, estudiantes en una compra…
//
// Si falta lo esencial para el match (zona, presupuesto, dormitorios) se
// avisa y hay que confirmar: se puede crear igualmente —a veces el cliente
// aún no lo sabe—, pero no sin darse cuenta.
// ============================================================================

import { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { createClientWithBrief } from "@/app/(admin)/admin/clientes/actions";
import { EncargoForm } from "@/components/admin/clientes/encargo/encargo-form";
import { Button, Labeled, Modal, TextInput } from "@/components/admin/ui/primitives";
import { briefGaps, EMPTY_BRIEF, type BriefInput, type BriefProfile } from "@/lib/clients/brief";
import { getCountryConfig, isCountry } from "@/lib/country-config";

type Contact = { firstName: string; lastName: string; email: string; phone: string };
const EMPTY_CONTACT: Contact = { firstName: "", lastName: "", email: "", phone: "" };

export function CreateClientDialog() {
  const router = useRouter();
  const params = useParams<{ country?: string }>();
  const country = isCountry(params?.country) ? params.country : "es";

  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState<Contact>(EMPTY_CONTACT);
  const [brief, setBrief] = useState<BriefInput>({ ...EMPTY_BRIEF });
  const [profile, setProfile] = useState<BriefProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmGaps, setConfirmGaps] = useState(false);
  const [pending, startTransition] = useTransition();

  const reset = () => {
    setContact(EMPTY_CONTACT);
    setBrief({ ...EMPTY_BRIEF });
    setProfile(null);
    setError(null);
    setConfirmGaps(false);
  };

  const close = () => {
    if (pending) return;
    setOpen(false);
    reset();
  };

  const essentialGaps = briefGaps(brief).filter((g) => g.level === "essential");

  const submit = () => {
    setError(null);
    if (!contact.firstName.trim()) return setError("El nombre es obligatorio.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact.email.trim())) {
      return setError("Falta un email válido: es con el que el cliente entra a su portal.");
    }
    if (!profile) return setError("Elige el perfil del cliente.");
    if (essentialGaps.length && !confirmGaps) {
      setConfirmGaps(true);
      return setError(
        `Falta lo esencial para sugerirle propiedades: ${essentialGaps.map((g) => g.label.toLowerCase()).join(", ")}. Pulsa otra vez para crearlo igualmente.`,
      );
    }

    startTransition(async () => {
      const result = await createClientWithBrief({
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone || undefined,
        country,
        profile,
        brief,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      reset();
      // Directo a su ficha: ahí está el encargo recién guardado y las
      // primeras propiedades sugeridas.
      router.push(`${getCountryConfig(country).prefix}/clientes/${result.clientId}`);
    });
  };

  const setC = (k: keyof Contact, v: string) => setContact((c) => ({ ...c, [k]: v }));

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90"
      >
        <Plus size={16} />
        Nuevo cliente
      </button>

      <Modal
        open={open}
        onClose={close}
        wide
        title="Nuevo cliente"
        footer={
          <>
            {error && <p className="me-auto text-xs text-rose-600">{error}</p>}
            <Button onClick={close} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={submit} disabled={pending}>
              {pending ? "Creando…" : confirmGaps && essentialGaps.length ? "Crear igualmente" : "Crear cliente"}
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="crm-label-sm text-ink/55">Contacto</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Labeled label="Nombre *">
                <TextInput value={contact.firstName} onChange={(e) => setC("firstName", e.target.value)} placeholder="Juan" />
              </Labeled>
              <Labeled label="Apellidos">
                <TextInput value={contact.lastName} onChange={(e) => setC("lastName", e.target.value)} placeholder="García" />
              </Labeled>
              <Labeled label="Email *">
                <TextInput
                  type="email"
                  value={contact.email}
                  onChange={(e) => setC("email", e.target.value)}
                  placeholder="juan@ejemplo.com"
                />
              </Labeled>
              <Labeled label="Teléfono">
                <TextInput type="tel" value={contact.phone} onChange={(e) => setC("phone", e.target.value)} placeholder="+34 600 000 000" />
              </Labeled>
            </div>
            <p className="text-xs text-ink/45">
              Recibirá un correo para fijar su contraseña y entrar a su portal.
            </p>
          </section>

          <div className="border-t border-ink/8 pt-5">
            <h3 className="crm-section-title mb-4 text-ink">El encargo</h3>
            <EncargoForm
              value={brief}
              onChange={(b) => {
                setBrief(b);
                setConfirmGaps(false);
              }}
              profile={profile}
              onProfileChange={setProfile}
              country={country}
              disabled={pending}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}
