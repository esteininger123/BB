const { test } = require('node:test');
const assert = require('node:assert');
const { kpWohnungFuerReservierung } = require('../api/_lib/reserv-preis');

// Extern: 2 % Abgabe-Rabatt auf die Wohnung, Provision auf Wohnung+Stellplatz.
test('extern: Abgabepreis minus 2 % plus Provision auf die Gesamtbasis', () => {
  const kp = kpWohnungFuerReservierung({ extern: true, kpBasis: 100000, stellplatzKp: 10000, provisionPct: 0.07 });
  assert.strictEqual(kp, 105560); // 98.000 + 7 % von 108.000
});

test('extern: ohne Provision bleibt der reine Abgabepreis', () => {
  assert.strictEqual(kpWohnungFuerReservierung({ extern: true, kpBasis: 159103, stellplatzKp: 0, provisionPct: 0 }), 155921);
});

// Intern: KEIN Rabatt, KEIN Aufschlag — der echte interne Preis.
test('intern: unveraenderter Kaufpreis der Wohneinheit', () => {
  assert.strictEqual(kpWohnungFuerReservierung({ extern: false, kpBasis: 159103, stellplatzKp: 0, provisionPct: 0.07 }), 159103);
});

test('intern: Snapshot-Gesamtpreis schlaegt den Live-Preis, Stellplatz wird abgezogen', () => {
  const kp = kpWohnungFuerReservierung({ extern: false, kpBasis: 178977, stellplatzKp: 10000, snapKaufpreis: 191275 });
  assert.strictEqual(kp, 181275);
});

test('intern: leerer/ungueltiger Snapshot faellt auf den WE-Preis zurueck', () => {
  assert.strictEqual(kpWohnungFuerReservierung({ extern: false, kpBasis: 159103, stellplatzKp: 0, snapKaufpreis: 0 }), 159103);
  assert.strictEqual(kpWohnungFuerReservierung({ extern: false, kpBasis: 159103, stellplatzKp: 0, snapKaufpreis: 'kaputt' }), 159103);
});

test('intern: Snapshot kleiner als der Stellplatzanteil ergibt nie einen negativen Preis', () => {
  assert.strictEqual(kpWohnungFuerReservierung({ extern: false, kpBasis: 50000, stellplatzKp: 20000, snapKaufpreis: 15000 }), 0);
});
