const { test } = require('node:test');
const assert = require('node:assert');
const { loadKalk } = require('./_loader');

const K = loadKalk().Kalk;

test('Band-Grenze: 149999 → klein, 150000/150001 → gross (Default-Zinsen identisch)', () => {
  // Defaults: beide Bänder gleich → Zins 4,5 % ohne KNK
  assert.strictEqual(K.resolveKondition(149999, false).zins, 0.045);
  assert.strictEqual(K.resolveKondition(150000, false).zins, 0.045);
  assert.strictEqual(K.resolveKondition(150001, false).zins, 0.045);
});

test('KNK-Variante wählt 4,8 % (Default)', () => {
  assert.strictEqual(K.resolveKondition(200000, true).zins, 0.048);
  assert.strictEqual(K.resolveKondition(200000, false).zins, 0.045);
  assert.strictEqual(K.resolveKondition(200000, true).tilgung, 0.01);
});

test('Band-Differenzierung greift mit Custom-Config', () => {
  const cfg = K.mergeKonditionen({
    schwelleKaufpreis: 150000,
    baender: { klein: { ohneKnk: { zins: 0.055 } } }
  });
  assert.strictEqual(K.resolveKondition(120000, false, cfg).zins, 0.055); // klein
  assert.strictEqual(K.resolveKondition(180000, false, cfg).zins, 0.045); // gross unverändert
});

test('kaufpreis 0/NaN → klein, kein Crash', () => {
  assert.strictEqual(K.resolveKondition(0, false).zins, 0.045);
  assert.strictEqual(K.resolveKondition(NaN, true).zins, 0.048);
});

test('mergeKonditionen füllt fehlende Zellen mit Defaults', () => {
  const cfg = K.mergeKonditionen({ baender: { klein: { mitKnk: { zins: 0.06 } } } });
  assert.strictEqual(cfg.baender.klein.mitKnk.zins, 0.06);
  assert.strictEqual(cfg.baender.klein.mitKnk.tilgung, 0.01); // Default beibehalten
  assert.strictEqual(cfg.baender.gross.ohneKnk.zins, 0.045);
  assert.strictEqual(cfg.schwelleKaufpreis, 150000);
});
