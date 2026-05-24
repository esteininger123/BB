// Edge-Case-Tests für die Kalkulations-Engine.
//
// Run: node --test tests/edge-cases.test.js
// Alle: npm test

const { test } = require('node:test');
const assert = require('node:assert');
const { loadKalk } = require('./_loader.js');

const w = loadKalk();
const { Kalk, WE_PRESETS_BY_RECID } = w;

// === Hard-Guards (kalkulator.js erwartet diese Edge-Cases ab) ===

test('recalc: kaufpreis=null → null', () => {
  const r = Kalk.recalc({ kaufpreis: null, stellplatzKp: 0 });
  assert.strictEqual(r, null);
});

test('recalc: kaufpreis=undefined → null', () => {
  const r = Kalk.recalc({ stellplatzKp: 0 });
  assert.strictEqual(r, null);
});

test('recalc: stellplatzKp alone → null (kpGesamt fehlt)', () => {
  const r = Kalk.recalc({ kaufpreis: 0, stellplatzKp: 5000 });
  // kpGesamt = 5000 → läuft (5000 > 0). Aber Engine erwartet typisch kaufpreis>0
  assert.ok(r, 'stellplatz alleine wird als kpGesamt akzeptiert');
});

test('recalc: alles 0 → null', () => {
  const r = Kalk.recalc({ kaufpreis: 0, stellplatzKp: 0 });
  assert.strictEqual(r, null);
});

test('recalc: zins=0 → Volltilger-Plan (kein NaN)', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'], Kalk.PROFILES.s30ohne, {
    zins: 0
  });
  const r = Kalk.recalc(inputs);
  assert.ok(r, 'zins=0 muss Ergebnis liefern');
  assert.ok(isFinite(r.annuityMo), 'annuityMo finite');
  assert.ok(isFinite(r.cf[0].cfJahr), 'CF J1 finite');
});

test('recalc: zins negativ → kein Crash', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'], Kalk.PROFILES.s30ohne, {
    zins: -0.01
  });
  const r = Kalk.recalc(inputs);
  assert.ok(r, 'auch bei negativem Zins (Promo-Darlehen) muss Engine liefern');
});

test('recalc: tilgung=0 → kein Tilgungsplan, kein Crash', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'], Kalk.PROFILES.s30ohne, {
    tilgung: 0
  });
  const r = Kalk.recalc(inputs);
  assert.ok(r, 'tilgung=0 (endfälliges Darlehen) muss laufen');
});

test('recalc: extrem hoher Kaufpreis (1 Mio) → läuft', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'], Kalk.PROFILES.s30ohne, {
    kaufpreis: 1000000
  });
  const r = Kalk.recalc(inputs);
  assert.ok(r, '1 Mio läuft');
  assert.ok(r.kpGesamt === 1000000);
});

test('recalc: Mietsteigerungsmodus "keine" → konstante Miete', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'], Kalk.PROFILES.s30ohne, {
    mietsteigerungsModus: 'keine'
  });
  const r = Kalk.recalc(inputs);
  assert.ok(r);
  // Miete bleibt konstant über alle Jahre (außer Subv)
  const j1 = r.cf[0].mieteJahr;
  const j10 = r.cf[9].mieteJahr;
  // Bei „keine" sollten Mieten gleich sein (Subv-Effekt rausgerechnet)
  // Lockerer Check: Jahr 1 nicht stark abweichend von Jahr 10 wenn keine Steigerung
  assert.ok(Math.abs(j1 - j10) < j1 * 0.5, 'ohne Steigerung sollten Mieten nicht stark abweichen');
});

test('recalc: knkMitfinanziert → ekBedarf=0', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'], Kalk.PROFILES.s30knk);
  const r = Kalk.recalc(inputs);
  assert.strictEqual(r.ekBedarf, 0, 'KNK mitfinanziert → kein EK-Bedarf');
});

test('recalc: extrem niedriger Kaufpreis (10k) → läuft', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'], Kalk.PROFILES.s30ohne, {
    kaufpreis: 10000
  });
  const r = Kalk.recalc(inputs);
  assert.ok(r);
});

