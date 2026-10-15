"use client";

// Conflicto en un formulario (BCP-01 E2, plan §3.5): lo guardado cambió
// mientras se editaba (otra pestaña u otra acción). Lo escrito NO se toca: se
// enseña lo guardado y la persona decide. «Mantener los míos» no guarda.

export function ConflictNote({ saved, onDiscard, onKeep }: { saved: string; onDiscard: () => void; onKeep: () => void }) {
  return (
    <div role="status" className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900" data-testid="draft-conflict">
      <p className="font-semibold">Lo guardado cambió mientras editabas. Tus cambios siguen aquí.</p>
      <p>
        Guardado ahora: <span className="text-amber-950">{saved || "—"}</span>
      </p>
      <div className="flex flex-wrap gap-3 pt-1">
        <button type="button" onClick={onDiscard} className="underline">
          Descartar mis cambios
        </button>
        <button type="button" onClick={onKeep} className="underline">
          Mantener los míos
        </button>
      </div>
    </div>
  );
}
