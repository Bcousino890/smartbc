// Credenciales de prueba para desarrollo
export const DEMO_CREDENTIALS = {
  cliente: {
    email: "cliente@smartbc.com",
    password: "cliente123",
  },
  admin: {
    email: "admin@smartbc.com",
    password: "admin123",
  },
};

export type UserRole = "cliente" | "admin";

export interface AuthSession {
  email: string;
  role: UserRole;
  isAuthenticated: boolean;
}

// Validar credenciales de prueba
export function validateCredentials(
  email: string,
  password: string,
  role: UserRole
): boolean {
  const creds = DEMO_CREDENTIALS[role];
  return email === creds.email && password === creds.password;
}

// Obtener sesión del localStorage
export function getStoredSession(): AuthSession | null {
  if (typeof window === "undefined") return null;

  const session = localStorage.getItem("smartbc_session");
  return session ? JSON.parse(session) : null;
}

// Guardar sesión en localStorage
export function saveSession(session: AuthSession): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("smartbc_session", JSON.stringify(session));
}

// Limpiar sesión
export function clearSession(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem("smartbc_session");
}
