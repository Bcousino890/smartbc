/**
 * Tests de la SALES INBOX.
 *
 * Dos cosas se prueban aquí, y la segunda es la que de verdad importa:
 *
 *  1 · Las derivaciones puras — estado comercial, motivos de atención,
 *      seguimiento — con `now` inyectado, así que no dependen del reloj.
 *
 *  2 · **Paridad entre SQL y TypeScript.** La regla del estado comercial vive
 *      dos veces: en la vista `lead_inbox_facts` (para poder filtrar y paginar
 *      en servidor) y en `derive.ts` (para pintar y para probarla). Si se
 *      separan, la bandeja empieza a mentir otra vez. Con las credenciales de
 *      producción en el entorno, este script compara lead a lead.
 *
 * Ejecutar:
 *   node --experimental-strip-types --import ./scripts/node-ts-loader.mjs \
 *     scripts/test-sales-inbox.mts
 */
import {
  attentionScore,
  deriveAttention,
  deriveCommercialState,
  deriveFirstContactAt,
  deriveFollowUpState,
  deriveLastActivityAt,
  needsAttention,
  type LeadFacts,
} from "../lib/sales-inbox/derive.ts";
import {
  FRESH_WINDOW_DAYS,
  isInboxView,
  NO_WHATSAPP,
  REASON_PRIORITY,
} from "../lib/sales-inbox/types.ts";

