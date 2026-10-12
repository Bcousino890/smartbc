"use client";

import { useEffect, useId, useState } from "react";
import { ClipboardPaste, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import {
  PORTAL_LABEL,
  SCRAPER_PORTALS,
  isValidCrawioKey,
  type ScraperControlPayload,
  type ScraperControlUpdate,
  type ScraperPortal,
} from "@/lib/scrapers/control-types";
import { FOCUS_RING, SwitchRow } from "../controls";
import { BTN_PRIMARY, BTN_SECONDARY, Notice, Section, fmt } from "./shared";

type SaveFn = (u: ScraperControlUpdate) => Promise<string | null>;

// ── Interruptores ───────────────────────────────────────────────────────────

export function SwitchesSection({ data, save }: { data: ScraperControlPayload; save: SaveFn }) {
  const { toast } = useToast();
  const s = data.settings;
  const disabled = !data.canEdit || !data.tablesReady;

  async function go(u: NonNullable<ScraperControlUpdate["settings"]>) {
    const err = await save({ settings: u });
    if (err) toast(err, "error");
    else toast("Guardado. El crawler lo aplica en su próxima ronda.", "success");
  }

  return (
    <Section id="interruptores" title="Qué se escanea" description="Lo que apagues aquí el crawler deja de hacerlo en su próxima ronda (en unos minutos).">
      <div className={cn("grid gap-6 md:grid-cols-2", disabled && "pointer-events-none opacity-60")} aria-disabled={disabled}>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-bold text-ink">Idealista</legend>
          <SwitchRow checked={s.idealistaEnabled} onChange={(v) => go({ idealistaEnabled: v })} label="Idealista activo" description="Apagado = no se gasta ni un crédito en Idealista." />
          <SwitchRow
            checked={s.idealistaOperations.sale}
            onChange={(v) => go({ idealistaOperations: { ...s.idealistaOperations, sale: v } })}
            label="Escanear venta"
          />
          <SwitchRow
            checked={s.idealistaOperations.rent}
            onChange={(v) => go({ idealistaOperations: { ...s.idealistaOperations, rent: v } })}
            label="Escanear alquiler"
          />
          <SwitchRow
            checked={s.agenciesEnabled}
            onChange={(v) => go({ agenciesEnabled: v })}
            label="Escanear agencias"
            description="Apagado = solo se vigilan particulares; las agencias solo por su tarjeta (sin ficha ni teléfono) y se ahorran muchos créditos."
          />
        </fieldset>
        <fieldset className="space-y-3">
          <legend className="mb-2 text-sm font-bold text-ink">Fotocasa</legend>
          <SwitchRow checked={s.fotocasaEnabled} onChange={(v) => go({ fotocasaEnabled: v })} label="Fotocasa activo" description="Viene apagado hasta que tú lo actives." />
          <SwitchRow
            checked={s.fotocasaOperations.sale}
            onChange={(v) => go({ fotocasaOperations: { ...s.fotocasaOperations, sale: v } })}
            label="Escanear venta"
          />
          <SwitchRow
            checked={s.fotocasaOperations.rent}
            onChange={(v) => go({ fotocasaOperations: { ...s.fotocasaOperations, rent: v } })}
            label="Escanear alquiler"
          />
        </fieldset>
      </div>
    </Section>
  );
}

// ── Presupuesto ─────────────────────────────────────────────────────────────

const FIELD = "h-11 w-full rounded-xl border border-ink/15 bg-white px-3 text-base text-ink transition focus:border-ink/40 disabled:bg-ink/[0.04]";

export function BudgetSection({ data, save }: { data: ScraperControlPayload; save: SaveFn }) {
  const { toast } = useToast();
  const s = data.settings;
  const [budget, setBudget] = useState(String(s.budgetCredits));
  const [reserve, setReserve] = useState(String(s.reserveCredits));
  const [busy, setBusy] = useState(false);
  const idB = useId();
  const idR = useId();

  // Si cambia desde fuera (otra pestaña, otro usuario) y aquí no hay edición en curso, se sincroniza.
  useEffect(() => {
    setBudget(String(s.budgetCredits));
    setReserve(String(s.reserveCredits));
  }, [s.budgetCredits, s.reserveCredits]);

  const b = Number(budget.replace(/\D/g, ""));
  const r = Number(reserve.replace(/\D/g, ""));
  const dirty = b !== s.budgetCredits || r !== s.reserveCredits;
  const problem =
    !Number.isInteger(b) || b < 10_000 ? "El presupuesto tiene que ser al menos 10.000 créditos." : r >= b ? "La reserva tiene que ser menor que el presupuesto." : null;
  const disabled = !data.canEdit || !data.tablesReady;

  async function onSave() {
    setBusy(true);
    const err = await save({ settings: { budgetCredits: b, reserveCredits: r } });
    setBusy(false);
    toast(err ?? "Presupuesto guardado.", err ? "error" : "success");
  }

  return (
    <Section id="presupuesto" title="Presupuesto mensual de créditos" description="Un solo tope para TODOS los scrapers juntos. El crawler lo vigila y se frena solo antes de pasarse.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={idB} className="mb-1 block text-sm font-medium text-ink">
            Presupuesto del periodo (créditos)
          </label>
          <input id={idB} inputMode="numeric" className={cn(FIELD, FOCUS_RING)} value={budget} disabled={disabled} onChange={(e) => setBudget(e.target.value)} />
        </div>
        <div>
          <label htmlFor={idR} className="mb-1 block text-sm font-medium text-ink">
            Reserva de seguridad (créditos)
          </label>
          <input id={idR} inputMode="numeric" className={cn(FIELD, FOCUS_RING)} value={reserve} disabled={disabled} onChange={(e) => setReserve(e.target.value)} />
        </div>
      </div>

      <ul className="mt-4 space-y-2 text-sm text-ink/80">
        <li>
          <strong>Normal</strong> (hasta {problem ? "…" : fmt(b - r)} créditos): se hace todo.
        </li>
        <li>
          <strong>Ahorro</strong> (de {problem ? "…" : fmt(b - r)} a {problem ? "…" : fmt(b)}): solo lo esencial, para no pasarse.
        </li>
        <li>
          <strong>Pausa</strong> (desde {problem ? "…" : fmt(b)}): no se gasta nada hasta que se renueve el periodo (día {s.billingDay}) o subas el presupuesto.
        </li>
      </ul>
      <p className="mt-2 text-xs text-ink/65">Tu plan de Crawio incluye {fmt(s.planCredits)} créditos al mes; el presupuesto deja margen a propósito.</p>
      {b > s.planCredits && <div className="mt-3"><Notice tone="warn">Este presupuesto es mayor que lo que incluye tu plan: Crawio cobraría el exceso.</Notice></div>}
      {problem && <div className="mt-3"><Notice tone="error">{problem}</Notice></div>}

      <div className="mt-4">
        <button type="button" className={cn(BTN_PRIMARY, FOCUS_RING)} disabled={disabled || busy || !dirty || !!problem} onClick={onSave}>
          {busy ? "Guardando…" : "Guardar presupuesto"}
        </button>
      </div>
    </Section>
  );
}

// ── Claves de Crawio ────────────────────────────────────────────────────────

function KeyCard({ portal, data, save, suggested }: { portal: ScraperPortal; data: ScraperControlPayload; save: SaveFn; suggested: number }) {
  const { toast } = useToast();
  const info = data.keys[portal];
  const [key, setKey] = useState("");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const idK = useId();
  const idL = useId();
  const disabled = !data.canEdit || !data.tablesReady;
  const trimmed = key.trim();
  const invalid = trimmed.length > 0 && !isValidCrawioKey(trimmed);

  async function paste() {
    try {
      const t = (await navigator.clipboard.readText()).trim();
      if (t) setKey(t);
      else toast("El portapapeles está vacío.", "warning");
    } catch {
      toast("El navegador no deja leer el portapapeles: pega la clave a mano en el campo.", "warning");
    }
  }

  async function onSave() {
    setBusy(true);
    const err = await save({ keys: { [portal]: { key: trimmed, ...(label.trim() ? { label: label.trim() } : {}) } } });
    setBusy(false);
    if (err) {
      toast(err, "error");
      return;
    }
    // La clave ya no se queda en memoria de la pantalla: solo se ve su pista.
    setKey("");
    setLabel("");
    toast(`Clave de ${PORTAL_LABEL[portal]} guardada.`, "success");
  }

  return (
    <div className="rounded-xl border border-ink/10 bg-cream-50/60 p-4">
      <h4 className="flex items-center gap-2 text-base font-bold text-ink">
        <KeyRound size={16} aria-hidden="true" />
        {PORTAL_LABEL[portal]}
      </h4>
      <p className="mt-1 text-sm text-ink/80">
        {info.configured ? (
          <>
            Configurada: <strong>sí</strong> · <span className="font-mono">{info.hint}</span> · «{info.label}»
          </>
        ) : (
          <>
            Configurada: <strong>no</strong> — el crawler usa la clave de su propio fichero de configuración.
          </>
        )}
      </p>

      <div className="mt-3 space-y-3">
        <div>
          <label htmlFor={idK} className="mb-1 block text-sm font-medium text-ink">
            {info.configured ? "Cambiar clave" : "Clave de Crawio"}
          </label>
          <div className="flex gap-2">
            <input
              id={idK}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="rk-…"
              value={key}
              disabled={disabled}
              aria-invalid={invalid}
              aria-describedby={invalid ? `${idK}-err` : undefined}
              onChange={(e) => setKey(e.target.value)}
              className={cn(FIELD, "min-w-0 font-mono", FOCUS_RING)}
            />
            <button type="button" onClick={paste} disabled={disabled} className={cn(BTN_SECONDARY, "shrink-0", FOCUS_RING)}>
              <ClipboardPaste size={16} aria-hidden="true" />
              <span className="hidden sm:inline">Pegar clave</span>
              <span className="sr-only sm:hidden">Pegar clave</span>
            </button>
          </div>
          {invalid && (
            <p id={`${idK}-err`} className="mt-1 text-sm text-red-700">
              No parece una clave de Crawio: tiene que empezar por «rk-» y no llevar espacios.
            </p>
          )}
        </div>
        <div>
          <label htmlFor={idL} className="mb-1 block text-sm font-medium text-ink">
            Nombre (para reconocerla)
          </label>
          <input
            id={idL}
            maxLength={40}
            placeholder={info.label ?? PORTAL_LABEL[portal]}
            value={label}
            disabled={disabled}
            onChange={(e) => setLabel(e.target.value)}
            className={cn(FIELD, FOCUS_RING)}
          />
        </div>
        <button type="button" onClick={onSave} disabled={disabled || busy || !trimmed || invalid} className={cn(BTN_PRIMARY, FOCUS_RING)}>
          {busy ? "Guardando…" : "Guardar clave"}
        </button>
      </div>

      <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm text-ink/80 ring-1 ring-ink/10">
        En <strong>crawio.com</strong>, pon a esta clave un límite de unos <strong>{fmt(suggested)} créditos al mes</strong>. Es un freno extra por si algo falla.
      </p>
    </div>
  );
}

export function KeysSection({ data, save }: { data: ScraperControlPayload; save: SaveFn }) {
  // Fotocasa gasta poco (≈15.000 créditos/mes con el radar): límite de 20.000; Idealista, el resto del presupuesto.
  const fotocasa = 20_000;
  const idealista = Math.max(data.settings.budgetCredits - fotocasa, 10_000);
  return (
    <Section
      id="claves"
      title="Claves de Crawio"
      description="Cada portal puede usar su propia clave, así Crawio te muestra el gasto por separado. La clave se guarda en el servidor y nunca vuelve a mostrarse entera."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {SCRAPER_PORTALS.map((p) => (
          <KeyCard key={p} portal={p} data={data} save={save} suggested={p === "idealista" ? idealista : fotocasa} />
        ))}
      </div>
    </Section>
  );
}
