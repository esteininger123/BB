# Finanzierungs-Konditionen (Admin) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Henry (Admin) pflegt Zins + Tilgung in einer 2×2-Matrix (Kaufpreis-Band × KNK) im Admin-Bereich; der Kalkulator zieht die Werte daraus statt aus Code-Konstanten.

**Architecture:** Eine reine Funktion `resolveKondition(kaufpreis, knk, config)` in `kalkulator.js` ist die einzige Zins-/Tilgung-Quelle. Config liegt als JSON-Blob in einer neuen 1-Record-Airtable-Tabelle, served über `GET/PUT /api/konditionen`. Frontend lädt sie beim Boot in `state.konditionen`, fällt auf Code-Defaults zurück.

**Tech Stack:** Vanilla JS (kein Build), Vercel Serverless (Node 20), Airtable REST via `api/_lib/airtable.js`, `node --test`.

## Global Constraints

- **Airtable-Field-IDs nur in `api/_lib/tables.js`** — keine Hardcodes außerhalb.
- **Defaults = heutige Werte:** ohne KNK 4,5 % / mit KNK 4,8 % Zins, Tilgung 1 %, Schwelle 150.000 €. Beide Bänder starten identisch.
- **Band-Grenze:** Kaufpreis `≥ schwelleKaufpreis` → `gross`; sonst `klein`. 150.000 zählt zu `gross`.
- **Zins/Tilgung als Dezimal** (0.045 = 4,5 %). UI zeigt Prozent.
- **Resilienz:** Rechner blockiert nie an der Config — fehlt/kaputt → Defaults.
- **Validierung PUT:** schwelle > 0; jede zins ∈ [0, 0.20]; jede tilgung ∈ [0, 0.10]; Struktur vollständig.
- Commits: kurz, sachlich, kein Co-Author-Footer.

---

### Task 1: Airtable-Config-Tabelle + tables.js

**Files:**
- Airtable Base `appikHUetNyeonXBX`: neue Tabelle „App-Konfiguration"
- Modify: `api/_lib/tables.js` (neuer TABLES-Eintrag + FIELDS + export)

**Interfaces:**
- Produces: `TABLES.APP_KONFIG` (tableId), `APP_KONFIG_FIELDS = { KEY, JSON, AKTUALISIERT }` (fieldIds), `APP_KONFIG_KEY = 'konditionen'`.

- [ ] **Step 1: Tabelle per Airtable-MCP anlegen**

Tabelle „App-Konfiguration" mit Feldern:
- `Key` — Single line text (Primary)
- `JSON` — Long text
- `Aktualisiert` — Long text

Danach einen Record anlegen mit `Key = "konditionen"`, `JSON` leer (Defaults greifen per Fallback).
Tabellen-ID + die drei Field-IDs notieren (MCP-Antwort liefert sie).

- [ ] **Step 2: tables.js erweitern**

In `TABLES` ergänzen:
```js
  // App-weite Konfiguration (1 Record je Key). 2026-06-19: Finanzierungs-Konditionen.
  APP_KONFIG: 'tblXXXXXXXXXXXXXX',
```
Nach `FINANZIERUNGSFALL_FIELDS`-Block ergänzen:
```js
// App-Konfiguration (Key/Value-Store, 1 Record pro Key)
const APP_KONFIG_FIELDS = {
  KEY:          'fldXXXXXXXXXXXXXX', // Single line (Primary)
  JSON:         'fldXXXXXXXXXXXXXX', // Long text — Config-Blob
  AKTUALISIERT: 'fldXXXXXXXXXXXXXX', // Long text — ISO + Editor-Email
};
const APP_KONFIG_KEY_KONDITIONEN = 'konditionen';
```
In `module.exports` ergänzen: `APP_KONFIG_FIELDS,` und `APP_KONFIG_KEY_KONDITIONEN,`.

- [ ] **Step 3: Schema-Guard**

Run: `npm run guard`
Expected: keine Fehler zu APP_KONFIG-Feldern (IDs existieren in der Base).

- [ ] **Step 4: Commit**
```bash
git add api/_lib/tables.js
git commit -m "feat(konditionen): App-Konfig-Tabelle + Field-IDs"
```

