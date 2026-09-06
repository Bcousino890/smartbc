# -*- coding: utf-8 -*-
"""Comprueba que TODA clave i18n usada en el Command Center existe en los
cuatro idiomas. Incluye las que se arman con plantilla (`cc.tab.${x}`),
expandiéndolas con los valores posibles."""
import re, os, sys, json

src = open("lib/i18n/dictionary.ts", encoding="utf-8").read()
blocks = {}
for lang in ("es", "en", "fr", "de"):
    m = re.search(r"const %s: Strings = \{(.*?)\n\};" % lang, src, re.S)
    keys = set(re.findall(r'^\s*"([^"]+)":', m.group(1), re.M))
    blocks[lang] = keys

FILES = []
for root in ("app/[country]/(admin)/admin/clientes/[id]", "lib/client-command-center",
             "app/[country]/(admin)/admin/solicitudes", "lib/sales-inbox"):
    for dp, _, fns in os.walk(root):
        for fn in fns:
            if fn.endswith((".ts", ".tsx")):
                FILES.append(os.path.join(dp, fn))

used = set()
for f in FILES:
    code = open(f, encoding="utf-8").read()
    used |= set(re.findall(r'(?<![A-Za-z0-9_])t\(\s*"([a-zA-Z0-9_.-]+)"', code))
    used |= set(re.findall(r'titleKey:\s*"([a-zA-Z0-9_.]+)"', code))
    used |= set(re.findall(r'detailKey:\s*"([a-zA-Z0-9_.]+)"', code))

# Claves por plantilla, expandidas a mano con sus dominios reales.
TEMPLATES = {
 "cc.stage.": ["new","qualified","sourcing","shortlisted","prioritised","scheduled","visited","applying"],
 "cc.tab.": ["overview","properties","viewings","application","activity"],
 "cc.next.cta.": ["overview","properties","viewings","application","activity"],
 "cc.timeline.filter.": ["all","client","agent"],
 "cc.timeline.by.": ["client","agent","system"],
 "cc.lastActivity.by.": ["client","agent"],
 "cc.country.": ["es","cl"],
 "cc.shortlist.status.": ["reviewing","submitted","archived"],
 "cc.shortlist.link.": ["active","expired","revoked"],
 "cc.itinerary.status.": ["draft","published","completed","cancelled","archived"],
 "cc.applications.status.": ["draft","pending_review","approved","rejected","completed"],
 "cc.applications.operation.": ["rent","sale"],
 "cc.applications.doc.": ["pending","verified","rejected","needs_correction"],
 "cc.event.": ["collection_open","comment_added","decision_change","priority_change",
               "property_added","property_discarded","property_restored","property_view",
               "share_click","shortlist_open","shortlist_submitted","stop_expand",
               "stop_view","time_on_page"],
 "clientes.profile.": ["student","worker","company","family","investor"],
 "inbox.group.by.": ["none","property"],
 "inbox.operation.": ["all","sale","rent","mixed","unknown"],
 "inbox.view.": ["needs-attention","new","follow-up","my-leads","unassigned","all"],
 "inbox.empty.": ["needs-attention","new","follow-up","my-leads","unassigned","all"],
 "inbox.state.": ["new","contacted","engaged","converted","discarded"],
 "inbox.sort.": ["default","newest","oldest","activity","due"],
 "inbox.type.": ["particular","agencia","relocation"],
 "inbox.reason.": ["reply_unanswered","follow_up_overdue","follow_up_due_today",
                   "chat_opened_no_message","fresh_uncontacted","assigned_untouched",
                   "unmatched_property","possible_duplicate","missing_contact",
                   "client_exists_unlinked"],
 "inbox.log.call.": ["answered","no_answer","callback"],
 "inbox.client.matchedBy.": ["email","phone","phone_tail"],
 "inbox.activity.kind.": ["call","whatsapp","email","note","assignment","follow_up",
                          "conversion","discarded","status"],
 "inbox.property.status.": ["available","reserved","rented","sold","archived","draft"],
 "clientes.ficha.visits.status.": ["pending","confirmed","completed","cancelled"],
 "filters.operation.": ["rent","sale"],
 "card.stay.": ["short","long"],
}
for pre, vals in TEMPLATES.items():
    for v in vals:
        used.add(pre + v)

problems = []
for k in sorted(used):
    for lang in ("es","en","fr","de"):
        if k not in blocks[lang]:
            problems.append((k, lang))

if problems:
    print("FALTAN %d:" % len(problems))
    for k, lang in problems[:60]:
        print("  %-45s %s" % (k, lang))
    sys.exit(1)
# Paridad total de las claves cc.* : si una forma singular solo existe en
# español, `useTn` la elige y el resto de idiomas ve la cadena equivocada.
cc = {lang: {k for k in ks if k.startswith("cc.") or k.startswith("inbox.")} for lang, ks in blocks.items()}
desync = []
for lang in ("en","fr","de"):
    for k in sorted(cc["es"] ^ cc[lang]):
        desync.append((k, lang))
if desync:
    print("DESINCRONIZADAS %d:" % len(desync))
    for k, lang in desync[:40]:
        print("  %-50s %s" % (k, lang))
    sys.exit(1)

print("OK — %d claves usadas presentes en es/en/fr/de; %d claves cc.*/inbox.* en paridad"
      % (len(used), len(cc["es"])))
