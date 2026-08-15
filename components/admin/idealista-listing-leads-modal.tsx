"use client";

import { X, Loader2, Phone } from "lucide-react";
import { useEffect, useState } from "react";

type ContactStatus =
  | "ninguno"
  | "contactado_whatsapp"
  | "contactado_llamada"
  | "contactado_email"
  | "sin_respuesta";

type LeadRow = {
  id: string;
  name: string;
  phone: string | null;
  phone_country: string | null;
  is_international: boolean;
  message: string | null;
  contact_status: ContactStatus;
  status: "nuevo" | "fichado" | "descartado";
  created_at: string;
  message_date: string | null;
};

const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = {
  ninguno: "Sin contactar",
  contactado_whatsapp: "Contactado por WhatsApp",
  contactado_llamada: "Contactado por llamada",
  contactado_email: "Contactado por email",
  sin_respuesta: "Sin respuesta",
};

const CONTACT_STATUS_BADGE: Record<ContactStatus, string> = {
  ninguno: "border-ink/10 bg-ink/[0.03] text-ink/45",
  contactado_whatsapp: "border-emerald-200 bg-emerald-50 text-emerald-700",
  contactado_llamada: "border-blue-200 bg-blue-50 text-blue-700",
  contactado_email: "border-violet-200 bg-violet-50 text-violet-700",
  sin_respuesta: "border-amber-200 bg-amber-50 text-amber-700",
};

interface IdealistaListingLeadsModalProps {
  listingId: string;
  title: string;
  isOpen: boolean;
  onClose: () => void;
}

export function IdealistaListingLeadsModal({
  listingId,
  title,
  isOpen,
  onClose,
}: IdealistaListingLeadsModalProps) {
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    fetch(`/api/admin/idealista/listings/${listingId}/leads`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setLeads(data.data || []);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [isOpen, listingId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="mx-4 max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-2xl border border-gold/15 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gold/10 px-6 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wide text-ink/50">Leads del inbox de Idealista</p>
            <h2 className="truncate text-lg font-semibold text-ink">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink/40 transition hover:bg-ink/5 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="max-h-[calc(80vh-72px)] overflow-y-auto px-6 py-4">
          {loading && (
            <div className="flex items-center justify-center py-10 text-ink/40">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
          {!loading && !error && leads.length === 0 && (
            <p className="py-6 text-center text-sm text-ink/45">Sin leads matcheados a esta ficha.</p>
          )}
          <div className="space-y-3">
            {leads.map((lead) => (
              <div key={lead.id} className="rounded-xl border border-ink/10 bg-white/60 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-ink">{lead.name || "Sin nombre"}</p>
                    {lead.phone && (
                      <a
                        href={`tel:${lead.phone}`}
                        className="flex items-center gap-1 text-xs text-ink/50 hover:text-ink"
                      >
                        <Phone size={11} />
                        {lead.phone}
                      </a>
                    )}
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${CONTACT_STATUS_BADGE[lead.contact_status]}`}
                  >
                    {CONTACT_STATUS_LABEL[lead.contact_status]}
                  </span>
                </div>
                {lead.message && (
                  <p className="mt-1.5 line-clamp-2 text-xs text-ink/55">{lead.message}</p>
                )}
                <p className="mt-1.5 text-[11px] text-ink/35">
                  {new Date(lead.message_date || lead.created_at).toLocaleDateString("es-ES", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