---

### Task 2: resolveKondition + Defaults in kalkulator.js (TDD)

**Files:**
- Modify: `public/kalkulator.js` (neue Konstante + 2 Funktionen, Export auf `window.Kalk`)
- Test: `tests/konditionen.test.js`

**Interfaces:**
- Produces (auf `window.Kalk`):
  - `KONDITIONEN_DEFAULTS` — Objekt wie unten
  - `mergeKonditionen(partial) → vollständige Config`
  - `resolveKondition(kaufpreis, knkMitfinanziert, config?) → { zins, tilgung }`

- [ ] **Step 1: Failing test schreiben** — `tests/konditionen.test.js`
```js
const { test } = require('node:test');
const assert = require('node:assert');
const { loadKalk } = require('./_loader');

const K = loadKalk().Kalk;

test('Band-Grenze: 149999 → klein, 150000/150001 → gross (Default-Zinsen identisch)', () => {
  // Defaults: beide Bänder gleich → Zins 4,5 % ohne KNK
  assert.strictEqual(K.resolveKondition(149999, false).zins, 0.045);
  assert.strictEqual(K.resolveKondition(150000, false).zins, 0.045);
  assert.strictEqual(K.resolveKondition(150001, false).zins, 0.045);
});

test('KNK-Variante wählt 4,8 % (Default)', () => {
  assert.strictEqual(K.resolveKondition(200000, true).zins, 0.048);
  assert.strictEqual(K.resolveKondition(200000, false).zins, 0.045);
  assert.strictEqual(K.resolveKondition(200000, true).tilgung, 0.01);
});

test('Band-Differenzierung greift mit Custom-Config', () => {
  const cfg = K.mergeKonditionen({
    schwelleKaufpreis: 150000,
    baender: { klein: { ohneKnk: { zins: 0.055 } } }
  });
  assert.strictEqual(K.resolveKondition(120000, false, cfg).zins, 0.055); // klein
  assert.strictEqual(K.resolveKondition(180000, false, cfg).zins, 0.045); // gross unverändert
});

test('kaufpreis 0/NaN → klein, kein Crash', () => {
  assert.strictEqual(K.resolveKondition(0, false).zins, 0.045);
  assert.strictEqual(K.resolveKondition(NaN, true).zins, 0.048);
});

test('mergeKonditionen füllt fehlende Zellen mit Defaults', () => {
  const cfg = K.mergeKonditionen({ baender: { klein: { mitKnk: { zins: 0.06 } } } });
  assert.strictEqual(cfg.baender.klein.mitKnk.zins, 0.06);
  assert.strictEqual(cfg.baender.klein.mitKnk.tilgung, 0.01); // Default beibehalten
  assert.strictEqual(cfg.baender.gross.ohneKnk.zins, 0.045);
  assert.strictEqual(cfg.schwelleKaufpreis, 150000);
});
```

- [ ] **Step 2: Test ausführen, FAIL erwarten**

Run: `node --test tests/konditionen.test.js`
Expected: FAIL (`K.resolveKondition is not a function`)

