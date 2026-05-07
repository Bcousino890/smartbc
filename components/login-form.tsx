"use client";

import {
  ArrowRight,
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  ShoppingBag,
  User,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

type Role = "cliente" | "admin";

export function LoginForm() {
  const [role, setRole] = useState<Role>("cliente");
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit =
    email.length > 0 &&
    password.length > 0 &&
    (role === "admin" || accepted);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // TODO: integrar con auth (Supabase / NextAuth) cuando montemos el backend
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-md rounded-[20px] border border-white/60 bg-cream-50/85 px-6 pb-5 pt-3.5 shadow-[0_30px_80px_-20px_rgba(40,28,10,0.45),0_0_0_1px_rgba(201,169,110,0.18)] backdrop-blur-md md:px-8 md:pb-6 md:pt-4"
    >
      <div className="flex flex-col items-center text-center">
        <KeyRound
          className="text-gold"
          size={22}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="mt-1.5 h-px w-8 bg-gold/60" />
        <h2 className="mt-2 font-serif text-2xl font-medium leading-tight tracking-tight text-ink md:text-[1.75rem]">
          Acceso Privado
        </h2>
        <p className="mt-1 text-[13px] text-ink/60">
          Portal exclusivo para clientes y administradores
        </p>
      </div>

      <div className="mt-3.5 grid grid-cols-2 gap-2 rounded-xl border border-gold/20 bg-white/40 p-1.5">
        <RoleTab
          active={role === "cliente"}
          onClick={() => setRole("cliente")}
          icon={<User size={16} strokeWidth={1.75} />}
          label="Clientes"
        />
        <RoleTab
          active={role === "admin"}
          onClick={() => setRole("admin")}
          icon={<ShieldCheck size={16} strokeWidth={1.75} />}
          label="Administradores"
        />
      </div>

      <div className="mt-3.5 space-y-2.5">
        <Field icon={<Mail size={18} strokeWidth={1.5} />}>
          <input
            type="text"
            autoComplete="username"
            placeholder="Correo o usuario"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-transparent py-2.5 pr-3 text-sm text-ink placeholder:text-ink/40 focus:outline-none"
          />
        </Field>

        <Field icon={<Lock size={18} strokeWidth={1.5} />}>
          <input
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-transparent py-2.5 pr-2 text-sm text-ink placeholder:text-ink/40 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={
              showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
            }
            className="pr-3 text-ink/40 transition hover:text-ink/70"
          >
            {showPassword ? (
              <EyeOff size={18} strokeWidth={1.5} />
            ) : (
              <Eye size={18} strokeWidth={1.5} />
            )}
          </button>
        </Field>
      </div>

      {role === "cliente" && (
        <div className="mt-3.5 rounded-xl border border-gold/30 bg-cream-100/70 p-3">
          <div className="flex items-start gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/50 text-gold">
              <ShoppingBag size={14} strokeWidth={1.75} />
            </span>
            <div className="min-w-0">
              <p className="font-serif text-sm font-semibold text-ink">
                Personal Shopper
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-ink/70">
                Servicio equivalente a un mes de alquiler/renta. Se valida cuando
                el cliente alquila oficialmente con Benjamín Cousiño Propiedades.
              </p>
            </div>
          </div>

          <div className="mt-2.5 border-t border-gold/20 pt-2.5">
            <label className="flex cursor-pointer items-start gap-2 text-[11px] text-ink/80">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 shrink-0 cursor-pointer accent-ink"
              />
              <span>He leído y acepto las condiciones del Personal Shopper.</span>
            </label>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className={cn(
          "mt-4 flex w-full items-center justify-center gap-3 rounded-xl bg-ink px-5 py-3 text-sm font-medium tracking-wide text-cream-50 transition",
          "hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-50",
        )}
      >
        <span>Iniciar sesión</span>
        <ArrowRight size={18} strokeWidth={1.75} className="text-gold" />
      </button>

      <div className="mt-2.5 text-center">
        <a
          href="#"
          className="text-[13px] text-gold-dark underline-offset-4 transition hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </a>
      </div>

      <div className="mt-3 flex flex-col items-center border-t border-gold/20 pt-3">
        <ShieldCheck
          size={14}
          strokeWidth={1.5}
          className="text-gold"
          aria-hidden="true"
        />
        <p className="mt-1 text-center text-[11px] text-ink/55">
          Acceso seguro a propiedades disponibles y seguimiento personalizado
        </p>
      </div>
    </form>
  );
}

function RoleTab({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-ink text-gold shadow-sm"
          : "text-ink/60 hover:bg-white/60 hover:text-ink",
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function Field({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center rounded-xl border border-gold/25 bg-white/60 transition focus-within:border-gold/60 focus-within:bg-white/80">
      <span className="pl-3 pr-2.5 text-ink/40">{icon}</span>
      {children}
    </div>
  );
}
