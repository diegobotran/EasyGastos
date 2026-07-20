import { expect, test } from '@playwright/test';

const admin = { email: 'admin@example.test', firstName: 'Ada', lastName: 'Admin', isAdmin: true };

test.beforeEach(async ({ page }) => {
  await page.route('http://localhost:3000/api/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/users/login') {
      await route.fulfill({ json: { token: 'jwt-e2e', user: admin } });
      return;
    }
    if (url.pathname === '/api/admin/parameters/invoice-validity') {
      await route.fulfill({ json: { success: true, data: { _id: 'p1', key: 'INVOICE_VALIDITY_DAYS', name: 'Vigencia', value: 55, active: true, updatedAt: '2026-07-20T12:00:00.000Z', updatedBy: admin.email } } });
      return;
    }
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { success: true, items: [{ _id: 's1', acronimo: 'RG', codigo: '1000', nit: '336963', razonSocial: 'Rones de Guatemala', activa: true, updatedAt: '2026-07-20T12:00:00.000Z', updatedBy: admin.email }], pagination: { page: 1, limit: 25, total: 1, pages: 1 } } });
      return;
    }
    await route.fulfill({ json: { success: true, data: {} } });
  });
});

test('administrador recorre catálogos y abre un alta', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo corporativo').fill(admin.email);
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Ingresar al backoffice' }).click();
  await expect(page.getByRole('heading', { name: 'Sociedad – NIT' })).toBeVisible();
  await expect(page.getByText('336963')).toBeVisible();
  await page.getByRole('link', { name: /Cuentas/ }).click();
  await expect(page.getByRole('heading', { name: 'Cuentas' })).toBeVisible();
  await page.getByRole('button', { name: '+ Nuevo registro' }).click();
  await expect(page.getByRole('dialog')).toContainText('Nuevo registro');
});

test('muestra el módulo de vigencia', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo corporativo').fill(admin.email);
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Ingresar al backoffice' }).click();
  await page.getByRole('link', { name: /Vigencia de factura/ }).click();
  await expect(page.getByRole('heading', { name: 'Vigencia de factura' })).toBeVisible();
  await expect(page.getByLabel('Número de días')).toHaveValue('55');
});

test('muestra errores 422 dentro del formulario activo', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Correo corporativo').fill(admin.email);
  await page.getByLabel('PIN').fill('1234');
  await page.getByRole('button', { name: 'Ingresar al backoffice' }).click();
  await page.getByRole('link', { name: /Cuentas/ }).click();
  await page.route('http://localhost:3000/api/admin/cuentas', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 422, json: { code: 'INVALID_CATALOG_CODE', error: 'El código debe contener únicamente dígitos.' } });
      return;
    }
    await route.fallback();
  });
  await page.getByRole('button', { name: '+ Nuevo registro' }).click();
  await page.getByLabel('Acrónimo').fill('PRUEBA');
  await page.getByLabel('Código').fill('ABC');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toContainText('únicamente dígitos');
});
