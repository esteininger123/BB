// 14.10.2026 (Henry): Der komplizierte Rechner (Kunden-Kalkulator als Klick-Ziel
// der WE-Liste) ist gesperrt — die WE-Liste nutzt für alle die Musterberechnung,
// auch wenn im localStorage noch der alte Haken „1" liegt.
// public/app.js ist Browser-Code ohne Exporte → Block wird aus dem Quelltext geschnitten.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const a = src.indexOf('const KOMPLEX_RECHNER_GESPERRT');
const b = src.indexOf('window._komplexRechnerToggle = _komplexRechnerToggle;');
assert.ok(a > 0 && b > a, 'Sperr-Block in app.js nicht gefunden');

function lade(user, gespeichert) {
  const toasts = [];
  const localStorage = {
    getItem: () => gespeichert,
    setItem: () => { throw new Error('localStorage darf gesperrt nicht beschrieben werden'); },
  };
  const ctx = new Function(
    'state', 'localStorage', 'toast', 'renderWeListe',
    src.slice(a, b) + '\nreturn { aktiv: _komplexRechnerAktiv, toggle: _komplexRechnerToggle, simple: _simpleRechnerAktiv, listeSimple: _weListeSimpleMode, gesperrt: KOMPLEX_RECHNER_GESPERRT };'
  )({ user, view: 'we-liste' }, localStorage, (m) => toasts.push(m), () => { throw new Error('kein Re-Render'); });
  return { ...ctx, toasts };
}

test('Sperre ist aktiv und ignoriert einen gespeicherten Haken', () => {
  const x = lade({ email: 'h.wacker@bub-immo.de', rolle: 'Admin' }, '1');
  assert.strictEqual(x.gesperrt, true);
  assert.strictEqual(x.aktiv(), false, 'alter localStorage-Haken darf nicht mehr wirken');
  assert.strictEqual(x.simple(), true);
  assert.strictEqual(x.listeSimple(), true, 'WE-Liste rechnet mit der Musterberechnung');
});

test('Toggle schreibt nichts mehr und meldet nur die Sperre', () => {
  const x = lade({ email: 'h.wacker@bub-immo.de', rolle: 'Vertriebler' }, null);
  x.toggle(true);
  assert.strictEqual(x.toasts.length, 1);
  assert.match(x.toasts[0], /gesperrt/);
  assert.strictEqual(x.aktiv(), false);
});

test('Haken ist aus der WE-Liste entfernt', () => {
  assert.ok(!src.includes('🧮 Komplizierter Rechner'), 'Checkbox-Label darf nicht mehr gerendert werden');
  assert.ok(!src.includes('onchange="window._komplexRechnerToggle'), 'kein onchange auf den Toggle');
});
