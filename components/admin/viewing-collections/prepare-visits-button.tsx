"use client";

// ============================================================================
// "Preparar visitas" — la puerta de Solicitudes hacia Viewing Collections.
//
// · Con cliente resuelto (solicitudes de visita): enlace directo a la ficha,
//   anclado al bloque de selección. Cero fricción.
// · Con lead (Idealista / consulta web): diálogo que resuelve el cliente —
//   vincular uno existente detectado por email/teléfono, o crear uno nuevo
//   con los datos ya prellenados — y aterriza en el mismo sitio.
//
// El sistema de destino es siempre el mismo: la selección e itinerarios del
// cliente. Aquí no se duplica nada.
// ============================================================================

import { useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { CalendarPlus, Link2, Loader2, UserPlus, X } from "lucide-react";
import {
  confirmPrepareVisits,
  lookupPrepareVisits,
  type PrepareVisitsLookup,
} from "@/app/[country]/(admin)/admin/solicitudes/prepare-visits-actions";
import { getCountryConfig, isCountry } from "@/lib/country-config";
import { cn } from "@/lib/utils";

function usePrefix(): string {
  const params = useParams<{ country?: string }>();
  const country = isCountry(params?.country) ? params.country : "es";
  return getCountryConfig(country).prefix;
}

/** Caso 1 · la solicitud ya tiene cliente: enlace directo. */
export function PrepareVisitsLink({
  clientId,
  compact = false,
}: {
  clientId: string;
  compact?: boolean;
}) {
  const prefix = usePrefix();
  return (
    <a
      href={`${prefix}/clientes/${clientId}#viewing-collections`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink",
        compact ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-[12px]",
      )}
      title="Selección de propiedades e itinerarios de este cliente"
    >
      <CalendarPlus size={12} strokeWidth={1.75} className="text-gold-dark" />
      Preparar visitas
    </a>
  );
}

/** Casos 2 y 3 · lead sin cliente: diálogo de resolución. */
export function PrepareVisitsButton({
  source,
  sourceId,
  compact = false,
}: {
  source: "idealista" | "contact";
  sourceId: string;
  compact?: boolean;
}) {
  const [lookup, setLookup] = useState<PrepareVisitsLookup | null>(null);
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const openDialog = () => {
    setOpen(true);
    startTransition(async () => {
      setLookup(await lookupPrepareVisits(source, sourceId));
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-ink/15 bg-white font-medium text-ink/75 transition hover:border-gold/55 hover:text-ink",
          compact ? "px-2.5 py-1.5 text-[11px]" : "px-3 py-2 text-[12px]",
        )}
      >
        <CalendarPlus size={12} strokeWidth={1.75} className="text-gold-dark" />
        Preparar visitas
      </button>

      {open && (
        <PrepareVisitsDialog
          lookup={lookup}
          loading={pending && !lookup}
          onClose={() => {
            setOpen(false);
            setLookup(null);
          }}
        />
      )}
    </>
  );
}

