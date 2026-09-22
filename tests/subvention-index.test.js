// Tests für die Index-Subvention (2026-08-14, Henry/Spechtweg; Regel geändert 22.09.2026):
// Bei Indexmietverträgen (vermietung.istIndexvertrag) ist das Subventionsziel die Miete,
// die der Vertrag in 6 Jahren organisch erreicht (MbV × (1+p)^6, Standard p = 3,0 %) —
// NICHT die Marktmiete. Die Subvention wird je VERTRAGSJAHR gerechnet, sinkt jährlich
// und läuft mit der 6. Indexanpassung auf null aus. Phasen unter 20 €/Mo entfallen.
const { test } = require('node:test');
const assert = require('node:assert');

const { computeAutoSubvention } = require('../api/stammdaten/[weId].js');

// Spechtweg-213-Profil: 52,58 qm, Indexvertrag 604,67 €, Marktmiete 15 €/qm (für Index irrelevant).
function kalk213(extra) {
  return Object.assign({
    vermietungsModus: 'Bestand',
    mieteBeiVerkauf: 604.67,
    kappungsgrenze: '15 % alle 3 Jahre',
    marktmiete: 15,
    mietzuschuss: null,
    mietzuschussMonate: null,
    langeSubvention: false,
  }, extra || {});
}
const QM_213 = 52.58;
const ZIEL_213 = Math.round(604.67 * Math.pow(1.03, 6) * 100) / 100; // 722,01

function vorMonaten(n) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}
function vermietungIndex(monateSeit) {
  return {
    istIndexvertrag: true,
    letzteMietsteigerung: monateSeit == null ? null : vorMonaten(monateSeit),
  };
}
const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.5 : tol);

test('Indexvertrag → Ziel = MbV × 1,03^6, Jahr 1 = Lücke zum Ziel, danach sinkend', () => {
  const s = computeAutoSubvention(kalk213(), vermietungIndex(8), QM_213);
  assert.strictEqual(s.quelle, 'auto-index-prognose');
  assert.ok(s.istIndexvertrag, 'istIndexvertrag markiert');
  assert.strictEqual(s.indexPrognosePct, 3, 'Standard-Prognose 3 %');
  assert.ok(near(s.zielMiete, ZIEL_213, 0.02), 'Zielmiete ' + s.zielMiete);
  assert.ok(near(s.zielMieteEurQm, ZIEL_213 / QM_213, 0.02), 'Ziel €/qm');
  // Phase 1 = 12 − 8 = 4 Monate bis zur nächsten Indexanpassung
  assert.strictEqual(s.phasen[0].monate, 4, 'Phase 1 = Restmonate bis Indexanpassung');
  assert.ok(near(s.phasen[0].mo, ZIEL_213 - 604.67, 0.05), 'Jahr 1 = volle Lücke zum Ziel (117,34)');
  assert.strictEqual(s.phasen[1].monate, 12);
  assert.ok(near(s.phasen[1].mo, ZIEL_213 - 604.67 * 1.03, 0.05), 'Jahr 2 = Lücke nach +3 %');
  assert.ok(s.phasen[1].mo < s.phasen[0].mo, 'Subvention sinkt jährlich');
  // Käufer-Einnahme konstant: Miete_k + Subv_k = Zielmiete (jede Phase)
  s.phasen.forEach((p, k) => {
    const mieteK = 604.67 * Math.pow(1.03, k);
    assert.ok(near(mieteK + p.mo, ZIEL_213, 0.05), 'Einnahme konstant auf Ziel in Phase ' + (k + 1));
  });
  // Genau 6 Vertragsjahre: 4 + 5 × 12 = 64 Monate, Jahr 7 wäre 0 € → keine Klippe
  assert.strictEqual(s.phasen.length, 6, '6 Jahresphasen');
  assert.strictEqual(s.monate, 64);
  assert.ok(s.phasen[5].mo >= 20, 'Jahr 6 noch über 20 €');
  assert.ok(near(s.totalEur, 4 * 117.34 + 12 * (99.20 + 80.51 + 61.26 + 41.44 + 21.03), 5), 'Total ' + s.totalEur);
});

