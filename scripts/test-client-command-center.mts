/**
 * Tests del CLIENT COMMAND CENTER.
 *
 * Aquí se prueba lo único que puede mentir: las cuatro señales derivadas
 * (etapa, próxima acción, métricas y última actividad) y la línea de tiempo.
 * Son funciones puras y `now` entra por parámetro, así que el resultado no
 * depende del reloj de quien ejecute esto.
 *
 * Lo que más se vigila:
 *   · que un `null` NO se convierta en un 0 (era el defecto de la ficha vieja);
 *   · que el orden de las próximas acciones respete la prioridad declarada;
 *   · que la etapa no retroceda cuando algo antiguo se archiva;
 *   · que la analítica entre por sesiones y no por vistas.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-client-command-center.mts
 */
import {
  deriveClientStage,
  deriveLastActivity,
  deriveMetrics,
  deriveNextActions,
  type CommandCenterSnapshot,
} from "../lib/client-command-center/derive.ts";
import { buildTimeline, type TimelineInput } from "../lib/client-command-center/timeline.ts";
import { CLIENT_STAGES, isCommandTab } from "../lib/client-command-center/types.ts";

let failures = 0;

function check(name: string, condition: boolean, detail?: string) {
  if (condition) {
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const NOW = new Date("2026-08-19T12:00:00.000Z");
const daysAgo = (n: number) =>
  new Date(NOW.getTime() - n * 86_400_000).toISOString();
const daysAhead = (n: number) =>
  new Date(NOW.getTime() + n * 86_400_000).toISOString();

/** Cliente recién creado: nada de nada. */
function empty(): CommandCenterSnapshot {
  return {
    hasPreferences: false,
    hasAdvisor: false,
    selections: [],
    portalLinks: [],
    shortlists: [],
    itineraries: [],
    visits: [],
    applications: [],
    engagement: { views: 0, lastViewAt: null, totalLinks: 0 },
    lastFeedbackAt: null,
    lastDecisionAt: null,
    lastPortalNoteAt: null,
  };
}

function shortlist(over: Partial<CommandCenterSnapshot["shortlists"][number]> = {}) {
  return {
    id: "sl1",
    status: "reviewing" as const,
    linkState: "active" as const,
    created_at: daysAgo(1),
    first_opened_at: daysAgo(1),
    submitted_at: null,
    client_updated_at: null,
    expires_at: daysAhead(60),
    updatedAfterSubmit: false,
    counts: { total: 19, decided: 16, mustVisit: 10 },
    ...over,
  };
}

function itinerary(over: Partial<CommandCenterSnapshot["itineraries"][number]> = {}) {
  return {
    id: "it1",
    status: "draft",
    scheduled_date: null,
    blockers: 0,
    stopsPendingConfirmation: 0,
    hasActiveShare: false,
    ...over,
  };
}

// ── Etapa ────────────────────────────────────────────────────────────────────
console.log("\n📍 ETAPA DEL CLIENTE\n");

check("sin nada, 'nuevo'", deriveClientStage(empty()) === "new");

check(
  "con preferencias, 'cualificado'",
  deriveClientStage({ ...empty(), hasPreferences: true }) === "qualified",
);

check(
  "una selección viva ya es 'buscando'",
  deriveClientStage({
    ...empty(),
    hasPreferences: true,
    selections: [{ status: "selected" }],
  }) === "sourcing",
);

check(
  "pero SOLO descartadas no llega a 'buscando'",
  deriveClientStage({
    ...empty(),
    hasPreferences: true,
    selections: [{ status: "discarded" }],
  }) === "qualified",
);

check(
  "selección privada enviada → 'selección enviada'",
  deriveClientStage({ ...empty(), shortlists: [shortlist()] }) === "shortlisted",
);

check(
  "el cliente contesta → 'con prioridades'",
  deriveClientStage({
    ...empty(),
    shortlists: [shortlist({ status: "submitted", submitted_at: daysAgo(1) })],
  }) === "prioritised",
);

check(
  "borrador de jornada → 'día montado'",
  deriveClientStage({
    ...empty(),
    shortlists: [shortlist({ status: "submitted" })],
    itineraries: [itinerary()],
  }) === "scheduled",
);

check(
  "una visita completada → 'visitado'",
  deriveClientStage({
    ...empty(),
    visits: [{ status: "completed", requested_at: daysAgo(10) }],
  }) === "visited",
);

check(
  "una solicitud enviada → 'en solicitud'",
  deriveClientStage({
    ...empty(),
    applications: [
      {
        id: "a1",
        status: "pending_review",
        submitted_at: daysAgo(1),
        updated_at: daysAgo(1),
        documentsPending: 2,
      },
    ],
  }) === "applying",
);

check(
  "la etapa NO retrocede porque la selección esté archivada",
  deriveClientStage({
    ...empty(),
    shortlists: [shortlist({ status: "archived" })],
    visits: [{ status: "completed", requested_at: daysAgo(30) }],
  }) === "visited",
);

check(
  "toda etapa derivable está en la lista que pinta el carril",
  CLIENT_STAGES.length === 8 && CLIENT_STAGES[0] === "new",
);

// ── Próxima acción ───────────────────────────────────────────────────────────
console.log("\n🎯 PRÓXIMA ACCIÓN\n");

check("sin datos, la ficha pide lo básico", (() => {
  const a = deriveNextActions(empty(), NOW);
  return a.length === 2 &&
    a[0].kind === "missing_preferences" &&
    a[1].kind === "no_advisor";
})());

check(
  "prioridades sin usar es LO PRIMERO, por encima de todo lo demás",
  (() => {
    const a = deriveNextActions(
      {
        ...empty(),
        hasPreferences: true,
        hasAdvisor: true,
        shortlists: [shortlist({ status: "submitted", submitted_at: daysAgo(1) })],
        portalLinks: [{ status: "callback", last_called_at: daysAgo(2) }],
        visits: [{ status: "pending", requested_at: daysAgo(1) }],
      },
      NOW,
    );
    return a[0].kind === "shortlist_submitted" && a[0].urgency === "now";
  })(),
);

check(
  "…pero si ya hay jornada montada, deja de pedirlo",
  !deriveNextActions(
    {
      ...empty(),
      hasPreferences: true,
      hasAdvisor: true,
      shortlists: [shortlist({ status: "submitted" })],
      itineraries: [itinerary({ status: "published" })],
    },
    NOW,
  ).some((a) => a.kind === "shortlist_submitted"),
);

check(
  "paradas sin confirmar solo si la jornada está PUBLICADA",
  (() => {
    const draft = deriveNextActions(
      { ...empty(), itineraries: [itinerary({ stopsPendingConfirmation: 3 })] },
      NOW,
    );
    const pub = deriveNextActions(
      {
        ...empty(),
        itineraries: [itinerary({ status: "published", stopsPendingConfirmation: 3 })],
      },
      NOW,
    );
    return (
      !draft.some((a) => a.kind === "stops_pending_confirmation") &&
      pub.some((a) => a.kind === "stops_pending_confirmation")
    );
  })(),
);

check(
  "un borrador con bloqueos avisa, con su número",
  (() => {
    const a = deriveNextActions(
      { ...empty(), itineraries: [itinerary({ blockers: 2 })] },
      NOW,
    ).find((x) => x.kind === "itinerary_blockers");
    return a?.vars?.count === 2 && a.tab === "viewings" && a.anchor === "it1";
  })(),
);

check(
  "'volver a llamar' pesa más que 'por llamar'",
  (() => {
    const a = deriveNextActions(
      {
        ...empty(),
        portalLinks: [
          { status: "callback", last_called_at: daysAgo(1) },
          { status: "pending", last_called_at: null },
          { status: "pending", last_called_at: null },
        ],
      },
      NOW,
    ).find((x) => x.kind === "portal_calls_pending");
    return a?.titleKey === "cc.next.portalCallbacks.title" && a.vars?.count === 1;
  })(),
);

check(
  "el enlace a punto de caducar avisa a 7 días, no antes",
  (() => {
    const lejos = deriveNextActions(
      { ...empty(), shortlists: [shortlist({ expires_at: daysAhead(30) })] },
      NOW,
    );
    const cerca = deriveNextActions(
      { ...empty(), shortlists: [shortlist({ expires_at: daysAhead(3) })] },
      NOW,
    );
    const a = cerca.find((x) => x.kind === "shortlist_expiring");
    return (
      !lejos.some((x) => x.kind === "shortlist_expiring") && a?.vars?.days === 3
    );
  })(),
);

check(
  "sin abrir: se calla los tres primeros días y avisa después",
  (() => {
    const pronto = deriveNextActions(
      {
        ...empty(),
        shortlists: [shortlist({ created_at: daysAgo(1), first_opened_at: null })],
      },
      NOW,
    );
    const tarde = deriveNextActions(
      {
        ...empty(),
        shortlists: [shortlist({ created_at: daysAgo(9), first_opened_at: null })],
      },
      NOW,
    );
    return (
      !pronto.some((x) => x.kind === "shortlist_unopened") &&
      tarde.find((x) => x.kind === "shortlist_unopened")?.vars?.days === 9
    );
  })(),
);

check(
  "un enlace caducado ya no pide renovación por caducidad inminente",
  !deriveNextActions(
    {
      ...empty(),
      shortlists: [shortlist({ linkState: "expired", expires_at: daysAgo(1) })],
    },
    NOW,
  ).some((x) => x.kind === "shortlist_expiring"),
);

check(
  "toda acción apunta a una pestaña que existe",
  deriveNextActions(
    {
      ...empty(),
      shortlists: [shortlist({ status: "submitted" })],
      itineraries: [itinerary({ blockers: 1 })],
      visits: [{ status: "pending", requested_at: daysAgo(1) }],
      portalLinks: [{ status: "pending", last_called_at: null }],
      applications: [
        {
          id: "a1",
          status: "pending_review",
          submitted_at: daysAgo(1),
          updated_at: daysAgo(1),
          documentsPending: 3,
        },
      ],
    },
    NOW,
  ).every((a) => isCommandTab(a.tab)),
);

// ── Métricas ─────────────────────────────────────────────────────────────────
console.log("\n📊 MÉTRICAS COMERCIALES\n");

check(
  "sin selección privada contestada, 'sus prioridades' es null y NO cero",
  deriveMetrics(empty()).clientPriorities === null,
);

check(
  "sin enlaces enviados, 'ha mirado' es null y NO cero",
  deriveMetrics(empty()).views === null,
);

check(
  "con enlaces enviados y cero aperturas, SÍ es cero",
  deriveMetrics({
    ...empty(),
    engagement: { views: 0, lastViewAt: null, totalLinks: 2 },
  }).views === 0,
);

check(
  "'en selección' no cuenta las descartadas",
  deriveMetrics({
    ...empty(),
    selections: [
      { status: "selected" },
      { status: "interested" },
      { status: "discarded" },
    ],
  }).selected === 2,
);

check(
  "'jornadas' no cuenta canceladas ni archivadas",
  deriveMetrics({
    ...empty(),
    itineraries: [
      itinerary({ id: "a", status: "published" }),
      itinerary({ id: "b", status: "completed" }),
      itinerary({ id: "c", status: "cancelled" }),
      itinerary({ id: "d", status: "archived" }),
    ],
  }).viewings === 2,
);

check(
  "'sus prioridades' toma la selección más generosa que él haya contestado",
  deriveMetrics({
    ...empty(),
    shortlists: [
      shortlist({ id: "a", status: "submitted", counts: { total: 19, decided: 19, mustVisit: 10 } }),
      shortlist({ id: "b", status: "archived", counts: { total: 5, decided: 5, mustVisit: 3 } }),
    ],
  }).clientPriorities === 10,
);

// ── Última actividad ─────────────────────────────────────────────────────────
console.log("\n🕐 ÚLTIMA ACTIVIDAD\n");

check("sin nada, es null", deriveLastActivity(empty()) === null);

check(
  "gana la marca más reciente, y dice de quién fue",
  (() => {
    const la = deriveLastActivity({
      ...empty(),
      engagement: { views: 5, lastViewAt: daysAgo(1), totalLinks: 1 },
      lastPortalNoteAt: daysAgo(4),
    });
    return la?.source === "analytics" && la.actor === "client";
  })(),
);

check(
  "una nota nuestra más fresca gana, y se marca como nuestra",
  (() => {
    const la = deriveLastActivity({
      ...empty(),
      engagement: { views: 5, lastViewAt: daysAgo(6), totalLinks: 1 },
      lastPortalNoteAt: daysAgo(1),
    });
    return la?.source === "portal_link" && la.actor === "agent";
  })(),
);

check(
  "una fecha corrupta no rompe ni gana",
  (() => {
    const la = deriveLastActivity({
      ...empty(),
      lastFeedbackAt: "no-es-una-fecha",
      lastPortalNoteAt: daysAgo(3),
    });
    return la?.source === "portal_link";
  })(),
);

// ── Línea de tiempo ──────────────────────────────────────────────────────────
console.log("\n📜 LÍNEA DE TIEMPO\n");

function timelineInput(over: Partial<TimelineInput> = {}): TimelineInput {
  return {
    client: { createdAt: daysAgo(40) },
    preferencesUpdatedAt: daysAgo(35),
    portalLinks: [],
    selections: [],
    shortlists: [],
    itineraries: [],
    visits: [],
    applications: [],
    sessions: [],
    ...over,
  };
}

check(
  "sale ordenada de lo más nuevo a lo más viejo",
  (() => {
    const ev = buildTimeline(
      timelineInput({
        selections: [
          {
            id: "s1",
            added_at: daysAgo(2),
            client_feedback_at: null,
            client_rating: 0,
            property: { title: "Padilla" },
          },
        ],
      }),
    );
    for (let i = 1; i < ev.length; i++) {
      if (new Date(ev[i - 1].at) < new Date(ev[i].at)) return false;
    }
    return ev.length === 3;
  })(),
);

check(
  "una fecha nula NO genera evento (en vez de un 'Invalid Date')",
  buildTimeline(timelineInput({ client: { createdAt: null }, preferencesUpdatedAt: null }))
    .length === 0,
);

check(
  "una fecha corrupta tampoco",
  buildTimeline(
    timelineInput({ client: { createdAt: "vete-a-saber" }, preferencesUpdatedAt: null }),
  ).length === 0,
);

check(
  "las decisiones del cliente se atribuyen a él, no a nosotros",
  (() => {
    const ev = buildTimeline(
      timelineInput({
        shortlists: [
          {
            id: "sl1",
            title: null,
            created_at: daysAgo(5),
            first_opened_at: daysAgo(4),
            submitted_at: daysAgo(3),
            counts: { total: 19, mustVisit: 10 },
            items: [
              {
                id: "i1",
                decision: "must_visit",
                decided_at: daysAgo(3),
                property: { title: "Padilla" },
              },
            ],
          },
        ],
      }),
    );
    const enviada = ev.find((e) => e.kind === "sent");
    const decidida = ev.find((e) => e.kind === "decision_must_visit");
    return enviada?.actor === "agent" && decidida?.actor === "client";
  })(),
);

check(
  "'sin decidir' no ensucia la línea aunque tenga fecha",
  !buildTimeline(
    timelineInput({
      shortlists: [
        {
          id: "sl1",
          title: null,
          created_at: daysAgo(5),
          first_opened_at: null,
          submitted_at: null,
          counts: { total: 1, mustVisit: 0 },
          items: [
            {
              id: "i1",
              decision: "undecided",
              decided_at: daysAgo(3),
              property: { title: "X" },
            },
          ],
        },
      ],
    }),
  ).some((e) => e.kind.startsWith("decision_")),
);

check(
  "la analítica entra por SESIÓN: 203 vistas no son 203 filas",
  (() => {
    const ev = buildTimeline(
      timelineInput({
        sessions: [
          {
            sessionId: "s-a",
            at: daysAgo(1),
            views: 120,
            pageType: "client_shortlist",
            device: "mobile",
            city: "Madrid",
            events: { property_view: 40, time_on_page: 9 },
          },
          {
            sessionId: "s-b",
            at: daysAgo(2),
            views: 83,
            pageType: "viewing_collection",
            device: "desktop",
            city: null,
            events: { stop_view: 12 },
          },
        ],
      }),
    );
    const sesiones = ev.filter((e) => e.source === "analytics");
    // `time_on_page` no es una acción del cliente: no debe inflar el recuento.
    return (
      sesiones.length === 2 &&
      sesiones[0].vars?.actions === 40 &&
      sesiones[0].vars?.views === 120
    );
  })(),
);

check(
  "cada evento lleva un id estable y único",
  (() => {
    const ev = buildTimeline(
      timelineInput({
        portalLinks: [
          {
            id: "l1",
            title: "Anuncio",
            created_at: daysAgo(6),
            last_called_at: daysAgo(5),
            status: "callback",
            notes_thread: [
              {
                id: "n1",
                kind: "call",
                body: "No contestan",
                created_at: daysAgo(5),
                authorName: "Fabricio",
              },
            ],
          },
        ],
      }),
    );
    return new Set(ev.map((e) => e.id)).size === ev.length;
  })(),
);

check(
  "el hilo de llamadas conserva quién la hizo",
  buildTimeline(
    timelineInput({
      portalLinks: [
        {
          id: "l1",
          title: "Anuncio",
          created_at: daysAgo(6),
          last_called_at: daysAgo(5),
          status: "callback",
          notes_thread: [
            {
              id: "n1",
              kind: "call",
              body: "Quedó en llamar el lunes",
              created_at: daysAgo(5),
              authorName: "Fabricio",
            },
          ],
        },
      ],
    }),
  ).find((e) => e.kind === "call")?.actorName === "Fabricio",
);

// ── Escenario real: Paul ─────────────────────────────────────────────────────
console.log("\n👤 ESCENARIO PAUL (datos de producción)\n");

const paul: CommandCenterSnapshot = {
  hasPreferences: true,
  hasAdvisor: false,
  selections: Array.from({ length: 20 }, () => ({ status: "selected" })),
  portalLinks: Array.from({ length: 15 }, (_, i) => ({
    status: i < 3 ? "pending" : "converted",
    last_called_at: null,
  })),
  shortlists: [
    shortlist({
      id: "scftdfpgezy946ew",
      status: "submitted",
      submitted_at: daysAgo(1),
      client_updated_at: daysAgo(1),
      counts: { total: 19, decided: 16, mustVisit: 10 },
    }),
  ],
  itineraries: [itinerary({ id: "it1", status: "draft", blockers: 1 })],
  visits: [{ status: "pending", requested_at: daysAgo(5) }],
  applications: [],
  engagement: { views: 203, lastViewAt: daysAgo(0), totalLinks: 9 },
  lastFeedbackAt: null,
  lastDecisionAt: daysAgo(1),
  lastPortalNoteAt: daysAgo(2),
};

check("Paul está en 'día montado'", deriveClientStage(paul) === "scheduled");

check(
  "su próxima acción es resolver el borrador, no volver a pedirle prioridades",
  deriveNextActions(paul, NOW)[0].kind === "itinerary_blockers",
);

check(
  "sus métricas son 20 / 10 / 1 / 203",
  (() => {
    const m = deriveMetrics(paul);
    return (
      m.selected === 20 &&
      m.clientPriorities === 10 &&
      m.viewings === 1 &&
      m.views === 203
    );
  })(),
);

check(
  "su última señal es suya, no nuestra",
  deriveLastActivity(paul)?.actor === "client",
);

check(
  "y se le sigue pidiendo asesor, pero al final de la cola",
  (() => {
    const a = deriveNextActions(paul, NOW);
    return a[a.length - 1].kind === "no_advisor";
  })(),
);

// ============================================================================
console.log(`\n${failures === 0 ? "✅ TODO OK" : `❌ ${failures} FALLO(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
