const test = require('node:test');
const assert = require('node:assert');
const { isExtern, ROLLE_EXTERN } = require('../api/_lib/auth');

// 2026-06-27: Externe Vertriebler (Rolle 'Extern') dürfen keine HubSpot-Leads suchen.
// isExtern() ist die zentrale Sperre — die HubSpot-Route gibt darauf 403.

test('ROLLE_EXTERN ist "Extern"', () => {
  assert.strictEqual(ROLLE_EXTERN, 'Extern');
});

test('isExtern: Rolle Extern → true (gesperrt)', () => {
  assert.strictEqual(isExtern({ rolle: 'Extern', vertrieblerId: 'recX', email: 'a@b.de' }), true);
});

test('isExtern: interner Vertriebler → false (erlaubt)', () => {
  assert.strictEqual(isExtern({ rolle: 'Vertriebler' }), false);
});

test('isExtern: Admin → false (erlaubt)', () => {
  assert.strictEqual(isExtern({ rolle: 'Admin' }), false);
});

test('isExtern: defensiv bei fehlender Session / Rolle', () => {
  assert.strictEqual(isExtern(null), false);
  assert.strictEqual(isExtern(undefined), false);
  assert.strictEqual(isExtern({}), false);
  assert.strictEqual(isExtern({ rolle: '' }), false);
});

test('isExtern: case-sensitive — "extern" klein matcht NICHT (nur exakte Choice)', () => {
  // Schutz vor versehentlichem Freischalten durch abweichende Schreibweise.
  assert.strictEqual(isExtern({ rolle: 'extern' }), false);
});