- [ ] **Step 3: Implementierung in `kalkulator.js`** (direkt nach dem `PROFILES`-Block, vor `BB_DEFAULTS`)
```js
/* ====================================================================
   FINANZIERUNGS-KONDITIONEN (editierbar im Admin, 2026-06-19)
   Zins+Tilgung je Kaufpreis-Band (klein <150k / gross >=150k) × KNK-Variante.
   Defaults = heutige Werte; beide Bänder identisch → bis Henry differenziert
   ändert sich am Rechenergebnis nichts.
   ACHTUNG: Default-Zahlen auch in api/konditionen.js (KONDITIONEN_DEFAULTS) —
   synchron halten.
   ==================================================================== */
const KONDITIONEN_DEFAULTS = Object.freeze({
  version: 1,
  schwelleKaufpreis: 150000,
  baender: {
    klein: { ohneKnk: { zins: 0.045, tilgung: 0.01 }, mitKnk: { zins: 0.048, tilgung: 0.01 } },
    gross: { ohneKnk: { zins: 0.045, tilgung: 0.01 }, mitKnk: { zins: 0.048, tilgung: 0.01 } },
  },
});

function _zelleMerge(partial, def) {
  const p = partial || {};
  const z = (typeof p.zins === 'number' && isFinite(p.zins)) ? p.zins : def.zins;
  const t = (typeof p.tilgung === 'number' && isFinite(p.tilgung)) ? p.tilgung : def.tilgung;
  return { zins: z, tilgung: t };
}

function mergeKonditionen(partial) {
  const p = partial || {};
  const pb = p.baender || {};
  const D = KONDITIONEN_DEFAULTS;
  const schwelle = (typeof p.schwelleKaufpreis === 'number' && isFinite(p.schwelleKaufpreis) && p.schwelleKaufpreis > 0)
    ? p.schwelleKaufpreis : D.schwelleKaufpreis;
  const band = (name) => {
    const b = pb[name] || {};
    return {
      ohneKnk: _zelleMerge(b.ohneKnk, D.baender[name].ohneKnk),
      mitKnk:  _zelleMerge(b.mitKnk,  D.baender[name].mitKnk),
    };
  };
  return { version: 1, schwelleKaufpreis: schwelle, baender: { klein: band('klein'), gross: band('gross') } };
}

function resolveKondition(kaufpreis, knkMitfinanziert, config) {
  const cfg = mergeKonditionen(config || (typeof window !== 'undefined' && window.Kalk && window.Kalk._konditionenActive) || null);
  const kp = (typeof kaufpreis === 'number' && isFinite(kaufpreis)) ? kaufpreis : 0;
  const band = kp >= cfg.schwelleKaufpreis ? cfg.baender.gross : cfg.baender.klein;
  const zelle = knkMitfinanziert ? band.mitKnk : band.ohneKnk;
  return { zins: zelle.zins, tilgung: zelle.tilgung };
}
```

- [ ] **Step 4: Export auf `window.Kalk` ergänzen**

Im bestehenden `window.Kalk = { ... }`-Export (Liste der Funktionen) ergänzen:
`KONDITIONEN_DEFAULTS, mergeKonditionen, resolveKondition,`

- [ ] **Step 5: Test grün**

Run: `node --test tests/konditionen.test.js`
Expected: PASS (alle 5)

- [ ] **Step 6: Commit**
```bash
git add public/kalkulator.js tests/konditionen.test.js
git commit -m "feat(konditionen): resolveKondition + Defaults in kalkulator.js"
```

---

### Task 3: Backend GET/PUT /api/konditionen (TDD für Validierung)

**Files:**
- Create: `api/konditionen.js`
- Test: `tests/konditionen.endpoint.test.js`

**Interfaces:**
- Consumes: `airtable`, `listAll` (`api/_lib/airtable.js`); `verifySession`, `requireAdminVerified` (`api/_lib/auth.js`); `readBody`, `methodNotAllowed`, `sendError` (`api/_lib/http.js`); `TABLES`, `APP_KONFIG_FIELDS`, `APP_KONFIG_KEY_KONDITIONEN` (`api/_lib/tables.js`).
- Produces: exportierte reine Funktion `validateKonditionen(obj) → { ok: true, value } | { ok: false, error }` (für Test); Default-Handler (GET/PUT).

