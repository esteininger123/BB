# Finanzierungs-Handover — Baustein A (Übergabe-Button + Fall) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein Vertriebler übergibt einen reservierten Kunden per Button + Mini-Formular an die Finanzierung; die App legt einen vorbefüllten `Endkunden-Finanzierungsfall` in Airtable an (Kennzahlen aus gewähltem Snapshot + Formular + Status „Unterlagen noch anfordern").

**Architecture:** Neue Vercel-Function `api/finanzierung/uebergeben.js` (gleiches Muster wie `api/snapshots.js`): liest den gewählten Snapshot-Record, baut über einen neuen Mapper die Airtable-Fields, legt den Fall an. Frontend: ein Modal analog `openNeuerKundeModal` (Snapshot-Dropdown + Formular) + Button im Kunden-Detail. **Kein Google Drive in diesem Baustein** — der Drive-Ordner (Baustein D) kommt separat; das Fall-Feld `Kunden-Drive` bleibt vorerst leer.

**Tech Stack:** Vanilla JS (kein Build), Vercel Serverless (Node 20), Airtable REST über `api/_lib/airtable.js`, Tests mit `node:test`.

**Referenz-Spec:** `docs/superpowers/specs/2026-06-15-finanzierung-handover-design.md`

---

## Airtable-Kontext (feststehende IDs)

- Base: `appikHUetNyeonXBX`
- Tabelle `Endkunden-Finanzierungsfall`: `tblM4e4tDae2o9mQz`
  - Titel (Primary): `fldBCoC1l9IukRTj8`
  - Kunden/Interessenten (Link): `fldE6949ttL6XNSqX`
  - Wohneinheiten (Link): `fldBAGky2mCKEJBmb`
  - 100 % (checkbox): `fldwBkuOlUEhqmi1I`
  - 107 % (checkbox): `fldJKQwW8w5S7lNzk`
  - Notizen: `fldeHRmH9D5L2yYnD`
  - Status Kundenfinanzierung (singleSelect): `fldgEgmxmVEMhFOdz` — Start-Choice: `Unterlagen noch anfordern`
- Tabelle `Kalk-Snapshots`: `tbliqxbITCdSjK0ua`
  - Klartext-Felder (bereits befüllt beim Snapshot-Speichern): KAUFPREIS `fldUCIaouk06a9g05`, WOHNFLAECHE `fldy7gMlU6dGu5zZB`, KALTMIETE `fldjNSivJDQIdBjiy`, ZINS `fld9uABNRIAIEcC0J`, TILGUNG `fldlBjQ7DPDg3NZx3`, EK_BEDARF `fldtFOGrxFPt648CW`, KNK_MITFINANZIERT `fldKvm1fzMdljWPOh`, WE_BEZ `fldCSEFLQgBmSo9ib`, WE_RECID `fldgmCTYq3iFluCQf`

**Neu anzulegende Felder** (Task 1 erzeugt sie und trägt die echten `fld…`-IDs ein) — alle in `tblM4e4tDae2o9mQz`:
Snapshot (Link→`tbliqxbITCdSjK0ua`), Stand vom (date), Kaufpreis (currency), EK-Bedarf gerechnet (currency), Zins % (number), Tilgung % (number), Wohnfläche (number), Kaltmiete (currency), Finanzierungsform andere (singleLineText), Max. Eigenkapital (currency), Hausbank vorhanden (checkbox), Hausbank — Name (singleLineText), Hausbank — Berater (singleLineText), Eigener Finanzberater (checkbox), Finanzberater — Kontakt (singleLineText), Was ist dem Kunden wichtig (multilineText), Notartermin-Ziel (date), SA-Status (singleSelect: `fehlt`/`liegt vor`).

---

## File Structure

- `api/_lib/tables.js` — **modify**: `TABLES.FINANZIERUNGSFALL` + `FINANZIERUNGSFALL_FIELDS` (neue + bestehende Field-IDs)
- `api/_lib/mappers.js` — **modify**: `finanzierungsfallBodyToFields(body, opts)` + Export
- `api/finanzierung/uebergeben.js` — **create**: POST-Handler
- `tests/finanzierungsfall.mapper.test.js` — **create**: Mapper-Unit-Test
- `public/app.js` — **modify**: `openFinanzierungUebergabeModal()` + `uebergebeAnFinanzierung()` + Button in `renderTabUebersicht`
- `public/styles.css` — **modify**: kleiner Stil-Block fürs Übergabe-Modal (nutzt `reserv-modal`-Basis)

---

### Task 1: Airtable-Felder anlegen + `tables.js` erweitern

**Files:**
- Modify: `api/_lib/tables.js`

> Lokaler Skill `airtable-feld-binden` ist hier die Referenz für sauberes Feld-Binden.

