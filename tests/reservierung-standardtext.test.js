// Tests für den neuen Reservierungs-Standardtext (Henry, 16.07.2026):
// [Kaufpreis.Zusammensetzung] + [Reservierung.Standardtext] in send-for-signature.js.
const { test } = require('node:test');
const assert = require('node:assert');

const {
  composeKaufpreisZusammensetzung,
  composeStandardtext,
  stellplatzLabel,
} = require('../api/reservierung/send-for-signature.js');

test('Kaufpreis-Zusammensetzung: Wohnung + Garage + Stellplatz + Subvention', () => {
  const s = composeKaufpreisZusammensetzung(163000, [
    { typ: 'Garage', preis: 15000 },
    { typ: 'Fläche', preis: 8000 },
  ], null, 3470);
  assert.strictEqual(s, '163.000 € + 15.000 € Garage + 8.000 € Stellplatz und 3.470 € Mietsubvention');
});

test('Kaufpreis-Zusammensetzung: nur Wohnung, keine Extras', () => {
  assert.strictEqual(composeKaufpreisZusammensetzung(290000, [], null, 0), '290.000 €');
});

test('Kaufpreis-Zusammensetzung: Snapshot-Preis hat Vorrang vor Live-Preis', () => {
  const s = composeKaufpreisZusammensetzung(163000, [{ typ: 'Garage', preis: 10000 }], 150000, 0);
  assert.strictEqual(s, '150.000 € + 10.000 € Garage');
});

test('Kaufpreis-Zusammensetzung: Stellplatz mit Preis 0 erscheint nicht', () => {
  const s = composeKaufpreisZusammensetzung(120000, [{ typ: 'Fläche', preis: 0 }], null, 0);
  assert.strictEqual(s, '120.000 €');
});

test('stellplatzLabel: Fläche → Stellplatz, Tiefgarage → TG-Stellplatz, Garage bleibt', () => {
  assert.strictEqual(stellplatzLabel('Fläche'), 'Stellplatz');
  assert.strictEqual(stellplatzLabel('Tiefgarage'), 'TG-Stellplatz');
  assert.strictEqual(stellplatzLabel('Garage'), 'Garage');
  assert.strictEqual(stellplatzLabel(''), 'Stellplatz');
});

test('Standardtext: alle 5 Pflicht-Bausteine im Wortlaut enthalten', () => {
  const txt = composeStandardtext({
    ablaufStr: '15.07.2026',
    adresse: 'Rheinstraße 290, 50389 Wesseling',
    qm: 60.72,
    weNr: '2',
    kaufpreisZusammensetzung: '150.000 € + 10.000 € Garage und 7.000 € Mietsubvention',
  });
  assert.ok(txt.includes('Die Vertragsparteien vereinbaren die Reservierung des Objekts bis zum 15.07.2026.'), 'Frist-Satz');
  assert.ok(txt.includes('Innerhalb dieser Zeit wird ein Notartermin festgelegt. Die Kaufinteressenten beauftragen hiermit ausdrücklich diesen Notartermin und tragen dementsprechend alle Kosten, die mit einer Absage verbunden wären.'), 'Notartermin-/Absagekosten-Satz');
  assert.ok(txt.includes('Objekt:'), 'Objekt-Überschrift');
  assert.ok(txt.includes('Rheinstraße 290, 50389 Wesseling mit 60,72 m², Wohnungs-Nr. 2 zum Kaufpreis von 150.000 € + 10.000 € Garage und 7.000 € Mietsubvention.'), 'Objekt-Zeile');
  assert.ok(txt.includes('Die Vertragsparteien sind sich einig, einen notariellen Kaufvertrag gemäß den oben genannten Angaben und den persönlichen Daten bei einem ortsnahen Notar zu erstellen.'), 'Notar-Satz');
  assert.ok(txt.includes('Reservierung unter dem Vorbehalt einer Besichtigung, bei der der Zustand dem Exposé entspricht.'), 'Besichtigungs-Vorbehalt');
});

test('Standardtext: fehlende qm/WE-Nr brechen den Satz nicht', () => {
  const txt = composeStandardtext({
    ablaufStr: '01.08.2026',
    adresse: 'Musterweg 1, 12345 Musterstadt',
    qm: null,
    weNr: '',
    kaufpreisZusammensetzung: '99.000 €',
  });
  assert.ok(txt.includes('Musterweg 1, 12345 Musterstadt zum Kaufpreis von 99.000 €.'), 'Objekt-Zeile ohne mit-Teil');
  assert.ok(!txt.includes(' mit  '), 'kein leerer mit-Teil');
});