test('Ohne letzte Anpassung: Phase 1 = volle 12 Monate, gesamt 72', () => {
  const s = computeAutoSubvention(kalk213(), vermietungIndex(null), QM_213);
  assert.strictEqual(s.phasen[0].monate, 12);
  assert.strictEqual(s.monate, 72);
});

test('Marktmiete spielt für Indexverträge keine Rolle (gleiches Ergebnis mit 12, 15 oder ohne Marktmiete)', () => {
  const a = computeAutoSubvention(kalk213({ marktmiete: 12 }), vermietungIndex(0), QM_213);
  const b = computeAutoSubvention(kalk213({ marktmiete: 15 }), vermietungIndex(0), QM_213);
  const c = computeAutoSubvention(kalk213({ marktmiete: 0 }), vermietungIndex(0), QM_213);
  assert.strictEqual(a.totalEur, b.totalEur);
  assert.strictEqual(b.totalEur, c.totalEur);
  assert.strictEqual(c.quelle, 'auto-index-prognose', 'ohne Marktmiete trotzdem berechnet');
});

test('Mini-Phasen unter 20 €/Mo entfallen (Subvention endet dort)', () => {
  // MbV 100 → Ziel 119,41: Jahr 1 = 19,41 < 20 → gar keine Phase.
  const s = computeAutoSubvention(kalk213({ mieteBeiVerkauf: 100 }), vermietungIndex(0), 41.18);
  assert.strictEqual(s.quelle, 'auto-index-marktnah');
  assert.strictEqual(s.phasen.length, 0);
  // MbV 200 → Ziel 238,81: Jahr 1 = 38,81, Jahr 2 = 32,81, Jahr 3 = 26,63, Jahr 4 = 20,26, Jahr 5 = 13,70 < 20 → 4 Phasen.
  const t = computeAutoSubvention(kalk213({ mieteBeiVerkauf: 200 }), vermietungIndex(0), 41.18);
  assert.strictEqual(t.phasen.length, 4);
  t.phasen.forEach(p => assert.ok(p.mo >= 20, 'keine Phase unter 20 €/Mo'));
});

test('Ohne Index-Flag: Kappungslogik unverändert (Regression)', () => {
  const ohneFlag = computeAutoSubvention(kalk213(), { letzteMietsteigerung: vorMonaten(8) }, QM_213);
  assert.notStrictEqual(ohneFlag.quelle, 'auto-index-prognose');
  assert.ok(ohneFlag.phasen.length >= 1 && ohneFlag.phasen.length <= 3, 'Kappungs-Phasenmodell');
});

test('Manueller Override schlägt Index-Logik (Override-Vorrang bleibt)', () => {
  const s = computeAutoSubvention(kalk213({ mietzuschuss: 100, mietzuschussMonate: 36 }), vermietungIndex(8), QM_213);
  assert.strictEqual(s.phasen.length, 1);
  assert.strictEqual(s.phasen[0].mo, 100);
  assert.strictEqual(s.phasen[0].monate, 36);
});

test('€-Cap kürzt hintere Index-Phasen', () => {
  // Hohe Prognose → große Lücke: MbV 300, 14 % p.a. → Ziel 658,45, Jahr 1 = 358 €/Mo;
  // Total ≈ 12 × (358 + 316 + 268 + 213 + 151 + 80) ≈ 16.600 > Cap max(5000, 30×200, 300×18) = 6.000.
  const s = computeAutoSubvention(kalk213({ mieteBeiVerkauf: 300, indexPrognosePa: 0.14 }), vermietungIndex(0), 30);
  assert.ok(s.capGreift, 'Cap greift');
  assert.ok(s.totalEur <= Math.max(5000, 30 * 200, 300 * 18) + 1, 'Total ≤ Cap');
  assert.ok(s.phasen.length >= 1, 'frühe Phasen bleiben erhalten');
});
