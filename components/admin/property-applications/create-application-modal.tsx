"use client";

import { useState, useEffect, useRef } from "react";
import {
  X,
  Search,
  Plus,
  Loader2,
  CheckCircle2,
  User,
  Home,
  Building2,
  Mail,
  Phone,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

type ClientResult = {
  id: string;
  full_name: string | null;
  email: string;
  phone: string | null;
  role: string;
  avatar_url: string | null;
};

type PropertyResult = {
  id: string;
  title: string;
  address: string | null;
  bc_reference: string | null;
  price: number | null;
  operation: string | null;
};

type Step = "client" | "credentials" | "details" | "success";

type Props = {
  onClose: () => void;
  onCreated: () => void;
};

function Toggle({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; icon?: React.ReactNode }[];
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-ink/10 bg-white/70 p-1">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium transition",
            value === opt.value
              ? "bg-ink text-cream-50 shadow-sm"
              : "text-ink/65 hover:text-ink",
          )}
        >
          {opt.icon}
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="rounded p-1 text-ink/40 transition hover:text-ink"
      title="Copiar"
    >
      {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
    </button>
  );
}

export function CreateApplicationModal({ onClose, onCreated }: Props) {
  const [step, setStep] = useState<Step>("client");

  // Step 1: client search
  const [clientQuery, setClientQuery] = useState("");
  const [clientResults, setClientResults] = useState<ClientResult[]>([]);
  const [propertyMatchResults, setPropertyMatchResults] = useState<PropertyResult[]>([]);
  const [clientLoading, setClientLoading] = useState(false);
  const [clientSearched, setClientSearched] = useState(false);
  const [selectedClient, setSelectedClient] = useState<ClientResult | null>(null);

  // Inline create form
  const [showInlineCreate, setShowInlineCreate] = useState(false);
  const [newFirstName, setNewFirstName] = useState("");
  const [newLastName, setNewLastName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState<"client" | "owner">("client");
  const [creatingUser, setCreatingUser] = useState(false);

  // Generated credentials
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  // Step 2: details
  const [country, setCountry] = useState<"ES" | "CL">("ES");
  const [operation, setOperation] = useState<"rent" | "sale">("rent");
  const [propertyQuery, setPropertyQuery] = useState("");
  const [propertyResults, setPropertyResults] = useState<PropertyResult[]>([]);
  const [propertyLoading, setPropertyLoading] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState<PropertyResult | null>(null);
  const [showPropertyDropdown, setShowPropertyDropdown] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const propertySearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search clients (and properties by reference code simultaneously)
  useEffect(() => {
    if (clientSearchTimeout.current) clearTimeout(clientSearchTimeout.current);
    if (!clientQuery.trim()) {
      setClientResults([]);
      setPropertyMatchResults([]);
      setClientSearched(false);
      return;
    }
    clientSearchTimeout.current = setTimeout(async () => {
      setClientLoading(true);
      try {
        const [clientRes, propRes] = await Promise.all([
          fetch(`/api/admin/clientes/search?q=${encodeURIComponent(clientQuery)}`),
          fetch(`/api/admin/properties/search?q=${encodeURIComponent(clientQuery)}`),
        ]);
        const clientJson = await clientRes.json();
        const propJson = await propRes.json();
        setClientResults(clientJson.data ?? []);
        setPropertyMatchResults(propJson.data ?? []);
        setClientSearched(true);
        setShowInlineCreate(false);
      } finally {
        setClientLoading(false);
      }
    }, 300);
  }, [clientQuery]);

  // Search properties
  useEffect(() => {
    if (propertySearchTimeout.current) clearTimeout(propertySearchTimeout.current);
    if (!propertyQuery.trim()) {
      setPropertyResults([]);
      return;
    }
    propertySearchTimeout.current = setTimeout(async () => {
      setPropertyLoading(true);
      try {
        const res = await fetch(`/api/admin/properties/search?q=${encodeURIComponent(propertyQuery)}`);
        const json = await res.json();
        setPropertyResults(json.data ?? []);
        setShowPropertyDropdown(true);
      } finally {
        setPropertyLoading(false);
      }
    }, 300);
  }, [propertyQuery]);

  function openInlineCreate(role: "client" | "owner") {
    setNewRole(role);
    setNewEmail(clientQuery.includes("@") ? clientQuery : "");
    setNewFirstName("");
    setNewLastName("");
    setNewPhone("");
    setShowInlineCreate(true);
    setError(null);
  }

  async function handleCreateNewUser() {
    if (!newFirstName) {
      setError("El nombre es obligatorio");
      return;
    }
    setError(null);
    setCreatingUser(true);
    try {
      const res = await fetch("/api/admin/usuarios/create-with-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: newEmail,
          firstName: newFirstName,
          lastName: newLastName,
          phone: newPhone || undefined,
          role: newRole,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Error creando usuario");
        return;
      }
      setSelectedClient({
        id: json.userId,
        full_name: `${newFirstName} ${newLastName}`.trim(),
        email: newEmail,
        phone: newPhone || null,
        role: newRole,
        avatar_url: null,
      });
      setGeneratedPassword(json.password);
      setStep("credentials");
    } catch {
      setError("Error de conexión");
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleSubmit() {
    if (!selectedClient) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/property-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: selectedClient.id,
          country,
          operation,
          property_id: selectedProperty?.id,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Error creando solicitud");
        return;
      }
      setStep("success");
      setTimeout(() => { onCreated(); }, 1800);
    } catch {
      setError("Error de conexión");
    } finally {
      setSubmitting(false);
    }
  }

  const stepLabel =
    step === "client" ? "Paso 1 de 2 — Selecciona o crea el acceso"
    : step === "credentials" ? "Acceso creado — Guarda las credenciales"
    : step === "details" ? "Paso 2 de 2 — Detalles de la solicitud"
    : "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-cream-50 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-ink/10 px-6 py-4">
          <div>
            <h2 className="font-serif text-lg text-ink">Nueva Solicitud de Documentación</h2>
            <p className="text-xs text-ink/50">{stepLabel}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-ink/40 transition hover:bg-ink/5 hover:text-ink">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">

          {/* ── Success ── */}
          {step === "success" && (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 size={40} className="text-green-500" />
              <p className="font-medium text-ink">¡Solicitud creada!</p>
              <p className="text-sm text-ink/50">Se ha creado la solicitud en estado borrador.</p>
            </div>
          )}

          {/* ── Credentials ── */}
          {step === "credentials" && selectedClient && (
            <div className="space-y-4">
              <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                <p className="mb-1 text-xs font-semibold text-green-700">✓ Acceso creado correctamente</p>
                <p className="text-sm text-ink/70">Comparte estas credenciales con el usuario:</p>
              </div>
              <div className="space-y-2 rounded-xl border border-ink/10 bg-white p-4 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-ink/50">Email</span>
                  {selectedClient.email.includes("@interno.smartbc.local") ? (
                    <span className="text-xs italic text-ink/40">Sin email — acceso solo por contraseña</span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-ink">{selectedClient.email}</span>
                      <CopyButton text={selectedClient.email} />
                    </div>
                  )}
                </div>
                <div className="border-t border-ink/5" />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-ink/50">Contraseña</span>
                  <div className="flex items-center gap-1">
                    <span className="font-mono text-ink">{generatedPassword}</span>
                    <CopyButton text={generatedPassword ?? ""} />
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-ink/40">El usuario puede cambiar su contraseña desde el portal una vez que inicie sesión.</p>
              <div className="flex justify-end">
                <button
                  onClick={() => setStep("details")}
                  className="rounded-xl bg-ink px-5 py-2 text-sm text-cream-50 transition hover:bg-ink/80"
                >
                  Continuar con la solicitud →
                </button>
              </div>
            </div>
          )}

          {/* ── Step 1: client ── */}
          {step === "client" && (
            <div className="space-y-4">
              {/* Search input */}
              {!showInlineCreate && (
                <div className="space-y-3">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
                    <input
                      autoFocus
                      type="text"
                      placeholder="Buscar cliente, propietario o ref. de propiedad (ej: BC-1074)..."
                      value={clientQuery}
                      onChange={(e) => { setClientQuery(e.target.value); setSelectedClient(null); }}
                      className="w-full rounded-xl border border-ink/15 bg-white/80 py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-1 focus:ring-gold"
                    />
                    {clientLoading && (
                      <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink/30" />
                    )}
                  </div>

                  {/* Client results */}
                  {clientResults.length > 0 && (
                    <div className="max-h-52 overflow-y-auto rounded-xl border border-ink/10 bg-white shadow-sm">
                      {clientResults.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => { setSelectedClient(c); setClientQuery(""); setClientResults([]); setPropertyMatchResults([]); setClientSearched(false); }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-cream-50/80"
                        >
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink/10 text-xs font-semibold text-ink/60">
                            {(c.full_name ?? c.email)[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-ink">{c.full_name ?? "—"}</p>
                            <p className="truncate text-xs text-ink/45">{c.email}</p>
                          </div>
                          <span className={cn(
                            "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                            c.role === "client" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                          )}>
                            {c.role === "client" ? "Cliente" : "Propietario"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Property matches — shown alongside or when no client found */}
                  {propertyMatchResults.length > 0 && (
                    <div className="rounded-xl border border-ink/10 bg-white shadow-sm">
                      <p className="border-b border-ink/5 px-4 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink/40">
                        Propiedades encontradas — click para pre-seleccionar
                      </p>
                      {propertyMatchResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            setSelectedProperty(p);
                            // auto-set operation based on property
                            if (p.operation === "rent") setOperation("rent");
                            if (p.operation === "sale") setOperation("sale");
                            setClientQuery("");
                            setPropertyMatchResults([]);
                            setClientSearched(false);
                          }}
                          className={cn(
                            "flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-cream-50/80",
                            selectedProperty?.id === p.id && "bg-green-50"
                          )}
                        >
                          <Home size={14} className="shrink-0 text-ink/40" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="truncate text-sm text-ink">{p.title}</p>
                              {p.bc_reference && (
                                <span className="shrink-0 rounded bg-ink/8 px-1.5 py-0.5 font-mono text-[10px] text-ink/60">{p.bc_reference}</span>
                              )}
                            </div>
                            {p.address && <p className="truncate text-[11px] text-ink/40">{p.address}</p>}
                          </div>
                          {selectedProperty?.id === p.id && <Check size={13} className="shrink-0 text-green-600" />}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* No results → quick create buttons */}
                  {clientSearched && !clientLoading && clientResults.length === 0 && propertyMatchResults.length === 0 && (
                    <div className="rounded-xl border border-dashed border-ink/15 bg-white/50 p-4">
                      <p className="mb-3 text-center text-xs text-ink/50">
                        No se encontró ningún usuario ni propiedad con &quot;{clientQuery}&quot;
                      </p>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openInlineCreate("client")}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition hover:bg-blue-100"
                        >
                          <Plus size={12} />
                          <User size={12} />
                          Crear cliente
                        </button>
                        <button
                          type="button"
                          onClick={() => openInlineCreate("owner")}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 transition hover:bg-amber-100"
                        >
                          <Plus size={12} />
                          <Building2 size={12} />
                          Crear propietario
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Selected property preview (when pre-selected from search) */}
                  {selectedProperty && !selectedClient && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
                        <Home size={13} className="shrink-0 text-amber-500" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-medium text-amber-700">Propiedad pre-seleccionada</p>
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-xs text-ink/70">{selectedProperty.title}</p>
                            {selectedProperty.bc_reference && (
                              <span className="shrink-0 rounded bg-amber-200 px-1.5 py-0.5 font-mono text-[10px] text-amber-800">{selectedProperty.bc_reference}</span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => setSelectedProperty(null)} className="text-amber-400 hover:text-amber-700">
                          <X size={13} />
                        </button>
                      </div>
                      <p className="flex items-center gap-1.5 text-xs text-ink/50">
                        <Search size={11} />
                        Ahora busca o crea el cliente para poder continuar
                      </p>
                    </div>
                  )}

                  {/* Selected client pill */}
                  {selectedClient && (
                    <div className="flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-200 text-xs font-semibold text-green-800">
                        {(selectedClient.full_name ?? selectedClient.email)[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{selectedClient.full_name ?? "—"}</p>
                        <p className="truncate text-xs text-ink/45">{selectedClient.email}</p>
                      </div>
                      <button onClick={() => setSelectedClient(null)} className="ml-auto text-ink/30 hover:text-ink">
                        <X size={14} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Inline create form */}
              {showInlineCreate && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className={cn(
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      newRole === "client" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                    )}>
                      {newRole === "client" ? "Nuevo cliente" : "Nuevo propietario"}
                    </span>
                    <button
                      type="button"
                      onClick={() => { setShowInlineCreate(false); setError(null); }}
                      className="text-xs text-ink/40 hover:text-ink"
                    >
                      ← Volver a buscar
                    </button>
                  </div>

                  <p className="text-xs text-ink/50">
                    Se generará una contraseña automáticamente. Podrás verla antes de continuar.
                  </p>

                  {/* Role switch */}
                  <Toggle
                    value={newRole}
                    onChange={(v) => setNewRole(v as "client" | "owner")}
                    options={[
                      { value: "client", label: "Cliente", icon: <User size={11} /> },
                      { value: "owner", label: "Propietario", icon: <Building2 size={11} /> },
                    ]}
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-ink/60">Nombre *</label>
                      <input
                        autoFocus
                        type="text"
                        value={newFirstName}
                        onChange={(e) => setNewFirstName(e.target.value)}
                        placeholder="Juan"
                        className="w-full rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-1 focus:ring-gold"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] font-medium text-ink/60">Apellido</label>
                      <input
                        type="text"
                        value={newLastName}
                        onChange={(e) => setNewLastName(e.target.value)}
                        placeholder="García"
                        className="w-full rounded-xl border border-ink/15 bg-white/80 px-3 py-2 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-1 focus:ring-gold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-ink/60">Email</label>
                    <div className="relative">
                      <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
                      <input
                        type="email"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="juan@ejemplo.com"
                        className="w-full rounded-xl border border-ink/15 bg-white/80 py-2 pl-8 pr-3 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-1 focus:ring-gold"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-[11px] font-medium text-ink/60">Teléfono</label>
                    <div className="relative">
                      <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
                      <input
                        type="tel"
                        value={newPhone}
                        onChange={(e) => setNewPhone(e.target.value)}
                        placeholder="+34 600 000 000"
                        className="w-full rounded-xl border border-ink/15 bg-white/80 py-2 pl-8 pr-3 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-1 focus:ring-gold"
                      />
                    </div>
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex justify-end gap-2 pt-1">
                <button
                  onClick={onClose}
                  className="rounded-xl border border-ink/15 px-4 py-2 text-sm text-ink/60 transition hover:text-ink"
                >
                  Cancelar
                </button>
                {showInlineCreate ? (
                  <button
                    onClick={handleCreateNewUser}
                    disabled={creatingUser || !newFirstName}
                    className="flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2 text-sm text-cream-50 transition hover:bg-ink/80 disabled:opacity-40"
                  >
                    {creatingUser && <Loader2 size={13} className="animate-spin" />}
                    Crear acceso y ver contraseña
                  </button>
                ) : (
                  <button
                    onClick={() => { setError(null); setStep("details"); }}
                    disabled={!selectedClient}
                    className="rounded-xl bg-ink px-4 py-2 text-sm text-cream-50 transition hover:bg-ink/80 disabled:opacity-40"
                  >
                    Continuar
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── Step 2: details ── */}
          {step === "details" && (
            <div className="space-y-5">
              {/* Selected client pill */}
              {selectedClient && (
                <div className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-4 py-2.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink/10 text-xs font-semibold text-ink/60">
                    {(selectedClient.full_name ?? selectedClient.email)[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{selectedClient.full_name ?? selectedClient.email}</p>
                    <p className="truncate text-[11px] text-ink/40">{selectedClient.email}</p>
                  </div>
                  <button
                    onClick={() => { setStep("client"); setSelectedClient(null); setGeneratedPassword(null); }}
                    className="ml-auto text-xs text-ink/30 hover:text-ink"
                  >
                    cambiar
                  </button>
                </div>
              )}

              {/* Country */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-ink/60">País</label>
                <Toggle
                  value={country}
                  onChange={(v) => setCountry(v as "ES" | "CL")}
                  options={[
                    { value: "ES", label: "🇪🇸 España" },
                    { value: "CL", label: "🇨🇱 Chile" },
                  ]}
                />
              </div>

              {/* Operation */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-ink/60">Tipo de operación</label>
                <Toggle
                  value={operation}
                  onChange={(v) => setOperation(v as "rent" | "sale")}
                  options={[
                    { value: "rent", label: "Alquiler", icon: <Home size={11} /> },
                    { value: "sale", label: "Compra", icon: <Building2 size={11} /> },
                  ]}
                />
              </div>

              {/* Property (optional) */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium text-ink/60">Propiedad (opcional)</label>
                {selectedProperty ? (
                  <div className="flex items-center gap-2 rounded-xl border border-ink/10 bg-white/60 px-4 py-2.5">
                    <Home size={14} className="shrink-0 text-ink/40" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm text-ink">{selectedProperty.title}</p>
                        {selectedProperty.bc_reference && (
                          <span className="shrink-0 rounded bg-ink/8 px-1.5 py-0.5 font-mono text-[10px] text-ink/60">{selectedProperty.bc_reference}</span>
                        )}
                      </div>
                    </div>
                    <button onClick={() => { setSelectedProperty(null); setPropertyQuery(""); }} className="ml-auto text-ink/30 hover:text-ink">
                      <X size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40" />
                    <input
                      type="text"
                      placeholder="Buscar por nombre, cód. referencia o dirección..."
                      value={propertyQuery}
                      onChange={(e) => { setPropertyQuery(e.target.value); setShowPropertyDropdown(true); }}
                      onFocus={() => propertyResults.length > 0 && setShowPropertyDropdown(true)}
                      className="w-full rounded-xl border border-ink/15 bg-white/80 py-2.5 pl-9 pr-4 text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:ring-1 focus:ring-gold"
                    />
                    {propertyLoading && (
                      <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-ink/30" />
                    )}
                    {showPropertyDropdown && propertyResults.length > 0 && (
                      <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-44 overflow-y-auto rounded-xl border border-ink/10 bg-white shadow-lg">
                        {propertyResults.map((p) => (
                          <button
                            key={p.id}
                            type="button"
                            onClick={() => { setSelectedProperty(p); setPropertyQuery(""); setShowPropertyDropdown(false); }}
                            className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-cream-50/80"
                          >
                            <Home size={13} className="shrink-0 text-ink/40" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <p className="truncate text-sm text-ink">{p.title}</p>
                                {p.bc_reference && (
                                  <span className="shrink-0 rounded bg-ink/8 px-1.5 py-0.5 font-mono text-[10px] text-ink/60">{p.bc_reference}</span>
                                )}
                              </div>
                              {p.address && <p className="truncate text-[11px] text-ink/40">{p.address}</p>}
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {error && <p className="text-xs text-red-600">{error}</p>}

              <div className="flex justify-between gap-2 pt-1">
                <button
                  onClick={() => setStep(generatedPassword ? "credentials" : "client")}
                  className="rounded-xl border border-ink/15 px-4 py-2 text-sm text-ink/60 transition hover:text-ink"
                >
                  Atrás
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex items-center gap-1.5 rounded-xl bg-ink px-5 py-2 text-sm text-cream-50 transition hover:bg-ink/80 disabled:opacity-40"
                >
                  {submitting && <Loader2 size={13} className="animate-spin" />}
                  <Plus size={13} />
                  Crear solicitud
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