- [ ] **Step 1: Failing test** — `tests/konditionen.endpoint.test.js`
```js
const { test } = require('node:test');
const assert = require('node:assert');
const { validateKonditionen } = require('../api/konditionen');

const VALID = {
  schwelleKaufpreis: 150000,
  baender: {
    klein: { ohneKnk: { zins: 0.05, tilgung: 0.01 }, mitKnk: { zins: 0.052, tilgung: 0.01 } },
    gross: { ohneKnk: { zins: 0.045, tilgung: 0.01 }, mitKnk: { zins: 0.048, tilgung: 0.01 } },
  },
};

test('valide Konditionen → ok', () => {
  assert.strictEqual(validateKonditionen(VALID).ok, true);
});

test('Zins > 20 % → Fehler', () => {
  const bad = JSON.parse(JSON.stringify(VALID));
  bad.baender.klein.ohneKnk.zins = 0.25;
  assert.strictEqual(validateKonditionen(bad).ok, false);
});

test('Schwelle <= 0 → Fehler', () => {
  const bad = JSON.parse(JSON.stringify(VALID));
  bad.schwelleKaufpreis = 0;
  assert.strictEqual(validateKonditionen(bad).ok, false);
});

test('fehlende Zelle → Fehler', () => {
  const bad = JSON.parse(JSON.stringify(VALID));
  delete bad.baender.gross.mitKnk;
  assert.strictEqual(validateKonditionen(bad).ok, false);
});

test('Tilgung > 10 % → Fehler', () => {
  const bad = JSON.parse(JSON.stringify(VALID));
  bad.baender.gross.ohneKnk.tilgung = 0.2;
  assert.strictEqual(validateKonditionen(bad).ok, false);
});
```

- [ ] **Step 2: Test ausführen, FAIL erwarten**

Run: `node --test tests/konditionen.endpoint.test.js`
Expected: FAIL (`Cannot find module '../api/konditionen'`)

- [ ] **Step 3: `api/konditionen.js` schreiben**
```js
// GET  /api/konditionen  — Finanzierungs-Konditionen (jeder eingeloggte User)
// PUT  /api/konditionen  — Konditionen setzen (nur Admin, validiert)
//
// Persistenz: Airtable App-Konfig, 1 Record (Key="konditionen"), JSON-Blob.
// ACHTUNG: KONDITIONEN_DEFAULTS synchron mit public/kalkulator.js halten.

const { airtable, listAll, escapeFormulaString } = require('./_lib/airtable');
const { verifySession, requireAdminVerified } = require('./_lib/auth');
const { readBody, methodNotAllowed, sendError } = require('./_lib/http');
const { TABLES, APP_KONFIG_FIELDS, APP_KONFIG_KEY_KONDITIONEN } = require('./_lib/tables');

const KONDITIONEN_DEFAULTS = {
  version: 1,
  schwelleKaufpreis: 150000,
  baender: {
    klein: { ohneKnk: { zins: 0.045, tilgung: 0.01 }, mitKnk: { zins: 0.048, tilgung: 0.01 } },
    gross: { ohneKnk: { zins: 0.045, tilgung: 0.01 }, mitKnk: { zins: 0.048, tilgung: 0.01 } },
  },
};

const BANDS = ['klein', 'gross'];
const VARIANTS = ['ohneKnk', 'mitKnk'];

function _zahl(v) { return typeof v === 'number' && isFinite(v); }

function validateKonditionen(obj) {
  if (!obj || typeof obj !== 'object') return { ok: false, error: 'Kein Objekt' };
  if (!_zahl(obj.schwelleKaufpreis) || obj.schwelleKaufpreis <= 0) return { ok: false, error: 'Schwelle muss > 0 sein' };
  if (!obj.baender || typeof obj.baender !== 'object') return { ok: false, error: 'baender fehlt' };
  for (const b of BANDS) {
    const band = obj.baender[b];
    if (!band || typeof band !== 'object') return { ok: false, error: `Band ${b} fehlt` };
    for (const v of VARIANTS) {
      const z = band[v];
      if (!z || typeof z !== 'object') return { ok: false, error: `${b}.${v} fehlt` };
      if (!_zahl(z.zins) || z.zins < 0 || z.zins > 0.20) return { ok: false, error: `${b}.${v}.zins ungültig (0–20 %)` };
      if (!_zahl(z.tilgung) || z.tilgung < 0 || z.tilgung > 0.10) return { ok: false, error: `${b}.${v}.tilgung ungültig (0–10 %)` };
    }
  }
  // Normalisiertes, sauberes Objekt zurück (keine Fremdfelder)
  const clean = { version: 1, schwelleKaufpreis: obj.schwelleKaufpreis, baender: {} };
  for (const b of BANDS) {
    clean.baender[b] = {};
    for (const v of VARIANTS) {
      clean.baender[b][v] = { zins: obj.baender[b][v].zins, tilgung: obj.baender[b][v].tilgung };
    }
  }
  return { ok: true, value: clean };
}

async function findRecord() {
  const formula = `{Key}='${escapeFormulaString(APP_KONFIG_KEY_KONDITIONEN)}'`;
  const recs = await listAll(TABLES.APP_KONFIG, { filterByFormula: formula, maxRecords: 1 }, 1);
  return recs[0] || null;
}

function parseStored(rec) {
  if (!rec || !rec.fields) return null;
  const raw = rec.fields[APP_KONFIG_FIELDS.JSON];
  if (!raw || typeof raw !== 'string') return null;
  try { return JSON.parse(raw); } catch { return null; }
}

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const session = verifySession(req);
    if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
    try {
      const rec = await findRecord();
      const stored = parseStored(rec);
      const val = (stored && validateKonditionen(stored).ok) ? validateKonditionen(stored).value : KONDITIONEN_DEFAULTS;
      const aktualisiert = (rec && rec.fields && rec.fields[APP_KONFIG_FIELDS.AKTUALISIERT]) || '';
      return res.status(200).json({ ...val, _aktualisiert: aktualisiert });
    } catch (e) {
      // Resilienz: nie blockieren — Defaults liefern
      return res.status(200).json({ ...KONDITIONEN_DEFAULTS, _aktualisiert: '', _fallback: true });
    }
  }

  if (req.method === 'PUT') {
    const session = await requireAdminVerified(req, res);
    if (!session) return; // requireAdminVerified hat schon geantwortet
    try {
      const body = await readBody(req);
      const v = validateKonditionen(body);
      if (!v.ok) return res.status(400).json({ error: v.error });
      const stamp = `${new Date().toISOString()} · ${session.email || ''}`;
      const fields = {
        [APP_KONFIG_FIELDS.KEY]: APP_KONFIG_KEY_KONDITIONEN,
        [APP_KONFIG_FIELDS.JSON]: JSON.stringify(v.value),
        [APP_KONFIG_FIELDS.AKTUALISIERT]: stamp,
      };
      const rec = await findRecord();
      if (rec) await airtable('update', TABLES.APP_KONFIG, { recordId: rec.id, fields });
      else await airtable('create', TABLES.APP_KONFIG, { fields });
      return res.status(200).json({ ...v.value, _aktualisiert: stamp });
    } catch (e) {
      return sendError(res, e);
    }
  }

  return methodNotAllowed(res, ['GET', 'PUT']);
};

module.exports.validateKonditionen = validateKonditionen;
module.exports.KONDITIONEN_DEFAULTS = KONDITIONEN_DEFAULTS;
```

