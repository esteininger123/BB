// Tests für die Index-Subvention (2026-08-14, Henry/Spechtweg):
// Bei Indexmietverträgen (vermietung.istIndexvertrag) wird die Subvention je
// VERTRAGSJAHR gerechnet — Miete steigt mit Prognose +2,0 % p.a., Subvention sinkt
// jährlich, Käufer-Einnahme bleibt konstant auf Marktniveau. Max. 72 Monate;
// Phasen unter 20 €/Mo entfallen (Henrys Mini-Subventions-Regel 14.08.2026).
const { test } = require('node:test');
const assert = require('node:assert');

const { computeAutoSubvention } = require('../api/stammdaten/[weId].js');

// Spechtweg-213-Profil: 52,58 qm, Indexvertrag 604,67 €, Marktmiete 15 €/qm = 788,70.
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

// letzte Anpassung vor N Monaten (dynamisch, damit der Test zeitstabil bleibt)
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

test('Indexvertrag → jährliche Phasen, Jahr 1 = Marktlücke, danach −2 %-Schritte', () => {
  const s = computeAutoSubvention(kalk213(), vermietungIndex(8), QM_213);
  assert.strictEqual(s.quelle, 'auto-index-prognose');
  assert.ok(s.istIndexvertrag, 'istIndexvertrag markiert');
  // Phase 1 = 12 − 8 = 4 Monate bis zur nächsten Indexanpassung
  assert.strictEqual(s.phasen[0].monate, 4, 'Phase 1 = Restmonate bis Indexanpassung');
  assert.ok(near(s.phasen[0].mo, 788.7 - 604.67, 0.1), 'Jahr 1 = volle Marktlücke (184,03)');
  // Folgephasen: 12 Monate, Subvention sinkt um die Indexsteigerung der Miete
  assert.strictEqual(s.phasen[1].monate, 12);
  assert.ok(near(s.phasen[1].mo, 788.7 - 604.67 * 1.02, 0.1), 'Jahr 2 = Lücke nach +2 %');
  assert.ok(s.phasen[1].mo < s.phasen[0].mo, 'Subvention sinkt jährlich');
  // Käufer-Einnahme konstant: Miete_k + Subv_k = Marktmiete (für jede Phase)
  s.phasen.forEach((p, k) => {
    const mieteK = 604.67 * Math.pow(1.02, k);
    assert.ok(near(mieteK + p.mo, 788.7, 0.1), 'Einnahme konstant auf Markt in Phase ' + (k + 1));
  });
  // Gesamtlaufzeit ≤ 72 Monate
  const monate = s.phasen.reduce((x, p) => x + p.monate, 0);
  assert.ok(monate <= 72, 'max. 72 Monate');
  assert.strictEqual(s.monate, monate);
});

test('Ohne letzte Anpassung: Phase 1 = volle 12 Monate', () => {
  const s = computeAutoSubvention(kalk213(), vermietungIndex(null), QM_213);
  assert.strictEqual(s.phasen[0].monate, 12);
});

test('Mini-Phasen unter 20 €/Mo entfallen (Subvention endet dort)', () => {
  // Miete nah am Markt: 41,18 qm × 15 = 617,70; Basis 590 → Jahr 1 = 27,70, Jahr 2 = 15,90 < 20 → Schluss.
  const s = computeAutoSubvention(kalk213({ mieteBeiVerkauf: 590 }), vermietungIndex(0), 41.18);
  assert.strictEqual(s.phasen.length, 1, 'nur Jahr 1');
  assert.ok(near(s.phasen[0].mo, 617.7 - 590, 0.1));
  s.phasen.forEach(p => assert.ok(p.mo >= 20, 'keine Phase unter 20 €/Mo'));
});

test('Miete quasi auf Markt (Lücke < 20 €) → keine Subvention, Quelle auto-index-marktnah', () => {
  const s = computeAutoSubvention(kalk213({ mieteBeiVerkauf: 610 }), vermietungIndex(0), 41.18);
  assert.strictEqual(s.quelle, 'auto-index-marktnah');
  assert.strictEqual(s.phasen.length, 0);
  assert.strictEqual(s.totalEur, 0);
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
  // Große Lücke → hoher Total; Cap = max(5000, qm×200, MbV×18). 30 qm, MbV 300, Markt 20 €/qm = 600:
  // Lücke 300 €/Mo × ~72 Mo ≈ 21.000 > Cap 6.000 → Kürzung muss greifen.
  const s = computeAutoSubvention(kalk213({ mieteBeiVerkauf: 300, marktmiete: 20 }), vermietungIndex(0), 30);
  assert.ok(s.capGreift, 'Cap greift');
  assert.ok(s.totalEur <= Math.max(5000, 30 * 200, 300 * 18) + 1, 'Total ≤ Cap');
  assert.ok(s.phasen.length >= 1, 'frühe Phasen bleiben erhalten');
});
