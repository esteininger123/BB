const test = require('node:test');
const assert = require('node:assert');
const { clampProvision, clampAbschlag, externPreis, PROVISION_MAX, EXTERN_RABATT } = require('../api/_lib/extern');

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

// 04.10.2026 (Henry): Einheiten-Abschlag (Kalk-Stammdaten „Extern-Abschlag %") ersetzt die 2 %.
// Basis = Gesamt-Kaufpreis (Wohnung + Stellflächen), abgezogen vom Wohnungspreis.
test('Einheiten-Abschlag 3,57 %: Meckesheim WE 9 und WE 11 (Abgabepreis ohne Provision)', () => {
  // WE 9: 221.000 + 8.000 Stellplatz → 3,57 % von 229.000 = 8.175,30
  assert.strictEqual(externPreis(221000, 8000, 0, 0.0357).kp, 212825);
  // WE 11: 219.000 + 23.000 Garage/Stellplatz → 3,57 % von 242.000 = 8.639,40
  assert.strictEqual(externPreis(219000, 23000, 0, 0.0357).kp, 210361);
});

test('Einheiten-Abschlag: Provision des Externen rechnet auf den Abgabepreis inkl. Stellflächen', () => {
  const e = externPreis(221000, 8000, 0.07, 0.0357);
  assert.strictEqual(e.aufschlag, 15458); // 7 % von 220.825
  assert.strictEqual(e.kp, 228283);
});

test('Einheiten-Abschlag leer/ungültig → Standard 2 % auf die Wohnung', () => {
  const standard = externPreis(100000, 10000, 0.07).kp;
  for (const v of [undefined, null, '', 0, -0.03, 'abc', NaN, 0.357]) {
    assert.strictEqual(externPreis(100000, 10000, 0.07, v).kp, standard, 'Wert: ' + String(v));
  }
  assert.strictEqual(clampAbschlag(0.357), null, 'Tippfehler-Schutz: > 15 % wird ignoriert');
  assert.strictEqual(clampAbschlag(0.0357), 0.0357);
});
