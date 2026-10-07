import type { Metadata } from "next";

// ============================================================================
// Política de privacidad de la extensión de Chrome.
//
// La Chrome Web Store exige una URL pública con esto para publicar una
// extensión que maneja datos de usuarios. Es la que se pone en el formulario
// de la tienda: https://portal.bcousinoprop.com/privacidad/extension
// (chrome-extension/STORE.md). Si la extensión empieza a leer o enviar algo
// nuevo, se actualiza aquí ANTES de publicar la versión.
// ============================================================================

export const metadata: Metadata = {
  title: "Privacidad · Extensión SmartBC",
  robots: { index: false },
};

const UPDATED = "7 de octubre de 2026";

export default function ExtensionPrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12 text-[15px] leading-relaxed text-neutral-800">
      <h1 className="text-2xl font-semibold text-neutral-900">Política de privacidad de la extensión SmartBC</h1>
      <p className="mt-2 text-sm text-neutral-500">Última actualización: {UPDATED}</p>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">Quién la ofrece y para qué</h2>
        <p>
          La extensión SmartBC es una herramienta interna de Benjamín Cousiño Propiedades para su equipo
          comercial. Solo funciona con un usuario del CRM SmartBC (portal.bcousinoprop.com): sin él no envía ni
          recibe nada. Sirve para dos cosas: mandar a la ficha de un cliente los anuncios inmobiliarios que el
          agente marca en Idealista, Fotocasa, Habitaclia o pisos.com, y guardar en el CRM los contactos del
          buzón de Idealista del propio agente.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">Qué datos trata</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Anuncios que el agente marca</strong> en los portales: dirección web del anuncio, título,
            precio, superficie, habitaciones, baños, zona, foto principal y, si el anuncio los muestra, el nombre
            y teléfono del anunciante, junto con la nota que escriba el agente. Solo se envían los anuncios que el
            agente marca y cuando pulsa «Enviar».
          </li>
          <li>
            <strong>Contactos del buzón de Idealista</strong> del agente (nombre, teléfono, mensajes y anuncio
            por el que preguntan), solo cuando el agente abre su buzón o usa «Capturar todas».
          </li>
          <li>
            <strong>Credencial de conexión</strong>: un token propio de cada usuario que el CRM crea al conectar
            la extensión. Se guarda solo en ese navegador; el CRM guarda únicamente una huella cifrada (SHA-256).
            La extensión nunca ve ni guarda contraseñas.
          </li>
        </ul>
        <p>
          La extensión no lee el historial de navegación, no lee otras webs que las de los cuatro portales y el
          propio CRM, no registra la actividad del usuario y no usa cookies ni herramientas de analítica o
          publicidad.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">A dónde van</h2>
        <p>
          Exclusivamente al CRM SmartBC (portal.bcousinoprop.com), alojado en servidores propios de la empresa en
          la Unión Europea. No se venden, no se ceden ni se comparten con terceros, y no se usan para nada distinto
          de la gestión comercial de los clientes de la empresa.
        </p>
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-semibold text-neutral-900">Control y conservación</h2>
        <p>
          Cada usuario puede desconectar la extensión en cualquier momento desde la propia extensión o desde el
          CRM (Extensión de Chrome → Mis navegadores conectados), y la conexión caduca sola tras 60 días sin usarse.
          Los datos enviados al CRM se conservan mientras dure la relación comercial con el cliente y se tratan
          conforme al RGPD. Para ejercer sus derechos de acceso, rectificación o supresión, escriba a
          contacto@bcousinoprop.com.
        </p>
      </section>
    </main>
  );
}
