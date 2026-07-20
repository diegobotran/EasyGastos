import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, errorMessage, request } from './http';

describe('cliente HTTP', () => {
  afterEach(() => vi.restoreAllMocks());

  it('envía JWT y serializa el cuerpo', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    }));
    await request('/api/admin/cuentas', { method: 'POST', token: 'jwt-demo', body: { codigo: '100' } });
    const [, options] = fetchMock.mock.calls[0];
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer jwt-demo');
    expect(options?.body).toBe(JSON.stringify({ codigo: '100' }));
  });

  it('conserva código y detalle de un conflicto 409', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      code: 'CATALOG_VERSION_CONFLICT', error: 'El registro cambió.'
    }), { status: 409, headers: { 'Content-Type': 'application/json' } }));
    await expect(request('/api/admin/cuentas/1')).rejects.toMatchObject({
      status: 409,
      code: 'CATALOG_VERSION_CONFLICT'
    });
  });

  it('presenta mensajes específicos para 403, 409 y 422', () => {
    expect(errorMessage(new ApiError(403, 'ADMIN_REQUIRED', 'x'))).toContain('permisos');
    expect(errorMessage(new ApiError(409, 'CONFLICT', 'x'))).toContain('cambió');
    expect(errorMessage(new ApiError(422, 'INVALID', 'Dato inválido'))).toBe('Dato inválido');
  });
});