- [ ] **Step 1: Neue Felder in `tblM4e4tDae2o9mQz` anlegen**

Lege via Airtable MCP `create_field` (oder manuell in Airtable) genau diese Felder in Tabelle `tblM4e4tDae2o9mQz` an. Notiere jede zurückgegebene `fld…`-ID:

| Feldname | Typ |
|---|---|
| Snapshot | Link → `tbliqxbITCdSjK0ua` |
| Stand vom | date |
| Kaufpreis | currency (EUR) |
| EK-Bedarf gerechnet | currency (EUR) |
| Zins % | number (2 Nachkomma) |
| Tilgung % | number (2 Nachkomma) |
| Wohnfläche | number (2 Nachkomma) |
| Kaltmiete | currency (EUR) |
| Finanzierungsform andere | singleLineText |
| Max. Eigenkapital | currency (EUR) |
| Hausbank vorhanden | checkbox |
| Hausbank — Name | singleLineText |
| Hausbank — Berater | singleLineText |
| Eigener Finanzberater | checkbox |
| Finanzberater — Kontakt | singleLineText |
| Was ist dem Kunden wichtig | multilineText |
| Notartermin-Ziel | date |
| SA-Status | singleSelect, Choices: `fehlt`, `liegt vor` |

- [ ] **Step 2: `tables.js` erweitern**

In `api/_lib/tables.js` im `TABLES`-Objekt ergänzen:

```js
  // Endkunden-Finanzierungsfall (Finanzierungs-Handover, 2026-06-15)
  FINANZIERUNGSFALL: 'tblM4e4tDae2o9mQz',
```

Danach nach dem `SNAPSHOT_FIELDS`-Block einen neuen Block einfügen (echte `fld…`-IDs aus Step 1 eintragen, hier mit Platzhalter-Kommentar markiert):

```js
// --- Endkunden-Finanzierungsfall (2026-06-15, Finanzierungs-Handover Baustein A) ---
const FINANZIERUNGSFALL_FIELDS = {
  TITEL:                 'fldBCoC1l9IukRTj8', // Primary singleLineText
  KUNDE:                 'fldE6949ttL6XNSqX', // Link → Kunden/Interessenten
  WOHNEINHEIT:           'fldBAGky2mCKEJBmb', // Link → Wohneinheit
  STATUS:                'fldgEgmxmVEMhFOdz', // singleSelect
  P100:                  'fldwBkuOlUEhqmi1I', // checkbox 100%
  P107:                  'fldJKQwW8w5S7lNzk', // checkbox 107%
  // NEU in Step 1 angelegt — echte IDs eintragen:
  SNAPSHOT:              'fld__SNAPSHOT__',
  STAND_VOM:             'fld__STAND_VOM__',
  KAUFPREIS:             'fld__KAUFPREIS__',
  EK_BEDARF:             'fld__EK_BEDARF__',
  ZINS:                  'fld__ZINS__',
  TILGUNG:               'fld__TILGUNG__',
  WOHNFLAECHE:           'fld__WOHNFLAECHE__',
  KALTMIETE:             'fld__KALTMIETE__',
  FINANZIERUNGSFORM_ANDERE: 'fld__FINFORM_ANDERE__',
  MAX_EK:                'fld__MAX_EK__',
  HAUSBANK_VORHANDEN:    'fld__HB_VORH__',
  HAUSBANK_NAME:         'fld__HB_NAME__',
  HAUSBANK_BERATER:      'fld__HB_BERATER__',
  FINANZBERATER_VORHANDEN: 'fld__FB_VORH__',
  FINANZBERATER_KONTAKT: 'fld__FB_KONTAKT__',
  WAS_WICHTIG:           'fld__WAS_WICHTIG__',
  NOTARTERMIN_ZIEL:      'fld__NOTAR_ZIEL__',
  SA_STATUS:             'fld__SA_STATUS__',
};

const FINANZIERUNGSFALL_STATUS_START = 'Unterlagen noch anfordern';
```

Im `module.exports` ergänzen: `FINANZIERUNGSFALL_FIELDS,` und `FINANZIERUNGSFALL_STATUS_START,`.

- [ ] **Step 3: Schema-Guard laufen lassen**

Run: `npm run guard`
Expected: kein Fehler über fehlende Field-IDs (alle `fld__…__` müssen durch echte IDs ersetzt sein — Guard schlägt sonst an).

- [ ] **Step 4: Commit**

```bash
git add api/_lib/tables.js
git commit -m "feat(finanzierung): Finanzierungsfall-Tabelle + Felder in tables.js binden"
```

---

### Task 2: Mapper `finanzierungsfallBodyToFields` + Test (TDD)

**Files:**
- Create: `tests/finanzierungsfall.mapper.test.js`
- Modify: `api/_lib/mappers.js`