- [ ] **Step 4: Test grün**

Run: `node --test tests/konditionen.endpoint.test.js`
Expected: PASS (alle 5)

- [ ] **Step 5: Commit**
```bash
git add api/konditionen.js tests/konditionen.endpoint.test.js
git commit -m "feat(konditionen): GET/PUT Endpoint mit Validierung + Admin-Gate"
```

---

### Task 4: Frontend Init-Load (Boot)

**Files:**
- Modify: `public/app.js` — `state` (Feld `konditionen`) + Boot-Handler (`window.addEventListener('load', …)` ~Zeile 9099)

**Interfaces:**
- Consumes: `GET /api/konditionen`, `window.Kalk.mergeKonditionen`
- Produces: `state.konditionen` (vollständige Config), `window.Kalk._konditionenActive` (Spiegel für resolveKondition-Default)

- [ ] **Step 1: state-Feld ergänzen** (im `const state = { … }`-Block, nahe `googleClientId: null,`)
```js
  konditionen: null,        // Finanzierungs-Konditionen (aus /api/konditionen, Fallback Defaults)
```

- [ ] **Step 2: Boot-Handler erweitern** (`window.addEventListener('load', …)`, nach `state.user = await api.get('/api/me');`)
```js
    state.user = await api.get('/api/me');
    await loadKonditionen();
    await loadInitialData();
```
Und neue Funktion (z.B. direkt vor dem Boot-Handler) hinzufügen:
```js
// Finanzierungs-Konditionen laden — Fallback auf Code-Defaults, blockiert nie.
async function loadKonditionen() {
  try {
    const cfg = await api.get('/api/konditionen');
    state.konditionen = window.Kalk.mergeKonditionen(cfg);
  } catch (e) {
    state.konditionen = window.Kalk.mergeKonditionen(null); // = Defaults
  }
  window.Kalk._konditionenActive = state.konditionen;
}
window.loadKonditionen = loadKonditionen;
```

