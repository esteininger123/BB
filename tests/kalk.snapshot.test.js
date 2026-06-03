// Snapshot-Tests für die Kalkulations-Engine (public/kalkulator.js).
//
// Zweck: Wenn jemand recalc() ändert (z.B. Welle 1: Sensitivitäts-Matrix,
// Sondertilgung, geplante Mietsteigerung), bricht dieser Test bei jeder
// numerischen Drift. Das zwingt zu bewusster Entscheidung — entweder
// Erwartungswerte aktualisieren (mit Commit-Begründung) oder Fehler fixen.
//
// Werte sind hand-festgezurrt am 24.05.2026 mit echten WE-Presets:
//   - Wesseling WE8 (Standard-Profil 30%, KNK extra)
//   - Bruchsal WE1 (Standard-Profil 30%, KNK extra)
//   - Wesseling WE12 (Standard-Profil 30%, mit Mietsubvention)
//   - Wesseling WE8 (42%-Profil)
//   - Wesseling WE8 (KNK mitfinanziert, 4,8% Zins)
//
// IRR-Re-Baseline 03.06.2026: Die IRR-Erwartungswerte wurden 24.05. festgezurrt,
// einen Tag BEVOR Commit be11ae1d (FS-3a, 25.05. 01:03) den Exit-Wert der IRR-Reihe
// korrigierte (irrSeries-Endglied = cf[9]+verkaufserloes statt zu niedrigem Altwert;
// vorher: Einzel-IRR systematisch zu niedrig, inkonsistent mit Paket-IRR/vermoegenNetto10).
// Die alten IRR-Werte (12,80 / 6,33 / 23,79 / 16,50 %) waren damit arithmetisch
// inkonsistent mit den — im selben Test geprüften und unverändert grünen — Cashflows:
// der NPV der Reihe ist bei der neuen IRR exakt 0, bei der alten deutlich > 0.
// Neu festgezogen auf die NPV-verifizierten Engine-Werte. Die Live-App zeigte schon
// seit FS-3a die korrekten (höheren) IRRs — nur dieser Test hing hinterher.
//
// Run: node --test tests/kalk.snapshot.test.js
// Run alle: npm test

const { test } = require('node:test');
const assert = require('node:assert');
const { loadKalk } = require('./_loader.js');

const w = loadKalk();
const { Kalk, WE_PRESETS_BY_RECID } = w;

// Toleranz: 1 Cent für €-Beträge, 1€ für gerundete Vermögens-/CF-Werte,
// 0,01% für Prozente. Wenn Tests zu strikt sind, verlangt jede minimale
// Floating-Point-Drift einen Test-Update — wenn zu lasch, übersehen
// echte Engine-Fehler.
const EPS_CENT = 0.01;
const EPS_EUR = 1.0;
const EPS_PCT = 0.01;

function near(actual, expected, msg, eps) {
  const tol = eps !== undefined ? eps : EPS_CENT;
  const diff = Math.abs(actual - expected);
  assert.ok(diff < tol,
    `${msg}: actual=${actual} expected=${expected} (diff=${diff.toFixed(4)} > eps=${tol})`);
}
function nearEur(actual, expected, msg) { return near(actual, expected, msg, EPS_EUR); }
function nearPct(actual, expected, msg) { return near(actual, expected, msg, EPS_PCT); }

function runCase(recId, profileName) {
  const preset = WE_PRESETS_BY_RECID[recId];
  if (!preset) throw new Error(`Preset für ${recId} nicht gefunden — wurde die WE umbenannt oder gelöscht?`);
  const profile = Kalk.PROFILES[profileName];
  if (!profile) throw new Error(`Profil ${profileName} nicht gefunden`);
  const inputs = Object.assign({}, preset, profile);
  const r = Kalk.recalc(inputs);
  assert.ok(r, `recalc() lieferte null für ${recId}/${profileName} — kpGesamt-Guard fehlgeschlagen?`);
  return r;
}