- [ ] **Step 1: Failing test schreiben**

Erstelle `tests/finanzierungsfall.mapper.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { finanzierungsfallBodyToFields } = require('../api/_lib/mappers');
const { FINANZIERUNGSFALL_FIELDS: F, FINANZIERUNGSFALL_STATUS_START } = require('../api/_lib/tables');

const baseBody = {
  kundeId: 'recKUNDE000000001',
  weId: 'recWE0000000000001',
  snapshotId: 'recSNAP00000000001',
  kundeName: 'Mustermann, Max',
  weBezeichnung: 'WE 12, Rheinstraße 292',
  snapshot: { kaufpreis: 200000, wohnflaeche: 60, kaltmiete: 600, zins: 3.5, tilgung: 2, ekBedarf: 25000, knkMitfinanziert: false },
  standVom: '2026-06-15',
  finanzierungsform: '107',
  finanzierungsformAndere: '',
  maxEigenkapital: 30000,
  hausbankVorhanden: true,
  hausbankName: 'Sparkasse Offenburg',
  hausbankBerater: 'Frau Klein',
  finanzberaterVorhanden: false,
  finanzberaterKontakt: '',
  wasWichtig: 'Niedrige monatliche Rate',
  notarterminZiel: '2026-07-30',
};

test('mapper: Links werden als Arrays gesetzt', () => {
  const f = finanzierungsfallBodyToFields(baseBody);
  assert.deepStrictEqual(f[F.KUNDE], ['recKUNDE000000001']);
  assert.deepStrictEqual(f[F.WOHNEINHEIT], ['recWE0000000000001']);
  assert.deepStrictEqual(f[F.SNAPSHOT], ['recSNAP00000000001']);
});

test('mapper: Kennzahlen aus snapshot übernommen', () => {
  const f = finanzierungsfallBodyToFields(baseBody);
  assert.strictEqual(f[F.KAUFPREIS], 200000);
  assert.strictEqual(f[F.EK_BEDARF], 25000);
  assert.strictEqual(f[F.ZINS], 3.5);
  assert.strictEqual(f[F.TILGUNG], 2);
  assert.strictEqual(f[F.WOHNFLAECHE], 60);
  assert.strictEqual(f[F.KALTMIETE], 600);
});

test('mapper: Finanzierungsform 107 setzt P107, nicht P100', () => {
  const f = finanzierungsfallBodyToFields(baseBody);
  assert.strictEqual(f[F.P107], true);
  assert.strictEqual(f[F.P100], false);
});

test('mapper: Finanzierungsform andere setzt Textfeld + keine Checkbox', () => {
  const f = finanzierungsfallBodyToFields({ ...baseBody, finanzierungsform: 'andere', finanzierungsformAndere: 'KfW-Kombi' });
  assert.strictEqual(f[F.P100], false);
  assert.strictEqual(f[F.P107], false);
  assert.strictEqual(f[F.FINANZIERUNGSFORM_ANDERE], 'KfW-Kombi');
});

test('mapper: Formularfelder + Status + Titel', () => {
  const f = finanzierungsfallBodyToFields(baseBody);
  assert.strictEqual(f[F.MAX_EK], 30000);
  assert.strictEqual(f[F.HAUSBANK_VORHANDEN], true);
  assert.strictEqual(f[F.HAUSBANK_NAME], 'Sparkasse Offenburg');
  assert.strictEqual(f[F.HAUSBANK_BERATER], 'Frau Klein');
  assert.strictEqual(f[F.FINANZBERATER_VORHANDEN], false);
  assert.strictEqual(f[F.WAS_WICHTIG], 'Niedrige monatliche Rate');
  assert.strictEqual(f[F.NOTARTERMIN_ZIEL], '2026-07-30');
  assert.strictEqual(f[F.STATUS], FINANZIERUNGSFALL_STATUS_START);
  assert.strictEqual(f[F.SA_STATUS], 'fehlt');
  assert.match(f[F.TITEL], /Mustermann, Max/);
  assert.match(f[F.TITEL], /WE 12/);
});
```

- [ ] **Step 2: Test laufen, Fehlschlag prüfen**

Run: `node --test tests/finanzierungsfall.mapper.test.js`
Expected: FAIL — `finanzierungsfallBodyToFields is not a function`.

- [ ] **Step 3: Mapper implementieren**

In `api/_lib/mappers.js` den Import oben erweitern:

```js
const { KUNDEN_FIELDS, SNAPSHOT_FIELDS, VERTRIEBLER_FIELDS, WE_FIELDS, FINANZIERUNGSFALL_FIELDS, FINANZIERUNGSFALL_STATUS_START } = require('./tables');
```

Vor `// --- Wohneinheiten ---` einfügen:

