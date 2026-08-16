// Tests für den Subventions-Laufzeit-Deckel „Subvention max. Monate" (Henry 16.08.2026).
// Deckelt Kappungs-Phasen UND Index-Treppe auf N Monate; hintere Phasen werden gekappt.
// Referenzfall: Spechtweg WE 332 (Indexvertrag, „4 Jahre Indexmiete" = 48 Mo).
const { test } = require('node:test');
const assert = require('node:assert');

const { computeAutoSubvention } = require('../api/stammdaten/[weId].js');

const QM = 41.18;

function frischesDatum(monateHer) {
  const h = new Date();
  const d = new Date(h.getFullYear(), h.getMonth() - monateHer, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function kalkIndex(extra) {
  return Object.assign({
    vermietungsModus: 'Bestand',
    mieteBeiVerkauf: 473.57,
    kappungsgrenze: '15 % alle 3 Jahre',
    marktmiete: 15,
    mietzuschuss: null, mietzuschussMonate: null, langeSubvention: false,
    letzteMietsteigerung: frischesDatum(3),
  }, extra || {});
}

test('Index + Deckel 48 → Treppe endet nach genau 48 Monaten', () => {
  const s = computeAutoSubvention(kalkIndex({ subvMaxMonate: 48 }), { istIndexvertrag: true, letzteMietsteigerung: frischesDatum(3) }, QM);
  assert.strictEqual(s.quelle, 'auto-index-prognose');
  assert.strictEqual(s.monate, 48, 'gesamt 48 Monate: ' + s.monate);
  const ohne = computeAutoSubvention(kalkIndex(), { istIndexvertrag: true, letzteMietsteigerung: frischesDatum(3) }, QM);
  assert.strictEqual(ohne.monate, 72, 'ohne Deckel 72');
  assert.ok(s.totalEur < ohne.totalEur, 'gedeckelt subventioniert weniger');
  assert.ok(/gedeckelt/.test(s.erlaeuterung), 'Deckel-Hinweis: ' + s.erlaeuterung);
});

test('Kappungs-Pfad + Deckel 48 → P1 voll, P2 gekappt (33 + 15)', () => {
  const s = computeAutoSubvention(kalkIndex({ subvMaxMonate: 48 }), null, QM);
  assert.strictEqual(s.phasen.length, 2);
  assert.strictEqual(s.phasen[0].monate, 33, 'P1 = 36 − 3');
  assert.strictEqual(s.phasen[1].monate, 15, 'P2 auf Rest gekappt');
  assert.strictEqual(s.gesamtMonate, 48);
});

test('Ohne Feld / Deckel > Laufzeit → unverändert (Regression)', () => {
  const a = computeAutoSubvention(kalkIndex(), null, QM);
  const b = computeAutoSubvention(kalkIndex({ subvMaxMonate: 90 }), null, QM);
  assert.strictEqual(a.gesamtMonate, 69);
  assert.strictEqual(b.gesamtMonate, 69, 'Deckel über Laufzeit ändert nichts');
  assert.strictEqual(a.totalEur, b.totalEur);
});

test('Manueller Override ignoriert den Deckel (Override-Vorrang)', () => {
  const s = computeAutoSubvention(kalkIndex({ subvMaxMonate: 12, mietzuschuss: 100, mietzuschussMonate: 36 }), null, QM);
  assert.strictEqual(s.quelle, 'manuell');
  assert.strictEqual(s.monate, 36);
});
