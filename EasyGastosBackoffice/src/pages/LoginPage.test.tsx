import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '../auth/AuthContext';
import { LoginPage } from './LoginPage';

const renderLogin = () => render(
  <MemoryRouter initialEntries={['/login']}>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/sociedades" element={<div>Panel administrativo</div>} />
      </Routes>
    </AuthProvider>
  </MemoryRouter>
);

const response = (isAdmin: boolean) => new Response(JSON.stringify({
  token: 'jwt-demo',
  user: { email: 'admin@example.test', firstName: 'Ada', lastName: 'Admin', isAdmin }
}), { status: 200, headers: { 'Content-Type': 'application/json' } });

describe('inicio de sesión', () => {
  afterEach(() => vi.restoreAllMocks());

  it('permite entrar a un administrador', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(true));
    renderLogin();
    await userEvent.type(screen.getByLabelText('Correo corporativo'), 'admin@example.test');
    await userEvent.type(screen.getByLabelText('PIN'), '1234');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar al backoffice' }));
    expect(await screen.findByText('Panel administrativo')).toBeInTheDocument();
  });

  it('rechaza un usuario autenticado sin isAdmin', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(false));
    renderLogin();
    await userEvent.type(screen.getByLabelText('Correo corporativo'), 'user@example.test');
    await userEvent.type(screen.getByLabelText('PIN'), '1234');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar al backoffice' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('permisos administrativos');
    expect(localStorage.getItem('easygastos.backoffice.session')).toBeNull();
  });
});
