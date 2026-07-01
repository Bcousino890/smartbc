"use client";

import {
  ArrowLeft, Phone, MapPin, Check, Image, Clock,
  MessageSquare, Navigation, ExternalLink, Loader2, MessageCircle, Trash2, Edit,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { Captacion, CaptacionContact } from "../actions";
import { LocationSection } from "./location-section";
import { normalizePhone, isValidPhoneChile, formatPhoneDisplay } from "@/lib/phone-utils";

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

type DetailClientProps = {
  captacion: Captacion;
  userRole: string;
  currentUserId: string;
  photos: Photo[];
  logs: Log[];
  captadoras: Array<{ id: string; full_name: string | null }>;
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
};

const STATUS_CONFIG: Record<string, { label: string; color: string; description: string }> = {
  draft: { label: "Borrador", color: "bg-red-100 text-red-700", description: "Esperando asignación" },
  assigned: { label: "Asignada", color: "bg-blue-100 text-blue-700", description: "Asignada a captadora" },
  preliminary_data: { label: "Datos Preliminares", color: "bg-orange-100 text-orange-700", description: "Datos iniciales completados" },
  contacting: { label: "Contactando", color: "bg-purple-100 text-purple-700", description: "En proceso de contacto" },
  revision: { label: "Revisión", color: "bg-orange-200 text-orange-800", description: "Revisar datos inconsistentes" },
  confirmed: { label: "Confirmada", color: "bg-emerald-100 text-emerald-700", description: "Dueño confirmó que quiere vender" },
  converted_to_property: { label: "Convertida", color: "bg-cyan-100 text-cyan-700", description: "Ya es una propiedad" },
  rejected: { label: "Rechazada", color: "bg-red-100 text-red-700", description: "Rechazada" },
};

// Transiciones de estado permitidas (debe coincidir con backend)
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  draft: ["assigned", "rejected"],
  assigned: ["preliminary_data", "rejected"],
  preliminary_data: ["contacting", "revision", "rejected"],
  contacting: ["revision", "confirmed", "rejected"],
  revision: ["preliminary_data", "contacting"],
  confirmed: ["converted_to_property", "rejected"],
  converted_to_property: [],
  rejected: [],
};

function formatPrice(price: number | null, currency: string): string | null {
  if (!price) return null;
  if (currency === "uf") return `UF ${price.toLocaleString("es-CL")}`;
  return `$${(price / 1_000_000).toFixed(1)}M`;
}

