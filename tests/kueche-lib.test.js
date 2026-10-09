// Einbauküche im Verkauf (09.10.2026, Henry/Spechtweg) — _lib/kueche.js:
// Eigentum aus dem WE-Feld, Küchen-KP + Küchenmiete aus Stammdaten/Mietvertrag.
const test = require('node:test');
const assert = require('node:assert');

const { buildKueche, kuecheEigentum, KUECHE_AFA_JAHRE } = require('../api/_lib/kueche');
const { KALK_STAMMDATEN_FIELDS: K } = require('../api/_lib/tables');

test('kuecheEigentum: Select-Objekt und String, Vermieter vor Mieter', () => {
  assert.strictEqual(kuecheEigentum({ id: 'selX', name: 'Vermietereigentum' }), 'Vermietereigentum');
  assert.strictEqual(kuecheEigentum('Mietereigentum'), 'Mietereigentum');
  assert.strictEqual(kuecheEigentum(null), null);
  assert.strictEqual(kuecheEigentum(''), null);
});

test('buildKueche: Küchen-KP + Küchenmiete aus dem Mietvertrag (Spechtweg 104: 30 €)', () => {
  const k = buildKueche({
    stammFields: { [K.KUECHE_KP]: 3750 },
    zusatzMieteMo: 30, vermietet: true, eigentum: 'Vermietereigentum',
  });
  assert.deepStrictEqual(k, {
    eigentum: 'Vermietereigentum', kp: 3750, mieteMo: 30, mieteQuelle: 'mietvertrag',
    imVerkauf: true, afaJahre: KUECHE_AFA_JAHRE,
  });
  assert.strictEqual(KUECHE_AFA_JAHRE, 10);
});

test('buildKueche: Override „Küchenmiete bei Verkauf" schlägt den Vertrag (Leerstand 205: 7.000 € / 50 €)', () => {
  const k = buildKueche({
    stammFields: { [K.KUECHE_KP]: 7000, [K.KUECHE_MIETE_BEI_VERKAUF]: 50 },
    zusatzMieteMo: 0, vermietet: false, eigentum: 'Vermietereigentum',
  });
  assert.strictEqual(k.kp, 7000);
  assert.strictEqual(k.mieteMo, 50);
  assert.strictEqual(k.mieteQuelle, 'kalk-stammdaten');
});

test('buildKueche: leerstehend ohne Override → keine Vertrags-Küchenmiete', () => {
  const k = buildKueche({ stammFields: { [K.KUECHE_KP]: 7000 }, zusatzMieteMo: 40, vermietet: false, eigentum: 'Vermietereigentum' });
  assert.strictEqual(k.mieteMo, 0);
  assert.strictEqual(k.mieteQuelle, 'keine');
});

test('buildKueche: ohne Stammdaten/Küche → neutraler Block (kein Verkauf, 0 €)', () => {
  const k = buildKueche({ stammFields: null, zusatzMieteMo: 0, vermietet: true, eigentum: null });
  assert.strictEqual(k.kp, 0);
  assert.strictEqual(k.imVerkauf, false);
  assert.strictEqual(k.mieteMo, 0);
  assert.strictEqual(k.eigentum, null);
});

test('buildKueche: negative/kaputte Werte werden auf 0 gezogen', () => {
  const k = buildKueche({ stammFields: { [K.KUECHE_KP]: -5, [K.KUECHE_MIETE_BEI_VERKAUF]: 'abc' }, zusatzMieteMo: 'x', vermietet: true });
  assert.strictEqual(k.kp, 0);
  assert.strictEqual(k.mieteMo, 0);
});