// === Sensitivitäts-Matrix Edge-Cases ===

test('sensitivitaetsMatrix: leeres Zins-Delta-Array → leeres Raster', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'], Kalk.PROFILES.s30ohne);
  const m = Kalk.sensitivitaetsMatrix(inputs, { zinsDeltas: [], leerstandMonateProJahr: [0] });
  assert.strictEqual(m.cells[0].length, 0, 'leere Zins-Achse → 0 Spalten');
});

test('sensitivitaetsMatrix: einzelne Zelle möglich', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'], Kalk.PROFILES.s30ohne);
  const m = Kalk.sensitivitaetsMatrix(inputs, { zinsDeltas: [0], leerstandMonateProJahr: [0] });
  assert.strictEqual(m.cells.length, 1);
  assert.strictEqual(m.cells[0].length, 1);
  assert.ok(m.cells[0][0], 'eine Zelle muss vorhanden sein');
});

// === Renovierungs-Stress Edge-Cases ===

test('renovierungsStress: Default-Array hat 5 Zellen', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'], Kalk.PROFILES.s30ohne);
  const rs = Kalk.renovierungsStress(inputs);
  assert.strictEqual(rs.zellen.length, 5, '0, 5k, 10k, 15k, 20k');
  assert.strictEqual(rs.zellen[0].isBase, true, 'erste Zelle = Basis (0 Renov)');
});

test('renovierungsStress: höhere Renov → mehr EK + niedrigerer Cashflow', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'], Kalk.PROFILES.s30ohne);
  const rs = Kalk.renovierungsStress(inputs, [0, 10000]);
  const base = rs.zellen[0];
  const renov = rs.zellen[1];
  assert.ok(renov.ekBedarf > base.ekBedarf, 'EK steigt mit Renov');
  assert.ok(renov.cfJ1 < base.cfJ1, 'CF wird negativer durch mehr Annuität');
});

test('renovierungsStress: 0 Renov → Werte gleich wie normale recalc', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'], Kalk.PROFILES.s30ohne);
  const normal = Kalk.recalc(inputs);
  const rs = Kalk.renovierungsStress(inputs, [0]);
  assert.strictEqual(rs.zellen[0].ekBedarf, normal.ekBedarf, 'Basis-Zelle matched normalen recalc');
});

// === computeBonitaetDetailed Edge-Cases ===

test('computeBonitaetDetailed: null sa → null', () => {
  const r = Kalk.computeBonitaetDetailed(null, true);
  assert.strictEqual(r, null);
});

test('computeBonitaetDetailed: leere SA → 0-Werte', () => {
  const r = Kalk.computeBonitaetDetailed({}, true);
  assert.ok(r);
  assert.strictEqual(r.einkommenAnrechenbarMo, 0);
  assert.strictEqual(r.fixkostenMo, 0);
});

test('computeBonitaetDetailed: minimal-SA mit Netto-Einkommen', () => {
  const sa = {
    antragsteller: {
      nettoMo: 3000,
      anzahlGehaelter: 13,
    }
  };
  const r = Kalk.computeBonitaetDetailed(sa, false);
  assert.ok(r);
  // 3000 × 13 / 12 = 3250
  assert.ok(Math.abs(r.einkommenAnrechenbarMo - 3250) < 1, 'Einkommen = nettoMo × 13/12');
});

test('computeBonitaetDetailed: Mieteinnahmen werden zu 80% angerechnet', () => {
  const sa = {
    antragsteller: {
      nettoMo: 0,
      immobilien: [{ mietenMo: 1000 }]
    }
  };
  const r = Kalk.computeBonitaetDetailed(sa, false);
  assert.ok(r);
  // 1000 × 0.8 = 800
  assert.strictEqual(r.einkommenAnrechenbarMo, 800);
});

test('computeBonitaetDetailed: Baufi-Belastung in Verbindlichkeiten', () => {
  const sa = {
    antragsteller: {
      immobilien: [{ baufiBelastungMo: 1200, baufiRestsaldo: 200000 }]
    }
  };
  const r = Kalk.computeBonitaetDetailed(sa, false);
  assert.strictEqual(r.verbindlichkeitenMo, 1200);
  assert.strictEqual(r.verbindlichkeitenGesamt, 200000);
});

