"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, clearSession } from "@/lib/auth";
import { LogOut, Home } from "lucide-react";

export default function ClientDashboard() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored || !stored.isAuthenticated || stored.role !== "cliente") {
      router.push("/login");
    } else {
      setSession(stored);
      setIsLoading(false);
    }
  }, [router]);

  function handleLogout() {
    clearSession();
    router.push("/login");
  }

  if (isLoading) {
    return <div className="flex h-screen items-center justify-center">Cargando...</div>;
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-cream-50 via-cream-100 to-gold-light/20">
      {/* Header */}
      <header className="border-b border-gold/20 bg-white/40 backdrop-blur-sm sticky top-0 z-50">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 md:px-8">
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-center">
              <p className="font-serif text-sm font-semibold tracking-widest text-ink">
                BENJAMÍN COUSIÑO
              </p>
              <p className="font-serif text-xs tracking-wider text-gold">
                PROPIEDADES
              </p>
            </div>
            <div className="h-10 w-px bg-gold/30" />
            <div className="flex items-center gap-2">
              <Home className="text-gold" size={24} />
              <h1 className="font-serif text-xl font-semibold text-ink">
                Portal Cliente
              </h1>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm text-cream-50 transition hover:bg-ink-soft"
          >
            <LogOut size={18} />
            Salir
          </button>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-6xl px-4 py-12 md:px-8">
        <div className="rounded-2xl border border-gold/30 bg-white/60 p-8 backdrop-blur-sm">
          <div className="mb-8">
            <p className="text-sm text-ink/60">Sesión iniciada como:</p>
            <p className="font-serif text-xl font-semibold text-ink">
              {session?.email}
            </p>
          </div>

          <h2 className="mb-6 font-serif text-2xl font-semibold text-ink">
            Bienvenido al Portal de Cliente
          </h2>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Propiedades card */}
            <div className="rounded-xl border border-gold/20 bg-gradient-to-br from-cream-100 to-cream-50 p-6">
              <h3 className="mb-2 font-serif text-lg font-semibold text-ink">
                📍 Propiedades Disponibles
              </h3>
              <p className="text-sm text-ink/70">
                Explora propiedades filtradas según tu perfil, zona, presupuesto
                y tipo de estancia.
              </p>
            </div>

            {/* Favoritos card */}
            <div className="rounded-xl border border-gold/20 bg-gradient-to-br from-cream-100 to-cream-50 p-6">
              <h3 className="mb-2 font-serif text-lg font-semibold text-ink">
                ⭐ Mis Favoritos
              </h3>
              <p className="text-sm text-ink/70">
                Guarda las propiedades que más te interesen para un acceso
                rápido.
              </p>
            </div>

            {/* Visitas card */}
            <div className="rounded-xl border border-gold/20 bg-gradient-to-br from-cream-100 to-cream-50 p-6">
              <h3 className="mb-2 font-serif text-lg font-semibold text-ink">
                📅 Mis Visitas
              </h3>
              <p className="text-sm text-ink/70">
                Solicita y gestiona visitas a las propiedades de tu interés.
              </p>
            </div>

            {/* Personal Shopper card */}
            <div className="rounded-xl border border-gold/20 bg-gradient-to-br from-gold-light/30 to-gold-light/10 p-6">
              <h3 className="mb-2 font-serif text-lg font-semibold text-ink">
                👜 Personal Shopper
              </h3>
              <p className="text-sm text-ink/70">
                Servicio personalizado de búsqueda y seguimiento de propiedades.
              </p>
            </div>
          </div>

          <div className="mt-8 rounded-lg border border-gold/30 bg-gold-light/10 p-4">
            <p className="text-sm text-ink/80">
              💡 <strong>Demo:</strong> Este es un ambiente de prueba con
              credenciales de demostración.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
