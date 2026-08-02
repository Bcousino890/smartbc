"use client";

import {
  ArrowLeft, Phone, MapPin, Check, Image, Clock,
  MessageSquare, Navigation, ExternalLink, Loader2, MessageCircle, Trash2, Edit, Copy,
  Plug, User,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Captacion, CaptacionContact, CaptacionExtraPhone, CaptacionStage } from "../actions";
import { LocationSection } from "./location-section";
import { ListingsSection } from "./listings-section";
import { normalizePhone, isValidPhoneChile, formatPhoneDisplay } from "@/lib/phone-utils";
import { pipelineColor } from "@/lib/captaciones/pipeline-colors";
import { getCaptacionEditableFields } from "@/lib/permissions";
import { isCaptacionAdminRole } from "@/lib/captaciones/access";

// Descripciones cortas por tipo de etapa (las etapas "normal" son libres, así
// que no tienen una descripción fija: el nombre que le puso el admin ya es
// autoexplicativo).
const STAGE_TYPE_HINT: Record<string, string> = {
  draft: "Esperando asignación",
  assign: "Asignada, a la espera de contacto",
  confirmed: "Dueño confirmó que quiere vender",
  rejected: "Rechazada",
  converted: "Ya es una propiedad",
};

type Photo = { id: string; url: string; position: number };
type Log = {
  id: string;
  created_at: string;
  attempt_type: "call" | "visit" | "message" | "whatsapp";
  result: string;
  notes: string | null;
  owner_phone: string | null;
  owner_name: string | null;
  profiles?: { full_name: string | null };
};

type ListingOperation = {
  operation: string | null;
  price: number | null;
  currency: string | null;
};

type DetailClientProps = {
  captacion: Captacion;
  /** Rol EFECTIVO en Chile (rol por país si lo tiene; si no, el global). */
  userRole: string;
  /**
   * ¿Puede trabajar esta captación? (registrar intentos, editar contactos y
   * datos del dueño). Ya viene resuelto del servidor con la misma regla que
   * aplican las rutas de API — ver `lib/captaciones/access.ts`.
   */
  canWork: boolean;
  /** Permiso efectivo `captaciones.delete` (borrar contactos). */
  canDelete: boolean;
  currentUserId: string;
  photos: Photo[];
  logs: Log[];
  captadoras: Array<{ id: string; full_name: string | null }>;
  listingOperations: ListingOperation[];
  stages: CaptacionStage[];
};

const ATTEMPT_TYPE_LABELS: Record<string, string> = {
  call: "Llamada",
  visit: "Visita",
  message: "Mensaje",
  whatsapp: "WhatsApp",
};
const RESULT_LABELS: Record<string, string> = {
  answered: "Respondió",
  no_answer: "No respondió",
  interested: "Interesado",
  not_interested: "No interesado",
  call_back: "Llamar después",
  wrong_number: "Número incorrecto",
  busy: "Ocupado",
  owner_found: "Dueño ubicado",
  visit_scheduled: "Visita agendada",
  no_owner_data: "Sin datos del dueño",
  left_note: "Se dejó nota/carta",
  nobody_home: "No había nadie",
};

function formatPrice(price: number | null, currency: string): string | null {
  if (!price) return null;
  if (currency === "uf") return `UF ${price.toLocaleString("es-CL")}`;
  return `$${(price / 1_000_000).toFixed(1)}M`;
}

// Botón para copiar un valor (nombre, RUT, teléfono, email…) al portapapeles.
function CopyButton({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const done = () => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        };
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(value).then(done).catch(() => {});
        }
      }}
      title={label ? `Copiar ${label}` : "Copiar"}
      className="inline-flex shrink-0 items-center rounded p-0.5 text-ink/40 transition hover:text-ink hover:bg-ink/5"
    >
      {copied ? (
        <Check size={12} className="text-emerald-600" />
      ) : (
        <Copy size={12} />
      )}
    </button>
  );
}