```js
// --- Endkunden-Finanzierungsfall (2026-06-15) ---
// body: { kundeId, weId, snapshotId, kundeName, weBezeichnung, standVom,
//   snapshot:{kaufpreis,wohnflaeche,kaltmiete,zins,tilgung,ekBedarf,knkMitfinanziert},
//   finanzierungsform:'100'|'107'|'andere', finanzierungsformAndere,
//   maxEigenkapital, hausbankVorhanden, hausbankName, hausbankBerater,
//   finanzberaterVorhanden, finanzberaterKontakt, wasWichtig, notarterminZiel }
function finanzierungsfallBodyToFields(body) {
  const F = FINANZIERUNGSFALL_FIELDS;
  const out = {};
  const num = (v) => (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);
  const setIf = (field, val) => { if (val != null) out[field] = val; };

  if (body.kundeId)    out[F.KUNDE]       = [body.kundeId];
  if (body.weId)       out[F.WOHNEINHEIT] = [body.weId];
  if (body.snapshotId) out[F.SNAPSHOT]    = [body.snapshotId];

  // Titel = "Kundenname — WE-Bezeichnung"
  const titel = [body.kundeName, body.weBezeichnung].map(s => (s || '').trim()).filter(Boolean).join(' — ');
  if (titel) out[F.TITEL] = titel;

  if (body.standVom) out[F.STAND_VOM] = body.standVom;

  const s = (body.snapshot && typeof body.snapshot === 'object') ? body.snapshot : {};
  setIf(F.KAUFPREIS,   num(s.kaufpreis));
  setIf(F.EK_BEDARF,   num(s.ekBedarf));
  setIf(F.ZINS,        num(s.zins));
  setIf(F.TILGUNG,     num(s.tilgung));
  setIf(F.WOHNFLAECHE, num(s.wohnflaeche));
  setIf(F.KALTMIETE,   num(s.kaltmiete));

  // Finanzierungsform → Checkboxen 100/107 + Freitext "andere"
  const form = String(body.finanzierungsform || '');
  out[F.P100] = form === '100';
  out[F.P107] = form === '107';
  out[F.FINANZIERUNGSFORM_ANDERE] = (form === 'andere') ? (body.finanzierungsformAndere || '') : '';

  setIf(F.MAX_EK, num(body.maxEigenkapital));
  out[F.HAUSBANK_VORHANDEN]      = !!body.hausbankVorhanden;
  out[F.HAUSBANK_NAME]           = body.hausbankName || '';
  out[F.HAUSBANK_BERATER]        = body.hausbankBerater || '';
  out[F.FINANZBERATER_VORHANDEN] = !!body.finanzberaterVorhanden;
  out[F.FINANZBERATER_KONTAKT]   = body.finanzberaterKontakt || '';
  out[F.WAS_WICHTIG]             = body.wasWichtig || '';
  if (body.notarterminZiel) out[F.NOTARTERMIN_ZIEL] = body.notarterminZiel;

  out[F.STATUS]    = FINANZIERUNGSFALL_STATUS_START;
  out[F.SA_STATUS] = 'fehlt';

  return out;
}
```

Im `module.exports` von `mappers.js` ergänzen: `finanzierungsfallBodyToFields,`.

- [ ] **Step 4: Test laufen, Erfolg prüfen**

Run: `node --test tests/finanzierungsfall.mapper.test.js`
Expected: PASS (5 Tests grün).

- [ ] **Step 5: Volle Test-Suite**

Run: `npm test`
Expected: alle bestehenden Tests weiterhin grün.

- [ ] **Step 6: Commit**

```bash
git add api/_lib/mappers.js tests/finanzierungsfall.mapper.test.js
git commit -m "feat(finanzierung): finanzierungsfallBodyToFields Mapper + Tests"
```

---

### Task 3: API-Route `POST /api/finanzierung/uebergeben`

**Files:**
- Create: `api/finanzierung/uebergeben.js`

- [ ] **Step 1: Route implementieren**

Erstelle `api/finanzierung/uebergeben.js`:

