export const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';
/** Origen del backend sin el sufijo /api (para servir archivos como /uploads/...). */
export const API_ORIGIN = API_BASE.replace(/\/api\/?$/, '');

export function getToken(): string | null {
  return typeof window !== 'undefined' ? localStorage.getItem('lhdv_token') : null;
}

/** Cliente HTTP del panel: adjunta el JWT y normaliza errores del backend. */
export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
    const message = Array.isArray(body.message)
      ? body.message.join(', ')
      : (body.message ?? `Error ${res.status}`);
    throw new Error(message);
  }

  // Maneja cuerpos vacíos (204, o 200 con null como en /customers/lookup sin resultado).
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}