- [ ] **Step 3: JSC-Syntax-Check** (Browser-JS ohne Node)

Run: Befehl aus `.claude/settings.local.json` (JavaScriptCore) gegen `public/app.js`.
Expected: keine Syntaxfehler.

- [ ] **Step 4: Commit**
```bash
git add public/app.js
git commit -m "feat(konditionen): beim Boot laden, Fallback auf Defaults"
```

---

### Task 5: Integration der 3 Zins-Setz-Stellen

**Files:**
- Modify: `public/app.js` — zentrale Helper-Funktion `syncKonditionen()`, KNK-Toggle (~3042), WE-Load (~3192) + `applyProfil` (~3060), WE-Liste-Loop (~8468) + Label (~8714)

**Interfaces:**
- Consumes: `window.Kalk.resolveKondition`, `state.konditionen`, `state.kalk.{kaufpreis,knkMitfinanziert}`
- Produces: `syncKonditionen()` setzt `state.kalk.zins` + `state.kalk.tilgung`

- [ ] **Step 1: Helper `syncKonditionen()` hinzufügen** (nahe `applyProfil`)
```js
// Setzt Zins+Tilgung zentral aus der Konditionen-Matrix (Kaufpreis-Band × KNK).
// Aufgerufen bei: WE laden, Profil anwenden, KNK-Toggle. Manueller Zins-Slider
// überschreibt danach bis zum nächsten dieser Trigger (wie bisher).
function syncKonditionen() {
  if (!window.Kalk || !window.Kalk.resolveKondition) return;
  const k = window.Kalk.resolveKondition(state.kalk.kaufpreis, state.kalk.knkMitfinanziert, state.konditionen);
  state.kalk.zins = k.zins;
  state.kalk.tilgung = k.tilgung;
}
window.syncKonditionen = syncKonditionen;
```

- [ ] **Step 2: KNK-Toggle ersetzen** (`public/app.js` ~3042)

Vorher:
```js
      if (k === 'knkMitfinanziert') {
        state.kalk.zins = (v === true) ? 0.048 : 0.045;
        renderTabKalkulator();
        return;
      }
```
Nachher:
```js
      if (k === 'knkMitfinanziert') {
        state.kalk.knkMitfinanziert = v;
        syncKonditionen(); // Zins+Tilgung band-aware aus der Matrix
        renderTabKalkulator();
        return;
      }
```

- [ ] **Step 3: WE-Load** — nach dem finalen `state.kalk.kaufpreis = resp.we.kp || 0;` (im stammdaten-Block, ~3192), am Ende des `if (resp && resp.we)`-Zweigs, `syncKonditionen();` aufrufen. Außerdem am Ende von `applyProfil(name)` vor `renderTabKalkulator();` ein `syncKonditionen();` ergänzen.

- [ ] **Step 4: WE-Liste-Loop** (`public/app.js` ~8468) — direkt nach dem `const inputs = Object.assign({}, base, profile, { … });`-Block:
```js
      // Zins+Tilgung kommen aus der Konditionen-Matrix (nicht mehr aus dem Profil),
      // band-genau nach Kaufpreis dieser WE.
      if (window.Kalk && window.Kalk.resolveKondition) {
        const kc = window.Kalk.resolveKondition(inputs.kaufpreis, profile.knkMitfinanziert, state.konditionen);
        inputs.zins = kc.zins;
        inputs.tilgung = kc.tilgung;
      }
```