test('Wesseling WE8, Standard-Profil 30%', () => {
  const r = runCase('recDl2o8H2Fmigm0R', 's30ohne');
  near(r.kpGesamt, 169000, 'kpGesamt');
  near(r.knk, 11830.00, 'knk (5% GrESt + 1,5% Notar + 0,5% GB)');
  near(r.annuityMo, 774.58, 'annuityMo');
  assert.strictEqual(r.nper, 456, 'nper');
  near(r.afaJahr, 6916.75, 'afaJahr (4,5% × 85% × (169k + 11.83k))');
  near(r.belastungMo, -55.43, 'belastungMo');
  near(r.cf[0].cfJahr, -665.12, 'cf Jahr 1');
  near(r.cf[9].cfJahr, 759.97, 'cf Jahr 10');
  nearEur(r.vermoegenBrutto10, 53256, 'vermoegenBrutto10');
  nearEur(r.vermoegenNetto10, 41426, 'vermoegenNetto10');
  near(r.irr * 100, 14.26, 'irr (%) — NPV-verifiziert nach FS-3a-Exit-Fix');
});

test('Bruchsal WE1, Standard-Profil 30%', () => {
  const r = runCase('rec4jjmghcBR3NoTT', 's30ohne');
  near(r.kpGesamt, 267000, 'kpGesamt');
  near(r.knk, 18690.00, 'knk');
  near(r.annuityMo, 1223.75, 'annuityMo');
  near(r.afaJahr, 4856.73, 'afaJahr (2% AfA)');
  near(r.belastungMo, -524.49, 'belastungMo');
  near(r.cf[0].cfJahr, -6293.88, 'cf Jahr 1 (deutlich negativ — kleine Miete)');
  nearEur(r.vermoegenBrutto10, 69340, 'vermoegenBrutto10');
  nearEur(r.vermoegenNetto10, 50650, 'vermoegenNetto10');
  near(r.irr * 100, 8.26, 'irr (%) — NPV-verifiziert nach FS-3a-Exit-Fix');
});

test('Wesseling WE12 (mit Subvention), Standard-Profil 30%', () => {
  const r = runCase('rec0HGkjl1Ts7ZhVt', 's30ohne');
  near(r.kpGesamt, 145000, 'kpGesamt');
  near(r.knk, 10150.00, 'knk');
  near(r.afaJahr, 4549.77, 'afaJahr (3,45% AfA)');
  near(r.belastungMo, -117.14, 'belastungMo');
  near(r.cf[0].cfJahr, -1405.64, 'cf Jahr 1');
  // Subvention 65,7€/Mo × 26 Mo: muss in mietsubventionGesamt drinstecken
  // Hinweis Iter-91.5: mietsubventionGesamt-Logik mit Marktmiete-Cap.
  nearEur(r.vermoegenBrutto10, 126992, 'vermoegenBrutto10 (mit Marktwert + Wertsteigerung)');
  nearEur(r.vermoegenNetto10, 116842, 'vermoegenNetto10');
  near(r.irr * 100, 24.84, 'irr (%) — Top-IRR durch Marktwert-Aufschlag (NPV-verifiziert, FS-3a)');
});

test('Wesseling WE8 — Profil 42% (Spitzensteuer)', () => {
  const r = runCase('recDl2o8H2Fmigm0R', 's42ohne');
  near(r.kpGesamt, 169000, 'kpGesamt');
  near(r.belastungMo, 17.92, 'belastungMo (jetzt positiv — höherer Steuervorteil)');
  near(r.cf[0].cfJahr, 215.02, 'cf Jahr 1 (positiv)');
  near(r.irr * 100, 17.84, 'irr (%) — NPV-verifiziert nach FS-3a-Exit-Fix');
});

test('Wesseling WE8 — KNK mitfinanziert, 4,8% Zins', () => {
  const r = runCase('recDl2o8H2Fmigm0R', 's30knk');
  near(r.knk, 11830.00, 'knk');
  near(r.annuityMo, 874.01, 'annuityMo (höher: Darlehen inkl. KNK)');
  assert.strictEqual(r.nper, 441, 'nper (kürzer: höherer Zins, mehr Tilgung pro Periode)');
  near(r.belastungMo, -127.98, 'belastungMo');
  near(r.cf[0].cfJahr, -1535.82, 'cf Jahr 1');
});

