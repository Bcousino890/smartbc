import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, Info, Lock } from "lucide-react";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { resolveCountryAccess, type CountryAccessProfile } from "@/lib/auth/country-access";
import { getCountryConfig, type Country } from "@/lib/country-config";
import { createAdminClient } from "@/lib/db/admin";
import { getEffectiveRoleAndPermissions } from "@/lib/db/queries/permissions";
import { getCurrentProfile } from "@/lib/db/queries/session";
import { getMailboxRow, isConnected } from "@/lib/mailbox/store";
import {
  buildGuide,
  COUNTRY_LABELS,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
} from "@/lib/onboarding/guide";
import { ACTION_LABELS } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * Guía de inicio para usuarios nuevos. Se arma con los permisos EFECTIVOS del
 * usuario en el país activo (ver lib/onboarding/guide.ts): solo explica los
 * módulos de su menú y los pasos que el servidor le va a dejar hacer.
 * No tiene recurso de permisos propio: todo el staff la ve (el layout ya
 * exige rol de staff y acceso al país).
 */
export default async function GuiaPage({ params }: { params: Promise<{ country: Country }> }) {
  const { country } = await params;
  const config = getCountryConfig(country);
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");

  const [{ effectiveRole, isCustomRole, permissions }, customRoleLabel, mailbox, admins] =
    await Promise.all([
      getEffectiveRoleAndPermissions(profile.id, profile.role, country),
      getCustomRoleLabel(profile.id),
      getMailboxRow(profile.id).catch(() => null),
      getAdminNames(profile.id),
    ]);

  const guide = buildGuide({ role: effectiveRole, permissions, country });
  const access = resolveCountryAccess(profile as CountryAccessProfile);
  const firstName = profile.full_name?.trim().split(/\s+/)[0] || null;

  const roleLabel = isCustomRole && customRoleLabel
    ? customRoleLabel
    : ROLE_LABELS[effectiveRole] ?? effectiveRole;
  const roleDescription = isCustomRole
    ? "Rol personalizado: un administrador eligió a mano qué puedes hacer en cada módulo. Abajo lo tienes detallado."
    : ROLE_DESCRIPTIONS[effectiveRole] ?? "";
  const countryRoleDiffers = !isCustomRole && effectiveRole !== profile.role;
  const mailboxReady = isConnected(mailbox) && !mailbox.last_error;
  const canSeeMailbox = guide.modules.some((m) => m.href === "/admin/correo");
  const href = (path: string) => path.replace("/admin", config.prefix);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] flex-col px-6 pb-12 lg:px-10">
      <AdminPageHeader titleKey="admin.nav.guia" subtitleKey="guia.subtitle" />

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
              done={mailboxReady}
              doneLabel="Conectado"
            >
              {mailboxReady
                ? "Ya lees y envías tu correo @bcousinoprop.com desde el CRM."
                : mailbox?.last_error
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
              {m.actions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.actions.map((a) => (
                    <span
                      key={a}
                      className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-xs text-emerald-800"
                    >
                      {ACTION_LABELS[a]}
                    </span>
                  ))}
                </div>
              )}
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

/** Nombre del rol personalizado del usuario (custom_roles, migración 0090). */
async function getCustomRoleLabel(userId: string): Promise<string | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient({ timeoutMs: 5_000 }) as any;
    const { data: p } = await db.from("profiles").select("custom_role_id").eq("id", userId).maybeSingle();
    if (!p?.custom_role_id) return null;
    const { data: r } = await db.from("custom_roles").select("label").eq("id", p.custom_role_id).maybeSingle();
    return (r?.label as string | undefined)?.trim() || null;
  } catch {
    return null;
  }
}

/** Propietarios y administradores (quienes pueden dar permisos), sin el propio usuario. */
async function getAdminNames(selfId: string): Promise<string[]> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient({ timeoutMs: 5_000 }) as any;
    const { data } = await db
      .from("profiles")
      .select("id, full_name")
      .in("role", ["owner", "admin"])
      .neq("id", selfId)
      .order("full_name")
      .limit(4);
    return ((data ?? []) as { full_name: string | null }[])
      .map((r) => r.full_name?.trim())
      .filter((n): n is string => Boolean(n));
  } catch {
    return [];
  }
}
