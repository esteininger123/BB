// 11.11.2026 (Henry / Domi Seitz, Christoph Zinnbauer): Ein einzelner Externer darf mit dem Regler bis 10 %
// Provision nehmen. Steuerung über Kalk-Vertriebler „Provision max extern" (0.10) + Haken „Provision frei
// wählbar". Alle anderen Zugänge bleiben bei 7 % — auch wenn im Feld „Provision Extern" ein höherer Wert steht.
const test = require('node:test');
const assert = require('node:assert');

const { VERTRIEBLER_FIELDS } = require('../api/_lib/tables');
const { provisionAusRecord, provisionMaxAusRecord, clampProvision, externPreis, PROVISION_MAX, PROVISION_MAX_ABSOLUT } = require('../api/_lib/extern');

const F = VERTRIEBLER_FIELDS;

test('Christoph: frei wählbar + max 10 % → Regler bis 10 %, gespeicherte 10 % bleiben 10 %', () => {
  const k = provisionAusRecord({ [F.PROVISION_FREI]: true, [F.PROVISION_MAX]: 0.10, [F.PROVISION_EXTERN]: 0.10 });
  assert.strictEqual(k.provisionFrei, true);
  assert.strictEqual(k.provisionMax, 0.10);
  assert.strictEqual(k.provisionPct, 0.10);
  // Kitzingen WE: Abschlag 0 % (kein 2-%-Rabatt), 168.930 € → Kundenpreis 168.930 × 1,10
  const e = externPreis(168930, 0, k.provisionPct, 0);
  assert.strictEqual(e.provisionPct, 0.10);
  assert.strictEqual(e.kp, 168930 + 16893);
});

test('Christoph heute (Domi hat 10 % eingetragen, aber kein Haken „frei wählbar") → fest 7 %', () => {
  const k = provisionAusRecord({ [F.PROVISION_EXTERN]: 0.10, [F.PROVISION_MAX]: 0.10 });
  assert.strictEqual(k.provisionFrei, false);
  assert.strictEqual(k.provisionPct, 0.07);
});

test('Sparkasse Freiburg (frei wählbar, ohne Max-Feld): Regler bleibt bei 0–7 %, 10 % werden auf 7 % gekappt', () => {
  const k = provisionAusRecord({ [F.PROVISION_FREI]: true, [F.PROVISION_EXTERN]: 0.10 });
  assert.strictEqual(k.provisionMax, PROVISION_MAX);
  assert.strictEqual(k.provisionPct, 0.07);
});

test('Normaler Externer ohne Haken: fest 7 %, Max-Feld egal', () => {
  assert.strictEqual(provisionAusRecord({}).provisionPct, 0.07);
  assert.strictEqual(provisionAusRecord({}).provisionMax, 0.07);
  assert.strictEqual(provisionAusRecord({ [F.PROVISION_MAX]: 0.12 }).provisionPct, 0.07);
});

test('Max-Feld: Tippfehler-Schutz — über 15 %, null oder Unsinn → Standard 7 %', () => {
  assert.strictEqual(provisionMaxAusRecord({ [F.PROVISION_MAX]: 1.0 }), PROVISION_MAX);   // 1.0 statt 0.10
  assert.strictEqual(provisionMaxAusRecord({ [F.PROVISION_MAX]: 0.2 }), PROVISION_MAX);
  assert.strictEqual(provisionMaxAusRecord({ [F.PROVISION_MAX]: 0 }), PROVISION_MAX);
  assert.strictEqual(provisionMaxAusRecord({ [F.PROVISION_MAX]: 'abc' }), PROVISION_MAX);
  assert.strictEqual(provisionMaxAusRecord({}), PROVISION_MAX);
  assert.strictEqual(provisionMaxAusRecord({ [F.PROVISION_MAX]: 0.15 }), PROVISION_MAX_ABSOLUT);
  assert.strictEqual(provisionMaxAusRecord({ [F.PROVISION_MAX]: 0.05 }), 0.05); // auch nach unten möglich
});

test('clampProvision mit persönlicher Grenze: 10 % bleibt bei max 10 %, 12 % wird 10 %, ohne max weiter 7 %', () => {
  assert.strictEqual(clampProvision(0.10, 0.10), 0.10);
  assert.strictEqual(clampProvision(0.12, 0.10), 0.10);
  assert.strictEqual(clampProvision(0.10), 0.07);
  assert.strictEqual(clampProvision(0.5, 0.9), PROVISION_MAX_ABSOLUT); // max selbst nie über der harten Decke
});
