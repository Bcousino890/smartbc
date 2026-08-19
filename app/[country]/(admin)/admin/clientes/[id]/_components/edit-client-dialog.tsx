"use client";

// ============================================================================
// Editar cliente — desde la propia ficha.
//
// Hasta ahora el nombre y el teléfono de un cliente NO se podían cambiar en
// ninguna pantalla del panel: se fijaban al crearlo y ahí se quedaban.
//
// El correo se muestra bloqueado a propósito. `profiles.email` es con lo que
// la persona entra, y GoTrue guarda el suyo por su cuenta: tocar solo esta
// columna dejaría un correo en pantalla y otro para iniciar sesión. Mientras
// no exista un cambio de correo de verdad (los dos lados a la vez), es mejor
// que el campo esté cerrado que que mienta.
// ============================================================================

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import type { AdminClient } from "@/lib/types";
import type { Country } from "@/lib/country-config";
import { useT } from "@/lib/i18n/provider";
import { updateClientIdentity } from "../actions";
import { Button, Labeled, Modal, Select, TextInput } from "./ui";

export function EditClientDialog({
  open,
  onClose,
  client,
  country,
}: {
  open: boolean;
  onClose: () => void;
  client: AdminClient;
  country: Country;
}) {
  const t = useT();
  const router = useRouter();
  const [saving, startSave] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [fullName, setFullName] = useState(
    `${client.firstName} ${client.lastName}`.trim(),
  );
  const [phone, setPhone] = useState(client.phone ?? "");
  const [nextCountry, setNextCountry] = useState<Country>(country);

  const save = () => {
    setError(null);
    startSave(async () => {
      const r = await updateClientIdentity({
        clientId: client.id,
        fullName,
        phone: phone || null,
        country: nextCountry,
      });
      if (!r.ok) {
        setError(r.error);
        return;
      }
      // Cambiar de país cambia la RUTA de la ficha: si no se navega, la página
      // queda en el árbol del país anterior y el siguiente refresco da 404.
      if (nextCountry !== country) {
        router.push(`/${nextCountry}/admin/clientes/${client.id}`);
      } else {
        router.refresh();
      }
      onClose();
    });
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t("cc.editClient.title")}
      footer={
        <>
          {error && (
            <p className="me-auto text-[11.5px] text-rose-600">{error}</p>
          )}
          <Button onClick={onClose} disabled={saving}>
            {t("cc.cancel")}
          </Button>
          <Button variant="primary" onClick={save} disabled={saving}>
            {saving ? t("cc.saving") : t("cc.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Labeled label={t("cc.editClient.name")}>
          <TextInput
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            autoFocus
          />
        </Labeled>

        <Labeled label={t("cc.editClient.phone")}>
          <TextInput
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            inputMode="tel"
            placeholder="+34 …"
          />
        </Labeled>

        <Labeled label={t("cc.editClient.country")}>
          <Select
            value={nextCountry}
            onChange={(e) => setNextCountry(e.target.value as Country)}
          >
            <option value="es">{t("cc.country.es")}</option>
            <option value="cl">{t("cc.country.cl")}</option>
          </Select>
        </Labeled>

        <div>
          <span className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-[0.07em] text-ink/45">
            <Lock size={10} strokeWidth={2} />
            {t("cc.editClient.email")}
          </span>
          <p className="rounded-md border border-ink/10 bg-ink/[0.03] px-2.5 py-1.5 text-[13px] text-ink/50">
            {client.email}
          </p>
          <p className="mt-1 text-[10.5px] leading-relaxed text-ink/40">
            {t("cc.editClient.emailLocked")}
          </p>
        </div>
      </div>
    </Modal>
  );
}
