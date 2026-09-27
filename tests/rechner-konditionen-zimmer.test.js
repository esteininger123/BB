// 27.09.2026 (Henry): Standard-Konditionen im Einfachen Rechner nach Zimmeranzahl.
// 1 Zi = 4,8 % Zins / 1,5 % Tilgung, 2 Zi = 4,9 % / 1,25 % (unabhängig von EK und KP);
// andere Zimmerzahlen / leeres Feld → bisherige Regel (4,4/4,6 % nach EK, Tilgung nach 150-T€-Grenze).
// public/app.js ist Browser-Code ohne Exporte → die Konditions-Funktionen werden aus dem Quelltext geschnitten.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const a = src.indexOf('const RECHNER_ZINS_MIT_NK_PCT');
const b = src.indexOf('const RECHNER_SEV_MO');
assert.ok(a > 0 && b > a, 'Konditions-Block in app.js nicht gefunden');
const { zinsAuto, tilgungAuto } = new Function(src.slice(a, b) + '\nreturn { zinsAuto: _rechnerZinsAuto, tilgungAuto: _rechnerTilgungAuto };')();

test('1 Zimmer: 4,8 % Zins / 1,5 % Tilgung, egal ob EK die KNK deckt', () => {
  assert.strictEqual(zinsAuto(11526, 11526, 1), 4.8);
  assert.strictEqual(zinsAuto(0, 11526, 1), 4.8);
  assert.strictEqual(tilgungAuto(157887, 1), 1.5);
  assert.strictEqual(tilgungAuto(120000, 1), 1.5);
});

test('2 Zimmer: 4,9 % Zins / 1,25 % Tilgung', () => {
  assert.strictEqual(zinsAuto(15000, 15000, 2), 4.9);
  assert.strictEqual(zinsAuto(0, 15000, 2), 4.9);
  assert.strictEqual(tilgungAuto(140000, 2), 1.25);
  assert.strictEqual(tilgungAuto(204300, 2), 1.25);
});

test('3+ Zimmer oder Feld leer: bisherige Regel bleibt', () => {
  assert.strictEqual(zinsAuto(20000, 20000, 3), 4.4);
  assert.strictEqual(zinsAuto(0, 20000, 3), 4.6);
  assert.strictEqual(zinsAuto(20000, 20000, null), 4.4);
  assert.strictEqual(zinsAuto(0, 20000, undefined), 4.6);
  assert.strictEqual(tilgungAuto(140000, 4), 1.5);
  assert.strictEqual(tilgungAuto(250000, null), 1.25);
});
