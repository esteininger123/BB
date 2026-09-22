// Tests für das Feld „Index-Prognose % p.a." (Henry 16.08.2026, Standard seit 22.09.2026 = 3,0 %):
// überschreibt die Standard-Prognose der Index-Subventions-Treppe pro WE. Seit 22.09.2026
// bestimmt die Prognose auch das Subventionsziel (MbV × (1+p)^6).
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

test('Leer = 3 % Standard; 2 % explizit → niedrigeres Ziel und weniger Subvention', () => {
  const std = computeAutoSubvention(kalk(), verm(), QM);
  const zwei = computeAutoSubvention(kalk({ indexPrognosePa: 0.02 }), verm(), QM);
  assert.strictEqual(std.indexPrognosePct, 3);
  assert.strictEqual(zwei.indexPrognosePct, 2);
  assert.ok(Math.abs(std.zielMiete - 565.47) < 0.02, 'Ziel 3 %: ' + std.zielMiete);
  assert.ok(Math.abs(zwei.zielMiete - 533.32) < 0.02, 'Ziel 2 %: ' + zwei.zielMiete);
  assert.ok(zwei.totalEur < std.totalEur, `2 % (${zwei.totalEur}) < 3 % (${std.totalEur})`);
  assert.ok(/\+3,0 % p\.a\./.test(std.erlaeuterung), std.erlaeuterung);
  assert.ok(/\+2,0 % p\.a\./.test(zwei.phasen[1].label), zwei.phasen[1].label);
});

test('Spechtweg-137-Referenz (3 %, 3 Monate seit Anpassung): P1 = 91,90 über 9 Mo, P2 = 77,69', () => {
  const s = computeAutoSubvention(kalk(), verm(), QM);
  // Ziel 565,47: Jahr 1: 565,47 − 473,57 = 91,90; Jahr 2: 565,47 − 487,78 = 77,69
  assert.strictEqual(s.phasen[0].monate, 9);
  assert.ok(Math.abs(s.phasen[0].mo - 91.90) < 0.02, 'P1 ' + s.phasen[0].mo);
  assert.ok(Math.abs(s.phasen[1].mo - 77.69) < 0.02, 'P2 ' + s.phasen[1].mo);
  assert.strictEqual(s.phasen.length, 5, 'Jahr 6 (16,44 €) entfällt unter der 20-€-Regel');
  assert.strictEqual(s.monate, 9 + 4 * 12);
});

test('3 % + Deckel 48 → 48 Monate', () => {
  const s = computeAutoSubvention(kalk({ subvMaxMonate: 48 }), verm(), QM);
  assert.strictEqual(s.monate, 48);
});

test('Unplausible Prognose (≥ 15 %) fällt auf 3 % zurück', () => {
  const s = computeAutoSubvention(kalk({ indexPrognosePa: 0.5 }), verm(), QM);
  assert.strictEqual(s.indexPrognosePct, 3);
});
