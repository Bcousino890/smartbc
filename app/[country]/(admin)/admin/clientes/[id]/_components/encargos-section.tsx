"use client";

// ============================================================================
// ENCARGOS — lo que busca el cliente, cuando busca más de una cosa (solo España).
//
// Un cliente puede tener N encargos (filas de `client_preferences`): una
// colaboradora con un encargo por cliente suyo, un cliente que busca un piso
// para él y otro para su hijo… Cada uno tiene su matching y sus avisos. Aquí se
// listan y se gestionan: crear, editar, pausar, cerrar, reactivar y «hacer
// principal». El principal no se pausa ni se cierra (lo usan el portal del
// cliente, el correo de novedades y Captaciones): primero se hace principal
// otro.
//
// Con un solo encargo la sección es una fila y un botón para añadir otro: la
// ficha se siente como antes.
//
// El formulario es el MISMO de siempre (EncargoForm), con el nombre del
// encargo y el cliente final arriba. El perfil del cliente no se pregunta
// aquí: es del cliente, no del encargo, y se edita en «Editar encargo».
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CirclePause, CircleX, Pencil, Plus, Search, Star } from "lucide-react";
import { EncargoForm, type EncargoMeta } from "@/components/admin/clientes/encargo/encargo-form";
import { EMPTY_BRIEF, type BriefInput } from "@/lib/clients/brief";
import type { Encargo, EncargoStatus } from "@/lib/encargos/model";
import { ENCARGO_STATUS_LABEL, encargoActions, encargoSummary } from "@/lib/encargos/ui-state";
import {
  createEncargoAction,
  makePrimaryAction,
  setEncargoStatusAction,
  updateEncargoAction,
} from "../encargos-actions";
import { Button, Modal, Panel, Pill, type Tone } from "./ui";

const STATUS_TONE: Record<EncargoStatus, Tone> = {
  active: "positive",
  paused: "warning",
  closed: "neutral",
};

const STATUS_ICON: Record<EncargoStatus, React.ReactNode> = {
  active: <CheckCircle2 size={11} aria-hidden />,
  paused: <CirclePause size={11} aria-hidden />,
  closed: <CircleX size={11} aria-hidden />,
};

