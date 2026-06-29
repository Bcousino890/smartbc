"use client";

import {
  Check,
  KeyRound,
  Loader2,
  MessageSquare,
  RefreshCw,
  Shield,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type LoginStep = "credentials" | "sms" | "done";
type SessionState = "unknown" | "active" | "expired";

export function IdealistaConfigClient({
  initialConfig,
}: {
  initialConfig: {
    username: string | null;
    lastLoginAt: string | null;
  } | null;
}) {
  const [step, setStep] = useState<LoginStep>("credentials");
  const [sessionState, setSessionState] = useState<SessionState>("unknown");

  const [username, setUsername] = useState(initialConfig?.username ?? "");
  const [password, setPassword] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [phoneMask, setPhoneMask] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const checkSession = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/idealista/session-status");
      const data = await res.json();
      setSessionState(data.connected ? "active" : "expired");
      if (data.connected) {
        setMessage("Sesión activa. Puedes publicar propiedades sin re-autenticarte.");
      } else {
        setMessage("");
      }
    } catch {
      setSessionState("expired");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  const handleConnect = async () => {
    if (!username || !password) {
      setError("Ingresa usuario y contraseña");
      return;
    }
    setLoading(true);
    setError("");
    setMessage("");
    try {
      const res = await fetch("/api/admin/idealista/login-start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Error al iniciar sesión");
        return;
      }

      if (data.status === "connected") {
        setSessionState("active");
        setStep("done");
        setMessage("Conectado correctamente. La sesión quedó guardada.");
        return;
      }

      if (data.status === "sms_required") {
        setSessionId(data.sessionId);
        setPhoneMask(data.phone ?? "tu número");
        setStep("sms");
      }
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifySms = async () => {
    if (!smsCode.trim()) {
      setError("Ingresa el código SMS");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/idealista/login-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, smsCode }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.error ?? "Código incorrecto");
        return;
      }

      setSessionState("active");
      setStep("done");
      setMessage("Conectado correctamente. La sesión quedó guardada en el servidor.");
      setSmsCode("");
    } catch {
      setError("Error al verificar código. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep("credentials");
    setError("");
    setMessage("");
    setSmsCode("");
    setSessionId("");
    setPhoneMask("");
    setPassword("");
  };

  const sessionBadge = (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold",
        sessionState === "active"
          ? "bg-emerald-100 text-emerald-700"
          : sessionState === "expired"
            ? "bg-red-100 text-red-700"
            : "bg-amber-100 text-amber-700"
      )}
    >
      {sessionState === "active" ? (
        <Wifi size={12} />
      ) : sessionState === "expired" ? (
        <WifiOff size={12} />
      ) : (
        <Loader2 size={12} className="animate-spin" />
      )}
      {sessionState === "active"
        ? "Sesión activa"
        : sessionState === "expired"
          ? "Sin sesión"
          : "Verificando..."}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Estado de sesión */}
      <div className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-gold" />
            <h3 className="font-serif text-base font-semibold text-ink">
              Conexión con Idealista
            </h3>
          </div>
          {sessionBadge}
        </div>

        {initialConfig?.lastLoginAt && (
          <p className="mb-4 text-xs text-ink/45">
            Último login exitoso:{" "}
            {new Date(initialConfig.lastLoginAt).toLocaleString("es-ES")}
          </p>
        )}

        {message && (
          <div className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            <Check size={14} />
            {message}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step: Credentials */}
        {step === "credentials" && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                Email de Idealista
              </label>
              <input
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="andrea@bcousinoprop.com"
                className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-gold/55 focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 text-sm text-ink placeholder:text-ink/30 focus:border-gold/55 focus:outline-none"
                onKeyDown={(e) => e.key === "Enter" && handleConnect()}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleConnect}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <KeyRound size={14} />
                )}
                Conectar con Idealista
              </button>

              <button
                type="button"
                onClick={checkSession}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-50"
              >
                <RefreshCw size={14} />
                Verificar sesión
              </button>
            </div>
          </div>
        )}

        {/* Step: SMS code */}
        {step === "sms" && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-xl bg-amber-50 p-4">
              <MessageSquare size={18} className="mt-0.5 shrink-0 text-amber-700" />
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  Código de verificación enviado
                </p>
                <p className="mt-1 text-xs text-amber-700/80">
                  Idealista envió un SMS al número <strong>{phoneMask}</strong>.
                  Ingresa el código a continuación.
                </p>
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-ink/50">
                Código SMS
              </label>
              <input
                type="text"
                value={smsCode}
                onChange={(e) => setSmsCode(e.target.value)}
                placeholder="123456"
                maxLength={10}
                autoFocus
                className="w-full rounded-lg border border-ink/10 bg-white px-3 py-2 font-mono text-base text-ink placeholder:text-ink/30 focus:border-gold/55 focus:outline-none"
                onKeyDown={(e) => e.key === "Enter" && handleVerifySms()}
              />
              <p className="mt-1 text-xs text-ink/40">
                Tienes 5 minutos antes de que expire la sesión de verificación.
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleVerifySms}
                disabled={loading}
                className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-cream-50 transition hover:bg-ink/80 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Check size={14} />
                )}
                Verificar y conectar
              </button>

              <button
                type="button"
                onClick={handleReset}
                disabled={loading}
                className="rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={checkSession}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5 disabled:opacity-50"
            >
              <RefreshCw size={14} />
              Verificar sesión
            </button>

            <button
              type="button"
              onClick={handleReset}
              className="flex items-center gap-2 rounded-lg border border-ink/15 bg-white px-4 py-2 text-sm font-medium text-ink transition hover:bg-ink/5"
            >
              <KeyRound size={14} />
              Cambiar cuenta
            </button>
          </div>
        )}
      </div>

      {/* Información */}
      <div className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] md:p-6">
        <h3 className="mb-3 font-serif text-base font-semibold text-ink">
          Cómo funciona
        </h3>
        <ul className="space-y-2 text-sm text-ink/65">
          <li>
            <strong className="text-ink/80">Conexión inicial:</strong> Ingresa el email y contraseña de tu cuenta Idealista. Se enviará un SMS al teléfono asociado.
          </li>
          <li>
            <strong className="text-ink/80">Sesión guardada:</strong> Tras verificar el SMS, la sesión queda guardada en el servidor. No necesitarás volver a loguearte hasta que Idealista la expire (semanas/meses).
          </li>
          <li>
            <strong className="text-ink/80">Publicación automática:</strong> Desde la ficha de cada propiedad podrás publicarla en Idealista con un clic.
          </li>
          <li>
            <strong className="text-ink/80">Sesión expirada:</strong> Si la sesión caduca, aparecerá un aviso. Solo tendrás que volver a conectar aquí.
          </li>
        </ul>
      </div>
    </div>
  );
}
