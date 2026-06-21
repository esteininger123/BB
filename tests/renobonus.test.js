// Tests für den Renovierungsbonus (Carve-out) in recalc().
// Run: node --test tests/renobonus.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { loadKalk } = require('./_loader.js');

const { Kalk } = loadKalk();

// Vollständiger Standard-Input + explizite kp/qm/zustand. getDefaults() liefert
// das komplette Standard-Profil (Zins, Tilgung, AfA, Hausgeld etc.).
function inputs(extra) {
  return Object.assign({}, Kalk.getDefaults(), {
    kaufpreis: 150000, qm: 60, stellplatzKp: 0,
    steuersatz: 0.40, gebaeudeAnteil: 0.85, knkMitfinanziert: false,
  }, extra || {});
}
const EPS = 0.5;
function near(a, b, msg) { assert.ok(Math.abs(a - b) < EPS, `${msg}: ${a} vs ${b}`); }

test('Standard 60qm ohne Override → 6000 € Default', () => {
  const r = Kalk.recalc(inputs({ zustand: 'Standard' }));
  near(r.renovierungsbonus, 6000, 'bonus');
  near(r.ekBedarfNetto, r.ekBedarf - 6000, 'ekBedarfNetto');
  near(r.renoErstattung, 6000 * 0.40, 'erstattung');
});

test('renovierungsbedürftig 60qm → 12000 € Default', () => {
  const r = Kalk.recalc(inputs({ zustand: 'renovierungsbedürftig' }));
  near(r.renovierungsbonus, 12000, 'bonus');
});

test('kernsaniert → 0 € (kein Default)', () => {
  const r = Kalk.recalc(inputs({ zustand: 'kernsaniert' }));
  near(r.renovierungsbonus, 0, 'bonus');
  near(r.ekBedarfNetto, r.ekBedarf, 'ekBedarfNetto == ekBedarf');
});

test('Override sticht über Default', () => {
  const r = Kalk.recalc(inputs({ zustand: 'Standard', renovierungsbonusOverride: 5000 }));
  near(r.renovierungsbonus, 5000, 'override');
});

test('Override 0 (explizit) → 0, kein Default', () => {
  const r = Kalk.recalc(inputs({ zustand: 'Standard', renovierungsbonusOverride: 0 }));
  near(r.renovierungsbonus, 0, 'expliziter 0-Override');
});

test('Override über Cap → auf 15 % Gebäudewert gedeckelt', () => {
  const r = Kalk.recalc(inputs({ zustand: 'renovierungsbedürftig', renovierungsbonusOverride: 999999 }));
  // Cap = 0.15 × 0.85 × 150000 = 19125
  near(r.renovierungsbonus, 19125, 'cap');
  near(r.renovierungsbonusCap, 19125, 'cap-feld');
});

test('Zustand-Aufschläge berühren die Engine-Kennzahlen NICHT (Aufschlag lebt in Airtable)', () => {
  const a = Kalk.recalc(inputs({ zustand: 'kernsaniert' }));
  const b = Kalk.recalc(inputs({ zustand: 'Standard' }));
  near(a.ekBedarf, b.ekBedarf, 'ekBedarf identisch — Aufschlag ist kein Engine-Input');
});
