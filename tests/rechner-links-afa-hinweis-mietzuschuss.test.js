// 24.10.2026 (Henry/Sparkasse Freiburg): Drei Rechner-Erweiterungen für den externen Vertrieb
// (Spechtweg-Kontingent Sparkasse Freiburg): (1) Buttons „Objektordner" + „Wohnungsunterlagen" aus
// den Stammdaten-Links neben dem Exposé-Button, (2) Freitext „AfA Hinweis" unter der AfA-Zeile,
// (3) Tabelle „Aufschlüsselung Mietzuschuss" je Phase + Hinweis zur Auszahlungswahl.
// Reine Darstellung: Rechenwerte (_rechnerCalc) bleiben unverändert.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'public', 'app.js'), 'utf8');

// ---------- Mapping: Field-IDs + API-Objekt ----------
test('tables.js: neue Kalk-Stammdaten-Felder mit den Airtable-IDs vom 24.10.2026', () => {
  const t = require('../api/_lib/tables.js').KALK_STAMMDATEN_FIELDS;
  assert.strictEqual(t.LINK_DATENRAUM_EXTERN, 'fld68EK09v3gnlhLr');
  assert.strictEqual(t.LINK_WOHNUNGSUNTERLAGEN_EXTERN, 'fldMaFbHFIHsBnmZt');
  assert.strictEqual(t.AFA_HINWEIS, 'fldD3lf7XignFQE8x');
  // keine doppelten IDs in der Feldliste (422-Falle)
  const ids = Object.values(t);
  assert.strictEqual(new Set(ids).size, ids.length, 'doppelte Field-ID in KALK_STAMMDATEN_FIELDS');
});

test('API: beide Stammdaten-Endpunkte liefern linkDatenraumExtern / linkWohnungsunterlagenExtern / afaHinweis (leer = null)', () => {
  for (const f of ['api/stammdaten/[weId].js', 'api/stammdaten/index.js']) {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const [key, field] of [['linkDatenraumExtern', 'LINK_DATENRAUM_EXTERN'], ['linkWohnungsunterlagenExtern', 'LINK_WOHNUNGSUNTERLAGEN_EXTERN'], ['afaHinweis', 'AFA_HINWEIS']]) {
      const re = new RegExp(key + ':\\s*\\(\\w+\\[KALK_STAMMDATEN_FIELDS\\.' + field + '\\] \\|\\| \'\'\\)\\.toString\\(\\)\\.trim\\(\\) \\|\\| null');
      assert.ok(re.test(s), f + ' fehlt ' + key);
      assert.strictEqual(s.split(key + ':').length - 1, 1, f + ': ' + key + ' muss genau einmal vorkommen');
    }
  }
});

// ---------- Rechenkern: afaHinweis wird durchgereicht, Zahlen unverändert ----------
const a = src.search(/const RECHNER_[A-Z_]+ *=/);
const b = src.indexOf('function _rechnerCalc(d, inp) {');
const close = src.indexOf('\n}', b);
const bEnd = src.indexOf('\n', close + 1) + 1;
const fn = new Function(src.slice(a, bEnd) + '\nreturn { calc: _rechnerCalc };')();

const phasen3 = [{ mo: 120.5, monate: 22 }, { mo: 80.25, monate: 36 }, { mo: 40, monate: 36 }];
const basisDaten = (extra) => ({
  we: { kp: 190900, kaltmiete: 0, lage: 'WE: 101, 2.OG Links, Spechtweg 33, 79110 Freiburg', weNr: '101', qm: 60 },
  kalkStammdaten: Object.assign({ hausverwaltung: 32.73, hausgeldRuecklage: 35, grEst: 0.05, gebaeudeAnteil: 0.85, afaGutachten: 0.0385, mieteBeiVerkauf: 644 }, extra || {}),
  derived: { subventionPhasen: phasen3, subventionTotalEur: 120.5 * 22 + 80.25 * 36 + 40 * 36 },
  stellplaetze: {},
});
const inp = { ek: 0, zinsPct: 5, tilgungPct: 1, steuerPct: 42, sev: true };

test('_rechnerCalc: afaHinweis kommt getrimmt aus den Stammdaten, Rechenwerte bleiben identisch', () => {
  const ohne = fn.calc(basisDaten(), inp);
  const mit = fn.calc(basisDaten({ afaHinweis: '  Gutachten liegt vor.\nAnerkennung erwartet.  ' }), inp);
  assert.strictEqual(ohne.afaHinweis, '');
  assert.strictEqual(mit.afaHinweis, 'Gutachten liegt vor.\nAnerkennung erwartet.');
  for (const k of ['einnahmenMo', 'kostenMo', 'rateMo', 'vorSteuerMo', 'nachSteuerMo', 'afaJahr', 'subvTotal']) {
    assert.strictEqual(mit[k], ohne[k], k + ' darf sich durch den Hinweis nicht ändern');
  }
});

