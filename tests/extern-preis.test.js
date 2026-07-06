const test = require('node:test');
const assert = require('node:assert');
const { clampProvision, externPreis, PROVISION_MAX, EXTERN_RABATT } = require('../api/_lib/extern');

// 06.07.2026 (Henry): Externe Vertriebler kaufen die Wohnung 2 % unter dem internen
// Abgabepreis ein (Stellplatz unrabattiert). Kundenpreis = Extern-Abgabepreis +
// Satz × (Extern-Abgabepreis + Stellplatz-KP), Aufschlag nur auf der Wohnung.
// (1-%-Spielraum am 06.07.2026 wieder entfernt — verwirrt nur.)

test('Konstanten: max 7 % Provision, 2 % Extern-Rabatt', () => {
  assert.strictEqual(PROVISION_MAX, 0.07);
  assert.strictEqual(EXTERN_RABATT, 0.02);
});

test('clampProvision: gültige Werte bleiben, Runden auf 4 Dezimalstellen', () => {
  assert.strictEqual(clampProvision(0.05), 0.05);
  assert.strictEqual(clampProvision('0.05'), 0.05);
  assert.strictEqual(clampProvision(0.033333), 0.0333);
});

test('clampProvision: kappt auf 7 %, negativ/ungültig → 0', () => {
  assert.strictEqual(clampProvision(0.08), 0.07);
  assert.strictEqual(clampProvision(1), 0.07);
  assert.strictEqual(clampProvision(-0.02), 0);
  assert.strictEqual(clampProvision(null), 0);
  assert.strictEqual(clampProvision(undefined), 0);
  assert.strictEqual(clampProvision('abc'), 0);
  assert.strictEqual(clampProvision(NaN), 0);
});

test('externPreis: 2 % Rabatt auf die Wohnung — 0 % Provision → 98 % des internen KP', () => {
  const e = externPreis(100000, 10000, 0);
  assert.strictEqual(e.aufschlag, 0);
  assert.strictEqual(e.kp, 98000); // Stellplatz bleibt unrabattiert (separat)
});

test('externPreis: Henrys Beispiel — intern 100k + Stellplatz 10k @ 7 %', () => {
  // Extern-Abgabepreis 98.000 → 7 % von (98.000 + 10.000) = 7.560 → Wohnung 105.560.
  const e = externPreis(100000, 10000, 0.07);
  assert.strictEqual(e.aufschlag, 7560);
  assert.strictEqual(e.kp, 105560);
  assert.strictEqual(e.provisionPct, 0.07);
});

test('externPreis: ohne Stellplatz rechnet die Basis nur mit der (rabattierten) Wohnung', () => {
  const e = externPreis(100000, 0, 0.05);
  assert.strictEqual(e.aufschlag, 4900); // 5 % von 98.000
  assert.strictEqual(e.kp, 102900);
});

test('externPreis: Stellplatz erhöht die Provisions-Basis UNrabattiert', () => {
  const mit = externPreis(100000, 20000, 0.05);
  const ohne = externPreis(100000, 0, 0.05);
  assert.strictEqual(mit.aufschlag - ohne.aufschlag, 1000); // 5 % von vollen 20.000
});

test('externPreis: defensiv bei kaputten Inputs', () => {
  const e = externPreis(null, undefined, 'foo');
  assert.strictEqual(e.kp, 0);
  assert.strictEqual(e.aufschlag, 0);
});

test('externPreis: Satz über Max wird serverseitig gekappt', () => {
  const e = externPreis(100000, 0, 0.5);
  assert.strictEqual(e.provisionPct, 0.07);
  assert.strictEqual(e.kp, 98000 + Math.round(0.07 * 98000)); // 98.000 + 6.860 = 104.860
});