export function CaptacionDetailClient({
  captacion,
  userRole,
  currentUserId,
  photos,
  logs,
  captadoras,
}: DetailClientProps) {
  const isCaptadora = userRole === "captadora";
  const isAdmin = userRole === "admin";
  const isCreator = currentUserId === captacion.created_by;
  const [tab, setTab] = useState<"info" | "location" | "photos" | "logs">("info");
  const [updatingData, setUpdatingData] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [loggingAttempt, setLoggingAttempt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [rescrapingAttempt, setRescrapeingAttempt] = useState(false);
  const [assigningCaptadora, setAssigningCaptadora] = useState(false);
  const [showReassignForm, setShowReassignForm] = useState(false);
  const [selectedCaptadoraId, setSelectedCaptadoraId] = useState(captacion.assigned_to || "");
  const [newStatus, setNewStatus] = useState("");
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
    phone: "",
    email: "",
    has_whatsapp: false,
    relationship: "",
  });
  const [phoneValidationError, setPhoneValidationError] = useState("");
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
    if (!newStatus) return;

    // Validar que si es "revision", debe haber notas
    if (newStatus === "revision" && !revisionNotes.trim()) {
      setError("Se requieren notas para marcar como revisión");
      return;
    }

    setError("");
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/cl/captaciones/${captacion.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          new_status: newStatus,
          notes: newStatus === "revision" ? revisionNotes : undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al cambiar estado");
        return;
      }
      window.location.reload();
    } catch {
      setError("Error de conexión");
    } finally {
      setUpdatingStatus(false);
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
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Error al registrar intento");
        return;
      }
      setLogForm({ attempt_type: "call", result: "answered", notes: "", phone: "", name: "" });
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
          phone: phone || null,
          email: contactForm.email || null,
          has_whatsapp: contactForm.has_whatsapp,
          relationship: contactForm.relationship || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setPhoneValidationError(data.error || "Error al guardar contacto");
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
        phone: "",
        email: "",
        has_whatsapp: false,
        relationship: "",
      });
    } catch (e) {
      console.error("save-contact error:", e);
      setPhoneValidationError("Error de conexión");
    } finally {
      setSavingContact(false);
    }
  }

  function handleEditContact(contact: CaptacionContact) {
    setEditingContactId(contact.id);
    setContactForm({
      contact_type: contact.contact_type,
      contact_name: contact.contact_name || "",
      phone: contact.phone || "",
      email: contact.email || "",
      has_whatsapp: contact.has_whatsapp || false,
      relationship: contact.relationship || "",
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
      phone: "",
      email: "",
      has_whatsapp: false,
      relationship: "",
    });
    setPhoneValidationError("");
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
                STATUS_CONFIG[captacion.status]?.color || "bg-gray-100 text-gray-700"
              )}>
                {STATUS_CONFIG[captacion.status]?.label || captacion.status}
              </span>
              <p className="text-[10px] text-ink/40">
                {STATUS_CONFIG[captacion.status]?.description}
              </p>
            </div>
          </div>

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
          </div>

          {/* Stats grid */}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {captacion.price && (
              <div className="rounded-lg bg-ink/4 px-3 py-2">
                <p className="text-[10px] text-ink/50 uppercase tracking-wide">Precio</p>
                <p className="mt-0.5 text-base font-bold text-ink">
                  {formatPrice(captacion.price, captacion.currency || "clp")}
                </p>
              </div>
            )}
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
                <p className="text-[10px] text-ink/50 uppercase tracking-wide">Superficie</p>
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

      {/* Asignación (solo para admin) */}
      {isAdmin && (
        <div className="mb-6 rounded-2xl border border-gold/15 bg-white/70 p-6">
          <h3 className="text-sm font-semibold text-ink mb-4">Asignación</h3>
          {captacion.assigned_to && !showReassignForm ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] text-ink/50 uppercase tracking-wide mb-0.5">Captadora asignada</p>
                <p className="text-sm font-semibold text-ink">
                  {captadoras.find(c => c.id === captacion.assigned_to)?.full_name || "—"}
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
                  <option value="">Selecciona captadora...</option>
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

      {/* Cambio de estado (solo admin) */}
      {isAdmin && (
        <div className="mb-6 rounded-2xl border border-gold/15 bg-white/70 p-6">
          <h3 className="text-sm font-semibold text-ink mb-4">Cambiar Estado</h3>
          {(() => {
            const allowedNextStatuses = ALLOWED_TRANSITIONS[captacion.status] ?? [];
            return (
              <div>
                {allowedNextStatuses.length === 0 ? (
                  <p className="text-sm text-ink/50">Este estado no permite más transiciones</p>
                ) : (
                  <>
                    <div className="flex gap-3 items-end">
                      <div className="flex-1">
                        <select
                          value={newStatus}
                          onChange={(e) => setNewStatus(e.target.value)}
                          className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm focus:border-gold/50 focus:outline-none"
                        >
                          <option value="">Selecciona nuevo estado...</option>
                          {allowedNextStatuses.map((s) => (
                            <option key={s} value={s}>{STATUS_CONFIG[s]?.label || s}</option>
                          ))}
                        </select>
                      </div>
                      <button
                        onClick={handleStatusChange}
                        disabled={updatingStatus || !newStatus || (newStatus === "revision" && !revisionNotes.trim())}
                        className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-cream-50 transition hover:bg-ink/90 disabled:opacity-50"
                      >
                        {updatingStatus ? "Actualizando..." : "Actualizar"}
                      </button>
                    </div>
                    {newStatus === "revision" && (
                      <div className="mt-3">
                        <label className="block text-xs font-medium text-ink/70 mb-1">
                          Motivo de la revisión (requerido)
                        </label>
                        <textarea
                          value={revisionNotes}
                          onChange={(e) => setRevisionNotes(e.target.value)}
                          placeholder="Ej: El teléfono no corresponde al dueño..."
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
      <div className="mb-4 flex gap-1 border-b border-ink/10">
        {(["info", "location", "photos", "logs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition",
              tab === t
                ? "border-b-2 border-gold text-gold"
                : "text-ink/50 hover:text-ink/80"
            )}
          >
            {t === "info" && "Datos del Dueño"}
            {t === "location" && "Ubicación"}
            {t === "photos" && `Fotos (${allPhotos.length})`}
            {t === "logs" && `Intentos (${logs.length})`}
          </button>
        ))}
      </div>

      {/* TAB: Location */}
      {tab === "location" && (
        <LocationSection
          captacion={{
            id: captacion.id,
            property_type: captacion.property_type || null,
            address_verified: captacion.address_verified || false,
            latitude: captacion.latitude || null,
            longitude: captacion.longitude || null,
            address_real: captacion.address_real || null,
          }}
          captacionId={captacion.id}
          isCaptadora={isCaptadora}
          isAdmin={isAdmin}
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
                  {(isCaptadora || isAdmin) && !showAddContact && (
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
                            <p className="text-sm font-medium text-ink">{contact.contact_name}</p>
                          )}
                          <div className="mt-1 flex items-center gap-3 flex-wrap">
                            {contact.phone && (
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
                            )}
                            {contact.email && (
                              <a
                                href={`mailto:${contact.email}`}
                                className="text-xs text-gold hover:underline truncate"
                              >
                                {contact.email}
                              </a>
                            )}
                          </div>
                        </div>
                        {(isCaptadora || isAdmin) && (
                          <div className="flex gap-1 flex-shrink-0">
                            <button
                              onClick={() => handleEditContact(contact)}
                              title="Editar"
                              className="rounded p-1.5 text-ink/50 hover:text-ink hover:bg-ink/5"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteContact(contact.id)}
                              disabled={deletingContactId === contact.id}
                              title="Eliminar"
                              className="rounded p-1.5 text-ink/50 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Legacy fields — only shown if they have values */}
              {(captacion.owner_phone || captacion.owner_name || captacion.owner_contact || captacion.address_real || captacion.notes) && (
                <>
                  <hr className="border-ink/10" />
                  <p className="text-xs text-ink/40">Datos heredados del sistema anterior</p>
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
                    {captacion.notes && (
                      <InfoRow label="Notas"><span className="whitespace-pre-wrap">{captacion.notes}</span></InfoRow>
                    )}
                  </div>
                </>
              )}

              <hr className="border-ink/10" />

              {(isCaptadora || isAdmin) && (
                <button
                  onClick={() => setUpdatingData(true)}
                  className="mt-2 rounded-lg border border-ink/20 px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
                >
                  {isCaptadora ? "Actualizar Datos del Dueño" : "Editar Datos"}
                </button>
              )}
              {!isCaptadora && !isAdmin && (
                <p className="mt-2 text-xs text-ink/40">
                  Solo captadoras y admins pueden editar
                </p>
              )}
            </div>
          ) : (
            <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); handleUpdate(); }}>
              <Input label="Teléfono" type="tel" value={formData.owner_phone}
                onChange={(v) => setFormData({ ...formData, owner_phone: v })}
                placeholder="+56 9 1234 5678" />
              <Input label="Nombre del Dueño" value={formData.owner_name}
                onChange={(v) => setFormData({ ...formData, owner_name: v })}
                placeholder="Juan Pérez" />
              <Input label="Contacto (Email/Otro)" value={formData.owner_contact}
                onChange={(v) => setFormData({ ...formData, owner_contact: v })}
                placeholder="juan@example.com" />
              <Input label="Dirección Real" value={formData.address_real}
                onChange={(v) => setFormData({ ...formData, address_real: v })}
                placeholder="Av. Providencia 1234" />
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
          {isCaptadora && !loggingAttempt && (
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