test('Hard-Guard: kaufpreis=0 → recalc liefert null', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'], Kalk.PROFILES.s30ohne, {
    kaufpreis: 0,
    stellplatzKp: 0,
  });
  const r = Kalk.recalc(inputs);
  assert.strictEqual(r, null, 'recalc muss bei kpGesamt=0 null liefern (Audit E-1)');
});

test('Hard-Guard: zins=NaN → recalc fängt ab (kein NaN-Output)', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'], Kalk.PROFILES.s30ohne, {
    zins: NaN,
  });
  const r = Kalk.recalc(inputs);
  assert.ok(r, 'recalc darf bei zins=NaN nicht crashen');
  assert.ok(isFinite(r.annuityMo), 'annuityMo muss finit sein nach Fallback auf 4,5%');
});

test('IRR-Helper: gemischte Cashflows liefern plausible Rate', () => {
  // -100, +30, +30, +30, +30 → ~7,7%
  const rate = Kalk.irr([-100, 30, 30, 30, 30]);
  assert.ok(rate !== null && rate > 0.06 && rate < 0.10, `IRR sollte ~7.7% sein, war ${rate}`);
});

test('IRR-Helper: nur positive CFs → null', () => {
  assert.strictEqual(Kalk.irr([1, 2, 3]), null);
});

test('IRR-Helper: nur negative CFs → null', () => {
  assert.strictEqual(Kalk.irr([-1, -2, -3]), null);
});

test('Sensitivitäts-Matrix: 5×4-Raster, Wesseling WE8', () => {
  const preset = WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'];
  const inputs = Object.assign({}, preset, Kalk.PROFILES.s30ohne);
  const m = Kalk.sensitivitaetsMatrix(inputs);
  assert.strictEqual(m.cells.length, 4, 'Leerstand-Zeilen');
  assert.strictEqual(m.cells[0].length, 5, 'Zins-Spalten');
  assert.strictEqual(m.engineVersion, '3.0', 'engineVersion mit propagiert');
  // Basis-Zelle (0Mo Leerstand, 0% Zins-Delta) muss zur normalen recalc passen.
  const baseCell = m.cells[0][1];
  near(baseCell.cfJ1, -665.12, 'Basis-Zelle CF Jahr 1 = normal recalc');
  // Worst-Cell (3Mo Leerstand, +2% Zins) muss deutlich schlechter sein.
  // Re-Baseline 03.06.2026: Nach dem FS-3a-Exit-Fix liegt die Basis-IRR bei ~14%; die
  // Worst-Cell bricht auf ~1,7% ein — durch Hebel + Wertsteigerung am Exit knapp positiv,
  // nicht mehr negativ (die alte „< 0"-Annahme stimmte schon vor FS-3a nicht). Geprüft wird
  // jetzt: weit unter Basis (< 40 %) statt eines fixen Vorzeichens.
  const worstCell = m.cells[3][4];
  assert.ok(worstCell.cfJ1 < -4000, 'Worst-Cell soll CF < -4000€ haben');
  assert.ok(worstCell.irr !== null && worstCell.irr < baseCell.irr * 0.4,
    `Worst-Cell-IRR soll weit unter Basis liegen (war ${worstCell.irr}, Basis ${baseCell.irr})`);
});

test('Stress-Szenario: Wesseling WE8, Worst-Default', () => {
  const preset = WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'];
  const inputs = Object.assign({}, preset, Kalk.PROFILES.s30ohne);
  const s = Kalk.stressSzenario(inputs);
  assert.ok(s, 'Stress-Szenario soll Ergebnis liefern');
  assert.ok(s.base, 'base muss da sein');
  assert.ok(s.stress, 'stress muss da sein');
  assert.ok(s.delta.cfJ1 < -3000, 'CF-J1-Delta muss deutlich negativ sein');
  assert.ok(s.delta.vermoegenNetto10 < -30000, 'Vermögens-Delta muss deutlich negativ sein');
});

test('engineVersion ist in jedem recalc-Ergebnis', () => {
  const preset = WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'];
  const r = Kalk.recalc(Object.assign({}, preset, Kalk.PROFILES.s30ohne));
  assert.strictEqual(r.engineVersion, '3.0', 'engineVersion = 3.0 (Welle 1)');
  assert.strictEqual(Kalk.ENGINE_VERSION, '3.0', 'globaler Export passt');
});