function PrepareVisitsDialog({
  lookup,
  loading,
  onClose,
}: {
  lookup: PrepareVisitsLookup | null;
  loading: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const prefix = usePrefix();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const ok = lookup?.ok ? lookup : null;
  const [name, setName] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [addProperty, setAddProperty] = useState(true);

  const effName = name ?? ok?.prefill.name ?? "";
  const effEmail = email ?? ok?.prefill.email ?? "";
  const effPhone = phone ?? ok?.prefill.phone ?? "";

  const finish = (input: {
    existingClientId?: string;
    newClient?: { name: string; email: string; phone: string };
  }) => {
    setError(null);
    startTransition(async () => {
      const res = await confirmPrepareVisits({
        ...input,
        propertyId:
          addProperty && ok?.property ? ok.property.id : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`${prefix}/clientes/${res.clientId}#viewing-collections`);
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div
        className="mt-10 w-full max-w-md overflow-hidden rounded-2xl border border-gold/20 bg-cream-50 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-gold/15 px-5 py-4">
          <h3 className="font-serif text-lg font-semibold text-ink">
            Preparar visitas
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-ink/45 transition hover:text-ink"
            aria-label="Cerrar"
          >
            <X size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="px-5 py-4">
          {loading && (
            <div className="flex h-24 items-center justify-center text-ink/45">
              <Loader2 size={16} className="mr-2 animate-spin" />
              <span className="text-[12px]">Buscando cliente…</span>
            </div>
          )}

          {lookup && !lookup.ok && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
              {lookup.error}
            </p>
          )}

          {ok && (
            <div className="space-y-4">
              {/* Caso 3 · posible cliente existente: vincular antes que duplicar */}
              {ok.match && (
                <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3.5">
                  <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-emerald-800/70">
                    Posible cliente existente
                  </p>
                  <p className="mt-1.5 text-[13px] font-medium text-ink">
                    {ok.match.fullName}
                  </p>
                  <p className="text-[11px] text-ink/55">
                    {ok.match.email}
                    {ok.match.phone ? ` · ${ok.match.phone}` : ""} — coincide
                    por {ok.match.matchedBy === "email" ? "email" : "teléfono"}
                  </p>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => finish({ existingClientId: ok.match!.id })}
                    className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-ink px-3 py-2 text-[12px] font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
                  >
                    <Link2 size={13} strokeWidth={1.75} className="text-gold" />
                    Vincular y preparar visitas
                  </button>
                </div>
              )}

              {/* Caso 2 · crear cliente con lo que ya sabemos */}
              <div
                className={cn(
                  "rounded-xl border border-ink/10 bg-white/60 p-3.5",
                  ok.match && "opacity-90",
                )}
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ink/50">
                  {ok.match ? "O crear un cliente nuevo" : "Crear cliente"}
                </p>
                <div className="mt-2.5 space-y-2">
                  <input
                    value={effName}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nombre *"
                    className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[12.5px] text-ink focus:border-gold/55 focus:outline-none"
                  />
                  <input
                    value={effEmail}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="Email (opcional)"
                    type="email"
                    className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[12.5px] text-ink focus:border-gold/55 focus:outline-none"
                  />
                  <input
                    value={effPhone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Teléfono (opcional)"
                    className="w-full rounded-lg border border-ink/15 bg-white px-3 py-2 text-[12.5px] text-ink focus:border-gold/55 focus:outline-none"
                  />
                </div>
                {!effEmail.trim() && (
                  <p className="mt-2 text-[10.5px] leading-relaxed text-ink/45">
                    Sin email se creará una dirección interna provisional; se
                    puede corregir después desde la ficha.
                  </p>
                )}
                <button
                  type="button"
                  disabled={pending || !effName.trim()}
                  onClick={() =>
                    finish({
                      newClient: {
                        name: effName,
                        email: effEmail,
                        phone: effPhone,
                      },
                    })
                  }
                  className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-ink/20 bg-white px-3 py-2 text-[12px] font-medium text-ink transition hover:border-gold/55 disabled:opacity-40"
                >
                  {pending ? (
                    <Loader2 size={13} className="animate-spin" />
                  ) : (
                    <UserPlus size={13} strokeWidth={1.75} className="text-gold-dark" />
                  )}
                  Crear cliente y preparar visitas
                </button>
              </div>

              {/* Contexto de propiedad del lead */}
              {ok.property && (
                <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-gold/20 bg-gold/5 px-3.5 py-3">
                  <input
                    type="checkbox"
                    checked={addProperty}
                    onChange={(e) => setAddProperty(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 accent-[#a8814a]"
                  />
                  <span className="text-[12px] leading-snug text-ink/80">
                    Añadir a su selección la propiedad del anuncio:
                    <span className="mt-0.5 block font-medium text-ink">
                      {ok.property.title}
                    </span>
                  </span>
                </label>
              )}

              {error && (
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[12px] text-rose-700">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