- [ ] **Step 5: WE-Liste-Label** (`public/app.js` ~8712) — `profilLabel` so anpassen, dass der Zins aus der Matrix (repräsentativ für `≥150k`-Band) statt `profilObj.zins` gezeigt wird, oder Zins-Teil durch „Zins lt. Konditionen" ersetzen. Minimal-Variante:
```js
  const _kondZins = (window.Kalk && window.Kalk.resolveKondition)
    ? window.Kalk.resolveKondition(200000, (profilObj && profilObj.knkMitfinanziert), state.konditionen).zins
    : (profilObj ? profilObj.zins : 0);
```
und im Label `((profilObj.zins||0)*100)` durch `(_kondZins*100)` ersetzen.

- [ ] **Step 6: JSC-Syntax-Check** gegen `public/app.js` — keine Fehler.

- [ ] **Step 7: kalk-integritaet-Skill durchziehen** — Snapshot-Tests bewusst prüfen (`node --test tests/kalk.snapshot.test.js`): Defaults identisch → Snapshots müssen unverändert grün sein. Falls rot → Ursache klären, nicht blind Snapshot überschreiben.

Run: `npm test`
Expected: alle grün (inkl. bestehende Snapshots).

- [ ] **Step 8: Commit**
```bash
git add public/app.js
git commit -m "feat(konditionen): Zins/Tilgung aus Matrix in Kalkulator + WE-Liste"
```

---

### Task 6: Admin-UI-Karte

**Files:**
- Modify: `public/app.js` — `renderAdmin()` (Karte einfügen ~vor `renderAdminStammdatenAudit`, ~8042) + Save-Handler

**Interfaces:**
- Consumes: `state.konditionen`, `state.user.rolle`, `api.put('/api/konditionen', …)`, `esc`, `fmtPct`/manuell
- Produces: `window.saveKonditionen()` (liest Inputs, PUT, aktualisiert state)

- [ ] **Step 1: Karte rendern** — HTML-Block in `renderAdmin()` einfügen (vor dem Stammdaten-Audit):
```js
      ${(() => {
        const c = state.konditionen || (window.Kalk && window.Kalk.mergeKonditionen(null)) || {};
        const b = c.baender || {};
        const pct = (x) => (typeof x === 'number' ? (x * 100).toString().replace('.', ',') : '');
        const cell = (band, variant) => {
          const z = (b[band] && b[band][variant]) || {};
          return `
            <td><input type="number" step="0.01" min="0" max="20" id="kond-${band}-${variant}-zins" value="${pct(z.zins)}" style="width:80px"> %</td>
            <td><input type="number" step="0.01" min="0" max="10" id="kond-${band}-${variant}-tilg" value="${pct(z.tilgung)}" style="width:80px"> %</td>`;
        };
        return `
        <div class="card">
          <div class="card-title">Finanzierungs-Konditionen
            <span class="text-tertiary text-small" style="font-weight:normal;">— Zins &amp; Tilgung je Preisklasse, von Henry pflegbar</span>
          </div>
          <p class="text-tertiary text-small">Schwelle bestimmt, ab welchem Kaufpreis das „groß"-Band gilt (≥ Schwelle).</p>
          <div style="margin:8px 0 16px;">
            <label>Schwelle Kaufpreis:
              <input type="number" step="1000" min="1" id="kond-schwelle" value="${(c.schwelleKaufpreis||150000)}" style="width:120px"> €
            </label>
          </div>
          <table class="table">
            <thead><tr><th></th><th>Zins ohne KNK</th><th>Tilgung ohne KNK</th><th>Zins mit KNK</th><th>Tilgung mit KNK</th></tr></thead>
            <tbody>
              <tr><td><strong>&lt; Schwelle (klein)</strong></td>${cell('klein','ohneKnk')}${cell('klein','mitKnk')}</tr>
              <tr><td><strong>&ge; Schwelle (groß)</strong></td>${cell('gross','ohneKnk')}${cell('gross','mitKnk')}</tr>
            </tbody>
          </table>
          <div style="margin-top:12px;display:flex;gap:12px;align-items:center;">
            <button class="primary" onclick="saveKonditionen()">Konditionen speichern</button>
            <span class="text-tertiary text-small">${c._aktualisiert ? 'Zuletzt: ' + esc(c._aktualisiert) : ''}</span>
          </div>
          <p id="kond-msg" class="text-small" style="margin-top:8px;"></p>
        </div>`;
      })()}
```