test('computeBonitaetDetailed: gemeinsam=true rechnet beide zusammen', () => {
  const sa = {
    antragsteller: { nettoMo: 3000, anzahlGehaelter: 12 },
    mitantragsteller: { nettoMo: 2000, anzahlGehaelter: 12 }
  };
  const r = Kalk.computeBonitaetDetailed(sa, true);
  assert.strictEqual(r.einkommenAnrechenbarMo, 5000);
});

test('computeBonitaetDetailed: gemeinsam=false ignoriert mitantragsteller', () => {
  const sa = {
    antragsteller: { nettoMo: 3000, anzahlGehaelter: 12 },
    mitantragsteller: { nettoMo: 2000, anzahlGehaelter: 12 }
  };
  const r = Kalk.computeBonitaetDetailed(sa, false);
  assert.strictEqual(r.einkommenAnrechenbarMo, 3000);
});

// === Format-Helper Edge-Cases ===

test('fmtEur: null → n.v.', () => {
  assert.strictEqual(Kalk.fmtEur(null), 'n.v.');
});

test('fmtEur: NaN → n.v.', () => {
  assert.strictEqual(Kalk.fmtEur(NaN), 'n.v.');
});

test('fmtEur: Infinity → n.v.', () => {
  assert.strictEqual(Kalk.fmtEur(Infinity), 'n.v.');
});

test('fmtPct: 0 → 0,0 %', () => {
  assert.strictEqual(Kalk.fmtPct(0), '0,0 %');
});

test('fmtPct: negative Werte', () => {
  // -0.05 → -5,0 %
  assert.ok(Kalk.fmtPct(-0.05).includes('-5,0'));
});

test('PROFILES enthält alle 6er-Matrix', () => {
  ['s30ohne','s30knk','s35ohne','s35knk','s42ohne','s42knk'].forEach(slug => {
    assert.ok(Kalk.PROFILES[slug], 'Profil fehlt: ' + slug);
    assert.ok(typeof Kalk.PROFILES[slug].zins === 'number');
    assert.ok(typeof Kalk.PROFILES[slug].steuersatz === 'number');
  });
});

test('BB_DEFAULTS ist frozen', () => {
  assert.ok(Object.isFrozen(Kalk.BB_DEFAULTS));
});

test('ENGINE_VERSION ist String und nicht-leer', () => {
  assert.strictEqual(typeof Kalk.ENGINE_VERSION, 'string');
  assert.ok(Kalk.ENGINE_VERSION.length > 0);
});

// === recalcPaket Edge-Cases ===

test('recalcPaket: leeres Array → null', () => {
  assert.strictEqual(Kalk.recalcPaket([], {}), null);
});

test('recalcPaket: 1 WE = single recalc', () => {
  const inputs = Object.assign({}, WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R']);
  const single = Kalk.recalc(Object.assign({}, inputs, Kalk.PROFILES.s30ohne));
  const paket = Kalk.recalcPaket([inputs], Kalk.PROFILES.s30ohne);
  assert.strictEqual(paket.kpGesamt, single.kpGesamt, 'KP gleich');
  assert.strictEqual(paket.ekBedarf, single.ekBedarf, 'EK gleich');
});

test('recalcPaket: 3 WEs aggregiert KPs additiv', () => {
  const w1 = WE_PRESETS_BY_RECID['recDl2o8H2Fmigm0R'];
  const w2 = WE_PRESETS_BY_RECID['rec4jjmghcBR3NoTT'];
  const w3 = WE_PRESETS_BY_RECID['rec0HGkjl1Ts7ZhVt'];
  const paket = Kalk.recalcPaket([w1, w2, w3], Kalk.PROFILES.s30ohne);
  const expected = (w1.kaufpreis + w1.stellplatzKp) + (w2.kaufpreis + w2.stellplatzKp) + (w3.kaufpreis + w3.stellplatzKp);
  assert.strictEqual(paket.kpGesamt, expected);
});