```js
// POST /api/finanzierung/uebergeben — legt aus einem gewählten Snapshot einen
// Endkunden-Finanzierungsfall an (Baustein A). Body:
//   { kundeId, snapshotId,
//     hausbankVorhanden, hausbankName, hausbankBerater,
//     finanzberaterVorhanden, finanzberaterKontakt,
//     finanzierungsform, finanzierungsformAndere, maxEigenkapital,
//     wasWichtig, notarterminZiel }

const { verifySession, requireSafeOrigin } = require('../_lib/auth');
const { airtable } = require('../_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const { TABLES, SNAPSHOT_FIELDS, KUNDEN_FIELDS } = require('../_lib/tables');
const { finanzierungsfallBodyToFields } = require('../_lib/mappers');

// Owner-Check (gleiche Logik wie snapshots.js): Admin darf alles, sonst muss
// der eingeloggte Vertriebler Owner des Kunden sein.
async function canAccessKunde(session, kundeId) {
  if (!kundeId) return false;
  if (session.rolle === 'Admin') return true;
  try {
    const rec = await airtable('get', TABLES.KUNDEN, { recordId: kundeId });
    const ownersRaw = (rec.fields && rec.fields[KUNDEN_FIELDS.OWNER]) || [];
    if (!Array.isArray(ownersRaw)) return false;
    const ownerIds = ownersRaw
      .map(o => (o && typeof o === 'object') ? o.id : (typeof o === 'string' && o.startsWith('rec') ? o : null))
      .filter(Boolean);
    return ownerIds.includes(session.vertrieblerId);
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  if (!requireSafeOrigin(req, res)) return;
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  try {
    if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

    const body = await readBody(req);
    if (!body.kundeId)    return res.status(400).json({ error: 'kundeId fehlt' });
    if (!body.snapshotId) return res.status(400).json({ error: 'snapshotId fehlt' });

    const allowed = await canAccessKunde(session, body.kundeId);
    if (!allowed) return res.status(403).json({ error: 'Kein Zugriff auf diesen Kunden' });

    // Snapshot-Record laden → Kennzahlen (Klartext-Felder) + WE-Bezug + Kunde-Match
    let snapRec;
    try {
      snapRec = await airtable('get', TABLES.SNAPSHOTS, { recordId: body.snapshotId });
    } catch {
      return res.status(404).json({ error: 'Snapshot nicht gefunden' });
    }
    const sf = snapRec.fields || {};
    const snapKundeLink = sf[SNAPSHOT_FIELDS.KUNDE] || [];
    const snapKundeId = Array.isArray(snapKundeLink) && snapKundeLink.length
      ? (typeof snapKundeLink[0] === 'object' ? snapKundeLink[0].id : snapKundeLink[0]) : null;
    if (snapKundeId && snapKundeId !== body.kundeId) {
      return res.status(400).json({ error: 'Snapshot gehört nicht zu diesem Kunden' });
    }

    // Kundenname für den Fall-Titel
    let kundeName = '';
    try {
      const kRec = await airtable('get', TABLES.KUNDEN, { recordId: body.kundeId });
      kundeName = (kRec.fields && kRec.fields[KUNDEN_FIELDS.NAME]) || '';
    } catch { /* Titel notfalls nur aus WE */ }

    const weRecId = sf[SNAPSHOT_FIELDS.WE_RECID] || '';
    const fields = finanzierungsfallBodyToFields({
      kundeId: body.kundeId,
      weId: weRecId || undefined,
      snapshotId: body.snapshotId,
      kundeName,
      weBezeichnung: sf[SNAPSHOT_FIELDS.WE_BEZ] || '',
      standVom: (sf[SNAPSHOT_FIELDS.CREATED] || snapRec.createdTime || '').slice(0, 10) || undefined,
      snapshot: {
        kaufpreis:        sf[SNAPSHOT_FIELDS.KAUFPREIS],
        wohnflaeche:      sf[SNAPSHOT_FIELDS.WOHNFLAECHE],
        kaltmiete:        sf[SNAPSHOT_FIELDS.KALTMIETE],
        zins:             sf[SNAPSHOT_FIELDS.ZINS],
        tilgung:          sf[SNAPSHOT_FIELDS.TILGUNG],
        ekBedarf:         sf[SNAPSHOT_FIELDS.EK_BEDARF],
        knkMitfinanziert: !!sf[SNAPSHOT_FIELDS.KNK_MITFINANZIERT],
      },
      hausbankVorhanden:      !!body.hausbankVorhanden,
      hausbankName:           body.hausbankName || '',
      hausbankBerater:        body.hausbankBerater || '',
      finanzberaterVorhanden: !!body.finanzberaterVorhanden,
      finanzberaterKontakt:   body.finanzberaterKontakt || '',
      finanzierungsform:      body.finanzierungsform || '',
      finanzierungsformAndere: body.finanzierungsformAndere || '',
      maxEigenkapital:        body.maxEigenkapital,
      wasWichtig:             body.wasWichtig || '',
      notarterminZiel:        body.notarterminZiel || '',
    });

    const created = await airtable('create', TABLES.FINANZIERUNGSFALL, { fields });

    // Kunden-Phase auf "Bank-Einreichung" + Letzte-Aktivität touchen (nicht kritisch)
    try {
      await airtable('update', TABLES.KUNDEN, {
        recordId: body.kundeId,
        fields: {
          [KUNDEN_FIELDS.PHASE]: 'Bank-Einreichung',
          [KUNDEN_FIELDS.LAST_ACTIVITY]: new Date().toISOString(),
        }
      });
    } catch { /* nicht kritisch */ }

    return res.status(201).json({ ok: true, id: created.id });
  } catch (e) {
    return sendError(res, e);
  }
};
```

