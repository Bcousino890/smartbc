import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Info, Lock } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { PermissionsTable } from "@/components/admin/onboarding/permissions-table";
import { RoleComparisonTable } from "@/components/admin/onboarding/role-comparison-table";
import type { CountryAccess } from "@/lib/auth/country-access";
import {
  COUNTRY_LABELS,
  type GuideView,
  type PermissionTableRow,
  type RoleComparisonRow,
} from "@/lib/onboarding/guide";

/**
 * Presentación de la Guía de inicio (`/{país}/admin/guia`). Sin datos propios:
 * todo llega ya calculado de la página (permisos efectivos, país, correo…).
 */
export function GuiaView({
  country,
  prefix,
  firstName,
  roleLabel,
  roleDescription,
  countryRoleDiffers,
  access,
  guide,
  table,
  comparison,
  myColumn,
  mailboxState,
  admins,
}: {
  country: string;
  /** `/es/admin` o `/cl/admin`. */
  prefix: string;
  firstName: string | null;
  roleLabel: string;
  roleDescription: string;
  countryRoleDiffers: boolean;
  access: CountryAccess;
  guide: GuideView;
  table: PermissionTableRow[];
  comparison: RoleComparisonRow[];
  /** Columna de su rol en la comparativa (-1 si es un rol personalizado). */
  myColumn: number;
  mailboxState: "ready" | "reconnect" | "pending";
  /** Propietarios/administradores a quienes pedir permisos. */
  admins: string[];
}) {
  const canSeeMailbox = guide.modules.some((m) => m.href === "/admin/correo");
  const href = (path: string) => path.replace("/admin", prefix);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-6 pb-12 lg:px-10">
      <AdminPageHeader titleKey="admin.nav.guia" subtitleKey="guia.subtitle" welcome={false} />

      <p className="mt-6 max-w-3xl text-base text-ink/75">
        {firstName ? `Hola ${firstName}. ` : ""}
        Esta guía se adapta a tu cuenta: solo te explica lo que ves en tu menú y lo que
        puedes hacer en cada módulo. Si un administrador te cambia los permisos, la guía
        cambia con ellos.
      </p>

      {/* ── Tu cuenta ─────────────────────────────────────────────────── */}
      <section className="mt-8 grid gap-4 md:grid-cols-2">
        <Card>
          <p className="crm-label-sm text-ink/55">TU ROL</p>
          <p className="mt-2 text-lg font-semibold text-ink">{roleLabel}</p>
          <p className="mt-1 text-sm text-ink/65">{roleDescription}</p>
          {countryRoleDiffers && (
            <p className="mt-2 text-sm text-ink/65">
              En {COUNTRY_LABELS[country]} tienes este rol; en otro país puedes tener otro
              distinto.
            </p>
          )}
        </Card>
        <Card>
          <p className="crm-label-sm text-ink/55">TUS PAÍSES</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {access.countries.map((c) => (
              <span
                key={c}
                className={
                  c === country
                    ? "rounded-full border border-gold/60 bg-gold/15 px-3 py-1 text-sm text-ink"
                    : "rounded-full border border-ink/15 px-3 py-1 text-sm text-ink/60"
                }
              >
                {COUNTRY_LABELS[c] ?? c}
              </span>
            ))}
          </div>
          <p className="mt-2 text-sm text-ink/65">
            {access.canSwitchCountry
              ? "Cambias de país con las banderas de arriba del menú. Tus permisos y lo que ves pueden ser distintos en cada país."
              : `Trabajas en ${COUNTRY_LABELS[access.defaultCountry]}. Si también necesitas el otro país, pídeselo a un administrador.`}
          </p>
        </Card>
      </section>

      {guide.scopeNotes.length > 0 && (
        <div className="mt-4 flex gap-3 rounded-2xl border border-amber-200 bg-amber-50/80 p-4 text-sm text-amber-900">
          <Info size={18} className="mt-0.5 shrink-0" />
          <div className="space-y-1">
            {guide.scopeNotes.map((note) => (
              <p key={note}>{note}</p>
            ))}
          </div>
        </div>
      )}

      {/* ── Tus permisos ──────────────────────────────────────────────── */}
      <section className="mt-10" id="permisos">
        <h2 className="crm-section-title text-ink">Tus permisos</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink/55">
          Lo que puedes hacer en {COUNTRY_LABELS[country]}, tal y como lo comprueba el
          servidor. Si algo no está marcado y lo necesitas, pídeselo a un administrador.
        </p>
        <PermissionsTable rows={table} />

        <details className="group mt-6 rounded-2xl border border-gold/15 bg-cream-50/85" id="roles">
          <summary className="cursor-pointer list-none px-5 py-4 font-semibold text-ink">
            <span className="mr-2 inline-block transition group-open:rotate-90">›</span>
            Qué puede hacer cada rol (por defecto, sin excepciones)
          </summary>
          <div className="border-t border-gold/15">
            <RoleComparisonTable rows={comparison} highlightColumn={myColumn} />
          </div>
        </details>
      </section>

      {/* ── Primeros pasos ────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="crm-section-title text-ink">Primeros pasos</h2>
        <ol className="mt-4 space-y-3">
          <Step n={1} title="Tu contraseña">
            Si entraste con el enlace de la invitación, ya la elegiste. Para cambiarla cuando
            quieras, usa «¿Olvidaste tu contraseña?» en la pantalla de acceso: te llega un
            enlace a tu correo.{" "}
            <Link href="/auth/forgot-password" className="text-gold hover:underline">
              Cambiar contraseña
            </Link>
          </Step>
          {canSeeMailbox && (
            <Step
              n={2}
              title="Conecta tu correo corporativo"
              done={mailboxState === "ready"}
              doneLabel="Conectado"
            >
              {mailboxState === "ready"
                ? "Ya lees y envías tu correo @bcousinoprop.com desde el CRM."
                : mailboxState === "reconnect"
                  ? "Tu correo necesita volver a conectarse (¿cambiaste la contraseña en cPanel?)."
                  : "Lee y envía tu correo @bcousinoprop.com sin salir del CRM. Solo se conecta una vez."}{" "}
              <Link href={href("/admin/correo")} className="text-gold hover:underline">
                Ir a Correo
              </Link>
            </Step>
          )}
          <Step n={canSeeMailbox ? 3 : 2} title="Recorre tus módulos">
            Abajo tienes cada módulo de tu menú, para qué sirve y lo que puedes hacer en él.
          </Step>
          <Step n={canSeeMailbox ? 4 : 3} title="¿Te falta algo?">
            Si necesitas un módulo o una acción que no tienes, pídeselo a
            {admins.length > 0 ? ` ${formatList(admins)}` : " un administrador"}. Se activa
            desde Usuarios → «Permisos», sin cambiarte el rol.
          </Step>
        </ol>
      </section>

      {/* ── Tus módulos ───────────────────────────────────────────────── */}
      <section className="mt-10" id="modulos">
        <h2 className="crm-section-title text-ink">Tus módulos</h2>
        <p className="mt-1 text-sm text-ink/55">
          Lo que tienes en el menú de {COUNTRY_LABELS[country]}, en el mismo orden.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {guide.modules.map((m) => (
            <Card key={m.href}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-lg font-semibold text-ink">{m.title}</h3>
                <Link
                  href={href(m.href)}
                  className="flex shrink-0 items-center gap-1 text-sm font-medium text-gold hover:underline"
                >
                  Abrir <ArrowRight size={14} />
                </Link>
              </div>
              <p className="mt-1 text-sm text-ink/65">{m.summary}</p>
              {m.steps.length > 0 && (
                <ul className="mt-3 space-y-1.5">
                  {m.steps.map((s) => (
                    <li key={s} className="flex gap-2 text-sm text-ink/80">
                      <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-gold" />
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          ))}
        </div>
      </section>

      {guide.hidden.length > 0 && (
        <section className="mt-10">
          <h2 className="crm-section-title text-ink">Módulos sin acceso</h2>
          <p className="mt-1 max-w-3xl text-sm text-ink/55">
            Existen en {COUNTRY_LABELS[country]} pero tu cuenta no los tiene. Si los
            necesitas para tu trabajo, pídelos a un administrador.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {guide.hidden.map((h) => (
              <span
                key={h.href}
                className="flex items-center gap-1.5 rounded-full border border-ink/15 px-3 py-1 text-sm text-ink/55"
              >
                <Lock size={12} /> {h.title}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* ── Si algo falla ─────────────────────────────────────────────── */}
      <section className="mt-10">
        <h2 className="crm-section-title text-ink">Si algo falla</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Faq q="«No tienes permiso para esta acción»">
            Tu cuenta no tiene ese permiso: no es un error del CRM. Pídeselo a un
            administrador.
          </Faq>
          <Faq q="«Failed to fetch» al guardar">
            Se cortó la conexión, pero el cambio pudo guardarse igual. Recarga la página y
            comprueba antes de repetirlo, para no duplicar nada.
          </Faq>
          <Faq q="No veo un módulo que usa un compañero">
            Depende de tu rol y del país activo: Agencias, Particulares, Idealista,
            Sindicación y Diagnóstico solo existen en España; Captaciones, solo en Chile.
          </Faq>
          <Faq q="Una subida no termina">
            Límites: vídeos 500 MB, planos 100 MB, adjuntos de WhatsApp 10 MB y de correo
            100 MB por archivo. Si con menos falla, avisa a soporte con el mensaje exacto.
          </Faq>
        </div>
      </section>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gold/15 bg-cream-50/85 p-5 shadow-[0_15px_40px_-25px_rgba(40,28,10,0.20)] backdrop-blur-sm">
      {children}
    </div>
  );
}

function Step({
  n,
  title,
  done,
  doneLabel,
  children,
}: {
  n: number;
  title: string;
  done?: boolean;
  doneLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-4 rounded-2xl border border-gold/15 bg-cream-50/85 p-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold/15 text-sm font-semibold text-ink">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-semibold text-ink">{title}</p>
          {done !== undefined &&
            (done ? (
              <span className="flex items-center gap-1 text-xs text-emerald-700">
                <CheckCircle2 size={14} /> {doneLabel}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-xs text-ink/50">
                <Circle size={14} /> Pendiente
              </span>
            ))}
        </div>
        <p className="mt-1 text-sm text-ink/70">{children}</p>
      </div>
    </li>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <Card>
      <p className="font-semibold text-ink">{q}</p>
      <p className="mt-1 text-sm text-ink/70">{children}</p>
    </Card>
  );
}

function formatList(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} o ${names[names.length - 1]}`;
}

