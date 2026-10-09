// Einbauküche in der Kalkulator-Engine (09.10.2026, Henry/Spechtweg):
// Küchen-KP zusätzlich zum Immobilien-KP (keine GrESt, 2 % Notar/GB), AfA 10 Jahre,
// Küchenmiete als konstante Zusatz-Einnahme. Ohne Küche muss alles bit-identisch bleiben.
const { test } = require('node:test');
const assert = require('node:assert');
const { loadKalk } = require('./_loader.js');

const W = loadKalk();
const Kalk = W.Kalk || W.KALK || W;
const recalc = (Kalk && typeof Kalk.recalc === 'function') ? Kalk.recalc : W.recalc;
assert.ok(typeof recalc === 'function', 'Kalk.recalc nicht gefunden');

function base() {
  return {
    kaufpreis: 154600, stellplatzKp: 0, qm: 42.46, marktwertProQm: 0,
    kaltmiete: 385.01, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 40, hgInflation: 0, mietverwaltung: 30, hausverwaltung: 30,
    afaSatz: 0.0435, gebaeudeAnteil: 0.85, grEstPct: 0.05, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.02, zins: 0.05, tilgung: 0.01, knkMitfinanziert: false, steuersatz: 0.42,
  };
}
const near = (x, y, msg, eps) => assert.ok(Math.abs(x - y) < (eps || 0.01), `${msg}: ${x} vs ${y}`);

test('ohne Küche: kuecheKp fehlt oder 0 → identische Kernwerte', () => {
  const r0 = recalc(base());
  const r1 = recalc(Object.assign(base(), { kuecheKp: 0, kuecheMiete: 0 }));
  for (const k of ['kpGesamt', 'knk', 'investitionGesamt', 'darlehen', 'afaJahr', 'belastungMo', 'irr', 'vermoegenNetto10']) {
    near(r0[k], r1[k], k, 1e-9);
  }
  assert.strictEqual(r0.kuecheKp, 0);
  assert.strictEqual(r0.afaKuecheJahr, 0);
  near(r0.knk, 154600 * 0.07, 'KNK 7 %');
});

test('mit Küche 5.000 € / 30 €: KNK ohne GrESt auf Küche, Darlehen inkl. Küche, AfA 10 J, Miete +30', () => {
  const r0 = recalc(base());
  const r = recalc(Object.assign(base(), { kuecheKp: 5000, kuecheMiete: 30 }));
  near(r.kpGesamt, 154600, 'kpGesamt = Immobilie');
  near(r.kpGesamtInklKueche, 159600, 'inkl. Küche');
  near(r.knk, 154600 * 0.07 + 5000 * 0.02, 'KNK: Küche nur 2 % Notar/GB');
  near(r.knkKueche, 100, 'KNK-Anteil Küche');
  near(r.darlehen, 159600, 'Darlehen finanziert die Küche mit');
  near(r.investitionGesamt, 159600 + r.knk, 'Investition gesamt');
  near(r.anschaffungskosten, 154600 + 154600 * 0.07, 'AfA-Basis Immobilie ohne Küche');
  near(r.afaGebJahr, r0.afaGebJahr, 'Gebäude-AfA unverändert');
  near(r.afaKuecheJahr, 5100 / 10, 'Küchen-AfA 10 J inkl. KNK-Anteil');
  near(r.afaJahr, r0.afaJahr + 510, 'AfA gesamt Jahr 1');
  // Jahre 1–10 mit Küchen-AfA, ab Jahr 11 ohne
  near(r.cf[0].afaJahr, r0.cf[0].afaJahr + 510, 'cf J1 AfA');
  near(r.cf[9].afaJahr, r0.cf[9].afaJahr + 510, 'cf J10 AfA');
  near(r.cf[10].afaJahr, r0.cf[10].afaJahr, 'cf J11 AfA ohne Küche');
  // Küchenmiete konstant in Einnahmen (Jahr 1 und Jahr 15), Tag-0 und Bonität
  near(r.cf[0].mieteJahr, r0.cf[0].mieteJahr + 360, 'Miete J1 +30/Mo');
  near(r.cf[14].mieteJahr, r0.cf[14].mieteJahr + 360, 'Miete J15 +30/Mo (konstant)');
  near(r.mieteTag0Mo, r0.mieteTag0Mo + 30, 'Tag-0-Miete');
  near(r.mieteTag1Mo, r0.mieteTag1Mo + 30, 'Tag-1-Miete');
  near(r.cfMonate[0].mieteM, r0.cfMonate[0].mieteM + 30, 'Monat 1');
  // Steuervorteil Jahr 1 steigt um (AfA + Zinsen auf 5.100 − 360 Miete) × 42 %
  const zinsDelta = r.cf[0].zinsenJahr - r0.cf[0].zinsenJahr;
  near(r.cf[0].stVorteilJahr - r0.cf[0].stVorteilJahr, (510 + zinsDelta - 360) * 0.42, 'Steuervorteil J1', 0.05);
});

test('Küche ohne Küchenmiete (Kategorie B 2.500 €): nur Preis + AfA', () => {
  const r0 = recalc(base());
  const r = recalc(Object.assign(base(), { kuecheKp: 2500 }));
  near(r.afaKuecheJahr, 2550 / 10, 'AfA');
  near(r.cf[0].mieteJahr, r0.cf[0].mieteJahr, 'Miete unverändert');
  near(r.darlehen, 157100, 'Darlehen');
});
