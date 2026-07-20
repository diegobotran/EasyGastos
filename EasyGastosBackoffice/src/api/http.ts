const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  token?: string | null;
}

export const request = async <T>(path: string, options: RequestOptions = {}): Promise<T> => {
  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json');
  if (options.body !== undefined) headers.set('Content-Type', 'application/json');
  if (options.token) headers.set('Authorization', `Bearer ${options.token}`);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });
  } catch {
    throw new ApiError(0, 'NETWORK_ERROR', 'No fue posible conectar con el servidor.');
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = payload.error || payload.message || 'La operación no pudo completarse.';
    throw new ApiError(response.status, payload.code || `HTTP_${response.status}`, message, payload.details);
  }
  return payload as T;
};

export const errorMessage = (error: unknown): string => {
  if (!(error instanceof ApiError)) return 'Ocurrió un error inesperado.';
  if (error.status === 403) return 'Tu usuario no tiene permisos administrativos.';
  if (error.status === 409) return 'El registro cambió desde que lo consultaste. Actualiza el listado y vuelve a intentarlo.';
  if (error.status === 422) return error.message;
  return error.message;
};
