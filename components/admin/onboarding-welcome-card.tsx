"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { BookOpen, X } from "lucide-react";

/**
 * Aviso de bienvenida del Dashboard para cuentas recién creadas: lleva a la
 * Guía de inicio. El Dashboard decide quién es "nuevo" (ver page.tsx); aquí
 * solo se recuerda, por navegador, que el usuario lo cerró. Arranca oculto y
 * aparece tras montar, para no parpadear a quien ya lo había cerrado.
 */
export function OnboardingWelcomeCard({
  userId,
  firstName,
  guideHref,
}: {
  userId: string;
  firstName: string | null;
  guideHref: string;
}) {
  const storageKey = `smartbc:onboarding-welcome-dismissed:${userId}`;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      setVisible(window.localStorage.getItem(storageKey) !== "1");
    } catch {
      setVisible(true);
    }
  }, [storageKey]);

  if (!visible) return null;

  function dismiss() {
    setVisible(false);
    try {
      window.localStorage.setItem(storageKey, "1");
    } catch {
      // Sin almacenamiento (modo privado): se cierra solo hasta recargar.
    }
  }

  return (
    <div className="relative flex flex-col gap-4 rounded-2xl border border-gold/30 bg-gold/10 p-5 sm:flex-row sm:items-center">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gold/20 text-gold">
        <BookOpen size={20} />
      </div>
      <div className="min-w-0 flex-1 pr-6">
        <p className="font-semibold text-ink">
          {firstName ? `Bienvenido/a, ${firstName}.` : "Bienvenido/a."} ¿Primera vez en el CRM?
        </p>
        <p className="mt-0.5 text-sm text-ink/65">
          La Guía de inicio te explica, en cinco minutos, qué puedes hacer con tu cuenta y por
          dónde empezar.
        </p>
      </div>
      <Link
        href={guideHref}
        className="shrink-0 rounded-lg bg-ink px-4 py-2 text-center text-sm font-medium text-cream-50 transition hover:bg-ink/90"
      >
        Abrir la guía
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar"
        className="absolute right-3 top-3 rounded-full p-1 text-ink/40 transition hover:bg-ink/5 hover:text-ink/70"
      >
        <X size={16} />
      </button>
    </div>
  );
}
