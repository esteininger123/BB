// 23.10.2026 (Henry/Kitzingen): Der einfache Rechner nimmt die Mietverwaltung (SEV) aus den
// Kalk-Stammdaten (mietverwaltungDefault), wenn dort ein Wert > 0 steht; sonst Standard 30 €.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const a = src.search(/const RECHNER_[A-Z_]+ *=/);   // erste Rechner-Konstante (NOTAR, ZINS, SEV, …)
const b = src.indexOf('function _rechnerCalc(d, inp) {');
const close = src.indexOf('\n}', b);            // Funktionsende (CRLF-tolerant)
const bEnd = src.indexOf('\n', close + 1) + 1;
assert.ok(a > 0 && b > a, 'Rechner-Block nicht gefunden');
const fn = new Function(src.slice(a, bEnd) + '\nreturn { calc: _rechnerCalc, basis: _rechnerBasis };')();

const d = (mv) => ({ we: { kp: 190900, kaltmiete: 0 }, kalkStammdaten: { hausverwaltung: 32.73, hausgeldRuecklage: 35, grEst: 0.035, gebaeudeAnteil: 0.85, afaGutachten: 0.0833, mieteBeiVerkauf: 644, mietverwaltungDefault: mv }, derived: {}, stellplaetze: {} });
const inp = { ek: 0, zinsPct: 4.9, tilgungPct: 1.25, steuerPct: 42, sev: true };

test('Stammdaten-Wert geht vor (Kitzingen 53,55 €)', () => {
  assert.strictEqual(fn.calc(d(53.55), inp).sevMo, 53.55);
});

test('ohne Stammdaten-Wert bleibt der Standard 30 €', () => {
  assert.strictEqual(fn.calc(d(null), inp).sevMo, 30);
  assert.strictEqual(fn.calc(d(0), inp).sevMo, 30);
});

test('SEV abgewählt = 0, unabhängig vom Stammdaten-Wert', () => {
  assert.strictEqual(fn.calc(d(53.55), Object.assign({}, inp, { sev: false })).sevMo, 0);
});

// 23.10.2026 (Henry/Kitzingen): Hinweistext + Worst-Case-AfA kommen aus den Stammdaten und
// greifen nur dort, wo die Felder gefüllt sind (Kitzingen). Andere Objekte: kein Vermerk.
test('Worst-Case-AfA: Cashflow nach Steuer mit 3,5 % statt 8,33 %, nur wenn Feld gesetzt', () => {
  const basis = d(53.55);
  assert.strictEqual(fn.calc(basis, inp).nachSteuerWorstMo, null, 'ohne Feld kein Worst Case');
  const mitWorst = Object.assign({}, basis, { kalkStammdaten: Object.assign({}, basis.kalkStammdaten, { afaWorstCasePct: 0.035, mietverwaltungHinweis: ' Neuvermietungen inklusive ' }) });
  const c = fn.calc(mitWorst, inp);
  assert.strictEqual(c.afaWorst, 0.035);
  assert.strictEqual(c.mvHinweis, 'Neuvermietungen inklusive');
  assert.ok(c.nachSteuerWorstMo < c.nachSteuerMo, 'Worst Case muss schlechter sein');
  const direkt = fn.calc(Object.assign({}, basis, { kalkStammdaten: Object.assign({}, basis.kalkStammdaten, { afaGutachten: 0.035 }) }), inp);
  assert.ok(Math.abs(c.nachSteuerWorstMo - direkt.nachSteuerMo) < 0.005, 'Worst Case = Rechnung mit 3,5 % AfA');
  // Worst-Case-Satz über der Gutachten-AfA → kein Vermerk
  const hoeher = Object.assign({}, basis, { kalkStammdaten: Object.assign({}, basis.kalkStammdaten, { afaGutachten: 0.03, afaWorstCasePct: 0.035 }) });
  assert.strictEqual(fn.calc(hoeher, inp).nachSteuerWorstMo, null);
});

test('Backend: „Nur externer Vertrieb" versteckt die Einheit vor internen Nicht-Admins', () => {
  const idx = fs.readFileSync(path.join(__dirname, '..', 'api', 'stammdaten', 'index.js'), 'utf8');
  assert.ok(idx.includes("if (session.rolle !== 'Admin') audit = audit.filter(row => !(row.stammdaten && row.stammdaten.nurExtern));"));
  const we = fs.readFileSync(path.join(__dirname, '..', 'api', 'wohneinheiten.js'), 'utf8');
  assert.ok(we.includes('nurExternVersteckt'), 'WE-Liste muss den Filter kennen');
  const tables = require('../api/_lib/tables.js');
  assert.strictEqual(tables.KALK_STAMMDATEN_FIELDS.NUR_EXTERN, 'fldlIjigRyNMuSuWW');
  assert.strictEqual(tables.KALK_STAMMDATEN_FIELDS.MIETVERWALTUNG_HINWEIS, 'fld60m6cIQ9Q0d7NK');
  assert.strictEqual(tables.KALK_STAMMDATEN_FIELDS.AFA_WORST_CASE_PCT, 'fldueDsHmqg6EmmWP');
});
