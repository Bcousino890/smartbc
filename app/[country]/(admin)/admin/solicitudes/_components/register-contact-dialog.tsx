"use client";

// ============================================================================
// REGISTRAR CONTACTO
//
// Un resultado (obligatorio), una nota (opcional) y, si procede, el siguiente
// paso. UNA confirmación guarda las dos cosas en una transacción
// (registerContact → lead_register_contact). La clave `clientKey` se fija al
// abrir: un doble clic o un reintento tras un corte no duplica nada.
//
// «Volver a llamar» no es un resultado: es una tarea. Que el teléfono sonara no
// demuestra que se hablara, así que el resultado de la llamada se elige aparte.
// Si falla, lo escrito se queda; al cerrar con cambios sin guardar, se avisa.
// ============================================================================

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LeadDetail } from "@/lib/db/queries/sales-inbox";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { Button, Labeled, Modal, TextArea, TextInput } from "@/components/admin/ui/primitives";
import { formatDateTime } from "@/app/[country]/(admin)/admin/clientes/[id]/_components/format";
import {
  DEFAULT_TASK_TIME,
  TASK_TZ,
  madridDatePlus,
  madridToIso,
} from "@/lib/sales-inbox/time";
import { registerContact } from "../inbox-actions";

type Result = "answered" | "no_answer" | "email" | "whatsapp";
const RESULTS: Result[] = ["answered", "no_answer", "email", "whatsapp"];

function newKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Navegadores antiguos: uuid v4 suficiente para idempotencia.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export function RegisterContactDialog({
  lead,
  locale,
  onClose,
  completingTask = false,
}: {
  lead: LeadDetail;
  locale: string;
  onClose: () => void;
  /** Abierto desde «Marcar como hecho»: la tarea pendiente ya va marcada. */
  completingTask?: boolean;
}) {
  const t = useT();
  const router = useRouter();
  const [clientKey] = useState(newKey);
  const [result, setResult] = useState<Result | null>(null);
  const [note, setNote] = useState("");
  const [withTask, setWithTask] = useState(false);
  const [date, setDate] = useState(() => madridDatePlus(new Date(), 1));
  const [time, setTime] = useState(DEFAULT_TASK_TIME);
  const [action, setAction] = useState("");
  const [completeTask, setCompleteTask] = useState(completingTask && !!lead.nextActionAt);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();

  const dueIso = useMemo(() => (withTask ? madridToIso(date, time) : null), [withTask, date, time]);
  const dirty = !!result || !!note.trim() || withTask || !!action.trim();
  const canSave = !!result && (!withTask || (!!dueIso && !!action.trim())) && !saving;

  const close = () => {
    if (dirty && !saving && !window.confirm(t("inbox.contact.discardDraft"))) return;
    onClose();
  };

  const submit = () => {
    if (!canSave || !result) return;
    setError(null);
    startSave(async () => {
      const r = await registerContact({
        leadId: lead.id,
        result,
        note,
        task: withTask && dueIso ? { at: dueIso, note: action } : null,
        completeTask: !withTask && completeTask,
        clientKey,
      });
      if (!r.ok) {
        // Lo escrito se conserva: solo se enseña el fallo.
        setError(r.error);
        return;
      }
      router.refresh();
      onClose();
    });
  };

  const shortcut = (days: number) => {
    setWithTask(true);
    setDate(madridDatePlus(new Date(), days));
  };

  return (
    <Modal
      open
      onClose={close}
      title={t("inbox.contact.title")}
      footer={
        <>
          <Button onClick={close} disabled={saving}>{t("common.cancel")}</Button>
          <Button variant="primary" onClick={submit} disabled={!canSave}>
            {saving ? t("cc.saving") : withTask ? t("inbox.contact.saveWithTask") : t("inbox.contact.save")}
          </Button>
        </>
      }
    >
      <p className="text-sm text-ink/60">{completingTask ? t("inbox.ws.followUp.doneHint") : t("inbox.contact.intro")}</p>

      <fieldset className="mt-3">
        <legend className="crm-label-sm mb-1.5 text-ink/55">{t("inbox.contact.what")}</legend>
        <div className="grid grid-cols-2 gap-2">
          {RESULTS.map((r) => (
            <label
              key={r}
              className={cn(
                "flex min-h-[44px] cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition",
                result === r ? "border-ink bg-ink text-cream-50" : "border-ink/15 bg-white text-ink/75 hover:border-gold/50",
              )}
            >
              <input
                type="radio"
                name="contact-result"
                value={r}
                checked={result === r}
                onChange={() => setResult(r)}
                className="sr-only"
              />
              {t(`inbox.contact.result.${r}`)}
            </label>
          ))}
        </div>
      </fieldset>

      <Labeled label={t("inbox.contact.note")} className="mt-3">
        <TextArea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("inbox.contact.notePlaceholder")} />
      </Labeled>

      <fieldset className="mt-4 rounded-md border border-ink/10 p-3">
        <legend className="crm-label-sm px-1 text-ink/55">{t("inbox.contact.next")}</legend>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => shortcut(1)}>{t("inbox.followUp.tomorrow")}</Button>
          <Button size="sm" onClick={() => shortcut(3)}>{t("inbox.followUp.in3")}</Button>
          <Button size="sm" onClick={() => shortcut(7)}>{t("inbox.followUp.nextWeek")}</Button>
          <Button size="sm" onClick={() => setWithTask(true)}>{t("inbox.contact.pickDate")}</Button>
          {withTask && (
            <Button size="sm" variant="ghost" onClick={() => setWithTask(false)}>{t("inbox.contact.noTask")}</Button>
          )}
        </div>
        {withTask && (
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_7rem]">
            <Labeled label={t("inbox.contact.date")}>
              <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Labeled>
            <Labeled label={t("inbox.contact.time")}>
              <TextInput type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </Labeled>
            <Labeled label={t("inbox.contact.action")} className="sm:col-span-2">
              <TextInput value={action} onChange={(e) => setAction(e.target.value)} placeholder={t("inbox.contact.actionPlaceholder")} required />
            </Labeled>
            <p className="text-xs text-ink/55 sm:col-span-2" aria-live="polite">
              {dueIso
                ? t("inbox.contact.when", { when: formatDateTime(dueIso, locale), tz: TASK_TZ })
                : t("inbox.contact.badDate")}
            </p>
          </div>
        )}
        {!withTask && lead.nextActionAt && (
          <label className="mt-3 flex items-center gap-2 text-sm text-ink/70">
            <input type="checkbox" checked={completeTask} onChange={(e) => setCompleteTask(e.target.checked)} className="h-4 w-4" />
            {t("inbox.contact.completeTask", { when: formatDateTime(lead.nextActionAt, locale) })}
          </label>
        )}
      </fieldset>

      <p className="mt-3 text-xs text-ink/50">{t("inbox.contact.notByOpening")}</p>

      {error && (
        <p role="alert" className="mt-3 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error}
        </p>
      )}
    </Modal>
  );
}
