"use client";

import { useState } from "react";

export default function CapSolverConfigPage() {
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSave() {
    if (!apiKey.trim()) {
      setMessage({ type: "error", text: "API key no puede estar vacía" });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/save-capsolver-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKey.trim() }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage({ type: "success", text: "✓ API key guardada. Reinicia la app para que tome efecto." });
        setApiKey("");
      } else {
        setMessage({ type: "error", text: `Error: ${data.error || "Desconocido"}` });
      }
    } catch (err) {
      setMessage({ type: "error", text: `Error: ${err instanceof Error ? err.message : "Desconocido"}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: "600px", margin: "40px auto", padding: "20px" }}>
      <h1>⚙️ CapSolver Configuration</h1>
      <p>Configura la API key de CapSolver para resolver CAPTCHAs de DataDome automáticamente.</p>

      <div style={{ marginTop: "30px" }}>
        <label style={{ display: "block", marginBottom: "10px", fontWeight: "bold" }}>
          CapSolver API Key
        </label>
        <textarea
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder="CAP-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
          style={{
            width: "100%",
            height: "100px",
            padding: "10px",
            fontFamily: "monospace",
            fontSize: "12px",
            border: "1px solid #ccc",
            borderRadius: "4px",
          }}
        />
        <p style={{ fontSize: "12px", color: "#666", marginTop: "8px" }}>
          Obtén tu API key en: <a href="https://www.capsolver.com" target="_blank">capsolver.com</a>
        </p>
      </div>

      <button
        onClick={handleSave}
        disabled={loading || !apiKey.trim()}
        style={{
          marginTop: "20px",
          padding: "10px 20px",
          backgroundColor: loading ? "#ccc" : "#007bff",
          color: "white",
          border: "none",
          borderRadius: "4px",
          cursor: loading ? "not-allowed" : "pointer",
          fontSize: "14px",
          fontWeight: "bold",
        }}
      >
        {loading ? "Guardando..." : "Guardar API Key"}
      </button>

      {message && (
        <div
          style={{
            marginTop: "20px",
            padding: "12px",
            backgroundColor: message.type === "success" ? "#d4edda" : "#f8d7da",
            color: message.type === "success" ? "#155724" : "#721c24",
            borderRadius: "4px",
            fontSize: "14px",
          }}
        >
          {message.text}
        </div>
      )}
    </div>
  );
}
