// 12.11.2026 (Henry): Preview ohne Login — feste Session nur bei BB_READONLY=1 + BB_PREVIEW_SESSION.
const test = require('node:test');
const assert = require('node:assert');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-test-secret-test-secret-1234';
const { verifySession } = require('../api/_lib/auth');
const req = (cookie) => ({ headers: cookie ? { cookie } : {} });

test('ohne Env: kein Cookie → null (wie bisher)', () => {
  delete process.env.BB_READONLY; delete process.env.BB_PREVIEW_SESSION;
  assert.strictEqual(verifySession(req()), null);
  assert.strictEqual(verifySession(req('bbk_session=kaputt')), null);
});

test('BB_PREVIEW_SESSION ohne BB_READONLY → weiterhin null (nie ohne Schreibschutz)', () => {
  delete process.env.BB_READONLY;
  process.env.BB_PREVIEW_SESSION = JSON.stringify({ vertrieblerId: 'recHenry', email: 'h.wacker@bub-immo.de', rolle: 'Admin', name: 'Henry Wacker' });
  assert.strictEqual(verifySession(req()), null);
});

test('BB_READONLY=1 + BB_PREVIEW_SESSION → feste Session ohne Cookie, auch bei kaputtem Cookie', () => {
  process.env.BB_READONLY = '1';
  process.env.BB_PREVIEW_SESSION = JSON.stringify({ vertrieblerId: 'recHenry', email: 'h.wacker@bub-immo.de', rolle: 'Admin', name: 'Henry Wacker' });
  const s = verifySession(req());
  assert.strictEqual(s.vertrieblerId, 'recHenry');
  assert.strictEqual(s.rolle, 'Admin');
  assert.strictEqual(s.preview, true);
  assert.strictEqual(verifySession(req('bbk_session=kaputt')).vertrieblerId, 'recHenry');
  process.env.BB_PREVIEW_SESSION = '{nicht json';
  assert.strictEqual(verifySession(req()), null);
  delete process.env.BB_READONLY; delete process.env.BB_PREVIEW_SESSION;
});