export function EncargosSection({
  clientId,
  encargos,
  selectedId,
  canEdit,
  onShowMatching,
  initialEditId = null,
  onEditClosed,
}: {
  clientId: string;
  encargos: Encargo[];
  /** El encargo que enseña ahora el matching (Propiedades). */
  selectedId: string | null;
  canEdit: boolean;
  onShowMatching: (encargoId: string) => void;
  /** `?editar=<id>` (desde Captaciones): abre directamente el diálogo de ese encargo. */
  initialEditId?: string | null;
  /** Al cerrar ese diálogo (la ficha quita `editar` de la URL). */
  onEditClosed?: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Encargo | "new" | null>(() =>
    canEdit && initialEditId ? (encargos.find((e) => e.id === initialEditId) ?? null) : null,
  );
  const [closing, setClosing] = useState<Encargo | null>(null);

  const run = (encargoId: string, action: () => Promise<{ ok: boolean; error?: string }>) => {
    setError(null);
    setBusy(encargoId);
    startTransition(async () => {
      try {
        const r = await action();
        if (!r.ok) setError(r.error ?? "No se pudo guardar el cambio.");
        else router.refresh();
      } catch {
        setError("No se pudo guardar el cambio. Inténtalo de nuevo.");
      } finally {
        setBusy(null);
      }
    });
  };

  const several = encargos.length > 1;

  return (
    <Panel
      title="Encargos"
      count={several ? encargos.length : null}
      action={
        canEdit ? (
          <Button size="sm" variant="secondary" onClick={() => setEditing("new")}>
            <Plus size={12} aria-hidden />
            Nuevo encargo
          </Button>
        ) : null
      }
      dense
    >
      {error && (
        <p role="alert" className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}

      <ul className="divide-y divide-ink/8">
        {encargos.map((e) => (
          <EncargoRow
            key={e.id}
            encargo={e}
            selected={several && e.id === selectedId}
            solo={!several}
            canEdit={canEdit}
            busy={busy === e.id}
            disabled={busy !== null}
            onEdit={() => setEditing(e)}
            onShowMatching={() => onShowMatching(e.id)}
            onStatus={(next) => {
              if (next === "closed") setClosing(e);
              else run(e.id, () => setEncargoStatusAction(e.id, next));
            }}
            onMakePrimary={() => run(e.id, () => makePrimaryAction(e.id))}
          />
        ))}
      </ul>

      {!several && canEdit && (
        <p className="border-t border-ink/8 px-4 py-2.5 text-xs text-ink/50">
          ¿Busca algo más (otro piso, para un familiar, para un cliente suyo)? Añade otro encargo: cada uno
          tiene su propio matching y sus avisos.
        </p>
      )}

      {editing && (
        <EncargoDialog
          clientId={clientId}
          encargo={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
            onEditClosed?.();
          }}
        />
      )}

      {closing && (
        <Modal
          open
          onClose={() => setClosing(null)}
          title={`Cerrar «${closing.label}»`}
          footer={
            <>
              <Button onClick={() => setClosing(null)}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={() => {
                  const e = closing;
                  setClosing(null);
                  run(e.id, () => setEncargoStatusAction(e.id, "closed"));
                }}
              >
                Cerrar encargo
              </Button>
            </>
          }
        >
          <p className="text-sm text-ink/70">
            Deja de buscar y de avisar para este encargo. Lo ya encontrado no se borra y puedes reactivarlo
            cuando quieras.
          </p>
        </Modal>
      )}
    </Panel>
  );
}

function EncargoRow({
  encargo: e,
  selected,
  solo,
  canEdit,
  busy,
  disabled,
  onEdit,
  onShowMatching,
  onStatus,
  onMakePrimary,
}: {
  encargo: Encargo;
  selected: boolean;
  /** Único encargo (el principal): sin pausar/cerrar, que no se podría. */
  solo: boolean;
  canEdit: boolean;
  busy: boolean;
  disabled: boolean;
  onEdit: () => void;
  onShowMatching: () => void;
  onStatus: (next: EncargoStatus) => void;
  onMakePrimary: () => void;
}) {
  const a = encargoActions(e);
  const lockedId = `encargo-locked-${e.id}`;
  const summary = encargoSummary(e.brief);

  return (
    <li
      aria-busy={busy || undefined}
      className={selected ? "border-s-2 border-gold bg-gold/[0.04] px-4 py-3" : "px-4 py-3"}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="text-sm font-semibold text-ink">{e.label || "Encargo sin nombre"}</h3>
            {e.isPrimary && (
              <Pill tone="gold" icon={<Star size={10} className="fill-current" aria-hidden />}>
                Principal
              </Pill>
            )}
            <Pill tone={STATUS_TONE[e.status]} icon={STATUS_ICON[e.status]}>
              {ENCARGO_STATUS_LABEL[e.status]}
            </Pill>
            {selected && <span className="text-xs text-ink/50">· en el matching</span>}
          </div>
          {e.endClientLabel && (
            <p className="mt-0.5 text-xs text-ink/60">
              Cliente final: <span className="text-ink/80">{e.endClientLabel}</span>
            </p>
          )}
          <p className="mt-1 text-xs text-ink/55">{summary}</p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="secondary" onClick={onShowMatching} disabled={disabled}>
            <Search size={12} aria-hidden />
            Ver matching
          </Button>
          {canEdit && (
            <>
              <Button size="sm" variant="secondary" onClick={onEdit} disabled={disabled}>
                <Pencil size={11} aria-hidden />
                Editar
              </Button>
              {solo ? null : a.canReactivate ? (
                <Button size="sm" variant="secondary" onClick={() => onStatus("active")} disabled={disabled}>
                  Reactivar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onStatus("paused")}
                  disabled={disabled || !a.canPause}
                  aria-describedby={a.lockedReason ? lockedId : undefined}
                >
                  Pausar
                </Button>
              )}
              {!solo && (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onStatus("closed")}
                  disabled={disabled || !a.canClose}
                  aria-describedby={a.lockedReason ? lockedId : undefined}
                >
                  Cerrar
                </Button>
              )}
              {!e.isPrimary && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={onMakePrimary}
                  disabled={disabled || !a.canMakePrimary}
                  title={a.canMakePrimary ? undefined : "Solo un encargo activo puede ser el principal"}
                >
                  <Star size={11} aria-hidden />
                  Hacer principal
                </Button>
              )}
            </>
          )}
        </div>
      </div>
      {canEdit && !solo && a.lockedReason && (
        <p id={lockedId} className="mt-1.5 text-xs text-ink/45">
          {a.lockedReason}
        </p>
      )}
    </li>
  );
}