- [ ] **Step 2: Save-Handler** (im `views/admin`-Modul, nahe `reloadAdminWohneinheiten`)
```js
async function saveKonditionen() {
  const msg = document.getElementById('kond-msg');
  const numPct = (id) => { const el = document.getElementById(id); const v = parseFloat(String(el && el.value).replace(',', '.')); return isFinite(v) ? v / 100 : NaN; };
  const cellOf = (band, variant) => ({ zins: numPct(`kond-${band}-${variant}-zins`), tilgung: numPct(`kond-${band}-${variant}-tilg`) });
  const schwelleEl = document.getElementById('kond-schwelle');
  const payload = {
    schwelleKaufpreis: parseFloat(schwelleEl && schwelleEl.value),
    baender: {
      klein: { ohneKnk: cellOf('klein','ohneKnk'), mitKnk: cellOf('klein','mitKnk') },
      gross: { ohneKnk: cellOf('gross','ohneKnk'), mitKnk: cellOf('gross','mitKnk') },
    },
  };
  try {
    if (msg) { msg.textContent = 'Speichere…'; msg.style.color = ''; }
    const saved = await api.put('/api/konditionen', payload);
    state.konditionen = window.Kalk.mergeKonditionen(saved);
    window.Kalk._konditionenActive = state.konditionen;
    if (msg) { msg.textContent = '✓ Gespeichert.'; msg.style.color = 'green'; }
  } catch (e) {
    if (msg) { msg.textContent = 'Fehler: ' + (e && e.message || 'unbekannt'); msg.style.color = 'crimson'; }
  }
}
window.saveKonditionen = saveKonditionen;
```

- [ ] **Step 3: JSC-Syntax-Check** gegen `public/app.js` — keine Fehler.

- [ ] **Step 4: Commit**
```bash
git add public/app.js
git commit -m "feat(konditionen): Admin-Karte zum Pflegen der Matrix"
```

---

### Task 7: Doku + Vor-Deploy-Check

**Files:**
- Modify: `docs/SPEC.md` (neue Tabelle + Route), ggf. `README.md`

- [ ] **Step 1: SPEC.md ergänzen** — Tabelle `APP_KONFIG` mit Field-IDs + Route `GET/PUT /api/konditionen` (Auth: GET eingeloggt, PUT Admin) dokumentieren.

- [ ] **Step 2: Volltest**

Run: `npm test`
Expected: alle grün.

- [ ] **Step 3: vor-deploy-check-Skill** — JSC-Syntax + `npm test` + Klick-Liste aus dem Diff (Admin-Karte speichern, WE laden → Zins prüft Band, KNK-Toggle, WE-Liste-Zins je Preisklasse).

- [ ] **Step 4: Commit**
```bash
git add docs/SPEC.md README.md
git commit -m "docs(konditionen): SPEC + README aktualisiert"
```

---

## Self-Review (vom Planautor ausgefüllt)

- **Spec-Coverage:** Matrix+Schwelle (T2/T6) ✓ · Persistenz Airtable (T1/T3) ✓ · GET/PUT+Auth+Validierung (T3) ✓ · Init-Load+Fallback (T4) ✓ · 3 Integrationspunkte (T5) ✓ · Admin-UI (T6) ✓ · Tests resolveKondition+Validierung (T2/T3) ✓ · Doku (T7) ✓.
- **Platzhalter:** Airtable-IDs in T1 sind `tblXXX`/`fldXXX` — werden in Step 1 aus der MCP-Antwort gefüllt (echter Schritt, kein TBD).
- **Typ-Konsistenz:** `resolveKondition(kaufpreis, knk, config)`, `mergeKonditionen(partial)`, `validateKonditionen(obj)→{ok,...}`, `syncKonditionen()`, `loadKonditionen()`, `saveKonditionen()` — überall identisch verwendet. Config-Form `{version,schwelleKaufpreis,baender:{klein,gross}:{ohneKnk,mitKnk}:{zins,tilgung}}` durchgängig.
