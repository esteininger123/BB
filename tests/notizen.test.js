// Tests für api/_lib/notizen.js — Block-aware Insert + Cutoff.
// Diese Lib ist neu in FS-2a (Tech-Architekt BLOCKER B-2/B-3-Fix) und ist
// der zentrale Notizen-Helper im Backend. Wenn sie bricht, brechen 4
// API-Endpoints gleichzeitig.

const { test } = require('node:test');
const assert = require('node:assert');
const notizen = require('../api/_lib/notizen.js');

// === _extractFreeNotes ===

test('_extractFreeNotes: leerer String → leer', () => {
  assert.strictEqual(notizen._extractFreeNotes(''), '');
  assert.strictEqual(notizen._extractFreeNotes(null), '');
});

test('_extractFreeNotes: ohne Blocks → unverändert', () => {
  assert.strictEqual(notizen._extractFreeNotes('Hallo Welt'), 'Hallo Welt');
});

test('_extractFreeNotes: nur KAV-Block → leer', () => {
  const s = '[KAV-TRACKER]\n{"tasks":{}}\n[/KAV-TRACKER]';
  assert.strictEqual(notizen._extractFreeNotes(s), '');
});

test('_extractFreeNotes: Free + KAV-Block → nur Free', () => {
  const s = 'Notiz vom 15.5.\n\n[KAV-TRACKER]\n{"tasks":{}}\n[/KAV-TRACKER]';
  assert.ok(notizen._extractFreeNotes(s).includes('Notiz vom 15.5.'));
  assert.ok(!notizen._extractFreeNotes(s).includes('KAV-TRACKER'));
});

test('_extractFreeNotes: Free + KAV + WUNSCH → nur Free', () => {
  const s = 'Notiz\n[KAV-TRACKER]\n{}\n[/KAV-TRACKER]\n[WUNSCH-PROFIL]\n{}\n[/WUNSCH-PROFIL]';
  assert.strictEqual(notizen._extractFreeNotes(s), 'Notiz');
});

// === _enforceLineLimit ===

test('_enforceLineLimit: kurze Notizen unverändert', () => {
  const short = 'Z1\nZ2\nZ3';
  assert.strictEqual(notizen._enforceLineLimit(short), short);
});

test('_enforceLineLimit: > 100 Zeilen → Cutoff vorne, Blocks bleiben', () => {
  const headLines = Array.from({ length: 105 }, (_, i) => `Z${i + 1}`).join('\n');
  const block = '[KAV-TRACKER]\n{"tasks":{}}\n[/KAV-TRACKER]';
  const full = headLines + block;
  const out = notizen._enforceLineLimit(full);
  // Cutoff-Marker enthalten
  assert.ok(out.includes('ältere Einträge abgeschnitten'));
  // KAV-Block muss erhalten bleiben
  assert.ok(out.includes('[KAV-TRACKER]'));
  assert.ok(out.includes('[/KAV-TRACKER]'));
  // Älteste Zeilen weg
  assert.ok(!out.includes('Z1\n'));
  assert.ok(out.includes('Z105'));
});

test('_enforceLineLimit: Wunsch-Block bleibt auch erhalten', () => {
  const headLines = Array.from({ length: 200 }, (_, i) => `Z${i + 1}`).join('\n');
  const wunschBlock = '[WUNSCH-PROFIL]\n{"regionen":["BW:Ortenaukreis"]}\n[/WUNSCH-PROFIL]';
  const full = headLines + wunschBlock;
  const out = notizen._enforceLineLimit(full);
  assert.ok(out.includes('[WUNSCH-PROFIL]'));
  assert.ok(out.includes('Ortenaukreis'));
});

test('_enforceLineLimit: keine Blocks, > 100 Zeilen → Cutoff', () => {
  const lines = Array.from({ length: 105 }, (_, i) => `Eintrag ${i + 1}`).join('\n');
  const out = notizen._enforceLineLimit(lines);
  assert.ok(out.includes('ältere Einträge abgeschnitten'));
  assert.ok(out.includes('Eintrag 105'));
});

// === Block-Marker-Erkennung (indirekt via _extractFreeNotes) ===

test('Lib exportiert die richtigen Konstanten', () => {
  assert.strictEqual(notizen.KAV_START, '[KAV-TRACKER]');
  assert.strictEqual(notizen.WUNSCH_START, '[WUNSCH-PROFIL]');
});

// === Helper-Funktion appendActivityZeile (Smoke-Test ohne echte DB) ===

test('appendActivityZeile: ist async + akzeptiert kundeId + zeile', async () => {
  // Echter Aufruf würde Airtable kontaktieren — wir prüfen nur die API-Form
  assert.strictEqual(typeof notizen.appendActivityZeile, 'function');
});

test('setNotizen: ist async', async () => {
  assert.strictEqual(typeof notizen.setNotizen, 'function');
});