/** Crear o editar un encargo con el formulario de siempre, más su nombre y el cliente final. */
function EncargoDialog({
  clientId,
  encargo,
  onClose,
}: {
  clientId: string;
  encargo: Encargo | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [valid, setValid] = useState(true);
  const [brief, setBrief] = useState<BriefInput>(() =>
    encargo ? encargo.brief : { ...EMPTY_BRIEF, operation: "rent", stay: "long" },
  );
  const [meta, setMeta] = useState<EncargoMeta>({
    label: encargo?.label ?? "",
    endClientLabel: encargo?.endClientLabel ?? "",
  });

  const save = () => {
    setError(null);
    const label = meta.label.trim();
    if (!label) {
      setError("El encargo necesita un nombre.");
      return;
    }
    const endClientLabel = meta.endClientLabel.trim() || null;
    startSave(async () => {
      try {
        const r = encargo
          ? // El servidor compara el brief con el guardado (normalizado): solo si
            // cambió vuelve a mirar el stock; renombrar no lo dispara.
            await updateEncargoAction(encargo.id, { label, endClientLabel, brief })
          : await createEncargoAction(clientId, { label, endClientLabel, brief });
        if (!r.ok) {
          setError(r.error);
          return;
        }
        router.refresh();
        onClose();
      } catch {
        setError("No se pudo guardar el encargo. Inténtalo de nuevo.");
      }
    });
  };

  // Mientras guarda no se cierra (Esc, Cancelar o fondo): el resultado se perdería.
  const close = () => {
    if (!saving) onClose();
  };

  return (
    <Modal
      open
      wide
      onClose={close}
      title={encargo ? `Editar «${encargo.label}»` : "Nuevo encargo"}
      footer={
        <>
          {error && (
            <p role="alert" className="me-auto text-xs text-rose-600">
              {error}
            </p>
          )}
          {!error && !valid && (
            <p className="me-auto text-xs text-amber-800">Revisa el tope por dormitorios para poder guardar.</p>
          )}
          <Button onClick={close} disabled={saving}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={save} disabled={saving || !valid}>
            {saving ? "Guardando…" : encargo ? "Guardar cambios" : "Crear encargo"}
          </Button>
        </>
      }
    >
      <EncargoForm
        value={brief}
        onChange={setBrief}
        meta={meta}
        onMetaChange={setMeta}
        onValidityChange={setValid}
        country="es"
        disabled={saving}
      />
      {!encargo && (
        <p className="mt-4 border-t border-ink/8 pt-3 text-xs text-ink/50">
          Al crearlo se mira todo el stock actual y el equipo recibe un solo aviso con lo que ya encaja.
        </p>
      )}
    </Modal>
  );
}

/**
 * Qué encargo enseña el matching (pestaña Propiedades). Solo con dos o más
 * encargos: con uno, la pestaña es la de siempre. Cambia `?encargo=` en la URL
 * (el resto del estado se conserva), así que se puede enlazar y volver atrás.
 */
export function EncargoSelector({
  encargos,
  selectedId,
  pending,
  onSelect,
}: {
  encargos: Encargo[];
  selectedId: string | null;
  pending: boolean;
  onSelect: (encargoId: string) => void;
}) {
  if (encargos.length < 2) return null;
  return (
    <nav aria-label="Encargo del matching" aria-busy={pending || undefined} className="min-w-0">
      <p className="crm-label-sm mb-1.5 text-ink/50">Buscando para el encargo</p>
      <ul className="flex flex-wrap gap-1.5">
        {encargos.map((e) => {
          const on = e.id === selectedId;
          return (
            <li key={e.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => !on && onSelect(e.id)}
                className={
                  "inline-flex max-w-[260px] items-center gap-1.5 rounded-md border px-3 py-2 text-sm transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold " +
                  (on
                    ? "border-ink bg-ink text-cream-50"
                    : "border-ink/15 bg-white text-ink/75 hover:border-gold/50 hover:text-ink")
                }
              >
                {e.isPrimary && (
                  <>
                    <Star size={11} className="shrink-0 fill-current" aria-hidden />
                    <span className="sr-only">Principal:</span>
                  </>
                )}
                <span className="truncate">{e.label || "Encargo sin nombre"}</span>
                {e.status !== "active" && (
                  <span className={on ? "shrink-0 text-cream-50/75" : "shrink-0 text-ink/45"}>
                    · {ENCARGO_STATUS_LABEL[e.status]}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