// ---------- Render: app.js in Mini-DOM-Sandbox, Rechner-Ansicht erzeugen ----------
function renderRechner(daten, rolle) {
  const el = { innerHTML: '', style: {}, classList: { add() {}, remove() {}, toggle() {} }, appendChild() {}, querySelectorAll: () => [], querySelector: () => null, addEventListener() {} };
  const mkEl = () => ({ innerHTML: '', textContent: '', style: {}, setAttribute() {}, appendChild() {}, classList: { add() {}, remove() {} }, addEventListener() {} });
  const document = {
    getElementById: (id) => (id === 'app' ? el : null),
    querySelector: () => null, querySelectorAll: () => [],
    createElement: mkEl, head: { appendChild() {} }, body: Object.assign(mkEl(), { classList: { add() {}, remove() {}, contains: () => false } }),
    addEventListener() {}, title: '',
  };
  const storage = { getItem: () => null, setItem() {}, removeItem() {} };
  const win = { addEventListener() {}, location: { hash: '', href: '', origin: '', pathname: '/' }, localStorage: storage, sessionStorage: storage, document, setTimeout, clearTimeout, console, navigator: { userAgent: 'test' }, matchMedia: () => ({ matches: false, addEventListener() {} }), history: { replaceState() {}, pushState() {} }, fetch: async () => ({ ok: false, json: async () => ({}) } ) };
  const sandbox = { window: win, document, localStorage: storage, sessionStorage: storage, console, setTimeout, clearTimeout, setInterval, clearInterval, fetch: win.fetch, navigator: win.navigator, location: win.location, history: win.history, URL, URLSearchParams, Intl, requestAnimationFrame: (f) => f(), alert() {}, confirm: () => false };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src + '\n;window.__state = state; window.__render = _rechnerRenderContent;', sandbox, { filename: 'app.js' });
  const state = sandbox.window.__state;
  state.user = { rolle: rolle || 'Extern', email: 't@example.com' };
  state._rechnerData = daten;
  state._rechnerInputs = Object.assign({}, inp);
  sandbox.window.__render();
  return el.innerHTML;
}