> **Hinweis:** `TABLES.FINANZIERUNGSFALL` muss aus Task 1 vorhanden sein. Phase-Wert `'Bank-Einreichung'` ist eine bestehende Choice im Kunden-`Phase`-Feld (siehe SPEC.md).

- [ ] **Step 2: Syntax-Check (JSC, ohne Browser)**

Run: `npm run guard` (prüft u.a. Field-ID-Konsistenz) — Expected: grün.
Run (lokal, falls `vercel dev` läuft): `curl -s -X POST http://localhost:3000/api/finanzierung/uebergeben -H 'content-type: application/json' -d '{}'`
Expected: `{"error":"Nicht eingeloggt"}` oder `{"error":"kundeId fehlt"}` (kein 500 / Crash).

- [ ] **Step 3: Commit**

```bash
git add api/finanzierung/uebergeben.js
git commit -m "feat(finanzierung): POST /api/finanzierung/uebergeben legt Fall aus Snapshot an"
```

---

### Task 4: Frontend — Übergabe-Modal

**Files:**
- Modify: `public/app.js` (neue Funktion `openFinanzierungUebergabeModal`)
- Modify: `public/styles.css` (Stil-Block)

- [ ] **Step 1: Modal-Funktion einfügen**

In `public/app.js` direkt nach `_neuerKundeEnsureStyles` (Ende des Neuer-Kunde-Modal-Blocks, ~Zeile 1065 ff., vor `// ===== MODUL: views/kunde =====`) einfügen. Das Modal nutzt dieselbe `reserv-modal-overlay`/`reserv-modal`-Basis wie `openNeuerKundeModal`.

