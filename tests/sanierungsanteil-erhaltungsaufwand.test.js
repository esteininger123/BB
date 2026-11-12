// 12.11.2026 (Henry / Südring 3 WE 9 + 12): Sanierungsanteil im Kaufpreis = Erhaltungsaufwand.
// Der Käufer beauftragt die Sanierung zwischen Notartermin und Übergang von Besitz/Nutzen/Lasten selbst
// (separater Werkvertrag) → vorweggenommene Werbungskosten, keine anschaffungsnahen Herstellungskosten
// (FG Rheinland-Pfalz 2 K 2304/17, BFH IX B 121/19). Rechner und Engine: GrESt/Notar/AfA nur auf den Rest,
// finanziert wird der volle Preis, Sanierungsanteil gleichmäßig auf 1–5 Jahre als Werbungskosten.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { loadKalk } = require('./_loader');

// ---------- Einfacher Rechner (app.js) ----------
const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const a = src.search(/const RECHNER_[A-Z_]+ *=/);
const b = src.indexOf('function _rechnerCalc(d, inp) {');
const close = src.indexOf('\n}', b);
const bEnd = src.indexOf('\n', close + 1) + 1;
assert.ok(a > 0 && b > a, 'Rechner-Block nicht gefunden');
const fn = new Function(src.slice(a, bEnd) + '\nreturn { calc: _rechnerCalc, basis: _rechnerBasis };')();

// WE 9 Südring 3: 3.000 €/m² × 79,27 m² = 237.810 €, davon 40.000 € Sanierung; Miete 800; AfA 5,26 %; GrESt 3,5 %
const d9 = (san) => ({ we: { kp: 237810, qm: 79.27, kaltmiete: 0 }, kalkStammdaten: { hausverwaltung: 30, hausgeldRuecklage: 39.64, mietverwaltungDefault: 52, grEst: 0.035, gebaeudeAnteil: 0.85, afaGutachten: 0.0526, mieteBeiVerkauf: 800, sanierungsanteil: san }, derived: {}, stellplaetze: {} });
const inp = (erhJahre) => ({ ek: 11473, zinsPct: 5, tilgungPct: 1, steuerPct: 42, sev: true, erhJahre });

test('Rechner: Sanierungsanteil trennt Kaufvertrag und Werkvertrag, KNK/AfA nur auf die Wohnung', () => {
  const c = fn.calc(d9(40000), inp(5));
  assert.strictEqual(c.kpAngebot, 237810);
  assert.strictEqual(c.sanierung, 40000);
  assert.strictEqual(c.kpWohnung, 197810);
  assert.strictEqual(c.gesamtKp, 197810);
  assert.strictEqual(Math.round(c.knk), Math.round(197810 * (0.035 + 0.023)));   // 11.473 € statt 13.793 €
  assert.strictEqual(Math.round(c.anschaffung), Math.round(197810 + c.knk));
  assert.strictEqual(Math.round(c.investGesamtMitKnk), Math.round(237810 + c.knk));
  assert.strictEqual(Math.round(c.finBetrag), 237810);                              // EK = KNK → voller Preis finanziert
  assert.strictEqual(Math.round(c.afaGebJahr), Math.round((197810 + c.knk) * 0.85 * 0.0526));
});

test('Rechner: Erhaltungsaufwand auf 5 Jahre → +280 €/Mo Steuerersparnis, laufend ohne; Sofortabzug = 16.800 €', () => {
  const c5 = fn.calc(d9(40000), inp(5));
  assert.strictEqual(c5.erhJahre, 5);
  assert.strictEqual(c5.erhJahr, 8000);
  assert.ok(Math.abs(c5.erhErsparnisMo - 280) < 0.01);
  assert.strictEqual(c5.erhErsparnisGesamt, 16800);
  assert.ok(Math.abs((c5.nachSteuerMo - c5.nachSteuerLaufendMo) - 280) < 0.01, 'Jahre 1–5 liegen genau um die Erhaltungsaufwand-Ersparnis über laufend');
  assert.ok(c5.nachSteuerLaufendMo < 0 && c5.nachSteuerLaufendMo > -80, 'laufend ca. −70 €/Mo (WE 9)');
  assert.ok(c5.nachSteuerMo > 200 && c5.nachSteuerMo < 215, 'Jahre 1–5 ca. +209 €/Mo (WE 9)');
  const c1 = fn.calc(d9(40000), inp(1));
  assert.strictEqual(c1.erhJahr, 40000);
  assert.ok(Math.abs(c1.erhErsparnisMo - 1400) < 0.01);
  assert.strictEqual(c1.nachSteuerLaufendMo, c5.nachSteuerLaufendMo);
  // Verteilung wird auf 1–5 geklemmt, Unsinn → 5
  assert.strictEqual(fn.calc(d9(40000), inp(9)).erhJahre, 5);
  assert.strictEqual(fn.calc(d9(40000), inp(0)).erhJahre, 1);     // Standard = sofort (Henry 12.11.)
  assert.strictEqual(fn.calc(d9(40000), inp('abc')).erhJahre, 1);
  assert.strictEqual(fn.calc(d9(40000), inp(1)).erhLabel, 'Jahr 1');
  assert.strictEqual(fn.calc(d9(40000), inp(5)).erhLabel, 'Jahre 1 bis 5');
  assert.ok(Math.abs(c1.nachSteuerMo - (c1.nachSteuerLaufendMo + 1400)) < 0.01, 'Jahr 1 = laufend + 1.400 €/Mo');
});

