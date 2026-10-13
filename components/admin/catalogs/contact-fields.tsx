"use client";

import type { ContactRole } from "@/lib/catalogs/contact-format";

// Campos del contacto público de un catálogo (BCP-01 ampliación, D19): lo
// que ve quien abre el enlace en la portada y el cierre. Interfaz del admin
// (Lato). La validación real la hace el servidor (y SQL).

export function ContactFields({
  idPrefix,
  name,
  phone,
  role,
  onName,
  onPhone,
  onRole,
  disabled = false,
}: {
  idPrefix: string;
  name: string;
  phone: string;
  role: ContactRole;
  onName: (v: string) => void;
  onPhone: (v: string) => void;
  onRole: (v: ContactRole) => void;
  disabled?: boolean;
}) {
  const input =
    "mt-1 w-full rounded-lg border border-gold/25 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-gold disabled:opacity-60";
  return (
    <fieldset className="space-y-3" disabled={disabled}>
      <legend className="crm-label-sm text-ink/70">Contacto que verá el cliente</legend>
      <div className="flex flex-wrap gap-4 text-sm text-ink/80" role="radiogroup" aria-label="Cómo se presenta">
        {(["asesor", "asesora"] as const).map((r) => (
          <label key={r} className="inline-flex items-center gap-2">
            <input
              type="radio"
              name={`${idPrefix}-role`}
              value={r}
              checked={role === r}
              onChange={() => onRole(r)}
              className="accent-gold"
            />
            {r === "asesor" ? "Tu asesor" : "Tu asesora"}
          </label>
        ))}
      </div>
      <label className="block">
        <span className="text-xs text-ink/60">Nombre</span>
        <input
          id={`${idPrefix}-contact-name`}
          value={name}
          onChange={(e) => onName(e.target.value)}
          maxLength={80}
          required
          autoComplete="off"
          className={input}
        />
      </label>
      <label className="block">
        <span className="text-xs text-ink/60">Teléfono</span>
        <input
          id={`${idPrefix}-contact-phone`}
          value={phone}
          onChange={(e) => onPhone(e.target.value)}
          inputMode="tel"
          required
          autoComplete="off"
          placeholder="+34 600 000 000"
          className={input}
        />
      </label>
      <p className="text-xs text-ink/50">
        Solo cambia lo que se muestra en este catálogo: no da acceso a Mi espacio a nadie.
      </p>
    </fieldset>
  );
}