```js
// Übergabe-an-Finanzierung-Modal (2026-06-15, Baustein A).
// Args: snapshots = Array {id, bezeichnung, weBezeichnung, created, kalkJson}.
// Gibt das Formular-Objekt zurück (inkl. gewählter snapshotId) oder null bei Abbruch.
function openFinanzierungUebergabeModal(snapshots) {
  _reservEnsureStyles();
  _finUebergabeEnsureStyles();
  const snaps = Array.isArray(snapshots) ? snapshots.slice() : [];
  return new Promise((resolve) => {
    const m = document.createElement('div');
    m.className = 'reserv-modal-overlay';
    const snapOptions = snaps.map((s, i) => {
      const label = [s.weBezeichnung || s.bezeichnung || 'Kalkulation',
        (s.created || '').slice(0, 10)].filter(Boolean).join(' · ');
      return `<option value="${esc(s.id)}"${i === 0 ? ' selected' : ''}>${esc(label)}</option>`;
    }).join('');
    m.innerHTML =
      '<div class="reserv-modal fin-modal">' +
        '<h2>An Finanzierung übergeben</h2>' +
        '<div class="reserv-modal-body">' +
          (snaps.length
            ? '<label class="fin-field fin-full"><span class="fin-label">Maßgebliche Kalkulation <span class="nk-req">*</span></span>' +
                '<select id="fin-snapshot">' + snapOptions + '</select></label>'
            : '<div class="nk-error">Kein Snapshot vorhanden — bitte zuerst eine Kalkulation speichern.</div>') +
          '<label class="fin-field"><span class="fin-label">Finanzierungsform</span>' +
            '<select id="fin-form"><option value="107">107 % (inkl. Nebenkosten)</option>' +
            '<option value="100">100 %</option><option value="andere">andere</option></select></label>' +
          '<label class="fin-field"><span class="fin-label">— falls andere</span>' +
            '<input type="text" id="fin-form-andere" placeholder="z.B. KfW-Kombi" /></label>' +
          '<label class="fin-field"><span class="fin-label">Max. Eigenkapital (€)</span>' +
            '<input type="number" id="fin-maxek" min="0" step="1000" placeholder="optional" /></label>' +
          '<label class="fin-field"><span class="fin-label">Notartermin-Ziel</span>' +
            '<input type="date" id="fin-notar" /></label>' +
          '<label class="fin-field fin-check fin-full"><input type="checkbox" id="fin-hb" /> <span>Hausbank vorhanden</span></label>' +
          '<label class="fin-field"><span class="fin-label">Hausbank — Name</span>' +
            '<input type="text" id="fin-hb-name" placeholder="optional" /></label>' +
          '<label class="fin-field"><span class="fin-label">Hausbank — Berater</span>' +
            '<input type="text" id="fin-hb-berater" placeholder="optional" /></label>' +
          '<label class="fin-field fin-check fin-full"><input type="checkbox" id="fin-fb" /> <span>Eigener Finanzberater</span></label>' +
          '<label class="fin-field fin-full"><span class="fin-label">Finanzberater — Kontakt</span>' +
            '<input type="text" id="fin-fb-kontakt" placeholder="optional" /></label>' +
          '<label class="fin-field fin-full"><span class="fin-label">Was ist dem Kunden wichtig?</span>' +
            '<textarea id="fin-wichtig" rows="2" placeholder="z.B. niedrige Rate, schnelle Zusage, Sondertilgung"></textarea></label>' +
        '</div>' +
        '<div class="reserv-modal-actions">' +
          '<button class="reserv-cancel" id="fin-cancel">Abbrechen</button>' +
          '<button class="reserv-confirm" id="fin-save"' + (snaps.length ? '' : ' disabled') + '>Übergeben</button>' +
        '</div>' +
      '</div>';
    const $ = (id) => m.querySelector('#' + id);
    const close = (val) => { m.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
    const onSave = () => {
      const snapshotId = snaps.length ? $('fin-snapshot').value : '';
      if (!snapshotId) return;
      close({
        snapshotId,
        finanzierungsform: $('fin-form').value,
        finanzierungsformAndere: $('fin-form-andere').value.trim(),
        maxEigenkapital: $('fin-maxek').value ? Number($('fin-maxek').value) : null,
        notarterminZiel: $('fin-notar').value || '',
        hausbankVorhanden: $('fin-hb').checked,
        hausbankName: $('fin-hb-name').value.trim(),
        hausbankBerater: $('fin-hb-berater').value.trim(),
        finanzberaterVorhanden: $('fin-fb').checked,
        finanzberaterKontakt: $('fin-fb-kontakt').value.trim(),
        wasWichtig: $('fin-wichtig').value.trim(),
      });
    };
    $('fin-cancel').onclick = () => close(null);
    if (snaps.length) $('fin-save').onclick = onSave;
    m.onclick = (e) => { if (e.target === m) close(null); };
    const onKey = (e) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(m);
  });
}

function _finUebergabeEnsureStyles() {
  if (document.getElementById('fin-modal-styles')) return;
  const s = document.createElement('style');
  s.id = 'fin-modal-styles';
  s.textContent = `
    .fin-modal { max-width: 520px; }
    .reserv-modal.fin-modal .reserv-modal-body { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
    .fin-field { display: flex; flex-direction: column; gap: 4px; }
    .fin-field.fin-full { grid-column: 1 / -1; }
    .fin-field.fin-check { flex-direction: row; align-items: center; gap: 8px; }
    .fin-label { font-size: 0.85em; color: #6b6b6b; }
    .fin-modal select, .fin-modal input, .fin-modal textarea { width: 100%; box-sizing: border-box; }
  `;
  document.head.appendChild(s);
}
```

> **Hinweis:** `esc()` ist die bestehende HTML-Escape-Helper-Funktion in `app.js` (vielfach genutzt). `_reservEnsureStyles()` existiert bereits.

- [ ] **Step 2: Syntax-Check ohne Browser (JSC)**

Run: der JSC-Syntax-Check-Befehl aus `.claude/settings.local.json` (Allow-Liste) gegen `public/app.js`.
Expected: kein Syntax-Fehler.

- [ ] **Step 3: Commit**

```bash
git add public/app.js public/styles.css
git commit -m "feat(finanzierung): Übergabe-an-Finanzierung Modal (Frontend)"
```

---

### Task 5: Frontend — Button + Verdrahtung

**Files:**
- Modify: `public/app.js` (`uebergebeAnFinanzierung` + Button in `renderTabUebersicht`)

- [ ] **Step 1: Handler-Funktion einfügen**

In `public/app.js` direkt nach `openFinanzierungUebergabeModal`/`_finUebergabeEnsureStyles` einfügen:

```js
// Button-Handler: öffnet das Übergabe-Modal mit den Snapshots des aktuellen Kunden,
// schickt das Ergebnis an die API, legt den Finanzierungsfall an.
async function uebergebeAnFinanzierung() {
  const snaps = state.snapshots || [];
  const data = await openFinanzierungUebergabeModal(snaps);
  if (!data) return;
  try {
    await api.post('/api/finanzierung/uebergeben', {
      kundeId: state.kundeId,
      snapshotId: data.snapshotId,
      finanzierungsform: data.finanzierungsform,
      finanzierungsformAndere: data.finanzierungsformAndere,
      maxEigenkapital: data.maxEigenkapital,
      notarterminZiel: data.notarterminZiel,
      hausbankVorhanden: data.hausbankVorhanden,
      hausbankName: data.hausbankName,
      hausbankBerater: data.hausbankBerater,
      finanzberaterVorhanden: data.finanzberaterVorhanden,
      finanzberaterKontakt: data.finanzberaterKontakt,
      wasWichtig: data.wasWichtig,
    });
    toast('An Finanzierung übergeben — Fall angelegt', 'success');
    // Kunde neu laden (Phase hat sich ggf. auf Bank-Einreichung geändert)
    if (typeof renderKunde === 'function') renderKunde();
  } catch (e) {
    toast('Fehler: ' + e.message, 'error');
  }
}
window.uebergebeAnFinanzierung = uebergebeAnFinanzierung;
```

- [ ] **Step 2: Button in der Übersicht rendern**

In `renderTabUebersicht` (ab ~Zeile 1624) im Aktions-/Kopfbereich des Kunden-Detail-Tabs einen Button ergänzen. Suche den bestehenden Card-/Header-Block und füge nach dem vorhandenen Phasen-/Aktions-Markup ein:

```js
        `<button class="btn-secondary" onclick="uebergebeAnFinanzierung()" title="Reservierten Kunden mit Kalkulation + Infos an die Finanzierung übergeben">→ An Finanzierung übergeben</button>`
```

(Platzierung: im selben Container wie die übrigen Aktions-Buttons der Übersicht; Klassen `btn-secondary` werden in `styles.css` bereits verwendet — bei Abweichung die dort genutzte Button-Klasse übernehmen.)

- [ ] **Step 3: Syntax-Check (JSC)**

Run: JSC-Syntax-Check gegen `public/app.js`.
Expected: kein Fehler.

- [ ] **Step 4: Commit**

```bash
git add public/app.js
git commit -m "feat(finanzierung): Button 'An Finanzierung übergeben' im Kunden-Detail"
```

---

### Task 6: End-to-End-Verifikation + Deploy-Vorbereitung

**Files:** keine (Verifikation)

- [ ] **Step 1: Lokal mit `vercel dev` testen**

Run: `npm run dev`
Klick-Liste:
1. Einloggen, Kunde mit ≥1 gespeichertem Snapshot öffnen.
2. „→ An Finanzierung übergeben" klicken → Modal erscheint, Snapshot-Dropdown vorbefüllt (neuester oben).
3. Formular ausfüllen (Hausbank an, Name, Was-wichtig), „Übergeben".
4. Toast „Fall angelegt". In Airtable `Endkunden-Finanzierungsfall`: neuer Record mit Links (Kunde/WE/Snapshot), Kennzahlen, Formularwerten, Status „Unterlagen noch anfordern", SA-Status „fehlt".
5. Kunden-Phase steht auf „Bank-Einreichung".
6. Kunde ohne Snapshot öffnen → Button öffnet Modal mit Hinweis „Kein Snapshot", „Übergeben" disabled.

- [ ] **Step 2: Volle Test-Suite + Guard**

Run: `npm run guard && npm test`
Expected: beides grün.

- [ ] **Step 3: vor-deploy-check Skill**

Lokalen Skill `vor-deploy-check` ausführen (JSC-Syntax + `npm test` + Klick-Liste aus dem Diff).

- [ ] **Step 4: Branch pushen (Preview), NICHT direkt main**

```bash
git push -u origin feature/finanzierung-handover
```
Vercel baut eine Preview-URL → am Handy testen. Erst nach Edgars OK nach `main` mergen.

---

## Self-Review (gegen Spec)

- **Spec §4 Auslöser (Button + Mini-Formular):** Task 4/5 ✓
- **Spec §4 Snapshot-Auswahl (neuester vorgewählt):** Task 4 Step 1 (`i === 0 ? selected`) ✓
- **Spec §6.1 neue Fall-Felder:** Task 1 ✓ (Drive-/Upload-Token-Felder bewusst NICHT hier — gehören zu Baustein D/U)
- **Spec §4 Objektzahlen eingefroren + datiert:** `standVom` + Klartext-Kennzahlen aus Snapshot ✓
- **Spec §6.3 Status-Andocken (Start „Unterlagen noch anfordern"):** Mapper + `FINANZIERUNGSFALL_STATUS_START` ✓
- **Spec §3 Nicht-Ziel Quick-Bonität:** Mapper überträgt **keine** Quick-Werte ✓
- **Bewusst außerhalb Baustein A:** Drive-Ordner (`Kunden-Drive` bleibt leer), Upload-Token, SA-Dokument, Cleanup der 3 Müll-Felder (Baustein C) — jeweils eigener Plan.

**Type-Konsistenz:** `finanzierungsfallBodyToFields` Signatur identisch in Task 2 (Definition), Task 3 (Aufruf) und Test. `FINANZIERUNGSFALL_FIELDS`-Keys identisch in tables.js / mapper / test.
