// Tests für das Feld „Index-Prognose % p.a." (Henry 16.08.2026):
// überschreibt die 2,0-%-Standard-Prognose der Index-Subventions-Treppe pro WE.
const { test } = require('node:test');
const assert = require('node:assert');

const { computeAutoSubvention } = require('../api/stammdaten/[weId].js');

const QM = 41.18;

function frischesDatum(monateHer) {
  const h = new Date();
  const d = new Date(h.getFullYear(), h.getMonth() - monateHer, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function kalk(extra) {
  return Object.assign({
    vermietungsModus: 'Bestand',
    mieteBeiVerkauf: 473.57,
    kappungsgrenze: '15 % alle 3 Jahre',
    marktmiete: 15,
    mietzuschuss: null, mietzuschussMonate: null, langeSubvention: false,
    letzteMietsteigerung: frischesDatum(3),
  }, extra || {});
}
const verm = () => ({ istIndexvertrag: true, letzteMietsteigerung: frischesDatum(3) });

test('3 % Prognose → steilere Treppe, weniger Subvention als 2 % (Regression: leer = 2 %)', () => {
  const std = computeAutoSubvention(kalk(), verm(), QM);
  const drei = computeAutoSubvention(kalk({ indexPrognosePa: 0.03 }), verm(), QM);
  assert.strictEqual(std.indexPrognosePct, 2);
  assert.strictEqual(drei.indexPrognosePct, 3);
  assert.ok(drei.totalEur < std.totalEur, `3 % (${drei.totalEur}) < 2 % (${std.totalEur})`);
  assert.ok(/\+3,0 % p\.a\./.test(drei.erlaeuterung), drei.erlaeuterung);
  assert.ok(/\+3,0 % p\.a\./.test(drei.phasen[1].label), drei.phasen[1].label);
});

test('3 % + Deckel 48 → Spechtweg-332-Referenzwerte', () => {
  const s = computeAutoSubvention(kalk({ indexPrognosePa: 0.03, subvMaxMonate: 48 }), verm(), QM);
  assert.strictEqual(s.monate, 48);
  // Jahr 1: 617,70 − 473,57 = 144,13; Jahr 2: 617,70 − 473,57×1,03 = 129,92 usw.
  assert.ok(Math.abs(s.phasen[0].mo - 144.13) < 0.02, 'P1 ' + s.phasen[0].mo);
  assert.ok(Math.abs(s.phasen[1].mo - 129.92) < 0.02, 'P2 ' + s.phasen[1].mo);
});

test('Unplausible Prognose (≥ 15 %) fällt auf 2 % zurück', () => {
  const s = computeAutoSubvention(kalk({ indexPrognosePa: 0.5 }), verm(), QM);
  assert.strictEqual(s.indexPrognosePct, 2);
});
