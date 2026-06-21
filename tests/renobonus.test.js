// Tests für den Renovierungsbonus (Carve-out, Override-only) in recalc().
// Run: node --test tests/renobonus.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { loadKalk } = require('./_loader.js');

const { Kalk } = loadKalk();

// Vollständiger Standard-Input + explizite kp/qm. getDefaults() liefert das
// komplette Standard-Profil (Zins, Tilgung, AfA, Hausgeld etc.).
function inputs(extra) {
  return Object.assign({}, Kalk.getDefaults(), {
    kaufpreis: 150000, qm: 60, stellplatzKp: 0,
    steuersatz: 0.40, gebaeudeAnteil: 0.85, knkMitfinanziert: false,
  }, extra || {});
}
const EPS = 0.5;
function near(a, b, msg) { assert.ok(Math.abs(a - b) < EPS, `${msg}: ${a} vs ${b}`); }

test('kein Override → 0 € Bonus, EK-Bedarf unverändert (Bestand bleibt wie er ist)', () => {
  const r = Kalk.recalc(inputs({}));
  near(r.renovierungsbonus, 0, 'bonus');
  near(r.ekBedarfNetto, r.ekBedarf, 'ekBedarfNetto == ekBedarf');
  near(r.renoErstattung, 0, 'erstattung');
});

test('leerer String als Override → 0 €', () => {
  const r = Kalk.recalc(inputs({ renovierungsbonusOverride: '' }));
  near(r.renovierungsbonus, 0, 'bonus');
});

test('Override 6000 → 6000 €, EK-Bedarf netto = brutto − 6000, Erstattung = 6000×Steuersatz', () => {
  const r = Kalk.recalc(inputs({ renovierungsbonusOverride: 6000 }));
  near(r.renovierungsbonus, 6000, 'bonus');
  near(r.ekBedarfNetto, r.ekBedarf - 6000, 'ekBedarfNetto');
  near(r.renoErstattung, 6000 * 0.40, 'erstattung');
});

test('Override 12000 > EK-Bedarf → negativer Netto-EK (Tag-1-Überschuss)', () => {
  const r = Kalk.recalc(inputs({ renovierungsbonusOverride: 12000 }));
  near(r.renovierungsbonus, 12000, 'bonus');
  assert.ok(r.ekBedarfNetto < 0, 'ekBedarfNetto negativ: ' + r.ekBedarfNetto);
});

test('Override über Cap → auf 15 % Gebäudewert gedeckelt', () => {
  const r = Kalk.recalc(inputs({ renovierungsbonusOverride: 999999 }));
  // Cap = 0.15 × 0.85 × 150000 = 19125
  near(r.renovierungsbonus, 19125, 'cap');
  near(r.renovierungsbonusCap, 19125, 'cap-feld');
});

test('Override 0 (explizit) → 0', () => {
  const r = Kalk.recalc(inputs({ renovierungsbonusOverride: 0 }));
  near(r.renovierungsbonus, 0, 'expliziter 0-Override');
});

test('Bonus berührt die Kern-Kennzahlen (ekBedarf, irr, vermoegenNetto10) NICHT', () => {
  const a = Kalk.recalc(inputs({}));
  const b = Kalk.recalc(inputs({ renovierungsbonusOverride: 6000 }));
  near(a.ekBedarf, b.ekBedarf, 'ekBedarf identisch');
  near(a.vermoegenNetto10, b.vermoegenNetto10, 'vermoegenNetto10 identisch');
  assert.strictEqual(a.irr, b.irr, 'irr identisch');
});
