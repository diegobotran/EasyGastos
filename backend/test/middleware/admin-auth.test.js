const test = require('node:test');
const assert = require('node:assert/strict');

const { requireAdmin } = require('../../middleware/auth');

const createResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

test('requireAdmin devuelve 401 sin autenticación', () => {
  const response = createResponse();
  let nextCalled = false;

  requireAdmin({}, response, () => { nextCalled = true; });

  assert.equal(response.statusCode, 401);
  assert.equal(nextCalled, false);
});

test('requireAdmin devuelve ADMIN_REQUIRED para manager no administrador', () => {
  const response = createResponse();
  let nextCalled = false;

  requireAdmin(
    { user: { isManager: true, isAdmin: false } },
    response,
    () => { nextCalled = true; }
  );

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, 'ADMIN_REQUIRED');
  assert.equal(nextCalled, false);
});

test('requireAdmin permite un administrador aunque no sea manager', () => {
  const response = createResponse();
  let nextCalled = false;

  requireAdmin(
    { user: { isManager: false, isAdmin: true } },
    response,
    () => { nextCalled = true; }
  );

  assert.equal(nextCalled, true);
  assert.equal(response.statusCode, 200);
});
