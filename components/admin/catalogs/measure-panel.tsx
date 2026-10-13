"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  HomeMeter,
  MEASURE_CHANNEL,
  REQUIRED_READERS,
  REQUIRED_TRIALS,
  TARGET_MS,
  formatLatency,
  isMeasureMsg,
  sharedClock,
} from "@/lib/catalogs/measurement";

// Modo medición de D13 en la gestión del catálogo (?medir=1, BCP-01 T10).
// Solo instrumentación: el canal lleva ensayo, catálogo, huella y horas; el
// contenido de los lectores llega siempre del servidor. No escribe nada.

export interface HomeMeasure {
  enabled: boolean;
  busy: boolean;
  begin: () => { trial: string; tStart: number } | null;
  complete: (
    t: { trial: string; tStart: number },
    label: string,
    fingerprint: string | null | undefined,
    publicChange?: boolean,
  ) => void;
  meter: HomeMeter | null;
  /** «Sin aviso inmediato»: los guardados no avisan al vigilante y el cambio
   *  llega por su pasada (camino de los cambios hechos desde otras pantallas). */
  skipNotify: boolean;
  setSkipNotify: (v: boolean) => void;
}

function randomId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function useHomeMeasure(enabled: boolean, catalogKey: string | null): HomeMeasure {
  const meterRef = useRef<HomeMeter | null>(null);
  const chanRef = useRef<BroadcastChannel | null>(null);
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [skipNotify, setSkipNotify] = useState(false);
  const skipRef = useRef(false);
  skipRef.current = skipNotify;

  useEffect(() => {
    if (!enabled || !catalogKey || typeof BroadcastChannel === "undefined") return;
    const meter = new HomeMeter(catalogKey);
    const ch = new BroadcastChannel(MEASURE_CHANNEL);
    meterRef.current = meter;
    chanRef.current = ch;
    ch.onmessage = (e) => {
      const m = e.data;
      if (!isMeasureMsg(m)) return;
      if (m.type === "presence") meter.onPresence(m, sharedClock());
      else if (m.type === "result" && meter.onResult(m)) force();
    };
    const id = window.setInterval(() => {
      meter.tick(sharedClock());
      force();
    }, 250);
    return () => {
      window.clearInterval(id);
      ch.close();
      meterRef.current = null;
      chanRef.current = null;
    };
  }, [enabled, catalogKey]);

  const begin = useCallback(() => {
    const meter = meterRef.current;
    if (!meter || meter.busy()) return null;
    return { trial: randomId(), tStart: sharedClock() };
  }, []);

  const complete = useCallback(
    (t: { trial: string; tStart: number }, label: string, fingerprint: string | null | undefined, publicChange = true) => {
      const tSaved = sharedClock();
      const meter = meterRef.current;
      if (!meter || !fingerprint) return;
      const watcherPath = skipRef.current;
      const msg = meter.saved({
        trial: t.trial,
        label: watcherPath ? `${label} (vigilante)` : label,
        fingerprint,
        tStart: t.tStart,
        tSaved,
        changed: publicChange,
        watcherPath,
      });
      if (msg) chanRef.current?.postMessage(msg);
      force();
    },
    [],
  );

  return {
    enabled: enabled && !!catalogKey,
    busy: !!meterRef.current?.busy(),
    begin,
    complete,
    meter: meterRef.current,
    skipNotify: enabled && skipNotify,
    setSkipNotify,
  };
}

export function MeasurePanel({ measure, hasShare }: { measure: HomeMeasure; hasShare: boolean }) {
  const meter = measure.meter;
  if (!hasShare) {
    return (
      <section className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
        Modo medición: crea primero el enlace del catálogo y ábrelo en dos ventanas con <code>?medir=1</code>.
      </section>
    );
  }
  if (!meter) return null;
  const now = sharedClock();
  const readers = meter.readers(now);
  const s = meter.summary();
  const rows = [...meter.rows].reverse();

  async function copyCsv() {
    try {
      await navigator.clipboard.writeText(meter!.csv());
    } catch {
      window.prompt("Copia el CSV:", meter!.csv());
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-amber-300 bg-amber-50/70 p-4 text-ink" aria-labelledby="mp-title" data-testid="measure-panel">
      <div className="flex items-center justify-between gap-2">
        <h2 id="mp-title" className="crm-label-sm text-amber-900">
          Medición D13 · ≤ {TARGET_MS / 1000} s
        </h2>
        <button type="button" onClick={copyCsv} className="rounded-md border border-amber-400 px-2 py-1 text-xs text-amber-900 hover:bg-white">
          Copiar CSV
        </button>
      </div>
      <p className="text-xs text-amber-900/80" data-testid="measure-readers">
        Lectores abiertos con ?medir=1: <strong>{readers.length}</strong> (hacen falta {REQUIRED_READERS})
        {measure.busy ? " · esperando a los lectores…" : ""}
      </p>
      <label className="flex items-center gap-2 text-xs text-amber-900">
        <input
          type="checkbox"
          checked={measure.skipNotify}
          onChange={(e) => measure.setSkipNotify(e.target.checked)}
          data-testid="measure-skip-notify"
        />
        Sin aviso inmediato (mide el camino del vigilante, como un cambio hecho desde la ficha)
      </label>
      <p className="text-xs" data-testid="measure-summary">
        Ensayos {s.trials}/{REQUIRED_TRIALS} · resultados {s.results}/{REQUIRED_TRIALS * REQUIRED_READERS} · fallos{" "}
        {s.failures} · máximo {s.maxMs === null ? "—" : formatLatency(s.maxMs)} · sin cambio público {s.unchanged}{" "}
        (no cuentan) · por el vigilante {s.watcherTrials} ·{" "}
        <strong className={s.pass ? "text-emerald-700" : s.complete ? "text-red-700" : ""}>
          {s.pass ? "PASA" : s.complete ? "NO PASA" : "en curso"}
        </strong>
      </p>
      {rows.length ? (
        <div className="max-h-64 overflow-auto rounded-lg border border-amber-200 bg-white">
          <table className="w-full text-left text-xs tabular-nums">
            <thead className="sticky top-0 bg-amber-100/80">
              <tr>
                <th className="px-2 py-1">#</th>
                <th className="px-2 py-1">Guardado</th>
                {[0, 1].map((i) => (
                  <th key={i} className="px-2 py-1">
                    Lector {i + 1}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.trial} className="border-t border-amber-100">
                  <td className="px-2 py-1">{rows.length - i}</td>
                  <td className="px-2 py-1">{row.label}</td>
                  {row.noChange ? (
                    <td colSpan={2} className="px-2 py-1 text-amber-900/70">
                      sin cambio público (no cuenta)
                    </td>
                  ) : [0, 1].map((j) => {
                    const r = row.expected[j];
                    const v = r ? row.results[r] : undefined;
                    const text = !r ? "falta lector" : v === undefined ? "…" : v === "missing" ? "sin respuesta" : formatLatency(v.latencyMs);
                    const bad = !r || v === "missing" || (v !== undefined && v.latencyMs > TARGET_MS);
                    return (
                      <td key={j} className={`px-2 py-1 ${bad && (v !== undefined || !r) ? "text-red-700" : ""}`}>
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-xs text-amber-900/80">
          Haz 20 guardados (5 añadidos, 5 ediciones, 5 retiradas y 5 cambios de orden) esperando a que respondan los dos
          lectores antes del siguiente.
        </p>
      )}
    </section>
  );
}
