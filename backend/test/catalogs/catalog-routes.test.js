const test = require('node:test');
const assert = require('node:assert/strict');

const adminRouter = require('../../routes/admin-catalogs');
const catalogRouter = require('../../routes/catalogs');
const legacySocietyRouter = require('../../routes/sociedades');

const routes = router => router.stack
  .filter(layer => layer.route)
  .map(layer => ({
    path: layer.route.path,
    methods: Object.keys(layer.route.methods).sort()
  }));

test('las mutaciones administrativas exigen autenticación e isAdmin', () => {
  const middlewareNames = adminRouter.stack
    .filter(layer => !layer.route)
    .map(layer => layer.handle.name);
  assert.ok(middlewareNames.includes('authenticateToken'));
  assert.ok(middlewareNames.includes('requireAdmin'));
});

test('el API administrativo expone CRUD sin borrado físico para los cuatro maestros', () => {
  const registered = routes(adminRouter);
  for (const path of ['/sociedades', '/centros', '/cuentas', '/ordenes-co']) {
    assert.ok(registered.some(route => route.path === path && route.methods.includes('get')));
    assert.ok(registered.some(route => route.path === path && route.methods.includes('post')));
    assert.ok(registered.some(route => route.path === `${path}/:id` && route.methods.includes('put')));
    assert.ok(registered.some(route => route.path === `${path}/:id/status` && route.methods.includes('patch')));
  }
  assert.equal(registered.some(route => route.methods.includes('delete')), false);
});

test('el quinto módulo expone lectura y actualización de vigencia', () => {
  const registered = routes(adminRouter);
  const matches = registered.filter(route => route.path === '/parameters/invoice-validity');
  assert.ok(matches.some(route => route.methods.includes('get')));
  assert.ok(matches.some(route => route.methods.includes('put')));
});

test('el API móvil expone cuatro catálogos de solo lectura y su versión', () => {
  const registered = routes(catalogRouter);
  for (const path of ['/sociedades', '/centros', '/cuentas', '/ordenes-co', '/version']) {
    const match = registered.find(route => route.path === path);
    assert.ok(match);
    assert.deepEqual(match.methods, ['get']);
  }
  const middlewareNames = catalogRouter.stack
    .filter(layer => !layer.route)
    .map(layer => layer.handle.name);
  assert.ok(middlewareNames.includes('authenticateToken'));
});

test('la sincronización histórica de sociedades también exige isAdmin', () => {
  const syncLayer = legacySocietyRouter.stack.find(layer => layer.route?.path === '/sync');
  assert.ok(syncLayer);
  const handlers = syncLayer.route.stack.map(layer => layer.handle.name);
  assert.ok(handlers.includes('authenticateToken'));
  assert.ok(handlers.includes('requireAdmin'));
});
