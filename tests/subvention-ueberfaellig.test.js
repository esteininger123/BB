// Tests für die Henry-Regel vom 16.08.2026 (ersetzt die Iter-63-Tag-1-Annahme):
// Bei überfälliger Mieterhöhung (> 36 Mo her) darf NICHT mehr Subvention eingepreist
// werden als 2 reguläre Kappungs-Sprünge über der HEUTIGEN IST-Miete. Die frühere
// Tag-1-Anhebung (Mieter vor Übergabe auf MbV×1,15, danach voller Zyklus gegen die
// neue Basis) preiste effektiv einen dritten Sprung ein — abgeschafft.
// Referenzfall: Freiburg Spechtweg WE 117/301 (MbV 368,97, 41,18 qm, Marktmiete 15).
const { test } = require('node:test');
const assert = require('node:assert');

const { computeAutoSubvention } = require('../api/stammdaten/[weId].js');

function kalk117(extra) {
  return Object.assign({
    vermietungsModus: 'Bestand',
    mieteBeiVerkauf: 368.97,
    kappungsgrenze: '15 % alle 3 Jahre',
    marktmiete: 15,           // €/qm → ×41,18 qm = 617,70 €/Mo
    mietzuschuss: null,
    mietzuschussMonate: null,
    langeSubvention: false,
    letzteMietsteigerung: '2019-01-01',  // weit überfällig (> 36 Mo)
  }, extra || {});
}
const QM = 41.18;

const near = (a, b, tol) => Math.abs(a - b) <= (tol == null ? 0.5 : tol);

test('Überfällige Erhöhung → KEINE Tag-1-Anhebung mehr, Basis bleibt IST-Miete', () => {
  const s = computeAutoSubvention(kalk117(), null, QM);
  assert.strictEqual(s.tag1Erhoehung, false, 'keine Tag-1-Erhöhung');
  assert.strictEqual(s.tag1Quelle, null);
  assert.strictEqual(s.kaltmieteAdjustiert, null, 'MbV wird nicht angehoben');
  assert.strictEqual(s.quelle, 'auto-2-phasen');
});

test('Überfällig → Standard-2-Sprünge gegen heutige Basis (X = MbV×(1,15²−1))', () => {
  const s = computeAutoSubvention(kalk117(), null, QM);
  assert.strictEqual(s.phasen.length, 2, '2 Phasen');
  assert.strictEqual(s.phasen[0].monate, 36, 'Phase 1 volle 36 Mo ab Übergabe');
  assert.strictEqual(s.phasen[1].monate, 36);
  // X_ideal = 368,97 × 0,3225 = 118,99; Phase 2 = 118,99 − 55,35 = 63,65.
  assert.ok(near(s.phasen[0].mo, 118.99, 0.02), `Phase1 ${s.phasen[0].mo} ≈ 118,99`);
  assert.ok(near(s.phasen[1].mo, 63.65, 0.02), `Phase2 ${s.phasen[1].mo} ≈ 63,65`);
  assert.ok(near(s.totalEur, 6575, 1), `Total ${s.totalEur} ≈ 6575`);
  // Käufer-Einnahme ≤ IST-Miete × 1,15² — nie ein dritter Sprung eingepreist.
  const einnahme = 368.97 + s.phasen[0].mo;
  assert.ok(einnahme <= 368.97 * 1.3225 + 0.02, `Einnahme ${einnahme} ≤ 2 Sprünge`);
});

test('Überfällig-Hinweis in der Erläuterung, Vereinbarungs-Pfad (Iter 70) unberührt', () => {
  const s = computeAutoSubvention(kalk117(), null, QM);
  assert.ok(/überfällig|liegt \d+ Monate zurück/i.test(s.erlaeuterung), 'Hinweis vorhanden: ' + s.erlaeuterung);
  // Echte Vereinbarung (Mietvertrag) hat weiter Vorrang und darf die Basis heben:
  const v = { geplanteErhoehung: { datum: new Date().toISOString().slice(0, 10), kaltmiete: 424.32 } };
  const s2 = computeAutoSubvention(kalk117(), v, QM);
  assert.strictEqual(s2.tag1Quelle, 'vereinbarung');
  assert.ok(near(s2.kaltmieteAdjustiert, 424.32, 0.01), 'vereinbarte Miete wird Basis');
});

test('Frische Erhöhung (< 36 Mo) rechnet unverändert (Regression)', () => {
  const heute = new Date();
  const vor12Mo = `${heute.getFullYear() - 1}-${String(heute.getMonth() + 1).padStart(2, '0')}-01`;
  const s = computeAutoSubvention(kalk117({ letzteMietsteigerung: vor12Mo }), null, QM);
  assert.strictEqual(s.phasen.length, 2);
  assert.strictEqual(s.phasen[0].monate, 24, 'Phase 1 = 36 − 12 Mo');
  assert.ok(near(s.phasen[0].mo, 118.99, 0.02));
});
