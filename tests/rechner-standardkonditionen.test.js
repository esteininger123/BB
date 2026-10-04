// 04.10.2026 (Henry): EIN Standard im Einfachen Rechner und in der WE-Liste — 5,0 % Zins /
// 1,0 % Tilgung für alle Einheiten, extern wie intern. Ersetzt die Regeln vom 14.08.
// (4,4/4,6 % nach EK, Tilgung nach 150-T€-Grenze) und 27.09. (Sätze nach Zimmeranzahl).
// public/app.js ist Browser-Code ohne Exporte → die Konditions-Funktionen werden aus dem Quelltext geschnitten.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const a = src.indexOf('const RECHNER_ZINS_STANDARD_PCT');
const b = src.indexOf('const RECHNER_SEV_MO');
assert.ok(a > 0 && b > a, 'Konditions-Block in app.js nicht gefunden');
const { zinsAuto, tilgungAuto } = new Function(src.slice(a, b) + '\nreturn { zinsAuto: _rechnerZinsAuto, tilgungAuto: _rechnerTilgungAuto };')();

test('Standard-Zins 5,0 % — unabhängig von Eigenkapital und Zimmeranzahl', () => {
  assert.strictEqual(zinsAuto(11526, 11526, 1), 5);  // EK deckt KNK, 1 Zimmer
  assert.strictEqual(zinsAuto(0, 11526, 1), 5);      // ohne EK
  assert.strictEqual(zinsAuto(15000, 15000, 2), 5);
  assert.strictEqual(zinsAuto(0, 20000, 3), 5);
  assert.strictEqual(zinsAuto(20000, 20000, null), 5);
  assert.strictEqual(zinsAuto(), 5);
});

test('Standard-Tilgung 1,0 % — unabhängig von Kaufpreis und Zimmeranzahl', () => {
  assert.strictEqual(tilgungAuto(120000, 1), 1);
  assert.strictEqual(tilgungAuto(157887, 1), 1);
  assert.strictEqual(tilgungAuto(204300, 2), 1);
  assert.strictEqual(tilgungAuto(250000, null), 1);
  assert.strictEqual(tilgungAuto(), 1);
});

test('Hinweistexte nennen den neuen Standard, keine alten Sätze mehr im Rechner-Code', () => {
  for (const alt of ['RECHNER_ZINS_MIT_NK_PCT', 'RECHNER_KONDITIONEN_ZIMMER', '4,4 % Zins (NK eingebracht)']) {
    assert.strictEqual(src.includes(alt), false, 'Altlast gefunden: ' + alt);
  }
});
