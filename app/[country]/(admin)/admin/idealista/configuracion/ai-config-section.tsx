"use client";

import { Sparkles, Loader2, Check, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";

const PROVIDERS = [
  { value: "openrouter", label: "OpenRouter (recomendado)" },
  { value: "anthropic", label: "Anthropic (Claude)" },
  { value: "nvidia", label: "NVIDIA NIM" },
  { value: "ollama", label: "Ollama (local, en el VPS)" },
  { value: "openai", label: "OpenAI / compatible" },
];

const inputCls =
  "w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-gold/55 focus:outline-none";

export function AIConfigSection() {
  const [provider, setProvider] = useState("openrouter");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [visionModel, setVisionModel] = useState("");
  const [zones, setZones] = useState(""); // una zona por línea
  const [hasKey, setHasKey] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/idealista/ai-config");
        const d = await res.json();
        if (res.ok) {
          setProvider(d.provider ?? "openrouter");
          setModel(d.model ?? "");
          setVisionModel(d.visionModel ?? "");
          setZones((d.zones ?? []).join("\n"));
          setHasKey(!!d.hasKey);
        }
      } catch {
        // silencioso — el usuario puede reintentar guardando
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    setError("");
    setMsg("");
    try {
      const res = await fetch("/api/admin/idealista/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          apiKey,
          model,
          visionModel,
          zones: zones.split("\n").map((z) => z.trim()).filter(Boolean),
        }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Error al guardar");
        return;
      }
      setHasKey(!!d.hasKey);
      setApiKey("");
      setMsg("Guardado. Los botones de IA (descripción y análisis de fotos) ya usan estos ajustes.");
    } catch {
      setError("Error de red al guardar");
    } finally {
      setSaving(false);
    }
  };

  const isOllama = provider === "ollama";

  return (
    <div className="mt-7 rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm md:p-6">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles size={20} className="text-gold" />
        <h2 className="crm-section-title text-ink">
          Inteligencia Artificial (descripciones y análisis de fotos)
        </h2>
      </div>
      <p className="mb-5 text-sm text-ink/60">
        Elige el proveedor de IA y pega su clave. Se usa para el botón{" "}
        <strong className="text-ink/80">Generar con IA</strong> y para{" "}
        <strong className="text-ink/80">Analizar fotos</strong> en las fichas. La clave se
        guarda en el servidor y no se muestra de nuevo.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-ink/50">
          <Loader2 size={14} className="animate-spin" /> Cargando configuración...
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block crm-label-sm text-ink/50">
              Proveedor
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className={inputCls}
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block crm-label-sm text-ink/50">
              Clave (API key)
              {hasKey && (
                <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  <Check size={10} /> Guardada
                </span>
              )}
            </label>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                isOllama
                  ? "(no necesaria para Ollama local)"
                  : hasKey
                    ? "•••••••••• (déjalo vacío para conservar la actual)"
                    : "sk-or-..."
              }
              className={`${inputCls} font-mono`}
              autoComplete="off"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block crm-label-sm text-ink/50">
                Modelo de texto
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="ej. google/gemini-2.5-flash"
                className={`${inputCls} font-mono`}
              />
            </div>
            <div>
              <label className="mb-1.5 block crm-label-sm text-ink/50">
                Modelo de visión (fotos)
              </label>
              <input
                type="text"
                value={visionModel}
                onChange={(e) => setVisionModel(e.target.value)}
                placeholder="debe aceptar imágenes"
                className={`${inputCls} font-mono`}
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block crm-label-sm text-ink/50">
              Zonas / barrios (una por línea)
            </label>
            <textarea
              value={zones}
              onChange={(e) => setZones(e.target.value)}
              rows={5}
              placeholder={"Barrio de Salamanca\nChamberí\nRetiro\nCentro"}
              className={`${inputCls} resize-y`}
            />
            <p className="mt-1 text-xs text-ink/45">
              Estas zonas aparecen como sugerencia en la ficha (campo Ciudad/Zona) y ayudan a la IA a
              redactar el título y la descripción con el barrio correcto.
            </p>
          </div>

          {msg && (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
              <Check size={14} /> {msg}
            </div>
          )}
          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-50"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />}
              Guardar configuración de IA
            </button>
          </div>

          <div className="rounded-xl bg-amber-50 p-4 text-xs text-amber-800 space-y-1.5">
            <p className="font-semibold">Cómo conseguir la clave y los modelos (OpenRouter):</p>
            <ol className="list-decimal list-inside space-y-1 text-amber-700/90">
              <li>Entra en <strong>openrouter.ai</strong>, regístrate y crea una clave en <strong>Keys</strong>.</li>
              <li>En <strong>openrouter.ai/models</strong> elige un modelo de texto y otro de visión; copia su ID exacto.</li>
              <li>Puedes empezar con modelos gratis (terminan en <strong>:free</strong>) y luego pasar a uno de pago barato.</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
