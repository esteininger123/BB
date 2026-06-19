const { test } = require('node:test');
const assert = require('node:assert');
const { validateKonditionen } = require('../api/konditionen');

const VALID = {
  schwelleKaufpreis: 150000,
  baender: {
    klein: { ohneKnk: { zins: 0.05, tilgung: 0.01 }, mitKnk: { zins: 0.052, tilgung: 0.01 } },
    gross: { ohneKnk: { zins: 0.045, tilgung: 0.01 }, mitKnk: { zins: 0.048, tilgung: 0.01 } },
  },
};

test('valide Konditionen → ok', () => {
  assert.strictEqual(validateKonditionen(VALID).ok, true);
});

test('Zins > 20 % → Fehler', () => {
  const bad = JSON.parse(JSON.stringify(VALID));
  bad.baender.klein.ohneKnk.zins = 0.25;
  assert.strictEqual(validateKonditionen(bad).ok, false);
});

test('Schwelle <= 0 → Fehler', () => {
  const bad = JSON.parse(JSON.stringify(VALID));
  bad.schwelleKaufpreis = 0;
  assert.strictEqual(validateKonditionen(bad).ok, false);
});

test('fehlende Zelle → Fehler', () => {
  const bad = JSON.parse(JSON.stringify(VALID));
  delete bad.baender.gross.mitKnk;
  assert.strictEqual(validateKonditionen(bad).ok, false);
});

test('Tilgung > 10 % → Fehler', () => {
  const bad = JSON.parse(JSON.stringify(VALID));
  bad.baender.gross.ohneKnk.tilgung = 0.2;
  assert.strictEqual(validateKonditionen(bad).ok, false);
});

test('valide Konditionen → normalisiertes value ohne Fremdfelder', () => {
  const withExtra = JSON.parse(JSON.stringify(VALID));
  withExtra.boeserHack = 'drop me';
  withExtra.baender.klein.ohneKnk.extra = 1;
  const r = validateKonditionen(withExtra);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.value.boeserHack, undefined);
  assert.deepStrictEqual(Object.keys(r.value.baender.klein.ohneKnk).sort(), ['tilgung', 'zins']);
});
