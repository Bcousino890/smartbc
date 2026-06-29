"use client";

import { useState } from "react";
import { Loader2, CheckCircle, AlertCircle, Copy } from "lucide-react";

interface DemoCredentials {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
}

export function DemoSetupClient() {
  const [loading, setLoading] = useState(false);
  const [applied, setApplied] = useState(false);
  const [credentials, setCredentials] = useState<DemoCredentials[]>([]);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const handleCreateDemo = async () => {
    setLoading(true);
    setError("");
    setCredentials([]);

    try {
      // Create 3 demo clients
      const demoClients = [
        {
          firstName: "María",
          lastName: "Martínez",
          email: "maria.martinez@example.com",
          phone: "+34 612 345 678",
        },
        {
          firstName: "Carlos",
          lastName: "López",
          email: "carlos.lopez@example.com",
          phone: "+34 623 456 789",
        },
        {
          firstName: "Anna",
          lastName: "García",
          email: "anna.garcia@example.com",
          phone: "+56 9 1234 5678",
        },
      ];

      const createdCreds: DemoCredentials[] = [];

      for (const client of demoClients) {
        try {
          const res = await fetch("/api/admin/clientes/create-no-email", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(client),
          });

          if (res.ok) {
            const data = await res.json();
            createdCreds.push({
              email: data.email,
              password: data.password,
              firstName: client.firstName,
              lastName: client.lastName,
            });
          }
        } catch (err) {
          console.error(`Error creating ${client.email}:`, err);
        }
      }

      // Create demo applications and documents
      const appsRes = await fetch("/api/admin/demo/create-applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!appsRes.ok) {
        const err = await appsRes.json();
        throw new Error(err.error || "Error al crear solicitudes demo");
      }

      setCredentials(createdCreds);
      setApplied(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="mt-8 space-y-6">
      {/* Main Setup Card */}
      <section className="rounded-2xl border border-gold/15 bg-cream-50/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)]">
        <h2 className="text-lg font-semibold text-ink mb-4">
          Generador de Datos Demo
        </h2>

        <p className="text-sm text-ink/65 mb-6">
          Crea 3 clientes demo con solicitudes de documentación en diferentes estados:
        </p>

        <ul className="space-y-2 text-sm text-ink/75 mb-6 ml-4">
          <li>✅ María Martínez (ES Alquiler) - Solicitud APROBADA</li>
          <li>⏳ Carlos López (CL Venta) - Solicitud PENDIENTE REVISIÓN</li>
          <li>📝 Anna García (ES Alquiler) - Solicitud EN BORRADOR</li>
        </ul>

        {error && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 mb-4">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {applied && (
          <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-700 mb-4">
            <CheckCircle size={16} />
            <span>✅ Datos demo creados exitosamente</span>
          </div>
        )}

        <button
          onClick={handleCreateDemo}
          disabled={loading}
          className="flex items-center justify-center gap-2 rounded-xl bg-ink px-6 py-3 text-sm font-medium text-cream-50 transition hover:bg-ink-soft disabled:opacity-50"
        >
          {loading && <Loader2 size={16} className="animate-spin" />}
          <span>
            {applied ? "Regenerar Datos Demo" : "Crear Datos Demo"}
          </span>
        </button>
      </section>

      {/* Credentials Display */}
      {credentials.length > 0 && (
        <section className="rounded-2xl border border-gold/15 bg-cream-50/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)]">
          <h3 className="text-lg font-semibold text-ink mb-4">
            Credenciales de Acceso Demo
          </h3>

          <div className="space-y-4">
            {credentials.map((cred, idx) => (
              <div
                key={idx}
                className="rounded-lg border border-ink/10 bg-white/85 p-4"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="font-medium text-ink">
                      {cred.firstName} {cred.lastName}
                    </p>
                    <p className="text-sm text-ink/65">{cred.email}</p>
                  </div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-gold/65">
                    Cliente {idx + 1}
                  </span>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between rounded bg-ink/5 p-2">
                    <span className="text-xs text-ink/65 font-mono">
                      Email: {cred.email}
                    </span>
                    <button
                      onClick={() => copyToClipboard(cred.email, `email-${idx}`)}
                      className="text-ink/55 hover:text-ink transition"
                    >
                      {copied === `email-${idx}` ? (
                        <CheckCircle size={14} className="text-green-600" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between rounded bg-ink/5 p-2">
                    <span className="text-xs text-ink/65 font-mono">
                      Pass: {cred.password}
                    </span>
                    <button
                      onClick={() =>
                        copyToClipboard(cred.password, `pass-${idx}`)
                      }
                      className="text-ink/55 hover:text-ink transition"
                    >
                      {copied === `pass-${idx}` ? (
                        <CheckCircle size={14} className="text-green-600" />
                      ) : (
                        <Copy size={14} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
            <p className="font-medium mb-2">📋 Próximos pasos:</p>
            <ol className="space-y-1 text-xs ml-4">
              <li>1. Copia las credenciales de arriba</li>
              <li>2. Abre https://portal.bcousinoprop.com/es/admin/solicitudes-documentacion</li>
              <li>3. Verás 3 solicitudes en diferentes estados (aprobada, pendiente, borrador)</li>
              <li>4. Haz clic en cada una para revisar documentos y flujo completo</li>
            </ol>
          </div>
        </section>
      )}

      {/* Info Card */}
      <section className="rounded-2xl border border-gold/15 bg-cream-50/85 p-6 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)]">
        <h3 className="text-lg font-semibold text-ink mb-4">
          ¿Qué incluye este setup?
        </h3>

        <div className="space-y-4 text-sm text-ink/75">
          <div>
            <p className="font-medium text-ink mb-1">
              🏠 3 Propiedades Demo:
            </p>
            <ul className="ml-4 space-y-1">
              <li>• Piso en Madrid (Calle Mayor 45) - Alquiler €1.200/mes</li>
              <li>• Depto en Santiago (Las Condes) - Venta CLP $450M</li>
            </ul>
          </div>

          <div>
            <p className="font-medium text-ink mb-1">
              👥 3 Clientes Demo con Estados Diferentes:
            </p>
            <ul className="ml-4 space-y-1">
              <li>
                • María (ES): Solicitud APROBADA - 87/100 puntos, docs verificados
              </li>
              <li>
                • Carlos (CL): PENDIENTE REVISIÓN - 65/100, docs incompletos
              </li>
              <li>
                • Anna (ES): BORRADOR - Sin documentos, 0/100
              </li>
            </ul>
          </div>

          <div>
            <p className="font-medium text-ink mb-1">
              📄 Documentos de Prueba:
            </p>
            <ul className="ml-4 space-y-1">
              <li>• María: Todos los documentos verificados ✅</li>
              <li>• Carlos: Algunos documentos pendientes ⏳</li>
              <li>• Anna: Sin documentos 📝</li>
            </ul>
          </div>

          <div>
            <p className="font-medium text-ink mb-1">
              🎯 Casos de Uso para Probar:
            </p>
            <ul className="ml-4 space-y-1">
              <li>• Ver flujo completo de solicitud aprobada</li>
              <li>• Revisar y verificar documentos pendientes</li>
              <li>• Rechazar y pedir correcciones</li>
              <li>• Ver scoring automático y análisis IA</li>
              <li>• Descargar resumen para dueño de propiedad</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
