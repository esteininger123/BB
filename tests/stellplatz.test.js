// Tests für das Stellplatz-Aggregat (api/_lib/stellplatz.js).
// Anlass: Henry-Bug 28.06.2026 (Marktheidenfeld 5A) — eine über die WE verlinkte
// "Fläche" wurde verschluckt, sobald der aktive Mietvertrag eine Garage im
// NEU-Feld hatte. Ursache war ein Entweder/Oder (neu ? neu : alt) statt einer
// Vereinigung. Diese Tests fixieren das korrekte Verhalten.

const { test } = require('node:test');
const assert = require('node:assert');

const { aggregateStellplaetze } = require('../api/_lib/stellplatz');

// Stellplatz-Stammsatz-Index wie ihn die Endpoints bauen.
const stpById = {
  garage:  { titel: 'StPl 175 Garage', typ: 'Garage', kaufpreis: 15000, mieteMo: 30 },
  flaeche: { titel: 'StPl 169 Fläche', typ: 'Fläche', kaufpreis: 8000,  mieteMo: 0  },
  extra:   { titel: 'StPl X Fläche',   typ: 'Fläche', kaufpreis: 5000,  mieteMo: 12 },
};

test('Garage (NEU) + Fläche (alt WE-Link) → BEIDE zählen (Henry-Bug MH 5A WE13)', () => {
  const r = aggregateStellplaetze({
    vermietet: true,
    neuStellplatzIds: ['garage'],            // Mietvertrag-NEU: nur die migrierte Garage
    altStellplatzIds: ['garage', 'flaeche'], // WE-Link: Garage + Henrys neue Fläche
    stpById,
    vertragMieteFallback: 0,
  });
  assert.strictEqual(r.anzahl, 2, 'beide Stellplätze müssen erkannt werden');
  assert.strictEqual(r.garageCount, 1);
  assert.strictEqual(r.flaecheCount, 1);
  assert.strictEqual(r.kaufpreisSumme, 23000, 'KP = Garage 15.000 + Fläche 8.000');
  assert.strictEqual(r.mieteMoSumme, 30, 'Miete kommt nur von der Garage');
});

test('Stellplatz in NEU UND alt verlinkt → dedupe, kein Doppelzählen', () => {
  const r = aggregateStellplaetze({
    vermietet: true,
    neuStellplatzIds: ['garage'],
    altStellplatzIds: ['garage'],
    stpById,
    vertragMieteFallback: 0,
  });
  assert.strictEqual(r.anzahl, 1);
  assert.strictEqual(r.kaufpreisSumme, 15000);
  assert.strictEqual(r.mieteMoSumme, 30);
});

test('Stellplatz nur in NEU (folgt dem Vertrag, nicht über WE verlinkt) → zählt', () => {
  const r = aggregateStellplaetze({
    vermietet: true,
    neuStellplatzIds: ['extra'],
    altStellplatzIds: [],
    stpById,
    vertragMieteFallback: 0,
  });
  assert.strictEqual(r.anzahl, 1);
  assert.strictEqual(r.kaufpreisSumme, 5000);
});

test('nur alt verlinkt (keine NEU-Migration, z.B. Bruchsal) → zählt unverändert', () => {
  const r = aggregateStellplaetze({
    vermietet: true,
    neuStellplatzIds: [],
    altStellplatzIds: ['flaeche'],
    stpById,
    vertragMieteFallback: 0,
  });
  assert.strictEqual(r.anzahl, 1);
  assert.strictEqual(r.flaecheCount, 1);
  assert.strictEqual(r.kaufpreisSumme, 8000);
});

