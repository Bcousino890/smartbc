"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredSession, clearSession } from "@/lib/auth";
import { LogOut, BarChart3, Users, Building2, DollarSign, AlertCircle } from "lucide-react";

export default function AdminDashboard() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const stored = getStoredSession();
    if (!stored || !stored.isAuthenticated || stored.role !== "admin") {
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
              <BarChart3 className="text-gold" size={24} />
              <h1 className="font-serif text-xl font-semibold text-ink">
                Panel Administrativo
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
            Bienvenido al Panel Administrativo
          </h2>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Gestión de Clientes */}
            <div className="rounded-xl border border-gold/20 bg-gradient-to-br from-cream-100 to-cream-50 p-6">
              <div className="flex items-start gap-3">
                <Users className="mt-1 text-gold" size={20} />
                <div>
                  <h3 className="mb-1 font-serif text-lg font-semibold text-ink">
                    Gestión de Clientes
                  </h3>
                  <p className="text-sm text-ink/70">
                    Administra perfiles de clientes, verifica documentación y
                    gestiona accesos al portal.
                  </p>
                </div>
              </div>
            </div>

            {/* Propiedades */}
            <div className="rounded-xl border border-gold/20 bg-gradient-to-br from-cream-100 to-cream-50 p-6">
              <div className="flex items-start gap-3">
                <Building2 className="mt-1 text-gold" size={20} />
                <div>
                  <h3 className="mb-1 font-serif text-lg font-semibold text-ink">
                    Gestión de Propiedades
                  </h3>
                  <p className="text-sm text-ink/70">
                    Crea, edita y elimina propiedades. Administra disponibilidad,
                    precios y detalles de inmuebles.
                  </p>
                </div>
              </div>
            </div>

            {/* Agencias y Comisiones */}
            <div className="rounded-xl border border-gold/20 bg-gradient-to-br from-cream-100 to-cream-50 p-6">
              <div className="flex items-start gap-3">
                <DollarSign className="mt-1 text-gold" size={20} />
                <div>
                  <h3 className="mb-1 font-serif text-lg font-semibold text-ink">
                    Agencias y Comisiones
                  </h3>
                  <p className="text-sm text-ink/70">
                    Administra agencias colaboradoras, porcentajes de comisión
                    y seguimiento de pagos.
                  </p>
                </div>
              </div>
            </div>

            {/* Reportes y Análisis */}
            <div className="rounded-xl border border-gold/20 bg-gradient-to-br from-gold-light/30 to-gold-light/10 p-6">
              <div className="flex items-start gap-3">
                <BarChart3 className="mt-1 text-gold" size={20} />
                <div>
                  <h3 className="mb-1 font-serif text-lg font-semibold text-ink">
                    Reportes y Análisis
                  </h3>
                  <p className="text-sm text-ink/70">
                    Visualiza estadísticas, métricas de uso, consultas frecuentes
                    y datos de rendimiento del sistema.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-lg border border-amber-300/40 bg-amber-50/70 p-4 flex gap-3">
            <AlertCircle className="mt-0.5 shrink-0 text-amber-700" size={18} />
            <div>
              <p className="text-sm font-semibold text-amber-900">
                Modo Demo Activo
              </p>
              <p className="text-sm text-amber-800/80">
                Este es un ambiente de prueba con credenciales de demostración.
                Los cambios no se guardarán de manera permanente.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
