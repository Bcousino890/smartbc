"use client";

import { Loader2, Phone, MessageCircle } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { Modal } from "@/components/ui/modal";
import { updateIdealistaLeadContactStatus } from "@/app/[country]/(admin)/admin/solicitudes/actions";

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
    if (!isOpen || !listingId) return;

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

  return (
    <Modal open={isOpen} onClose={onClose} title="Leads del inbox de Idealista" subtitle={title} size="xl">
      {loading && (
        <div className="flex items-center justify-center py-10 text-ink/40">
          <Loader2 size={20} className="animate-spin" />
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!loading && !error && leads.length === 0 && (
        <p className="py-6 text-center text-sm text-ink/45">Sin leads matcheados a esta ficha.</p>
      )}
      <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
        {leads.map((lead) => (
          <LeadCard key={lead.id} lead={lead} />
        ))}
      </div>
    </Modal>
  );
}

function LeadCard({ lead: initialLead }: { lead: LeadRow }) {
  const [lead, setLead] = useState(initialLead);
  const [isPending, startTransition] = useTransition();

  function handleContactStatusChange(status: ContactStatus) {
    setLead((prev) => ({ ...prev, contact_status: status }));
    startTransition(async () => {
      await updateIdealistaLeadContactStatus(lead.id, status);
    });
  }

  return (
    <div className="rounded-xl border border-ink/10 bg-white/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <p className="text-sm font-medium text-ink">{lead.name || "Sin nombre"}</p>
          {lead.phone && (
            <div className="flex items-center gap-2 text-xs text-ink/50">
              <a href={`tel:${lead.phone}`} className="flex items-center gap-1 hover:text-ink">
                <Phone size={11} />
                {lead.phone}
              </a>
              <a
                href={`https://wa.me/${lead.phone.replace(/[^\d]/g, "")}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 text-emerald-600 hover:text-emerald-700"
              >
                <MessageCircle size={11} />
                WhatsApp
              </a>
            </div>
          )}
        </div>
        <select
          value={lead.contact_status}
          onChange={(e) => handleContactStatusChange(e.target.value as ContactStatus)}
          disabled={isPending}
          className={`shrink-0 rounded-full border px-2 py-1 text-[10px] font-medium focus:outline-none disabled:opacity-60 ${CONTACT_STATUS_BADGE[lead.contact_status]}`}
        >
          {(Object.keys(CONTACT_STATUS_LABEL) as ContactStatus[]).map((s) => (
            <option key={s} value={s}>
              {CONTACT_STATUS_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      {lead.message && <p className="mt-1.5 line-clamp-2 text-xs text-ink/55">{lead.message}</p>}
      <p className="mt-1.5 text-[11px] text-ink/35">
        {new Date(lead.message_date || lead.created_at).toLocaleDateString("es-ES", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        })}
      </p>
    </div>
  );
}
