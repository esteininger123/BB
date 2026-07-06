const test = require('node:test');
const assert = require('node:assert');
const { clampProvision, externPreis, PROVISION_MAX, SPIELRAUM_PCT } = require('../api/_lib/extern');

// 06.07.2026 (Henry): Externe Vertriebler verkaufen zum Kundenpreis =
// Wohnungs-KP + Satz × (Wohnungs-KP + Stellplatz-KP). Der Aufschlag landet nur
// auf der Wohnung. Zusätzlich 1 % der Basis als Verhandlungsspielraum nach unten.

test('Konstanten: max 7 %, Spielraum 1 %', () => {
  assert.strictEqual(PROVISION_MAX, 0.07);
  assert.strictEqual(SPIELRAUM_PCT, 0.01);
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

test('externPreis: Henrys Beispiel — Wohnung 100k + Stellplatz 10k @ 7 %', () => {
  // 7 % von 110.000 = 7.700 → Wohnung 107.700, Spielraum 1 % von 110.000 = 1.100.
  const e = externPreis(100000, 10000, 0.07);
  assert.strictEqual(e.aufschlag, 7700);
  assert.strictEqual(e.kp, 107700);
  assert.strictEqual(e.spielraum, 1100);
  assert.strictEqual(e.kpMin, 106600);
  assert.strictEqual(e.provisionPct, 0.07);
});

test('externPreis: 0 % → Abgabepreis, Spielraum bleibt trotzdem', () => {
  const e = externPreis(100000, 10000, 0);
  assert.strictEqual(e.aufschlag, 0);
  assert.strictEqual(e.kp, 100000);
  // "egal welche Provision" — der 1-%-Spielraum gilt auch bei 0 %.
  assert.strictEqual(e.kpMin, 98900);
});

test('externPreis: ohne Stellplatz rechnet die Basis nur mit der Wohnung', () => {
  const e = externPreis(100000, 0, 0.05);
  assert.strictEqual(e.aufschlag, 5000);
  assert.strictEqual(e.kp, 105000);
  assert.strictEqual(e.kpMin, 104000);
});

test('externPreis: Stellplatz erhöht die Basis, nicht den Stellplatzpreis', () => {
  // Der Rückgabewert enthält nur den Wohnungs-Kundenpreis — der Stellplatz-KP
  // wird in den Endpoints unverändert weitergereicht.
  const mit = externPreis(100000, 20000, 0.05);
  const ohne = externPreis(100000, 0, 0.05);
  assert.strictEqual(mit.aufschlag - ohne.aufschlag, 1000); // 5 % von 20.000
});

test('externPreis: defensiv bei kaputten Inputs', () => {
  const e = externPreis(null, undefined, 'foo');
  assert.strictEqual(e.kp, 0);
  assert.strictEqual(e.aufschlag, 0);
  assert.strictEqual(e.kpMin, 0);
});

test('externPreis: Satz über Max wird serverseitig gekappt', () => {
  const e = externPreis(100000, 0, 0.5);
  assert.strictEqual(e.provisionPct, 0.07);
  assert.strictEqual(e.kp, 107000);
});