export function CaptacionDetailClient({
  captacion,
  userRole,
  canWork,
  canDelete,
  currentUserId,
  photos,
  logs,
  captadoras,
  listingOperations,
  stages,
}: DetailClientProps) {
  const isCaptadora = userRole === "captadora";
  const isAdmin = isCaptacionAdminRole(userRole);
  const isCreator = currentUserId === captacion.created_by;
  // Roles con permiso para cambiar la etapa de una captación (agent_admin,
  // agent_senior, owner…) — no solo el creador. Habilita confirmar y convertir
  // a quienes ven captaciones confirmadas de otros.
  const canManageStatus =
    isAdmin || getCaptacionEditableFields(userRole).canEditStatus;
  // Asignar/reasignar la captación a otra persona del equipo (misma condición
  // que exige POST /captaciones/[id]/assign).
  const canAssign = isAdmin || getCaptacionEditableFields(userRole).canAssignCaptadora;

  // Etapa actual dentro del pipeline configurable (reemplaza al status fijo)
  const currentStage = stages.find((s) => s.id === captacion.stage_id) || captacion.stage || null;
  const stageColor = currentStage ? pipelineColor(currentStage.color_key) : null;
  // Destinos válidos para "Cambiar Etapa": cualquier otra etapa del mismo
  // pipeline (la captación se mueve libremente, incluso desde Rechazada),
  // salvo "converted" (solo vía conversión) y "assign" (solo vía el flujo
  // de asignación, arriba en esta misma página).
  const allowedNextStages = currentStage
    ? stages.filter((s) => s.id !== currentStage.id && s.stage_type !== "converted" && s.stage_type !== "assign")
    : [];

  // La misma propiedad puede estar en venta Y arriendo (dos avisos). Se toma
  // el mejor precio por operación de los avisos de corredoras para mostrar
  // ambas operaciones en la ficha.
  const pricesByOperation = new Map<string, { price: number; currency: string | null }>();
  for (const l of listingOperations || []) {
    if (!l.operation || l.price == null) continue;
    if (!pricesByOperation.has(l.operation)) {
      pricesByOperation.set(l.operation, { price: Number(l.price), currency: l.currency });
    }
  }
  const mainOperation = captacion.operation || "venta";
  const otherOperations = Array.from(pricesByOperation.entries()).filter(
    ([op]) => op !== mainOperation
  );
  const hasFicha = Boolean(captacion.description || (captacion.features && captacion.features.length > 0));
  const [tab, setTab] = useState<"ficha" | "info" | "location" | "photos" | "logs" | "listings">(
    hasFicha ? "ficha" : "info"
  );
  const [updatingData, setUpdatingData] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [converting, setConverting] = useState(false);
  const [loggingAttempt, setLoggingAttempt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rescrapingAttempt, setRescrapeingAttempt] = useState(false);
  const [assigningCaptadora, setAssigningCaptadora] = useState(false);
  const [showReassignForm, setShowReassignForm] = useState(false);
  const [selectedCaptadoraId, setSelectedCaptadoraId] = useState(captacion.assigned_to || "");
  const [newStageId, setNewStageId] = useState("");
  const [revisionNotes, setRevisionNotes] = useState("");
  const [formData, setFormData] = useState({
    owner_phone: captacion.owner_phone || "",
    owner_name: captacion.owner_name || "",
    owner_contact: captacion.owner_contact || "",
    address_real: captacion.address_real || "",
    owner_confirmed: captacion.owner_confirmed || false,
    notes: captacion.notes || "",
  });
  const [logForm, setLogForm] = useState({
    attempt_type: "call" as "call" | "visit" | "message" | "whatsapp",
    result: "answered" as string,
    notes: "",
    phone: "",
    name: "",
    next_action_at: "",
    next_action_note: "",
  });
  const [error, setError] = useState("");
  const [currentPhoto, setCurrentPhoto] = useState(0);
  const [contacts, setContacts] = useState<CaptacionContact[]>(captacion.contacts || []);
  const [showAddContact, setShowAddContact] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState({
    contact_type: "owner" as "owner" | "spouse" | "family" | "other",
    contact_name: "",
    rut: "",
    phone: "",
    email: "",
    has_whatsapp: false,
    relationship: "",
    extra_phones: [] as CaptacionExtraPhone[],
  });
  const [phoneValidationError, setPhoneValidationError] = useState("");
  const [contactSaveError, setContactSaveError] = useState("");
  const [checkingWhatsApp, setCheckingWhatsApp] = useState(false);

  async function handleUpdate() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${captacion.id}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al actualizar");
        return;
      }
      setUpdatingData(false);
      window.location.reload();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign() {
    if (!selectedCaptadoraId) {
      setError("Selecciona una captadora");
      return;
    }
    setError("");
    setAssigningCaptadora(true);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${captacion.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ captadora_id: selectedCaptadoraId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al asignar");
        return;
      }
      setShowReassignForm(false);
      window.location.reload();
    } catch {
      setError("Error de conexión");
    } finally {
      setAssigningCaptadora(false);
    }
  }

  async function handleStatusChange() {
    if (!newStageId) return;
    const targetStage = stages.find((s) => s.id === newStageId);

    if (targetStage?.requires_notes && !revisionNotes.trim()) {
      setError(`Escribe una nota para mover a "${targetStage.label}"`);
      return;
    }

    setError("");
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${captacion.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_stage_id: newStageId,
          notes: targetStage?.requires_notes ? revisionNotes : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al cambiar de etapa");
        return;
      }
      window.location.reload();
    } catch {
      setError("Error de conexión");
    } finally {
      setUpdatingStatus(false);
    }
  }

  async function handleConvert() {
    setError("");
    setConverting(true);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${captacion.id}/convert`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || "Error al convertir a propiedad");
        return;
      }
      // La propiedad se crea como borrador: llevamos al agente directo a la
      // ficha para completarla y publicarla.
      window.location.href = `/cl/admin/propiedades/${data.slug}`;
    } catch {
      setError("Error de conexión");
    } finally {
      setConverting(false);
    }
  }

  async function handleLogAttempt() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${captacion.id}/log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attempt_type: logForm.attempt_type,
          result: logForm.result,
          notes: logForm.notes,
          owner_phone: logForm.phone || undefined,
          owner_name: logForm.name || undefined,
          // Próximo paso agendado del seguimiento (opcional)
          next_action_at: logForm.next_action_at
            ? new Date(logForm.next_action_at).toISOString()
            : undefined,
          next_action_note: logForm.next_action_note || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al registrar intento");
        return;
      }
      setLogForm({ attempt_type: "call", result: "answered", notes: "", phone: "", name: "", next_action_at: "", next_action_note: "" });
      setLoggingAttempt(false);
      window.location.reload();
    } catch {
      setError("Error de conexión");
    } finally {
      setSaving(false);
    }
  }

  async function handleRescrape() {
    setError("");
    setRescrapeingAttempt(true);
    try {
      const res = await fetch("/api/admin/cl/captaciones/scrape", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: captacion.source_url, captacion_id: captacion.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al scrapear");
        return;
      }
      setTimeout(() => window.location.reload(), 1000);
    } catch {
      setError("Error de conexión");
    } finally {
      setRescrapeingAttempt(false);
    }
  }

  function handlePhoneChange(value: string) {
    setPhoneValidationError("");
    setContactForm({ ...contactForm, phone: value });
    if (value.trim()) {
      const normalized = normalizePhone(value);
      if (!isValidPhoneChile(normalized)) {
        setPhoneValidationError("Teléfono chileno inválido (debe ser 9 dígitos después del prefijo)");
      }
    }
  }

  async function handleCheckWhatsApp() {
    if (!contactForm.phone || !isValidPhoneChile(normalizePhone(contactForm.phone))) {
      setPhoneValidationError("Teléfono inválido");
      return;
    }
    setCheckingWhatsApp(true);
    try {
      const normalized = normalizePhone(contactForm.phone);
      const res = await fetch(`/api/admin/cl/captaciones/${captacion.id}/check-whatsapp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: normalized }),
      });
      if (!res.ok) {
        setPhoneValidationError("Error al verificar WhatsApp");
        return;
      }
      const data = await res.json();
      setContactForm({ ...contactForm, has_whatsapp: data.has_whatsapp || false });
    } catch (e) {
      console.error("check-whatsapp error:", e);
    } finally {
      setCheckingWhatsApp(false);
    }
  }

  async function handleSaveContact() {
    setPhoneValidationError("");
    setContactSaveError("");
    setSavingContact(true);
    try {
      let phone = contactForm.phone;
      if (phone) {
        const normalized = normalizePhone(phone);
        if (!isValidPhoneChile(normalized)) {
          setPhoneValidationError("Teléfono chileno inválido");
          setSavingContact(false);
          return;
        }
        phone = normalized;
      }

      // Validar teléfonos adicionales (los vacíos se descartan)
      const extraPhones: CaptacionExtraPhone[] = [];
      for (const extra of contactForm.extra_phones) {
        if (!extra.phone.trim()) continue;
        const normalized = normalizePhone(extra.phone);
        if (!isValidPhoneChile(normalized)) {
          setPhoneValidationError(`Teléfono adicional inválido: ${extra.phone}`);
          setSavingContact(false);
          return;
        }
        extraPhones.push({
          phone: normalized,
          has_whatsapp: extra.has_whatsapp,
          label: extra.label?.trim() || null,
        });
      }

      const method = editingContactId ? "PUT" : "POST";
      const url = editingContactId
        ? `/api/admin/cl/captaciones/${captacion.id}/contacts/${editingContactId}`
        : `/api/admin/cl/captaciones/${captacion.id}/contacts`;

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contact_type: contactForm.contact_type,
          contact_name: contactForm.contact_name || null,
          rut: contactForm.rut || null,
          phone: phone || null,
          email: contactForm.email || null,
          has_whatsapp: contactForm.has_whatsapp,
          relationship: contactForm.relationship || null,
          extra_phones: extraPhones,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setContactSaveError(data.error || `Error ${res.status}: no se pudo guardar el contacto`);
        return;
      }
      const newContact = await res.json();
      if (editingContactId) {
        setContacts(contacts.map(c => c.id === editingContactId ? newContact : c));
      } else {
        setContacts([...contacts, newContact]);
      }
      setShowAddContact(false);
      setEditingContactId(null);
      setContactForm({
        contact_type: "owner",
        contact_name: "",
        rut: "",
        phone: "",
        email: "",
        has_whatsapp: false,
        relationship: "",
        extra_phones: [],
      });
    } catch (e) {
      console.error("save-contact error:", e);
      setContactSaveError("Error de conexión al guardar el contacto");
    } finally {
      setSavingContact(false);
    }
  }

  function handleEditContact(contact: CaptacionContact) {
    setEditingContactId(contact.id);
    setContactForm({
      contact_type: contact.contact_type,
      contact_name: contact.contact_name || "",
      rut: contact.rut || "",
      phone: contact.phone || "",
      email: contact.email || "",
      has_whatsapp: contact.has_whatsapp || false,
      relationship: contact.relationship || "",
      extra_phones: contact.extra_phones || [],
    });
    setShowAddContact(true);
  }

  async function handleDeleteContact(contactId: string) {
    if (!confirm("¿Eliminar este contacto?")) return;
    setDeletingContactId(contactId);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${captacion.id}/contacts/${contactId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Error al eliminar contacto");
        return;
      }
      setContacts(contacts.filter(c => c.id !== contactId));
    } catch (e) {
      console.error("delete-contact error:", e);
      setError("Error de conexión");
    } finally {
      setDeletingContactId(null);
    }
  }

  function resetContactForm() {
    setShowAddContact(false);
    setEditingContactId(null);
    setContactForm({
      contact_type: "owner",
      contact_name: "",
      rut: "",
      phone: "",
      email: "",
      has_whatsapp: false,
      relationship: "",
      extra_phones: [],
    });
    setPhoneValidationError("");
    setContactSaveError("");
  }

  function updateExtraPhone(index: number, patch: Partial<CaptacionExtraPhone>) {
    setPhoneValidationError("");
    setContactForm({
      ...contactForm,
      extra_phones: contactForm.extra_phones.map((p, i) =>
        i === index ? { ...p, ...patch } : p
      ),
    });
  }

  const allPhotos = photos.length > 0 ? photos : (captacion.cover_photo_url ? [{ id: "0", url: captacion.cover_photo_url, position: 0 }] : []);

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-8 sm:px-6">
      <Link
        href="/cl/admin/captaciones"
        className="flex items-center gap-2 text-sm font-medium text-gold hover:text-gold-dark mb-6"
      >
        <ArrowLeft size={16} />
        Volver a captaciones
      </Link>

      {/* Encabezado con foto */}
      <div className="rounded-2xl border border-gold/15 bg-white/70 overflow-hidden mb-6">
        {allPhotos.length > 0 && (
          <div className="relative h-56 bg-ink/5">
            <img
              src={allPhotos[currentPhoto]?.url}
              alt={captacion.title || ""}
              className="h-full w-full object-cover"
              onError={(e) => (e.currentTarget.style.display = "none")}
            />
            {allPhotos.length > 1 && (
              <div className="absolute bottom-3 right-3 flex gap-1">
                {allPhotos.slice(0, 8).map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => setCurrentPhoto(i)}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === currentPhoto ? "w-4 bg-white" : "w-1.5 bg-white/50"
                    )}
                  />
                ))}
              </div>
            )}
            {allPhotos.length > 1 && (
              <button
                onClick={() => setCurrentPhoto((prev) => (prev + 1) % allPhotos.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60"
              >
                →
              </button>
            )}
            <div className="absolute top-3 right-3 flex items-center gap-2">
              {!isCaptadora && (
                <button
                  onClick={handleRescrape}
                  disabled={rescrapingAttempt}
                  className="flex items-center gap-1 rounded-full bg-blue-600/80 px-2.5 py-1 text-[11px] text-white transition hover:bg-blue-700 disabled:opacity-50"
                  title="Obtener datos nuevamente del link"
                >
                  {rescrapingAttempt ? (
                    <>
                      <Loader2 size={10} className="animate-spin" />
                      Scrapeando...
                    </>
                  ) : (
                    <>
                      <Navigation size={11} />
                      Re-scrapear
                    </>
                  )}
                </button>
              )}
              <a
                href={captacion.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 rounded-full bg-black/50 px-2.5 py-1 text-[11px] text-white hover:bg-black/70"
              >
                <ExternalLink size={11} />
                Ver original
              </a>
            </div>
          </div>
        )}

        <div className="p-5">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-ink leading-snug">{captacion.title || "Sin título"}</h1>
              {!captacion.cover_photo_url && (
                <a
                  href={captacion.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center gap-1 text-xs text-gold hover:underline"
                >
                  <ExternalLink size={11} />
                  {captacion.source_url.slice(0, 60)}...
                </a>
              )}
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className={cn(
                "flex-shrink-0 inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium",
                stageColor?.badge || "bg-gray-100 text-gray-700"
              )}>
                {currentStage?.label || "Sin etapa"}
              </span>
              {currentStage && (
                <p className="text-[10px] text-ink/40">
                  {STAGE_TYPE_HINT[currentStage.stage_type] || ""}
                </p>
              )}
            </div>
          </div>

          {/* Origen API: esta captación la mantiene una integración externa, así
              que quien la mire sabe que los datos del anuncio se actualizan
              solos y no hace falta refrescarlos a mano. */}
          {captacion.origin === "api" && (
            <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-gold/8 px-3 py-2 text-[11px]">
              <span className="inline-flex items-center gap-1 font-medium text-gold-dark">
                <Plug size={12} />
                Origen: API · {captacion.external_source || "integración"}
              </span>
              {captacion.external_id && (
                <span className="text-ink/45">ref. proveedor: {captacion.external_id}</span>
              )}
              {captacion.external_synced_at && (
                <span className="text-ink/45">
                  última sincronización:{" "}
                  {new Date(captacion.external_synced_at).toLocaleString("es-CL")}
                </span>
              )}
            </div>
          )}

          {/* Scrape status and meta */}
          <div className="mb-3 flex items-center gap-2 text-[11px] text-ink/50">
            {captacion.scrape_status === "scraped" && (
              <span className="flex items-center gap-1 text-emerald-600">
                <Check size={12} />
                Datos obtenidos del link
              </span>
            )}
            {captacion.scrape_status === "failed" && (
              <span className="text-red-600">
                ⚠ Error al obtener datos: {captacion.scrape_error || "desconocido"}
              </span>
            )}
            {captacion.scrape_status === "pending" && (
              <span className="text-amber-600">Obteniendo datos del link...</span>
            )}
            {/* Sin fotos no se renderiza el encabezado con imagen (donde vive
                el botón Re-scrapear), así que se ofrece aquí */}
            {allPhotos.length === 0 && !isCaptadora && (
              <button
                onClick={handleRescrape}
                disabled={rescrapingAttempt}
                className="flex items-center gap-1 rounded-full bg-blue-600 px-2.5 py-1 text-[11px] text-white transition hover:bg-blue-700 disabled:opacity-50"
                title="Obtener datos nuevamente del link"
              >
                {rescrapingAttempt ? (
                  <>
                    <Loader2 size={10} className="animate-spin" />
                    Scrapeando...
                  </>
                ) : (
                  <>
                    <Navigation size={11} />
                    Re-scrapear
                  </>
                )}
              </button>
            )}
          </div>

          {/* Stats grid */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {captacion.price && (
              <div className="rounded-lg bg-ink/4 px-3 py-2">
                <p className="text-[10px] text-ink/50 uppercase tracking-wide">
                  Precio {mainOperation === "arriendo" ? "Arriendo" : "Venta"}
                </p>
                <p className="mt-0.5 text-base font-bold text-ink">
                  {formatPrice(captacion.price, captacion.currency || "clp")}
                </p>
              </div>
            )}
            {/* La misma propiedad también publicada en la otra operación
                (aviso registrado en Corredoras) */}
            {otherOperations.map(([op, info]) => (
              <div key={op} className="rounded-lg bg-sky-50 px-3 py-2">
                <p className="text-[10px] text-sky-700 uppercase tracking-wide">
                  También en {op}
                </p>
                <p className="mt-0.5 text-base font-bold text-sky-800">
                  {formatPrice(info.price, info.currency || "clp")}
                </p>
              </div>
            ))}
            {captacion.bedrooms && (
              <div className="rounded-lg bg-ink/4 px-3 py-2">
                <p className="text-[10px] text-ink/50 uppercase tracking-wide">Dormitorios</p>
                <p className="mt-0.5 text-base font-bold text-ink">{captacion.bedrooms}</p>
              </div>
            )}
            {captacion.bathrooms && (
              <div className="rounded-lg bg-ink/4 px-3 py-2">
                <p className="text-[10px] text-ink/50 uppercase tracking-wide">Baños</p>
                <p className="mt-0.5 text-base font-bold text-ink">{captacion.bathrooms}</p>
              </div>
            )}
            {captacion.square_meters && (
              <div className="rounded-lg bg-ink/4 px-3 py-2">
                <p className="text-[10px] text-ink/50 uppercase tracking-wide">Superficie total</p>
                <p className="mt-0.5 text-base font-bold text-ink">{captacion.square_meters} m²</p>
              </div>
            )}
          </div>

          {/* Location */}
          {(captacion.commune || captacion.region) && (
            <div className="mt-3 flex items-center gap-1.5 text-sm text-ink/60">
              <MapPin size={14} />
              <span>{[captacion.commune, captacion.region].filter(Boolean).join(", ")}</span>
            </div>
          )}
          {captacion.address_scraped && (
            <p className="mt-1 text-xs text-ink/45">{captacion.address_scraped}</p>
          )}

          {/* GPS link */}
          {captacion.latitude && captacion.longitude && (
            <a
              href={`https://maps.google.com/?q=${captacion.latitude},${captacion.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1.5 text-xs text-gold hover:underline"
            >
              <Navigation size={12} />
              Ver en Google Maps ({captacion.latitude.toFixed(4)}, {captacion.longitude.toFixed(4)})
            </a>
          )}

          {captacion.owner_confirmed && (
            <div className="mt-3 flex items-center gap-1.5 text-sm font-medium text-emerald-600">
              <Check size={15} />
              Dueño confirmó que quiere vender
            </div>
          )}
        </div>
      </div>

      {/* Nota de la etapa actual (etapas que piden nota al entrar, ej. una
          "Visita Presencial" o "Revisión" configurada en el pipeline) */}
      {currentStage?.requires_notes && captacion.revision_notes && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50/80 p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-800">
            <MapPin size={15} />
            {currentStage.label}
          </h3>
          <p className="mt-2 whitespace-pre-wrap text-sm text-amber-900">
            {captacion.revision_notes}
          </p>
        </div>
      )}

      {/* Asignación (roles con permiso para asignar) */}
      {canAssign && (
        <div className="mb-6 rounded-2xl border border-gold/15 bg-white/70 p-6">
          <h3 className="text-sm font-semibold text-ink mb-4">Asignación</h3>
          {captacion.assigned_to && !showReassignForm ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] text-ink/50 uppercase tracking-wide mb-0.5">Asignada a</p>
                <p className="text-sm font-semibold text-ink">
                  {captadoras.find(c => c.id === captacion.assigned_to)?.full_name || "Usuario"}
                </p>
                {captacion.assigned_at && (
                  <p className="text-xs text-ink/40 mt-0.5">
                    Desde {new Date(captacion.assigned_at).toLocaleDateString("es-CL")}
                  </p>
                )}
              </div>
              <button
                onClick={() => { setShowReassignForm(true); setSelectedCaptadoraId(""); }}
                className="text-xs text-ink/50 hover:text-ink underline"
              >
                Cambiar
              </button>
            </div>
          ) : (
            <div className="flex gap-3 items-end">
              <div className="flex-1">
                <label className="block text-xs font-medium text-ink/70 mb-2">
                  {captacion.assigned_to ? "Reasignar a" : "Asignar a"}
                </label>
                <select
                  value={selectedCaptadoraId}
                  onChange={(e) => setSelectedCaptadoraId(e.target.value)}
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                >
                  <option value="">Selecciona usuario...</option>
                  {captadoras
                    .filter(c => c.id !== captacion.assigned_to)
                    .map((captadora) => (
                      <option key={captadora.id} value={captadora.id}>
                        {captadora.full_name || "Sin nombre"}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAssign}
                  disabled={assigningCaptadora || !selectedCaptadoraId}
                  className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
                >
                  {assigningCaptadora ? "Asignando..." : "Asignar"}
                </button>
                {captacion.assigned_to && (
                  <button
                    onClick={() => setShowReassignForm(false)}
                    className="rounded-lg border border-ink/20 px-3 py-2 text-sm font-medium text-ink hover:bg-ink/5"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conversión a propiedad: paso final del flujo de captación. Crea la
          ficha real (borrador) con datos + fotos y enlaza la captación. */}
      {currentStage?.stage_type === "confirmed" && (canManageStatus || isCreator) && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50/70 p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-emerald-800">
                Dueño confirmado — lista para convertir
              </h3>
              <p className="mt-1 text-xs text-emerald-700">
                Se creará una propiedad en borrador con los datos y fotos de esta
                captación para completar la ficha y publicarla.
              </p>
            </div>
            <button
              onClick={handleConvert}
              disabled={converting}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-50"
            >
              {converting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {converting ? "Convirtiendo..." : "Convertir a propiedad"}
            </button>
          </div>
          {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
        </div>
      )}

      {/* Cambio de etapa: admin y roles con permiso para cambiar el estado
          (agent_senior, owner…), además del creador de la captación. */}
      {(canManageStatus || isCreator) && (
        <div className="mb-6 rounded-2xl border border-gold/15 bg-white/70 p-6">
          <h3 className="text-sm font-semibold text-ink mb-4">Cambiar Etapa</h3>
          {(() => {
            const targetStage = stages.find((s) => s.id === newStageId);
            return (
              <div>
                {allowedNextStages.length === 0 ? (
                  <p className="text-sm text-ink/50">Esta etapa no permite más transiciones</p>
                ) : (
                  <>
                    <div className="flex gap-3 items-end">
                      <div className="flex-1">
                        <select
                          value={newStageId}
                          onChange={(e) => setNewStageId(e.target.value)}
                          className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                        >
                          <option value="">Selecciona nueva etapa...</option>
                          {allowedNextStages.map((s) => (
                            <option key={s.id} value={s.id}>{s.label}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={handleStatusChange}
                        disabled={updatingStatus || !newStageId || (targetStage?.requires_notes && !revisionNotes.trim())}
                        className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
                      >
                        {updatingStatus ? "Actualizando..." : "Actualizar"}
                      </button>
                    </div>
                    {targetStage?.requires_notes && (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-ink/70 mb-1">
                          Nota para &quot;{targetStage.label}&quot; (requerido)
                        </label>
                        <textarea
                          value={revisionNotes}
                          onChange={(e) => setRevisionNotes(e.target.value)}
                          placeholder="Escribe el motivo o las instrucciones..."
                          rows={2}
                          className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                        />
                      </div>
                    )}
                    {error && <div className="mt-3"><ErrorBox>{error}</ErrorBox></div>}
                  </>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {/* Tabs */}
      <div className="mb-4 flex gap-1 border-b border-ink/10 overflow-x-auto">
        {(["ficha", "info", "location", "photos", "logs", "listings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition whitespace-nowrap",
              tab === t
                ? "border-b-2 border-gold text-gold"
                : "text-ink/50 hover:text-ink/80"
            )}
          >
            {t === "ficha" && "Ficha"}
            {t === "info" && "Datos del Dueño"}
            {t === "location" && "Ubicación"}
            {t === "photos" && `Fotos (${allPhotos.length})`}
            {t === "logs" && `Intentos (${logs.length})`}
            {t === "listings" && "Corredoras"}
          </button>
        ))}
      </div>

      {/* TAB: Ficha completa scrapeada del portal */}
      {tab === "ficha" && (
        <div className="rounded-2xl border border-gold/15 bg-white/70 p-6 space-y-6">
          {!hasFicha && (
            <div className="py-8 text-center">
              <p className="text-sm text-ink/50">
                Aún no hay ficha scrapeada para esta captación.
              </p>
              {!isCaptadora && (
                <p className="mt-1 text-xs text-ink/40">
                  Usa el botón &quot;Re-scrapear&quot; para obtener descripción,
                  características y fotos del aviso original.
                </p>
              )}
            </div>
          )}

          {/* Resumen de datos */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {captacion.price && (
              <InfoRow label={`Precio ${mainOperation === "arriendo" ? "Arriendo" : "Venta"}`}>
                {formatPrice(captacion.price, captacion.currency || "clp")}
              </InfoRow>
            )}
            {otherOperations.map(([op, info]) => (
              <InfoRow key={op} label={`También en ${op}`}>
                {formatPrice(info.price, info.currency || "clp")}
              </InfoRow>
            ))}
            {captacion.property_type && (
              <InfoRow label="Tipo">
                {{
                  house: "Casa",
                  apartment: "Departamento",
                  land: "Terreno",
                  office: "Oficina",
                  commercial: "Comercial",
                  other: "Otro",
                }[captacion.property_type]}
              </InfoRow>
            )}
            {captacion.bedrooms != null && (
              <InfoRow label="Dormitorios">{captacion.bedrooms}</InfoRow>
            )}
            {captacion.bathrooms != null && (
              <InfoRow label="Baños">{captacion.bathrooms}</InfoRow>
            )}
            {captacion.square_meters != null && (
              <InfoRow label="Superficie total">{captacion.square_meters} m²</InfoRow>
            )}
            {captacion.useful_square_meters != null && (
              <InfoRow label="Superficie útil">{captacion.useful_square_meters} m²</InfoRow>
            )}
            {captacion.operation && (
              <InfoRow label="Operación">
                {captacion.operation === "arriendo" ? "Arriendo" : "Venta"}
              </InfoRow>
            )}
            {(captacion.zone || captacion.commune || captacion.region) && (
              <InfoRow label="Ubicación (portal)">
                {[captacion.zone, captacion.commune, captacion.region].filter(Boolean).join(", ")}
              </InfoRow>
            )}
            {captacion.address_scraped && (
              <InfoRow label="Dirección (del aviso)">{captacion.address_scraped}</InfoRow>
            )}
            {captacion.portal_publication_number && (
              <InfoRow label="N° publicación portal">
                #{captacion.portal_publication_number}
              </InfoRow>
            )}
            {captacion.published_ago && (
              <InfoRow label="Antigüedad del aviso">{captacion.published_ago}</InfoRow>
            )}
            {captacion.rol_propiedad && (
              <InfoRow label="Rol SII">{captacion.rol_propiedad}</InfoRow>
            )}
            {captacion.broker_name && (
              <InfoRow label="Corredora">{captacion.broker_name}</InfoRow>
            )}
            {captacion.external_reference && (
              <InfoRow label="Código de referencia">{captacion.external_reference}</InfoRow>
            )}
          </div>

          {/* Descripción completa */}
          {captacion.description && (
            <div>
              <h3 className="text-sm font-semibold text-ink mb-2">Descripción</h3>
              <p className="text-sm text-ink/70 whitespace-pre-wrap leading-relaxed">
                {captacion.description}
              </p>
            </div>
          )}

          {/* Características */}
          {captacion.features && captacion.features.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-ink mb-2">
                Características ({captacion.features.length})
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {captacion.features.map((feature, i) => (
                  <span
                    key={i}
                    className="rounded-full bg-ink/6 px-3 py-1 text-xs text-ink/70"
                  >
                    {feature}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Fotos en miniatura */}
          {allPhotos.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-ink mb-2">
                Fotos ({allPhotos.length})
              </h3>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {allPhotos.slice(0, 8).map((p, i) => (
                  <button
                    key={p.id}
                    onClick={() => { setTab("photos"); setCurrentPhoto(i); }}
                    className="aspect-video overflow-hidden rounded-lg border border-ink/10 hover:border-gold/30"
                  >
                    <img
                      src={p.url}
                      alt={`Foto ${i + 1}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.currentTarget.parentElement as HTMLElement).style.display = "none";
                      }}
                    />
                  </button>
                ))}
              </div>
              {allPhotos.length > 8 && (
                <button
                  onClick={() => setTab("photos")}
                  className="mt-2 text-xs font-medium text-gold hover:underline"
                >
                  Ver las {allPhotos.length} fotos →
                </button>
              )}
            </div>
          )}

          <a
            href={captacion.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs text-gold hover:underline"
          >
            <ExternalLink size={12} />
            Ver aviso original
          </a>
        </div>
      )}

      {/* TAB: Location */}
      {/* TAB: Avisos por corredora (trazabilidad de la propiedad) */}
      {tab === "listings" && (
        <ListingsSection
          captacionId={captacion.id}
          canEdit={canWork}
        />
      )}

      {tab === "location" && (
        <LocationSection
          captacion={{
            id: captacion.id,
            property_type: captacion.property_type || null,
            address_verified: captacion.address_verified || false,
            latitude: captacion.latitude || null,
            longitude: captacion.longitude || null,
            address_real: captacion.address_real || null,
            rol_propiedad: captacion.rol_propiedad || null,
            commune: captacion.commune || null,
          }}
          captacionId={captacion.id}
          canEdit={canWork}
          onUpdate={async (data) => {
            const res = await fetch(`/api/admin/cl/captaciones/${captacion.id}/update`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(data),
            });
            if (!res.ok) {
              const err = await res.json();
              throw new Error(err.error || "Error al actualizar");
            }
            window.location.reload();
          }}
        />
      )}

      {/* TAB: Info */}
      {tab === "info" && (
        <div className="rounded-2xl border border-gold/15 bg-white/70 p-6">
          {!updatingData ? (
            <div className="space-y-4">
              {/* Contactos */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-ink">Contactos</h3>
                  {canWork && !showAddContact && (
                    <button
                      onClick={() => {
                        resetContactForm();
                        setShowAddContact(true);
                      }}
                      className="text-xs font-medium text-gold hover:text-gold-dark"
                    >
                      + Agregar Contacto
                    </button>
                  )}
                </div>

                {showAddContact && (
                  <div className="mb-4 rounded-lg border border-ink/10 bg-ink/3 p-4">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-xs font-medium text-ink/70 mb-1">Tipo</label>
                        <select
                          value={contactForm.contact_type}
                          onChange={(e) => setContactForm({ ...contactForm, contact_type: e.target.value as any })}
                          className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                        >
                          <option value="owner">Dueño</option>
                          <option value="spouse">Cónyuge</option>
                          <option value="family">Familiar</option>
                          <option value="other">Otro</option>
                        </select>
                      </div>
                      {contactForm.contact_type === "family" && (
                        <Input
                          label="Relación"
                          value={contactForm.relationship}
                          onChange={(v) => setContactForm({ ...contactForm, relationship: v })}
                          placeholder="Hijo, Hermano, etc."
                        />
                      )}
                    </div>

                    <Input
                      label="Nombre"
                      value={contactForm.contact_name}
                      onChange={(v) => setContactForm({ ...contactForm, contact_name: v })}
                      placeholder="Juan, María, etc."
                    />

                    <Input
                      label="RUT"
                      value={contactForm.rut}
                      onChange={(v) => setContactForm({ ...contactForm, rut: v })}
                      placeholder="12.345.678-9"
                    />

                    <div className="mb-3">
                      <label className="block text-xs font-medium text-ink/70 mb-1">Teléfono</label>
                      <div className="flex gap-2 items-start">
                        <input
                          type="tel"
                          value={contactForm.phone}
                          onChange={(e) => handlePhoneChange(e.target.value)}
                          placeholder="+56 9 1234 5678"
                          className="flex-1 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                        />
                        {contactForm.phone && isValidPhoneChile(normalizePhone(contactForm.phone)) && (
                          <button
                            onClick={handleCheckWhatsApp}
                            disabled={checkingWhatsApp}
                            title="Verificar si tiene WhatsApp"
                            className="mt-0.5 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm transition hover:bg-ink/5 disabled:opacity-50"
                          >
                            {checkingWhatsApp ? "..." : "Verificar"}
                          </button>
                        )}
                      </div>
                      {contactForm.phone && contactForm.phone.trim() && !contactForm.phone.startsWith("+") && (() => {
                        const normalized = normalizePhone(contactForm.phone);
                        return isValidPhoneChile(normalized) ? (
                          <p className="mt-1 text-xs text-emerald-600">→ Se guardará como: {normalized}</p>
                        ) : null;
                      })()}
                      {phoneValidationError && (
                        <p className="mt-1 text-xs text-red-600">{phoneValidationError}</p>
                      )}
                    </div>

                    {/* Teléfonos adicionales del mismo contacto */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-medium text-ink/70">
                          Teléfonos adicionales
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setContactForm({
                              ...contactForm,
                              extra_phones: [
                                ...contactForm.extra_phones,
                                { phone: "", has_whatsapp: false, label: "" },
                              ],
                            })
                          }
                          className="text-xs font-medium text-gold hover:text-gold-dark"
                        >
                          + Agregar otro teléfono
                        </button>
                      </div>
                      {contactForm.extra_phones.length === 0 ? (
                        <p className="text-xs text-ink/40">
                          Si el dueño tiene más de un número, agrégalo aquí.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          <datalist id="extra-phone-labels">
                            <option value="Esposo/a" />
                            <option value="Hijo/a" />
                            <option value="Padre" />
                            <option value="Madre" />
                            <option value="Hermano/a" />
                            <option value="Vecino/a" />
                          </datalist>
                          {contactForm.extra_phones.map((extra, i) => (
                            <div key={i} className="rounded-lg border border-ink/10 p-2 space-y-1.5">
                              <div className="flex items-center gap-2">
                                <input
                                  type="tel"
                                  value={extra.phone}
                                  onChange={(e) => updateExtraPhone(i, { phone: e.target.value })}
                                  placeholder="+56 9 1234 5678"
                                  className="flex-1 rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                                />
                                <label
                                  className="flex items-center gap-1 text-xs text-ink/60"
                                  title="Tiene WhatsApp"
                                >
                                  <input
                                    type="checkbox"
                                    checked={extra.has_whatsapp}
                                    onChange={(e) =>
                                      updateExtraPhone(i, { has_whatsapp: e.target.checked })
                                    }
                                    className="rounded border border-ink/20"
                                  />
                                  <MessageCircle size={13} className="text-emerald-600" />
                                </label>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setContactForm({
                                      ...contactForm,
                                      extra_phones: contactForm.extra_phones.filter((_, j) => j !== i),
                                    })
                                  }
                                  title="Quitar teléfono"
                                  className="rounded p-1.5 text-ink/40 hover:text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                              <input
                                type="text"
                                list="extra-phone-labels"
                                value={extra.label || ""}
                                onChange={(e) => updateExtraPhone(i, { label: e.target.value })}
                                placeholder="¿Quién es? Esposa, hijo, vecino..."
                                className="w-full rounded-lg border border-ink/10 bg-white px-3 py-1.5 text-xs focus:border-gold/50 focus:outline-none"
                              />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <Input
                      label="Email"
                      value={contactForm.email}
                      onChange={(v) => setContactForm({ ...contactForm, email: v })}
                      placeholder="correo@example.com"
                    />

                    <label className="flex items-center gap-2 mb-4">
                      <input
                        type="checkbox"
                        checked={contactForm.has_whatsapp}
                        onChange={(e) => setContactForm({ ...contactForm, has_whatsapp: e.target.checked })}
                        className="rounded border border-ink/20"
                      />
                      <span className="text-sm font-medium text-ink">Tiene WhatsApp</span>
                    </label>

                    {contactSaveError && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {contactSaveError}
                      </div>
                    )}

                    <div className="flex gap-2">
                      <button
                        onClick={handleSaveContact}
                        disabled={savingContact}
                        className="flex items-center gap-2 rounded-lg bg-ink px-3 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
                      >
                        {savingContact && <Loader2 size={14} className="animate-spin" />}
                        {editingContactId ? "Actualizar" : "Guardar"}
                      </button>
                      <button
                        onClick={resetContactForm}
                        className="rounded-lg border border-ink/20 px-3 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {contacts.length === 0 ? (
                  <p className="text-sm text-ink/40">Sin contactos registrados</p>
                ) : (
                  <div className="space-y-2">
                    {contacts.map((contact) => (
                      <div key={contact.id} className="rounded-lg border border-ink/10 bg-white p-3 flex items-start justify-between gap-3">
                        {/* Foto de perfil del número (la envía la integración y
                            se guarda copia en nuestro bucket). Le pone cara al
                            teléfono antes de marcar. Si no hay, iniciales. */}
                        <ContactAvatar
                          photoUrl={contact.photo_url ?? null}
                          name={contact.contact_name}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-medium uppercase text-ink/50">
                              {contact.contact_type === "owner" && "Dueño"}
                              {contact.contact_type === "spouse" && "Cónyuge"}
                              {contact.contact_type === "family" && "Familiar"}
                              {contact.contact_type === "other" && "Otro"}
                            </span>
                            {contact.relationship && (
                              <span className="text-xs text-ink/50">({contact.relationship})</span>
                            )}
                          </div>
                          {contact.contact_name && (
                            <div className="flex items-center gap-1">
                              <p className="text-sm font-medium text-ink">{contact.contact_name}</p>
                              <CopyButton value={contact.contact_name} label="nombre" />
                            </div>
                          )}
                          {contact.rut && (
                            <div className="flex items-center gap-1">
                              <p className="text-xs text-ink/50">RUT: {contact.rut}</p>
                              <CopyButton value={contact.rut} label="RUT" />
                            </div>
                          )}
                          <div className="mt-1 flex items-center gap-3 flex-wrap">
                            {contact.phone && (
                              <span className="flex items-center gap-1">
                                <a
                                  href={`tel:${contact.phone}`}
                                  className="flex items-center gap-1 text-xs text-gold hover:underline"
                                >
                                  <Phone size={12} />
                                  {contact.phone}
                                  {contact.has_whatsapp && (
                                    <span title="Tiene WhatsApp">
                                      <MessageCircle size={12} className="text-emerald-600" />
                                    </span>
                                  )}
                                </a>
                                <CopyButton value={contact.phone} label="teléfono" />
                              </span>
                            )}
                            {(contact.extra_phones || []).map((extra, i) => (
                              <span key={`${extra.phone}-${i}`} className="flex items-center gap-1">
                                <a
                                  href={`tel:${extra.phone}`}
                                  className="flex items-center gap-1 text-xs text-gold hover:underline"
                                >
                                  <Phone size={12} />
                                  {extra.phone}
                                  {extra.has_whatsapp && (
                                    <span title="Tiene WhatsApp">
                                      <MessageCircle size={12} className="text-emerald-600" />
                                    </span>
                                  )}
                                  {extra.label && (
                                    <span className="text-ink/40">({extra.label})</span>
                                  )}
                                </a>
                                <CopyButton value={extra.phone} label="teléfono" />
                              </span>
                            ))}
                            {contact.email && (
                              <span className="flex items-center gap-1 min-w-0">
                                <a
                                  href={`mailto:${contact.email}`}
                                  className="text-xs text-gold hover:underline truncate"
                                >
                                  {contact.email}
                                </a>
                                <CopyButton value={contact.email} label="email" />
                              </span>
                            )}
                          </div>
                        </div>
                        {canWork && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleEditContact(contact)}
                              title="Editar"
                              className="rounded p-1.5 text-ink/50 hover:text-ink hover:bg-ink/5"
                            >
                              <Edit size={14} />
                            </button>
                            {/* Borrar contacto exige `captaciones.delete` en la
                                API: sin ese permiso el botón no se enseña (antes
                                salía y devolvía 403). */}
                            {canDelete && (
                              <button
                                onClick={() => handleDeleteContact(contact.id)}
                                disabled={deletingContactId === contact.id}
                                title="Eliminar"
                                className="rounded p-1.5 text-ink/50 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Datos heredados del sistema anterior — teléfono/nombre/contacto se
                  pueden editar también como Contacto (arriba) y la dirección desde
                  la pestaña Ubicación, pero quedan aquí editables directamente para
                  corregir el dato heredado sin tener que crear un contacto nuevo. */}
              {(captacion.owner_phone || captacion.owner_name || captacion.owner_contact || captacion.address_real) && (
                <>
                  <hr className="border-ink/10" />
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs text-ink/40">Datos heredados del sistema anterior</p>
                      {canWork && (
                        <button
                          onClick={() => setUpdatingData(true)}
                          className="text-xs font-medium text-gold hover:text-gold-dark"
                        >
                          + Editar
                        </button>
                      )}
                    </div>
                    <div className="space-y-4">
                      {captacion.owner_phone && (
                        <InfoRow label="Teléfono">
                          <a href={`tel:${captacion.owner_phone}`} className="text-gold hover:underline">
                            {captacion.owner_phone}
                          </a>
                        </InfoRow>
                      )}
                      {captacion.owner_name && (
                        <InfoRow label="Nombre">{captacion.owner_name}</InfoRow>
                      )}
                      {captacion.owner_contact && (
                        <InfoRow label="Contacto (Email/Otro)">{captacion.owner_contact}</InfoRow>
                      )}
                      {captacion.address_real && (
                        <InfoRow label="Dirección Real">{captacion.address_real}</InfoRow>
                      )}
                    </div>
                  </div>
                </>
              )}

              <hr className="border-ink/10" />

              {/* Notas y confirmación */}
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-ink">Notas y confirmación</h3>
                  {canWork && (
                    <button
                      onClick={() => setUpdatingData(true)}
                      className="text-xs font-medium text-gold hover:text-gold-dark"
                    >
                      + Editar
                    </button>
                  )}
                </div>

                {captacion.notes && (
                  <p className="mb-2 whitespace-pre-wrap text-sm text-ink">{captacion.notes}</p>
                )}
                {captacion.owner_confirmed && (
                  <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                    <Check size={14} /> Dueño confirmó que quiere vender
                  </p>
                )}
                {!captacion.notes && !captacion.owner_confirmed && (
                  <p className="text-sm text-ink/40">Sin notas</p>
                )}
                {!canWork && (
                  <p className="mt-2 text-xs text-ink/40">
                    No tienes permiso para editar esta captación
                  </p>
                )}
              </div>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleUpdate(); }}>
              <Input
                label="Teléfono"
                value={formData.owner_phone}
                onChange={(v) => setFormData({ ...formData, owner_phone: v })}
                placeholder="+56 9 1234 5678"
              />
              <Input
                label="Nombre"
                value={formData.owner_name}
                onChange={(v) => setFormData({ ...formData, owner_name: v })}
              />
              <Input
                label="Contacto (Email/Otro)"
                value={formData.owner_contact}
                onChange={(v) => setFormData({ ...formData, owner_contact: v })}
              />
              <Input
                label="Dirección Real"
                value={formData.address_real}
                onChange={(v) => setFormData({ ...formData, address_real: v })}
              />
              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">Notas</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.owner_confirmed}
                  onChange={(e) => setFormData({ ...formData, owner_confirmed: e.target.checked })}
                  className="rounded border border-ink/20"
                />
                <span className="text-sm font-medium text-ink">Dueño confirmó que sí quiere vender</span>
              </label>

              {error && <ErrorBox>{error}</ErrorBox>}

              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Guardar
                </button>
                <button type="button" onClick={() => setUpdatingData(false)}
                  className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5">
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* TAB: Photos */}
      {tab === "photos" && (
        <div className="rounded-2xl border border-gold/15 bg-white/70 p-6">
          {allPhotos.length === 0 ? (
            <div className="py-12 text-center">
              <Image size={32} className="mx-auto mb-3 text-ink/25" />
              <p className="text-sm text-ink/50">Sin fotos guardadas</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {allPhotos.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => { setTab("info"); setCurrentPhoto(i); }}
                  className="aspect-video overflow-hidden rounded-lg border border-ink/10 hover:border-gold/30"
                >
                  <img
                    src={p.url}
                    alt={`Foto ${i + 1}`}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      (e.currentTarget.parentElement as HTMLElement).style.display = "none";
                    }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: Logs */}
      {tab === "logs" && (
        <div className="rounded-2xl border border-gold/15 bg-white/70 p-6">
          {/* Próximo paso agendado del seguimiento */}
          {captacion.next_action_at && (
            <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50/80 px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-blue-700">
                <Clock size={12} />
                Próximo paso
              </p>
              <p className="mt-1 text-sm font-medium text-blue-900">
                {new Date(captacion.next_action_at).toLocaleDateString("es-CL", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
                {captacion.next_action_note && ` — ${captacion.next_action_note}`}
              </p>
            </div>
          )}

          {/* Registran intentos: quien tiene la captación asignada, quien la
              creó y cualquiera con permiso de edición en captaciones (misma
              regla que la API — ver lib/captaciones/access.ts) */}
          {canWork && !loggingAttempt && (
            <button
              onClick={() => setLoggingAttempt(true)}
              className="mb-6 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
            >
              + Registrar Intento
            </button>
          )}

          {loggingAttempt && (
            <form className="mb-6 space-y-4 rounded-xl border border-ink/10 bg-ink/3 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">Tipo</label>
                  <select
                    value={logForm.attempt_type}
                    onChange={(e) => setLogForm({ ...logForm, attempt_type: e.target.value as any })}
                    className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm"
                  >
                    <option value="call">Llamada</option>
                    <option value="visit">Visita</option>
                    <option value="message">Mensaje</option>
                    <option value="whatsapp">WhatsApp</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-ink/70 mb-1">Resultado</label>
                  <select
                    value={logForm.result}
                    onChange={(e) => setLogForm({ ...logForm, result: e.target.value })}
                    className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm"
                  >
                    <option value="answered">Respondió</option>
                    <option value="no_answer">No respondió</option>
                    <option value="interested">Interesado</option>
                    <option value="not_interested">No interesado</option>
                    <option value="call_back">Llamar después</option>
                    <option value="wrong_number">Número incorrecto</option>
                    <option value="busy">Ocupado</option>
                    <option value="owner_found">Dueño ubicado</option>
                    <option value="visit_scheduled">Visita agendada</option>
                    <option value="no_owner_data">Sin datos del dueño</option>
                    <option value="left_note">Se dejó nota/carta</option>
                    <option value="nobody_home">No había nadie</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Input label="Teléfono obtenido" type="tel" value={logForm.phone}
                  onChange={(v) => setLogForm({ ...logForm, phone: v })}
                  placeholder="+56 9..." />
                <Input label="Nombre obtenido" value={logForm.name}
                  onChange={(v) => setLogForm({ ...logForm, name: v })}
                  placeholder="Nombre" />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink/70 mb-1">Notas del intento</label>
                <textarea
                  value={logForm.notes}
                  onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })}
                  rows={3}
                  placeholder="Detalles de la conversación..."
                  className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm"
                />
              </div>

              {/* Próximo paso: agenda el seguimiento (queda visible arriba) */}
              <div className="rounded-lg border border-blue-100 bg-blue-50/50 p-3">
                <p className="mb-2 text-xs font-semibold text-blue-800">
                  Próximo paso (opcional)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-ink/70 mb-1">¿Cuándo?</label>
                    <input
                      type="datetime-local"
                      value={logForm.next_action_at}
                      onChange={(e) => setLogForm({ ...logForm, next_action_at: e.target.value })}
                      className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-ink/70 mb-1">¿Qué hacer?</label>
                    <input
                      type="text"
                      value={logForm.next_action_note}
                      onChange={(e) => setLogForm({ ...logForm, next_action_note: e.target.value })}
                      placeholder="Volver a llamar, ir a la propiedad..."
                      className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>
              </div>

              {error && <ErrorBox>{error}</ErrorBox>}

              <div className="flex gap-2">
                <button type="button" onClick={handleLogAttempt} disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                  {saving && <Loader2 size={14} className="animate-spin" />}
                  Guardar Intento
                </button>
                <button type="button" onClick={() => setLoggingAttempt(false)}
                  className="rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink hover:bg-ink/5">
                  Cancelar
                </button>
              </div>
            </form>
          )}

          {logs.length === 0 ? (
            <div className="py-10 text-center">
              <MessageSquare size={28} className="mx-auto mb-3 text-ink/25" />
              <p className="text-sm text-ink/50">Sin intentos registrados</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="rounded-xl border border-ink/8 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="rounded-full bg-ink/8 px-2.5 py-0.5 text-xs font-medium text-ink">
                        {ATTEMPT_TYPE_LABELS[log.attempt_type] || log.attempt_type}
                      </span>
                      <span className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-medium",
                        log.result === "interested" && "bg-emerald-100 text-emerald-700",
                        log.result === "answered" && "bg-blue-100 text-blue-700",
                        log.result === "not_interested" && "bg-red-100 text-red-700",
                        !["interested", "answered", "not_interested"].includes(log.result) &&
                          "bg-amber-100 text-amber-700",
                      )}>
                        {RESULT_LABELS[log.result] || log.result}
                      </span>
                      {log.owner_phone && (
                        <span className="flex items-center gap-1 text-xs text-ink/55">
                          <Phone size={10} />
                          {log.owner_phone}
                        </span>
                      )}
                    </div>
                    <span className="flex items-center gap-1 text-[11px] text-ink/40 flex-shrink-0">
                      <Clock size={10} />
                      {new Date(log.created_at).toLocaleDateString("es-CL", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {log.notes && (
                    <p className="mt-2 text-sm text-ink/65 whitespace-pre-wrap">{log.notes}</p>
                  )}
                  {log.profiles?.full_name && (
                    <p className="mt-1.5 text-[11px] text-ink/40">{log.profiles.full_name}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Avatar del contacto. Si la integración envió foto de perfil se pinta la copia
 * de nuestro bucket; si no, las iniciales del nombre. La imagen se degrada sola
 * a iniciales si la copia no cargara, para que la tarjeta nunca quede rota.
 */
function ContactAvatar({ photoUrl, name }: { photoUrl: string | null; name: string | null }) {
  const [failed, setFailed] = useState(false);
  const initials = (name || "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  if (photoUrl && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name ? `Foto de ${name}` : "Foto del contacto"}
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-ink/10"
      />
    );
  }

  return (
    <div
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold/10 text-xs font-semibold text-gold-dark ring-1 ring-ink/5"
    >
      {initials || <User size={16} className="text-gold/60" />}
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-ink/50 uppercase tracking-wide">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">{children}</p>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-ink/70 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
      />
    </div>
  );
}

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {children}
    </div>
  );
}
