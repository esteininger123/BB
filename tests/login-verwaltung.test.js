// 04.11.2026 (Henry): Wer darf wem ein Login-Passwort setzen?
// Admin: jedem. Extern-Kontrollzugang (Dominik Seitz): nur Vertrieblern/Externen, nie Admins.
// Normale Externe und Vertriebler: niemandem.
const test = require('node:test');
const assert = require('node:assert/strict');
const { darfPasswortSetzen, istLoginVerwalter } = require('../api/_lib/auth');

const admin = { rolle: 'Admin' };
const kontrolle = { rolle: 'Extern', externKontrolle: true };
const extern = { rolle: 'Extern', externKontrolle: false };
const vertriebler = { rolle: 'Vertriebler' };

test('istLoginVerwalter: Admin und Kontroll-Account ja, Rest nein', () => {
  assert.equal(istLoginVerwalter(admin), true);
  assert.equal(istLoginVerwalter(kontrolle), true);
  assert.equal(istLoginVerwalter(extern), false);
  assert.equal(istLoginVerwalter(vertriebler), false);
  assert.equal(istLoginVerwalter(null), false);
});

test('darfPasswortSetzen: Admin darf alles', () => {
  for (const ziel of ['Admin', 'Vertriebler', 'Extern', '']) assert.equal(darfPasswortSetzen(admin, ziel), true);
});

test('darfPasswortSetzen: Kontroll-Account darf keine Admin-Passwörter setzen', () => {
  assert.equal(darfPasswortSetzen(kontrolle, 'Admin'), false);
  assert.equal(darfPasswortSetzen(kontrolle, 'Vertriebler'), true);
  assert.equal(darfPasswortSetzen(kontrolle, 'Extern'), true);
  assert.equal(darfPasswortSetzen(kontrolle, ''), true);
});

test('darfPasswortSetzen: normale Externe/Vertriebler dürfen nichts', () => {
  assert.equal(darfPasswortSetzen(extern, 'Extern'), false);
  assert.equal(darfPasswortSetzen(vertriebler, 'Extern'), false);
});