test('Render: Buttons Exposé / Objektordner / Wohnungsunterlagen (gleiche Klasse rc-expose, Print-Regel blendet sie aus)', () => {
  const d = basisDaten({ linkDatenraumExtern: 'https://drive.google.com/drive/folders/ABC', linkWohnungsunterlagenExtern: 'https://drive.google.com/drive/folders/XYZ?x=1&y=2' });
  d.we.objektvorstellungLink = 'https://expose.example/101';
  for (const rolle of ['Extern', 'Vertriebler']) {
    const html = renderRechner(d, rolle);
    const buttons = html.match(/<a class="rc-expose"[^>]*>[^<]*<\/a>/g) || [];
    // Hero + CTA-Leiste = je 3 Buttons
    assert.strictEqual(buttons.length, 6, rolle + ': 6 Link-Buttons erwartet, gefunden ' + buttons.length);
    assert.ok(html.includes('href="https://drive.google.com/drive/folders/ABC" target="_blank" rel="noopener">Objektordner ↗</a>'));
    assert.ok(html.includes('href="https://drive.google.com/drive/folders/XYZ?x=1&amp;y=2" target="_blank" rel="noopener">Wohnungsunterlagen ↗</a>'), 'URL muss HTML-escaped sein');
    assert.ok(html.includes('>Exposé ansehen ↗</a>'));
  }
  // ohne Links: nur der Exposé-Button
  const nur = renderRechner(Object.assign(basisDaten(), { we: Object.assign({}, d.we) }), 'Extern');
  assert.strictEqual((nur.match(/<a class="rc-expose"/g) || []).length, 2);
  assert.ok(!nur.includes('Objektordner'));
  // Print-Regel: .rc-expose wird im Druck ausgeblendet (alle drei Buttons teilen die Klasse)
  assert.ok(/@media print \{\s*#app-header, \.rc-back, \.rc-cta, \.rc-expose, \.rc-lock \{ display:none !important; \}/.test(src));
});

test('Render: AfA-Hinweis als eigener rc-hinweis-Absatz (escaped, Zeilenumbruch = <br>), Worst-Case-Satz folgt darunter', () => {
  const ohne = renderRechner(basisDaten(), 'Extern');
  assert.ok(!ohne.includes('Gutachten liegt vor'));
  const mit = renderRechner(basisDaten({ afaHinweis: 'Gutachten liegt <vor>.\nAnerkennung erwartet.', afaWorstCasePct: 0.02 }), 'Extern');
  const i1 = mit.indexOf('<div class="rc-hinweis">Gutachten liegt &lt;vor&gt;.<br>Anerkennung erwartet.</div>');
  const i2 = mit.indexOf('Grundlage ist das aktuell vorliegende Restnutzungsdauer-Gutachten');
  const iAfa = mit.indexOf('Verkürzte Restnutzungsdauer in %');
  assert.ok(i1 > 0, 'AfA-Hinweis fehlt oder nicht escaped');
  assert.ok(iAfa < i1 && i1 < i2, 'Reihenfolge: AfA-Zeile, Freitext, Worst-Case-Satz');
  assert.ok(mit.includes('id="rcv-afaWorst"') && mit.includes('id="rcv-afaWorstBasis"'), 'Live-Update-IDs bleiben');
  // nur Freitext, kein Worst Case
  const nurText = renderRechner(basisDaten({ afaHinweis: 'Nur Text' }), 'Extern');
  assert.ok(nurText.includes('<div class="rc-hinweis">Nur Text</div>'));
  assert.ok(!nurText.includes('rcv-afaWorst'));
});

test('Render Spechtweg: Aufschlüsselung Mietzuschuss mit 3 Kappungs-Phasen, Summenzeile = Garantie-Volumen, Hinweis darunter', () => {
  const html = renderRechner(basisDaten(), 'Extern');
  assert.ok(html.includes('Garantierte Miete durch B&amp;B (7 Jahre + 10 Monate)') || html.includes('Garantierte Miete durch B&amp;B (94 Monate)'));
  assert.ok(html.includes('<div class="rc-sub">Aufschlüsselung Mietzuschuss</div>'));
  const rows = html.match(/<tr><td>Monat [^<]*<\/td><td>[^<]*<\/td><td>\d+<\/td><td>[^<]*<\/td><\/tr>/g) || [];
  assert.strictEqual(rows.length, 3);
  assert.strictEqual(rows[0], '<tr><td>Monat 1 bis 22</td><td>120,50 €</td><td>22</td><td>2.651,00 €</td></tr>');
  assert.strictEqual(rows[1], '<tr><td>Monat 23 bis 58</td><td>80,25 €</td><td>36</td><td>2.889,00 €</td></tr>');
  assert.strictEqual(rows[2], '<tr><td>Monat 59 bis 94</td><td>40,00 €</td><td>36</td><td>1.440,00 €</td></tr>');
  assert.ok(html.includes('<tfoot><tr><td>Garantie-Volumen gesamt</td><td></td><td>94</td><td>6.980 €</td></tr></tfoot>'));
  const hinweis = 'Der Mietzuschuss ist eine Garantie von B&amp;B über die gesamte Laufzeit. Auszahlung nach Wahl des Käufers: jährlich im Nachgang, einmalig nach dem Notartermin oder als Kaufpreisreduzierung in Höhe des Garantie-Volumens. Die Käufer-Einnahme bleibt in jedem Fall konstant.';
  assert.ok(html.indexOf('</table>') < html.indexOf(hinweis), 'Hinweis direkt unter der Tabelle');
  assert.strictEqual(html.split(hinweis).length - 1, 1);
});

test('Render Spechtweg Index: 8 jährliche Phasen fortlaufend nummeriert', () => {
  const ph = Array.from({ length: 8 }, (_, k) => ({ mo: 150 - k * 12.5, monate: k === 0 ? 7 : 12 }));
  const total = ph.reduce((s, p) => s + p.mo * p.monate, 0);
  const d = basisDaten();
  d.derived = { subventionPhasen: ph, subventionTotalEur: total, subventionIstIndex: true };
  const html = renderRechner(d, 'Extern');
  const rows = html.match(/<tr><td>Monat (\d+) bis (\d+)<\/td>/g) || [];
  assert.strictEqual(rows.length, 8);
  assert.ok(rows[0].startsWith('<tr><td>Monat 1 bis 7</td>'));
  assert.ok(rows[1].startsWith('<tr><td>Monat 8 bis 19</td>'));
  assert.ok(rows[7].startsWith('<tr><td>Monat 80 bis 91</td>'));
  assert.ok(html.includes('<td>91</td><td>' + Math.round(total).toLocaleString('de-DE') + ' €</td></tr></tfoot>'));
});

test('Render Nicht-Spechtweg: Phasen-Zeilen wie bisher, keine Doppel-Tabelle, aber der Hinweis', () => {
  const d = basisDaten();
  d.we.lage = 'WE: 4, 1.OG, Mozartstraße 4, 97318 Kitzingen';
  const html = renderRechner(d, 'Vertriebler');
  assert.ok(html.includes('Mntl. Mietsubvention Phase 1 (Monat 1–22)'));
  assert.ok(!html.includes('Aufschlüsselung Mietzuschuss'));
  assert.ok(html.includes('Der Mietzuschuss ist eine Garantie von B&amp;B über die gesamte Laufzeit.'));
  // ohne Phasen: weder Tabelle noch Hinweis
  d.derived = { subventionPhasen: [], subventionTotalEur: 0 };
  const leer = renderRechner(d, 'Vertriebler');
  assert.ok(!leer.includes('Der Mietzuschuss ist eine Garantie'));
  assert.ok(leer.includes('keine — Miete liegt auf dem Zielniveau'));
});