test('Rechner: ohne Sanierungsanteil alles wie bisher (Spechtweg/Kitzingen unverändert)', () => {
  const c = fn.calc(d9(null), inp(5));
  assert.strictEqual(c.sanierung, 0);
  assert.strictEqual(c.kpWohnung, 237810);
  assert.strictEqual(Math.round(c.knk), Math.round(237810 * 0.058));
  assert.strictEqual(c.erhJahr, 0);
  assert.strictEqual(c.nachSteuerMo, c.nachSteuerLaufendMo);
  assert.strictEqual(c.ersparnisMo, c.ersparnisLaufendMo);
  assert.strictEqual(c.investGesamtMitKnk, c.anschaffung);
});

test('Rechner: Sanierungsanteil wird auf den Kaufpreis gedeckelt, nie negativ', () => {
  assert.strictEqual(fn.calc(d9(999999), inp(5)).sanierung, 237810);
  assert.strictEqual(fn.calc(d9(-5000), inp(5)).sanierung, 0);
});

// ---------- Engine (kalkulator.js) ----------
const { Kalk } = loadKalk();
const eng = (over) => Object.assign(Kalk.getDefaults(), {
  kaufpreis: 237810, stellplatzKp: 0, qm: 79.27, kaltmiete: 800, stellplatzMiete: 0,
  subventionMo: 0, subventionMonate: 0, subventionPhasen: [], mietsteigerungsModus: 'sprung', steigerungProz: 0.2,
  monateSeitMieterhoehung: 36, hausgeld: 39.64, mietverwaltung: 52, hausverwaltung: 30,
  zins: 0.05, tilgung: 0.01, knkMitfinanziert: false, steuersatz: 0.42,
  afaSatz: 0.0526, gebaeudeAnteil: 0.85, grEstPct: 0.035, wertsteigerung: 0.03, marktwertProQm: 0,
}, over || {});

test('Engine: Sanierungsanteil senkt KNK und AfA-Basis, Darlehen bleibt voll, WK Jahre 1–N erhöht', () => {
  const r0 = Kalk.recalc(eng({ sanierungsanteil: 0 }));
  const r = Kalk.recalc(eng({ sanierungsanteil: 40000, erhaltungsaufwandJahre: 5 }));
  assert.strictEqual(r.sanierungsanteil, 40000);
  assert.strictEqual(r.erhaltungsaufwandJahre, 5);
  assert.strictEqual(r.kaufpreisOhneSanierung, 197810);
  assert.strictEqual(r.erhaltungsaufwandErstattung, 16800);
  assert.ok(Math.abs(r.knk - 197810 * 0.055) < 0.01, 'KNK 5,5 % nur auf 197.810');
  assert.ok(Math.abs(r.anschaffungskosten - (197810 + r.knk)) < 0.01);
  assert.strictEqual(r.darlehen, 237810, 'voller Preis finanziert (EK = KNK)');
  assert.strictEqual(r.darlehen, r0.darlehen);
  assert.ok(r.afaJahr < r0.afaJahr, 'AfA-Basis ohne Sanierungsanteil');
  assert.strictEqual(r.cf[0].erhaltungsaufwandJahr, 8000);
  assert.strictEqual(r.cf[4].erhaltungsaufwandJahr, 8000);
  assert.strictEqual(r.cf[5].erhaltungsaufwandJahr, 0);
  // Jahr 1: Steuervorteil = laufend (mit kleinerer AfA) + 8.000 × 42 %
  const afaDelta = (r0.afaJahr - r.afaJahr) * 0.42;
  assert.ok(Math.abs((r.cf[0].stVorteilJahr - r0.cf[0].stVorteilJahr) - (8000 * 0.42 - afaDelta)) < 0.5);
  // Jahr 6: nur noch der AfA-Nachteil
  assert.ok(Math.abs((r.cf[5].stVorteilJahr - r0.cf[5].stVorteilJahr) + afaDelta) < 0.5);
  // Monats-Serie konsistent: Monat 1 enthält 8.000/12 als WK, Monat 61 nicht mehr
  assert.ok(Math.abs((r.cfMonate[0].stVorteilM - r0.cfMonate[0].stVorteilM) - (8000 / 12 * 0.42 - afaDelta / 12)) < 0.05);
  assert.ok(Math.abs((r.cfMonate[60].stVorteilM - r0.cfMonate[60].stVorteilM) + afaDelta / 12) < 0.05);
});

test('Engine: ohne Sanierungsanteil identisch zu vorher (Bestand unverändert)', () => {
  const r0 = Kalk.recalc(eng({}));
  const r1 = Kalk.recalc(eng({ sanierungsanteil: 0, erhaltungsaufwandJahre: 3 }));
  assert.strictEqual(Kalk.recalc(eng({ sanierungsanteil: 40000 })).erhaltungsaufwandJahre, 1, 'Engine-Standard = sofort');
  assert.strictEqual(Kalk.recalc(eng({ sanierungsanteil: 40000 })).cf[0].erhaltungsaufwandJahr, 40000);
  assert.strictEqual(r0.sanierungsanteil, 0);
  assert.strictEqual(r0.kaufpreisOhneSanierung, 237810);
  assert.strictEqual(r0.erhaltungsaufwandErstattung, 0);
  assert.strictEqual(r1.cf[0].stVorteilJahr, r0.cf[0].stVorteilJahr);
  assert.strictEqual(r1.knk, r0.knk);
  assert.strictEqual(r0.cf[0].erhaltungsaufwandJahr, 0);
});