let failures = 0;
function check(name: string, condition: boolean, detail?: string) {
  if (condition) console.log(`  ✅ ${name}`);
  else {
    failures++;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const NOW = new Date("2026-08-20T12:00:00.000Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
const ahead = (d: number) => new Date(NOW.getTime() + d * 86_400_000).toISOString();

function lead(over: Partial<LeadFacts> = {}): LeadFacts {
  return {
    createdAt: ago(1),
    legacyStatus: "nuevo",
    assignedTo: null,
    clientId: null,
    nextActionAt: null,
    matchedPropertyId: "p1",
    name: "Paul",
    phone: "+34 600 000 000",
    whatsapp: { ...NO_WHATSAPP },
    activity: [],
    duplicatePhone: false,
    clientCandidate: false,
    ...over,
  };
}

// ── Estado comercial ─────────────────────────────────────────────────────────
console.log("\n📌 ESTADO COMERCIAL (derivado de hechos)\n");

check("un lead recién llegado es 'nuevo'", deriveCommercialState(lead()) === "new");

check(
  "ESCENARIO A · con WhatsApp enviado ya NO es 'sin contactar'",
  deriveCommercialState(
    lead({
      whatsapp: { ...NO_WHATSAPP, conversationId: "c1", outbound: 2, firstOutboundAt: ago(1) },
    }),
  ) === "contacted",
);

check(
  "…y si él contestó, pasa a 'en conversación'",
  deriveCommercialState(
    lead({ whatsapp: { ...NO_WHATSAPP, conversationId: "c1", outbound: 2, inbound: 1 } }),
  ) === "engaged",
);

check(
  "abrir el chat SIN escribir no es contactar",
  deriveCommercialState(
    lead({ whatsapp: { ...NO_WHATSAPP, conversationId: "c1", outbound: 0 } }),
  ) === "new",
);

check(
  "una llamada registrada cuenta como contacto",
  deriveCommercialState(
    lead({ activity: [{ kind: "call", outcome: "no_answer", createdAt: ago(1) }] }),
  ) === "contacted",
);

check(
  "una llamada CONTESTADA cuenta como conversación",
  deriveCommercialState(
    lead({ activity: [{ kind: "call", outcome: "answered", createdAt: ago(1) }] }),
  ) === "engaged",
);

check(
  "una nota NO es contacto: escribir para uno mismo no es hablar con nadie",
  deriveCommercialState(
    lead({ activity: [{ kind: "note", outcome: null, createdAt: ago(1) }] }),
  ) === "new",
);

check(
  "con cliente vinculado es 'cliente', pase lo que pase",
  deriveCommercialState(lead({ clientId: "cl1", legacyStatus: "descartado" })) === "converted",
);

check(
  "descartado explícito gana a todo lo demás salvo la conversión",
  deriveCommercialState(
    lead({
      legacyStatus: "descartado",
      whatsapp: { ...NO_WHATSAPP, conversationId: "c1", outbound: 3, inbound: 2 },
    }),
  ) === "discarded",
);

// ── Primer contacto y última señal ───────────────────────────────────────────
console.log("\n🕐 MARCAS DE TIEMPO\n");

check(
  "el primer contacto es el más ANTIGUO de los que consten",
  deriveFirstContactAt(
    lead({
      whatsapp: { ...NO_WHATSAPP, conversationId: "c1", outbound: 1, firstOutboundAt: ago(3) },
      activity: [{ kind: "call", outcome: "answered", createdAt: ago(5) }],
    }),
  ) === ago(5),
);

check(
  "sin contacto, no hay primera fecha (y no se inventa)",
  deriveFirstContactAt(lead()) === null,
);

check(
  "la última señal gana al resto",
  deriveLastActivityAt(
    lead({
      whatsapp: { ...NO_WHATSAPP, conversationId: "c1", lastMessageAt: ago(1) },
      activity: [{ kind: "note", outcome: null, createdAt: ago(4) }],
    }),
  ) === ago(1),
);

// ── Atención ─────────────────────────────────────────────────────────────────
console.log("\n🎯 NECESITAN ATENCIÓN\n");

check(
  "ESCENARIO B · un lead de hace diez minutos es nuevo y entra en la cola",
  (() => {
    const r = deriveAttention(
      lead({ createdAt: new Date(NOW.getTime() - 600_000).toISOString() }),
      NOW,
    );
    return r.includes("fresh_uncontacted") && needsAttention(r);
  })(),
);

check(
  "ESCENARIO C · a los 8 días sin contacto sigue reclamando",
  needsAttention(deriveAttention(lead({ createdAt: ago(8) }), NOW)),
);

check(
  `…pero pasados ${FRESH_WINDOW_DAYS} días deja de ser "atención" y pasa a ser cola de fondo`,
  !deriveAttention(lead({ createdAt: ago(40) }), NOW).includes("fresh_uncontacted"),
);

check(
  "que él conteste y siga esperando es P1",
  (() => {
    const r = deriveAttention(
      lead({
        whatsapp: {
          ...NO_WHATSAPP,
          conversationId: "c1",
          outbound: 1,
          inbound: 1,
          awaitingReply: true,
        },
      }),
      NOW,
    );
    return r[0] === "reply_unanswered" && REASON_PRIORITY[r[0]] === 1;
  })(),
);

check(
  "ESCENARIO D · un seguimiento vencido es P1; uno de mañana, no",
  (() => {
    const tarde = deriveAttention(lead({ nextActionAt: ago(1) }), NOW);
    const manana = deriveAttention(lead({ nextActionAt: ahead(1) }), NOW);
    return (
      tarde.includes("follow_up_overdue") &&
      !manana.includes("follow_up_overdue") &&
      !manana.includes("follow_up_due_today")
    );
  })(),
);

check(
  "un seguimiento para dentro de unas horas es 'para hoy'",
  deriveAttention(
    lead({ nextActionAt: new Date(NOW.getTime() + 5 * 3600_000).toISOString() }),
    NOW,
  ).includes("follow_up_due_today"),
);

check(
  "chat abierto sin escribir reclama atención (los 9 casos de producción)",
  needsAttention(
    deriveAttention(
      lead({
        createdAt: ago(40),
        whatsapp: { ...NO_WHATSAPP, conversationId: "c1", outbound: 0 },
      }),
      NOW,
    ),
  ),
);

check(
  "un lead asignado y sin tocar en 3 días avisa",
  deriveAttention(lead({ assignedTo: "u1", createdAt: ago(5) }), NOW).includes(
    "assigned_untouched",
  ),
);

check(
  "un lead convertido no reclama nada",
  deriveAttention(lead({ clientId: "c1", nextActionAt: ago(5) }), NOW).length === 0,
);

check(
  "un lead descartado tampoco",
  deriveAttention(lead({ legacyStatus: "descartado", createdAt: ago(1) }), NOW).length === 0,
);

check(
  "las pistas de calidad NO meten a nadie en la cola por sí solas",
  (() => {
    const r = deriveAttention(
      lead({
        createdAt: ago(60),
        matchedPropertyId: null,
        duplicatePhone: true,
        name: null,
        whatsapp: { ...NO_WHATSAPP, conversationId: "c1", outbound: 1 },
      }),
      NOW,
    );
    return r.length > 0 && !needsAttention(r);
  })(),
);

check(
  "el orden pone P1 por encima de P2, y a igual prioridad al que lleva más esperando",
  (() => {
    const p1 = attentionScore(["reply_unanswered"], ago(1), NOW);
    const p2Viejo = attentionScore(["fresh_uncontacted"], ago(10), NOW);
    const p2Nuevo = attentionScore(["fresh_uncontacted"], ago(1), NOW);
    return p1 > p2Viejo && p2Viejo > p2Nuevo;
  })(),
);

check("sin motivos, la puntuación es cero", attentionScore([], ago(1), NOW) === 0);

// ── Seguimiento ──────────────────────────────────────────────────────────────
console.log("\n📅 SEGUIMIENTO\n");

check("sin fecha, no hay seguimiento", deriveFollowUpState(null, NOW) === "none");
check("una fecha pasada está vencida", deriveFollowUpState(ago(1), NOW) === "overdue");
check(
  "dentro de unas horas es hoy",
  deriveFollowUpState(new Date(NOW.getTime() + 4 * 3600_000).toISOString(), NOW) === "today",
);
check("dentro de tres días es más adelante", deriveFollowUpState(ahead(3), NOW) === "later");

check("las vistas de la bandeja se validan", isInboxView("needs-attention") && !isInboxView("x"));

// ── Paridad SQL ↔ TypeScript ─────────────────────────────────────────────────
console.log("\n🔗 PARIDAD SQL ↔ TYPESCRIPT\n");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log(
    "  ⚠️  sin credenciales en el entorno: se omite la comparación contra producción",
  );
  console.log(
    "      (NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY, o ejecútalo en el VPS)",
  );
} else {
  const res = await fetch(
    `${url}/rest/v1/lead_inbox_facts?select=id,legacy_status,client_id,wa_conversation_id,wa_outbound,wa_inbound,wa_awaiting_reply,activity_has_touch,activity_answered_call,commercial_state,created_at,next_action_at,matched_property_id,name,phone,assigned_to,duplicate_phone&limit=2000`,
    { headers: { apikey: key, Authorization: `Bearer ${key}` } },
  );
  if (!res.ok) {
    failures++;
    console.log(`  ❌ no se pudo leer la vista (${res.status})`);
  } else {
    const rows = (await res.json()) as any[];
    let mismatches = 0;
    const counts: Record<string, number> = {};
    for (const r of rows) {
      const facts: LeadFacts = {
        createdAt: r.created_at,
        legacyStatus: r.legacy_status,
        assignedTo: r.assigned_to,
        clientId: r.client_id,
        nextActionAt: r.next_action_at,
        matchedPropertyId: r.matched_property_id,
        name: r.name,
        phone: r.phone,
        whatsapp: {
          conversationId: r.wa_conversation_id,
          outbound: Number(r.wa_outbound ?? 0),
          inbound: Number(r.wa_inbound ?? 0),
          firstOutboundAt: null,
          lastMessageAt: null,
          awaitingReply: Boolean(r.wa_awaiting_reply),
        },
        activity: [
          ...(r.activity_has_touch
            ? [{ kind: "call", outcome: null, createdAt: r.created_at }]
            : []),
          ...(r.activity_answered_call
            ? [{ kind: "call", outcome: "answered", createdAt: r.created_at }]
            : []),
        ],
        duplicatePhone: Boolean(r.duplicate_phone),
        clientCandidate: false,
      };
      const ts = deriveCommercialState(facts);
      counts[ts] = (counts[ts] ?? 0) + 1;
      if (ts !== r.commercial_state) {
        mismatches++;
        if (mismatches <= 3) {
          console.log(`     · ${r.id}: SQL=${r.commercial_state} TS=${ts}`);
        }
      }
    }
    check(
      `la vista y derive.ts coinciden en los ${rows.length} leads de producción`,
      mismatches === 0,
      `${mismatches} discrepancias`,
    );
    console.log(
      `     reparto real: ${Object.entries(counts)
        .map(([k, v]) => `${k} ${v}`)
        .join(" · ")}`,
    );
  }
}

// ============================================================================
console.log(`\n${failures === 0 ? "✅ TODO OK" : `❌ ${failures} FALLO(S)`}\n`);
process.exit(failures === 0 ? 0 : 1);