test('leerstehend ohne Annahme → KP zählt trotzdem, Miete 0 (Bug B, Edgar 28.06.)', () => {
  // Edgar 28.06.2026: KP zählt IMMER (Käufer kauft den Stellplatz mit), auch bei Leerstand.
  // Ohne gepflegte "Stellplatz-Miete bei Verkauf" bleibt die Miete aber 0 (kein Vertrag).
  const r = aggregateStellplaetze({
    vermietet: false,
    neuStellplatzIds: [],
    altStellplatzIds: ['flaeche'],
    stpById,
    vertragMieteFallback: 0,
  });
  assert.strictEqual(r.anzahl, 1, 'Stellplatz wird erkannt');
  assert.strictEqual(r.flaecheCount, 1);
  assert.strictEqual(r.kaufpreisSumme, 8000, 'KP zählt auch bei Leerstand');
  assert.strictEqual(r.mieteMoSumme, 0, 'ohne Annahme keine Miete');
  assert.strictEqual(r.mieteMoQuelle, 'leer-keine-miete');
});

test('leerstehend + Stellplatz-Miete bei Verkauf → KP zählt + angenommene Miete greift', () => {
  const r = aggregateStellplaetze({
    vermietet: false,
    neuStellplatzIds: [],
    altStellplatzIds: ['flaeche'],
    stpById,
    vertragMieteFallback: 0,
    stellplatzMieteBeiVerkauf: 35,
  });
  assert.strictEqual(r.anzahl, 1);
  assert.strictEqual(r.kaufpreisSumme, 8000);
  assert.strictEqual(r.mieteMoSumme, 35, 'angenommene Miete aus Stammdaten');
  assert.strictEqual(r.mieteMoQuelle, 'miete-bei-verkauf');
});

test('Stellplatz-Miete bei Verkauf überschreibt auch die Ist-Miete bei vermietet (wie MBV)', () => {
  const r = aggregateStellplaetze({
    vermietet: true,
    neuStellplatzIds: ['garage'],      // Garage hat 30 €/Mo MIETKOSTEN
    altStellplatzIds: ['garage'],
    stpById,
    vertragMieteFallback: 0,
    stellplatzMieteBeiVerkauf: 50,
  });
  assert.strictEqual(r.mieteMoSumme, 50, 'Annahme gewinnt vor Ist-Miete');
  assert.strictEqual(r.mieteMoQuelle, 'miete-bei-verkauf');
});

test('Annahme-Feld gesetzt, aber 0 Stellplätze → KEINE Phantom-Miete (Review-Fund)', () => {
  // Pflegefehler: "Stellplatz-Miete bei Verkauf" gepflegt, aber kein Stellplatz verlinkt.
  // Darf KEINE Miete erzeugen (sonst Phantom-Einnahme in Cashflow/IRR ohne KP-Gegenwert).
  const r = aggregateStellplaetze({
    vermietet: false,
    neuStellplatzIds: [],
    altStellplatzIds: [],
    stpById,
    vertragMieteFallback: 0,
    stellplatzMieteBeiVerkauf: 40,
  });
  assert.strictEqual(r.anzahl, 0);
  assert.strictEqual(r.kaufpreisSumme, 0);
  assert.strictEqual(r.mieteMoSumme, 0, 'keine Miete ohne Stellplatz');
  assert.strictEqual(r.mieteMoQuelle, 'leer');
});

test('Annahme-Feld gesetzt + Orphan-ID (nicht in stpById) → keine Phantom-Miete', () => {
  const r = aggregateStellplaetze({
    vermietet: false,
    neuStellplatzIds: [],
    altStellplatzIds: ['gibtsnicht'],
    stpById,
    vertragMieteFallback: 0,
    stellplatzMieteBeiVerkauf: 40,
  });
  assert.strictEqual(r.anzahl, 0);
  assert.strictEqual(r.mieteMoSumme, 0);
  assert.strictEqual(r.mieteMoQuelle, 'leer');
});

test('komplett leer (kein Stellplatz) → 0/leer', () => {
  const r = aggregateStellplaetze({
    vermietet: false,
    neuStellplatzIds: [],
    altStellplatzIds: [],
    stpById,
    vertragMieteFallback: 0,
  });
  assert.strictEqual(r.anzahl, 0);
  assert.strictEqual(r.kaufpreisSumme, 0);
  assert.strictEqual(r.mieteMoSumme, 0);
  assert.strictEqual(r.mieteMoQuelle, 'leer');
});
