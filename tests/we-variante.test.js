// Varianten-Modell (möblierte Wohnungen) — 07.09.2026.
// Hintergrund: möbliert war als ZWEITER Wohneinheit-Record in Airtable angelegt und
// hat damit alle Objekt-Auswertungen verdoppelt. Jetzt: ein Kalk-Stammdatensatz mit
// Status 'Variante' auf DERSELBEN WE, Karte trägt die ID "<weId>~<stammId>".

const test = require('node:test');
const assert = require('node:assert');

const {
  parseWeId, composeWeId, baseWeId, isVarianteId,
  varianteInfo, variantenKp, applyVariante,
} = require('../api/_lib/we-variante');
const { WE_FIELDS, KALK_STAMMDATEN_FIELDS, KALK_STATUS_VARIANTE, KALK_STATUS_AKTIV } = require('../api/_lib/tables');

const WE_205 = 'recOVuIsot18BpO75';
const STAMM_205 = 'rec4h53kvjaD9SCMx';

function stammRec(overrides = {}) {
  return {
    id: STAMM_205,
    fields: Object.assign({
      [KALK_STAMMDATEN_FIELDS.STATUS]: { name: KALK_STATUS_VARIANTE },
      [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]: [{ id: WE_205 }],
      [KALK_STAMMDATEN_FIELDS.VARIANTE_LABEL]: 'möbliert',
      [KALK_STAMMDATEN_FIELDS.VARIANTE_PAKET]: 20000,
    }, overrides),
  };
}

// Spechtweg WE 205: Wohnung 176.275 € + Möblierung 20.000 € = 196.275 €
const weFields205 = {
  [WE_FIELDS.WE_NR]: '205',
  [WE_FIELDS.LAGE_BEZ]: 'WE: 205, EG, Spechtweg 35, 79110 Freiburg',
  [WE_FIELDS.KAUFPREIS]: 176275,
  [WE_FIELDS.QM]: 41.18,
  [WE_FIELDS.OBJEKTVORSTELLUNG]: 'https://drive.google.com/file/d/UNMOEBLIERT/view',
};

test('parseWeId trennt WE-ID und Varianten-Stammsatz', () => {
  assert.deepStrictEqual(parseWeId(`${WE_205}~${STAMM_205}`), {
    weId: WE_205, variantId: STAMM_205, raw: `${WE_205}~${STAMM_205}`,
  });
  assert.strictEqual(parseWeId(WE_205).variantId, null);
  assert.strictEqual(parseWeId('kaputt').weId, null);
  assert.strictEqual(parseWeId(`${WE_205}~nichtsGutes`).variantId, null);
  assert.strictEqual(parseWeId(undefined).weId, null);
});

test('baseWeId / composeWeId / isVarianteId', () => {
  assert.strictEqual(baseWeId(`${WE_205}~${STAMM_205}`), WE_205, 'Airtable-Links brauchen die echte WE-ID');
  assert.strictEqual(baseWeId(WE_205), WE_205);
  assert.strictEqual(composeWeId(WE_205, STAMM_205), `${WE_205}~${STAMM_205}`);
  assert.strictEqual(composeWeId(WE_205, null), WE_205);
  assert.strictEqual(isVarianteId(`${WE_205}~${STAMM_205}`), true);
  assert.strictEqual(isVarianteId(WE_205), false);
});

test('varianteInfo nur für Status = Variante', () => {
  const info = varianteInfo(stammRec());
  assert.strictEqual(info.label, 'möbliert');
  assert.strictEqual(info.weId, WE_205);
  assert.strictEqual(info.paket, 20000);
  // Ein normaler Aktiv-Stammsatz ist keine Variante — sonst würde die unmöblierte
  // Wohnung doppelt als Karte erscheinen.
  const aktiv = stammRec({ [KALK_STAMMDATEN_FIELDS.STATUS]: { name: KALK_STATUS_AKTIV } });
  assert.strictEqual(varianteInfo(aktiv), null);
  assert.strictEqual(varianteInfo(null), null);
});

test('Preis: WE-Kaufpreis + Ausstattungspaket (Spechtweg 205)', () => {
  const info = varianteInfo(stammRec());
  assert.strictEqual(variantenKp(weFields205, info), 196275); // 176.275 + 20.000
});

test('Preis: Basis-KP-Override schlägt den WE-Kaufpreis (Spechtweg 219/Kober)', () => {
  // WE 219 steht mit 178.977 € in Airtable, verkauft wird die möblierte Variante aber
  // mit dem qm-Preis der 205: 176.275 € Wohnung + 15.000 € Möbelpaket = 191.275 €.
  const info = varianteInfo(stammRec({
    [KALK_STAMMDATEN_FIELDS.VARIANTE_BASIS_KP]: 176275,
    [KALK_STAMMDATEN_FIELDS.VARIANTE_PAKET]: 15000,
  }));
  const we219 = Object.assign({}, weFields205, { [WE_FIELDS.KAUFPREIS]: 178977, [WE_FIELDS.WE_NR]: '219' });
  assert.strictEqual(variantenKp(we219, info), 191275);
});

test('applyVariante überlagert Preis, Name, qm-Preis und Exposé — ohne das Original zu ändern', () => {
  const info = varianteInfo(stammRec({
    [KALK_STAMMDATEN_FIELDS.VARIANTE_EXPOSE]: 'https://drive.google.com/file/d/MOEBLIERT/view',
  }));
  const out = applyVariante(weFields205, info);

  assert.strictEqual(out[WE_FIELDS.KAUFPREIS], 196275);
  assert.strictEqual(out[WE_FIELDS.WE_NR], '205 (möbliert)');
  assert.strictEqual(out[WE_FIELDS.LAGE_BEZ], 'WE: 205 (möbliert), EG, Spechtweg 35, 79110 Freiburg');
  assert.strictEqual(out[WE_FIELDS.QM_PREIS], Math.round((196275 / 41.18) * 100) / 100);
  assert.strictEqual(out[WE_FIELDS.OBJEKTVORSTELLUNG], 'https://drive.google.com/file/d/MOEBLIERT/view');

  // Original bleibt unangetastet (sonst würde der unmöblierte Preis mitwandern)
  assert.strictEqual(weFields205[WE_FIELDS.KAUFPREIS], 176275);
  assert.strictEqual(weFields205[WE_FIELDS.WE_NR], '205');
});

test('applyVariante ohne eigenes Exposé behält den WE-Link', () => {
  const out = applyVariante(weFields205, varianteInfo(stammRec()));
  assert.strictEqual(out[WE_FIELDS.OBJEKTVORSTELLUNG], 'https://drive.google.com/file/d/UNMOEBLIERT/view');
});

test('applyVariante hängt das Label auch an untypische Bezeichnungen an', () => {
  const out = applyVariante({ [WE_FIELDS.LAGE_BEZ]: 'Dachgeschoss links' }, varianteInfo(stammRec()));
  assert.strictEqual(out[WE_FIELDS.LAGE_BEZ], 'Dachgeschoss links (möbliert)');
});
