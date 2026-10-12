"use client";

import { useCallback, useEffect, useState } from "react";
import { assignParticular, createPropertyFromParticular, setParticularActive } from "../actions";
import { prefetchParticularDetail } from "../detail-cache";
import type { ParticularChangeRow, ParticularRow, StaffOption } from "../particulares-types";

type Callbacks = {
  onPhoneUpdated?: (newPhone: string | null) => void;
  onAssigned?: (advisorId: string | null, advisorName: string | null) => void;
  onActiveChanged?: (active: boolean, takenDownAt: string | null) => void;
  staffOptions: StaffOption[];
};

/**
 * Estado y acciones de la ficha (asignar, retirar/reactivar, crear propiedad,
 * verificar/guardar teléfono, carga del detalle). Es la misma lógica que tenía
 * el modal antes del rediseño, sacada a un hook para que el componente solo
 * pinte; no cambia ninguna server action ni endpoint.
 */
export function useFichaActions(row: ParticularRow, cb: Callbacks) {
  const { onPhoneUpdated, onAssigned, onActiveChanged, staffOptions } = cb;
  const [currentRow, setCurrentRow] = useState(row);
  /** `loading` mientras se pide la galería completa + ficha técnica; `error` deja la portada. */
  const [detail, setDetail] = useState<"loading" | "ready" | "error">(row.photos ? "ready" : "loading");

  // Si el listado cambia de anuncio sin desmontar la ficha, se vuelve a empezar.
  useEffect(() => {
    setCurrentRow(row);
    setDetail(row.photos ? "ready" : "loading");
    // Solo cuando cambia el anuncio (`row.id`): las ediciones locales no deben pisarse.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  // El listado solo trae la portada. Al abrir la ficha hacen falta la galería
  // completa + la ficha técnica; normalmente ya vienen de la caché porque se
  // prefetchan al pasar el ratón por la tarjeta (ver detail-cache.ts), así que
  // la ficha abre con todo puesto en vez de rellenarse a trozos.
  useEffect(() => {
    let cancelled = false;
    if (row.photos) return;
    (async () => {
      const data = await prefetchParticularDetail(row.id);
      if (cancelled) return;
      if (!data) {
        setDetail("error");
        return;
      }
      // Se fusiona el payload entero: fotos + ficha técnica (precio/m², rebaja,
      // planta, año, estado, energía…). `photos` sale siempre como array del servidor.
      setCurrentRow((prev) => ({ ...prev, ...data }));
      setDetail("ready");
    })();
    return () => {
      cancelled = true;
    };
    // Solo al abrir: `row.id` identifica el anuncio de la ficha.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row.id]);

  // ── Asignación (quién gestiona el anuncio; evita el doble trabajo) ────────
  const [assigning, setAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  const handleAssign = useCallback(
    async (advisorId: string) => {
      setAssigning(true);
      setAssignError(null);
      const value = advisorId || null;
      const res = await assignParticular(currentRow.id, value);
      if (res.ok) {
        const name = value ? (staffOptions.find((s) => s.id === value)?.name ?? null) : null;
        setCurrentRow((prev) => ({ ...prev, assigned_to: value, assigned_name: name }));
        onAssigned?.(value, name);
      } else {
        console.error("[particulares] Error asignando:", res.error);
        setAssignError("No se pudo guardar la asignación. Inténtalo de nuevo.");
      }
      setAssigning(false);
    },
    [currentRow.id, onAssigned, staffOptions],
  );

  // ── Retirar / reactivar manualmente (además de la baja automática del cron) ─
  const [togglingActive, setTogglingActive] = useState(false);

  const handleToggleActive = useCallback(async () => {
    const next = !currentRow.is_active;
    setTogglingActive(true);
    try {
      const res = await setParticularActive(currentRow.id, next);
      if (res.ok) {
        const takenDownAt = next ? null : new Date().toISOString();
        setCurrentRow((prev) => ({ ...prev, is_active: next, taken_down_at: takenDownAt }));
        onActiveChanged?.(next, takenDownAt);
      }
    } finally {
      setTogglingActive(false);
    }
  }, [currentRow.id, currentRow.is_active, onActiveChanged]);

  // ── Conversión particular → propiedad (en Portales externos) ──────────────
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ slug: string } | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  const handleCreateProperty = useCallback(async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const res = await createPropertyFromParticular(currentRow.id);
      if (res.ok) setCreated({ slug: res.slug });
      else setCreateError((res as { error?: string }).error || "unknown_error");
    } catch {
      setCreateError("network_error");
    } finally {
      setCreating(false);
    }
  }, [currentRow.id]);

  // ── Teléfono: editar a mano y verificar bajo demanda ──────────────────────
  const [showEditPhone, setShowEditPhone] = useState(false);

  const handlePhoneSaved = useCallback(
    (newPhone: string | null) => {
      // La edición manual se guarda con confianza «high» (ver updateParticularPhone).
      setCurrentRow((prev) => ({ ...prev, phone: newPhone, phone_confidence: newPhone ? "high" : null }));
      onPhoneUpdated?.(newPhone);
      setShowEditPhone(false);
    },
    [onPhoneUpdated],
  );

  // Verificación bajo demanda de ESTE anuncio: re-scrapea la ficha y llama al
  // endpoint AJAX «Ver teléfono» de Idealista. Si aparece teléfono, se guarda y
  // se refleja al instante.
  const [verifyingThis, setVerifyingThis] = useState(false);
  const [verifyThisResult, setVerifyThisResult] = useState<string | null>(null);

  const handleVerifyThisPhone = useCallback(async () => {
    setVerifyingThis(true);
    setVerifyThisResult(null);
    try {
      const res = await fetch(`/api/admin/particulares/verify-phones?id=${currentRow.id}`, { method: "POST" });
      const data = await res.json();
      if (data?.ok && data.foundPhone) {
        // Actualización en el sitio (sin recargar): refresca la ficha y la tarjeta de la lista vía onPhoneUpdated.
        setCurrentRow((prev) => ({ ...prev, phone: data.foundPhone, chat_only: false }));
        onPhoneUpdated?.(data.foundPhone);
        setVerifyThisResult("✓ Teléfono encontrado y guardado.");
      } else if (data?.ok) {
        setVerifyThisResult("El anuncio no expone teléfono en el portal (solo chat).");
      } else {
        setVerifyThisResult("No se pudo verificar — reintenta en un momento.");
      }
    } catch {
      setVerifyThisResult("No se pudo verificar — reintenta en un momento.");
    } finally {
      setVerifyingThis(false);
    }
  }, [currentRow.id, onPhoneUpdated]);

  return {
    currentRow,
    detail,
    assigning,
    assignError,
    handleAssign,
    togglingActive,
    handleToggleActive,
    creating,
    created,
    createError,
    handleCreateProperty,
    showEditPhone,
    setShowEditPhone,
    handlePhoneSaved,
    verifyingThis,
    verifyThisResult,
    handleVerifyThisPhone,
  };
}

/** Historial de cambios (`particulares_changes`): se pide UNA vez y lo comparten el bloque de precio y la pestaña «Histórico». */
export function useParticularChanges(id: string) {
  const [changes, setChanges] = useState<ParticularChangeRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setChanges(null);
    fetch(`/api/admin/particulares/changes?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((d) => !cancelled && setChanges(d.changes ?? []))
      .catch(() => !cancelled && setChanges([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { changes, loading };
}
