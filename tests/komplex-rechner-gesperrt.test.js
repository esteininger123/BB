// 22.10.2026 (Henry): „Meine Kunden" ist aus der Oberfläche raus (Nav-Link weg, Interne
// landen auf der Wohnungsliste), die Kunden-Logik bleibt im Hintergrund. Der komplizierte
// Rechner ist wieder per kleinem Haken in der WE-Liste erreichbar (nur Intern, Standard aus).
// public/app.js ist Browser-Code ohne Exporte → Block wird aus dem Quelltext geschnitten.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
const a = src.indexOf('const KOMPLEX_RECHNER_GESPERRT');
const b = src.indexOf('window._komplexRechnerToggle = _komplexRechnerToggle;');
assert.ok(a > 0 && b > a, 'Rechner-Block in app.js nicht gefunden');

function lade(user, gespeichert) {
  const toasts = []; const store = { v: gespeichert };
  const localStorage = {
    getItem: () => store.v,
    setItem: (k, v) => { store.v = v; },
  };
  const ctx = new Function(
    'state', 'localStorage', 'toast', 'renderWeListe',
    'function _komplexRechnerKey() { return "k"; }\n' +
    src.slice(a, b) + '\nreturn { aktiv: _komplexRechnerAktiv, toggle: _komplexRechnerToggle, simple: _simpleRechnerAktiv, listeSimple: _weListeSimpleMode, gesperrt: KOMPLEX_RECHNER_GESPERRT, versteckt: MEINE_KUNDEN_VERSTECKT };'
  )({ user, view: 'we-liste' }, localStorage, (m) => toasts.push(m), () => {});
  return { ...ctx, toasts, store };
}

test('Standard: Haken aus → Musterberechnung, Sperre gelöst', () => {
  const x = lade({ email: 'h.wacker@bub-immo.de', rolle: 'Admin' }, null);
  assert.strictEqual(x.gesperrt, false);
  assert.strictEqual(x.versteckt, true);
  assert.strictEqual(x.aktiv(), false);
  assert.strictEqual(x.listeSimple(), true, 'ohne Haken rechnet die WE-Liste mit der Musterberechnung');
});

test('Haken setzen schaltet Interne auf den komplizierten Rechner', () => {
  const x = lade({ email: 'h.wacker@bub-immo.de', rolle: 'Vertriebler' }, null);
  x.toggle(true);
  assert.strictEqual(x.store.v, '1');
  assert.strictEqual(x.aktiv(), true);
  assert.strictEqual(x.listeSimple(), false);
  assert.match(x.toasts[0], /aktiv/);
  x.toggle(false);
  assert.strictEqual(x.aktiv(), false);
});

test('Externe bleiben immer beim einfachen Rechner', () => {
  const x = lade({ email: 'extern@partner.de', rolle: 'Extern' }, '1');
  assert.strictEqual(x.aktiv(), false);
  assert.strictEqual(x.simple(), true);
});

test('Haken ist in der WE-Liste gerendert, „Meine Kunden" nicht mehr in der Navigation', () => {
  assert.ok(src.includes('🧮 Komplizierter Rechner'), 'Checkbox-Label fehlt');
  assert.ok(src.includes('onchange="window._komplexRechnerToggle(this.checked)"'), 'onchange auf den Toggle fehlt');
  assert.ok(src.includes("(state.user.rolle === 'Extern' || MEINE_KUNDEN_VERSTECKT) ? ''"), 'Nav-Link „Meine Kunden" muss hinter MEINE_KUNDEN_VERSTECKT hängen');
  assert.ok(src.includes("state.view = (hash === '/dashboard') ? 'dashboard' : 'we-liste';"), 'Interne müssen auf der Wohnungsliste landen');
});
