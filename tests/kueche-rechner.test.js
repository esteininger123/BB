// Einbauküche im Einfachen Rechner (09.10.2026, Henry/Spechtweg):
// Küchen-KP kommt separat zum Kaufpreis (keine GrESt, AfA 10 J), Küchenmiete als eigene Einnahme.
// public/app.js ist Browser-Code ohne Exporte → Rechenkern wird aus dem Quelltext geschnitten
// (Muster wie tests/rechner-standardkonditionen.test.js).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const a = src.indexOf('const RECHNER_NOTAR_PCT');
const b = src.indexOf('// Scoped Styles für den Extern-Rechner');
assert.ok(a > 0 && b > a, 'Rechner-Block in app.js nicht gefunden');
const { basis, calc, defaults } = new Function(
  src.slice(a, b) + '\nreturn { basis: _rechnerBasis, calc: _rechnerCalc, defaults: _rechnerDefaultInputs };'
)();

// Spechtweg 104 (Stand 09.10.2026): KP 160.700, Kaltmiete 423,84, Küchenzuschlag 30 €, GrESt 5 %.
function detail(kueche) {
  return {
    we: { kp: 160700, qm: 42.46, kaltmiete: 423.84, zimmer: 1, lage: 'WE: 104, EG, Spechtweg 37, 79110 Freiburg' },
    stellplaetze: { kaufpreisSumme: 0, mieteMoSumme: 0, details: [] },
    kalkStammdaten: { grEst: 0.05, hausverwaltung: 30, hausgeldRuecklage: 40, gebaeudeAnteil: 0.85, afaGutachten: 0.0385, mieteBeiVerkauf: 423.84 },
    derived: { subventionPhasen: [{ mo: 103.52, monate: 69 }], subventionTotalEur: 7143 },
    kueche,
  };
}
const near = (x, y, msg) => assert.ok(Math.abs(x - y) < 0.005, `${msg}: ${x} vs ${y}`);

test('ohne Küche: Ergebnis identisch, egal ob kueche fehlt oder leer ist', () => {
  const d0 = detail(undefined);
  const d1 = detail({ eigentum: 'Mietereigentum', kp: 0, mieteMo: 0 });
  const c0 = calc(d0, defaults(d0));
  const c1 = calc(d1, defaults(d1));
  for (const k of ['anschaffung', 'knk', 'einnahmenMo', 'afaJahr', 'nachSteuerMo', 'gesamtInvest']) near(c0[k], c1[k], k);
  near(c0.gesamtInvest, 160700, 'gesamtInvest = gesamtKp');
  near(c0.knk, 160700 * 0.073, 'KNK 5 % GrESt + 2,3 % Notar');
  near(c0.einnahmenMo, 423.84 + 103.52, 'Einnahmen = Kaltmiete + Subvention');
  near(c0.afaKuecheJahr, 0, 'keine Küchen-AfA');
});

test('mit Küche 3.750 € / 30 €: separat zum KP, keine GrESt, 10 J AfA, Küchenmiete als Einnahme', () => {
  const d = detail({ eigentum: 'Vermietereigentum', kp: 3750, mieteMo: 30, mieteQuelle: 'mietvertrag' });
  const c = calc(d, defaults(d));
  near(c.gesamtKp, 160700, 'Gesamtkaufpreis Immobilie unverändert');
  near(c.gesamtInvest, 164450, 'Gesamtinvestition = Immobilie + Küche');
  near(c.knkGrest, 160700 * 0.05, 'GrESt NICHT auf die Küche');
  near(c.knkNotar, 164450 * 0.023, 'Notar/Grundbuch auf den Gesamtbetrag');
  near(c.knkKueche, 3750 * 0.023, 'KNK-Anteil Küche');
  near(c.anschaffung, 164450 + c.knk, 'Anschaffung inkl. Küche + KNK');
  near(c.einnahmenMo, 423.84 + 103.52 + 30, 'Einnahmen + Küchenmiete');
  near(c.einnahmenJahr, (423.84 + 30) * 12, 'Jahreseinnahmen + Küchenmiete (ohne Subvention)');
  near(c.afaKuecheJahr, (3750 + 3750 * 0.023) / 10, 'Küchen-AfA 10 J inkl. KNK-Anteil');
  near(c.afaGebJahr, (160700 + c.knk - c.knkKueche) * 0.85 * 0.0385, 'Gebäude-AfA ohne Küchen-KNK');
  near(c.afaJahr, c.afaGebJahr + c.afaKuecheJahr, 'AfA gesamt');
  // EK-Default bleibt = KNK, Finanzierung deckt Immobilie + Küche
  near(c.ek, Math.round(c.knk), 'EK = KNK');
  near(c.finBetrag, c.anschaffung - c.ek, 'Finanzierungsbetrag');
});

test('Küche ohne Küchenmiete (Kategorie B): nur Preis + AfA, keine Einnahmezeile', () => {
  const d = detail({ eigentum: 'Vermietereigentum', kp: 2500, mieteMo: 0, mieteQuelle: 'keine' });
  const c = calc(d, defaults(d));
  near(c.gesamtInvest, 163200, 'Gesamtinvestition');
  near(c.einnahmenMo, 423.84 + 103.52, 'Einnahmen ohne Küchenmiete');
  near(c.afaKuecheJahr, (2500 + 57.5) / 10, 'Küchen-AfA');
});

test('Kaputte Küchen-Werte (negativ/undefined) → wie ohne Küche', () => {
  const d = detail({ eigentum: 'Vermietereigentum', kp: -100, mieteMo: undefined });
  const c = calc(d, defaults(d));
  near(c.gesamtInvest, 160700, 'gesamtInvest');
  near(c.einnahmenMo, 423.84 + 103.52, 'einnahmenMo');
});
