// Tests für die generalisierte N-Stufen-Auto-Subvention (2026-06-28, Henry/Marktheidenfeld).
// Schalter "Lange Subvention (9 J)" (kalkApi.langeSubvention) → bis zu 3 Phasen / 9 Jahre,
// Cap 1,5×. Ohne Schalter: unverändert 2 Phasen / 6 Jahre (Backward-Compat).
const { test } = require('node:test');
const assert = require('node:assert');

const { computeAutoSubvention } = require('../api/stammdaten/[weId].js');

// Basis-WE mit großer Lücke Bestandsmiete→Marktmiete (Marktheidenfeld-Typ):
//   MbV 300 €/Mo, 60 qm, Marktmiete 10 €/qm = 600 €/Mo, Kappung 20 %.
// letzteMietsteigerung weglassen → monateSeit=null → Phase 1 = volle 36 Mo, keine Tag-1-Erhöhung.
function baseKalk(extra) {
  return Object.assign({
    vermietungsModus: 'bestand',
    mieteBeiVerkauf: 300,
    kappungsgrenze: 0.2,
    marktmiete: 10,           // €/qm → ×60 qm = 600 €/Mo
    mietzuschuss: null,
    mietzuschussMonate: null,
    langeSubvention: false,
  }, extra || {});
}
const QM = 60;

const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.5 : tol);

test('Schalter AUS → 2 Phasen / 6 Jahre (Backward-Compat)', () => {
  const s = computeAutoSubvention(baseKalk(), null, QM);
  assert.strictEqual(s.phasen.length, 2, '2 Phasen');
  assert.strictEqual(s.phasen[0].monate, 36);
  assert.strictEqual(s.phasen[1].monate, 36);
  assert.strictEqual(s.gesamtMonate, 72);
  assert.strictEqual(s.gesamtJahre, 6);
  // X_ideal = 300×(1.2²−1) = 132; Phase 2 = 132 − 60 = 72.
  assert.ok(near(s.phasen[0].mo, 132), `Phase1 ${s.phasen[0].mo} ≈ 132`);
  assert.ok(near(s.phasen[1].mo, 72), `Phase2 ${s.phasen[1].mo} ≈ 72`);
  assert.ok(near(s.totalEur, 7344, 1), `Total ${s.totalEur} ≈ 7344`);
  assert.strictEqual(s.quelle, 'auto-2-phasen');
  assert.strictEqual(s.langeSubvention, false);
});

test('Schalter AN → 3 Phasen / 9 Jahre (Marktheidenfeld)', () => {
  const s = computeAutoSubvention(baseKalk({ langeSubvention: true }), null, QM);
  assert.strictEqual(s.phasen.length, 3, '3 Phasen');
  assert.strictEqual(s.phasen[2].monate, 36);
  assert.strictEqual(s.gesamtMonate, 108);
  assert.strictEqual(s.gesamtJahre, 9);
  // X_ideal = 300×(1.2³−1) = 218.4; Phasen 218.4 / 158.4 / 86.4.
  assert.ok(near(s.phasen[0].mo, 218.4), `Phase1 ${s.phasen[0].mo} ≈ 218.4`);
  assert.ok(near(s.phasen[1].mo, 158.4), `Phase2 ${s.phasen[1].mo} ≈ 158.4`);
  assert.ok(near(s.phasen[2].mo, 86.4), `Phase3 ${s.phasen[2].mo} ≈ 86.4`);
  assert.ok(near(s.totalEur, 16675, 1), `Total ${s.totalEur} ≈ 16675`);
  assert.strictEqual(s.quelle, 'auto-3-phasen');
  assert.strictEqual(s.langeSubvention, true);
});

test('Schalter AN subventioniert mehr (Total + Laufzeit) als AUS', () => {
  const aus = computeAutoSubvention(baseKalk(), null, QM);
  const an  = computeAutoSubvention(baseKalk({ langeSubvention: true }), null, QM);
  assert.ok(an.totalEur > aus.totalEur, `${an.totalEur} > ${aus.totalEur}`);
  assert.ok(an.gesamtMonate > aus.gesamtMonate, `${an.gesamtMonate} > ${aus.gesamtMonate}`);
});

test('Cap höher bei langer Subvention (1,5× Standard)', () => {
  // Standard-Cap: max(5000, 60×200=12000, 300×18=5400) = 12000.
  // Lang-Cap:     max(7500, 60×300=18000, 300×27=8100) = 18000.
  const aus = computeAutoSubvention(baseKalk(), null, QM);
  const an  = computeAutoSubvention(baseKalk({ langeSubvention: true }), null, QM);
  assert.strictEqual(aus.capEur, 12000);
  assert.strictEqual(an.capEur, 18000);
});

test('Schalter AN erzwingt KEINE 3. Phase ohne Markt-Spielraum', () => {
  // Kleine Lücke: MbV 550, Markt 600 → nach 1 Kappungs-Stufe ist der Markt erschöpft.
  const s = computeAutoSubvention(baseKalk({ mieteBeiVerkauf: 550, langeSubvention: true }), null, QM);
  assert.ok(s.phasen.length < 3, `nur ${s.phasen.length} Phase(n), nicht 3`);
});

test('Manueller Mietzuschuss bleibt unberührt vom Schalter', () => {
  const s = computeAutoSubvention(
    baseKalk({ mietzuschuss: 100, mietzuschussMonate: 24, langeSubvention: true }), null, QM);
  assert.strictEqual(s.quelle, 'manuell');
  assert.strictEqual(s.phasen.length, 1);
  assert.strictEqual(s.phasen[0].monate, 24);
});
