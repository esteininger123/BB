// 17.08.2026 (Henry) — Verkauf ÜBER Markt: liegt der WE-Kaufpreis/m² über dem besten
// Portal-Wert (ImmoScout/Homeday), liefert computeMarktpreisGemittelt wert=0 mit
// quelle='ueber-markt' → Marktwert wird nirgends angezeigt, kalkulator.js ankert auf
// dem Kaufpreis (markteinkaufVorteil=0 statt negativ), Rechner-Marktvergleich fällt raus.
const test = require('node:test');
const assert = require('node:assert');
const { computeMarktpreisGemittelt } = require('../api/stammdaten/[weId].js');

test('unter Markt: höherer Portal-Wert gewinnt, Quelle korrekt', () => {
  const r = computeMarktpreisGemittelt({ marktpreisImmoscout: 3000, marktpreisHomeday: 3200 }, 2500);
  assert.strictEqual(r.wert, 3200);
  assert.strictEqual(r.quelle, 'homeday');
});

test('über Markt: KP/m² über bestem Portal-Wert → wert 0, quelle ueber-markt', () => {
  const r = computeMarktpreisGemittelt({ marktpreisImmoscout: 3000, marktpreisHomeday: 3200 }, 3500);
  assert.strictEqual(r.wert, 0);
  assert.strictEqual(r.quelle, 'ueber-markt');
});

test('exakt auf Markt (KP/m² == Portal-Wert): Marktwert bleibt sichtbar', () => {
  const r = computeMarktpreisGemittelt({ marktpreisImmoscout: 3200 }, 3200);
  assert.strictEqual(r.wert, 3200);
  assert.strictEqual(r.quelle, 'immoscout');
});

test('ohne kaufpreisProQm (alte Aufrufer/0): Verhalten unverändert', () => {
  const r = computeMarktpreisGemittelt({ marktpreisImmoscout: 3000 });
  assert.strictEqual(r.wert, 3000);
  assert.strictEqual(r.quelle, 'immoscout');
  const r0 = computeMarktpreisGemittelt({ marktpreisHomeday: 2800 }, 0);
  assert.strictEqual(r0.wert, 2800);
});

test('WG-Konzept hat Vorrang vor ueber-markt', () => {
  const r = computeMarktpreisGemittelt({ wgKonzept: true, marktpreisImmoscout: 3000 }, 3500);
  assert.strictEqual(r.wert, 0);
  assert.strictEqual(r.quelle, 'wg-konzept');
});

test('keine Portal-Werte: quelle keine, kein ueber-markt', () => {
  const r = computeMarktpreisGemittelt({}, 3500);
  assert.strictEqual(r.wert, 0);
  assert.strictEqual(r.quelle, 'keine');
});
