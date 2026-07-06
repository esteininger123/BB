const test = require('node:test');
const assert = require('node:assert');
const { hashPasswort, verifyPasswort, passwortRegelFehler, MIN_LAENGE } = require('../api/_lib/passwort');

// 06.07.2026 (Henry): E-Mail+Passwort-Login (zusätzlich zu Google) — scrypt-Hash
// im Format s2$salt$hash, Verify mit timingSafeEqual.

test('hashPasswort: Format s2$salt$hash, pro Aufruf neues Salt', () => {
  const h1 = hashPasswort('geheim123');
  const h2 = hashPasswort('geheim123');
  assert.match(h1, /^s2\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  assert.notStrictEqual(h1, h2); // Salt unterschiedlich → Hash unterschiedlich
});

test('verifyPasswort: richtiges Passwort → true, falsches → false', () => {
  const h = hashPasswort('MeinSicheresPasswort!');
  assert.strictEqual(verifyPasswort('MeinSicheresPasswort!', h), true);
  assert.strictEqual(verifyPasswort('meinsicherespasswort!', h), false);
  assert.strictEqual(verifyPasswort('MeinSicheresPasswort! ', h), false);
});

test('verifyPasswort: defensiv bei fehlendem/kaputtem Hash (Google-only-User)', () => {
  assert.strictEqual(verifyPasswort('egal', undefined), false);
  assert.strictEqual(verifyPasswort('egal', null), false);
  assert.strictEqual(verifyPasswort('egal', ''), false);
  assert.strictEqual(verifyPasswort('egal', 'klartext-quatsch'), false);
  assert.strictEqual(verifyPasswort('egal', 's2$nurzweiteile'), false);
  assert.strictEqual(verifyPasswort('', hashPasswort('abc12345')), false);
});

test('passwortRegelFehler: min. Länge, Whitespace zählt nicht', () => {
  assert.strictEqual(passwortRegelFehler('abcdefgh'), null);
  assert.ok(passwortRegelFehler('kurz'));
  assert.ok(passwortRegelFehler('        '));
  assert.ok(passwortRegelFehler(undefined));
  assert.strictEqual(MIN_LAENGE, 8);
});
