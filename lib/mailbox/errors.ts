/** Errores del buzón que las rutas traducen a mensajes para el panel. */

export class MailboxAuthError extends Error {
  constructor(message = "Usuario o contraseña incorrectos") {
    super(message);
    this.name = "MailboxAuthError";
  }
}

export class MailboxConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MailboxConnectionError";
  }
}
