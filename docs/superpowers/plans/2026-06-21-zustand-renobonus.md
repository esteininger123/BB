# Zustand-Umbau + Renovierungsbonus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zustand-Feld auf 4 Werte umbauen (Aufschläge statt Abschläge) und einen individuell wählbaren Renovierungsbonus einführen, der als Carve-out den ausgewiesenen EK-Bedarf senkt und in einem getrennten Szenario-Block die Steuererstattung zeigt.

**Architecture:** Der Renobonus ist ein zusätzlicher, gedeckelter Output der Rechen-Engine (`recalc`) — die bestehenden Engine-Kennzahlen (`ekBedarf`, `irr`, `vermoegenNetto10`) bleiben **unangetastet**, der Bonus erscheint als neue Felder (`renovierungsbonus`, `ekBedarfNetto`, `renoErstattung`). Datenquelle ist die Wohneinheit (Airtable: `Zustand` + neues `Renovierungsbonus_Override`), durchgereicht über Mapper → API → `kalkInputs`. Anzeige in Vertriebler-Card, Investitions-PDF und Reservierungs-PDF.

**Tech Stack:** Vanilla JS (kein Build-Step), Vercel Serverless Functions (Node 20), Airtable (Field-IDs via `tables.js`), Node-native Tests (`node --test`).

## Global Constraints

- **Vanilla JS only** — kein Build-Step, kein Framework, Helper inline.
- **Airtable-Field-IDs nur in `api/_lib/tables.js`** — eine Quelle der Wahrheit. Nie hardcoden außerhalb.
- **Mapper-Pattern** — Airtable-Records ↔ App-JSON nur über `api/_lib/mappers.js`.
- **Berechnungslogik** lebt in `public/kalkulator.js`. Jede Formel-Änderung → Master-Referenz-HTML in `../docs/` mit-aktualisieren (`kalk-integritaet`-Skill).
- **Engine-Defaults (verbatim):** Gebäudeanteil `0.85`, Renobonus-Sätze `Standard = 100 €/qm`, `renovierungsbedürftig = 200 €/qm`, Cap `15 %` des Gebäudewerts.
- **Zustand-Aufschläge (verbatim, Airtable KP_VORSCHLAG-Formel):** `kernsaniert +8 %`, `renoviert +3 %`, `Standard 0 %`, `renovierungsbedürftig 0 %`.
- **Bestehende, verhandelte KAUFPREISe nicht neu berechnen** — nur die KP_VORSCHLAG-Formel verschiebt sich.
- **Commits:** kurz, sachlich, deutsch/englisch egal, **kein** Co-Author-Footer.
- **Vor jedem Push:** `npm run guard && npm test` grün, JSC-Syntax-Check (`vor-deploy-check`-Skill). `main` geht direkt live → Branch + Preview.

---

### Task 1: Engine — Renovierungsbonus in `recalc` (TDD, keystone)

Reine Rechenlogik, vollständig in Node testbar, ohne UI/Airtable. Zuerst, weil alles andere darauf aufbaut.

**Files:**
- Modify: `public/kalkulator.js` (Konstanten nahe `BB_DEFAULTS` ~Z.200; Bonus-Block nach Z.708; Return-Objekt Z.1250-1253)
- Test: `tests/renobonus.test.js` (neu)

**Interfaces:**
- Consumes (neue, optionale `recalc`-Inputs): `i.zustand` (string), `i.renovierungsbonusOverride` (number|string|null|''), `i.qm` (number, existiert), `i.gebaeudeAnteil` (number, existiert), `i.steuersatz` (number, existiert).
- Produces (neue Felder im `recalc`-Result, von Task 4/5 konsumiert):
  - `renovierungsbonus: number` — effektiver, gedeckelter Bonus in €
  - `renovierungsbonusCap: number` — der 15-%-Cap-Wert in € (für Anzeige/Debug)
  - `ekBedarfNetto: number` — `ekBedarf − renovierungsbonus` (kann negativ sein = Tag-1-Überschuss)
  - `renoErstattung: number` — `renovierungsbonus × steuersatz`

- [ ] **Step 1: Failing test schreiben** — `tests/renobonus.test.js`

```js
// Tests für den Renovierungsbonus (Carve-out) in recalc().
// Run: node --test tests/renobonus.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const { loadKalk } = require('./_loader.js');

const { Kalk } = loadKalk();

// Vollständiger Standard-Input + explizite kp/qm/zustand. getDefaults() liefert
// das komplette Standard-Profil (Zins, Tilgung, AfA, Hausgeld etc.).
function inputs(extra) {
  return Object.assign({}, Kalk.getDefaults(), {
    kaufpreis: 150000, qm: 60, stellplatzKp: 0,
    steuersatz: 0.40, gebaeudeAnteil: 0.85, knkMitfinanziert: false,
  }, extra || {});
}
const EPS = 0.5;
function near(a, b, msg) { assert.ok(Math.abs(a - b) < EPS, `${msg}: ${a} vs ${b}`); }

test('Standard 60qm ohne Override → 6000 € Default', () => {
  const r = Kalk.recalc(inputs({ zustand: 'Standard' }));
  near(r.renovierungsbonus, 6000, 'bonus');
  near(r.ekBedarfNetto, r.ekBedarf - 6000, 'ekBedarfNetto');
  near(r.renoErstattung, 6000 * 0.40, 'erstattung');
});

test('renovierungsbedürftig 60qm → 12000 € Default', () => {
  const r = Kalk.recalc(inputs({ zustand: 'renovierungsbedürftig' }));
  near(r.renovierungsbonus, 12000, 'bonus');
});

test('kernsaniert → 0 € (kein Default)', () => {
  const r = Kalk.recalc(inputs({ zustand: 'kernsaniert' }));
  near(r.renovierungsbonus, 0, 'bonus');
  near(r.ekBedarfNetto, r.ekBedarf, 'ekBedarfNetto == ekBedarf');
});

test('Override sticht über Default', () => {
  const r = Kalk.recalc(inputs({ zustand: 'Standard', renovierungsbonusOverride: 5000 }));
  near(r.renovierungsbonus, 5000, 'override');
});

test('Override 0 (explizit) → 0, kein Default', () => {
  const r = Kalk.recalc(inputs({ zustand: 'Standard', renovierungsbonusOverride: 0 }));
  near(r.renovierungsbonus, 0, 'expliziter 0-Override');
});

test('Override über Cap → auf 15 % Gebäudewert gedeckelt', () => {
  const r = Kalk.recalc(inputs({ zustand: 'renovierungsbedürftig', renovierungsbonusOverride: 999999 }));
  // Cap = 0.15 × 0.85 × 150000 = 19125
  near(r.renovierungsbonus, 19125, 'cap');
  near(r.renovierungsbonusCap, 19125, 'cap-feld');
});

test('Zustand-Aufschläge berühren die Engine-Kennzahlen NICHT (Aufschlag lebt in Airtable)', () => {
  const a = Kalk.recalc(inputs({ zustand: 'kernsaniert' }));
  const b = Kalk.recalc(inputs({ zustand: 'Standard' }));
  near(a.ekBedarf, b.ekBedarf, 'ekBedarf identisch — Aufschlag ist kein Engine-Input');
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `node --test tests/renobonus.test.js`
Expected: FAIL — `r.renovierungsbonus` ist `undefined`, `near` wirft.

- [ ] **Step 3: Konstanten definieren** — `public/kalkulator.js`, direkt nach dem `BB_DEFAULTS`-Objekt (~Z.205, nach dessen schließender `};`)

```js
// Renovierungsbonus (Carve-out, 2026-06-21): Default-Sätze je Zustand + Cap.
// Der Bonus ist ein Teil des Verkaufspreises, der nach Notar an den Käufer
// zurückfließt (zweckgebunden Renovierung). Cap = 15 % des Gebäudewerts hält
// die Reno als Erhaltungsaufwand unter der anschaffungsnahe-HK-Grenze (§6 EStG),
// damit die Sofort-Absetzung (R × Steuersatz) immer gilt.
const RENOBONUS_SATZ_QM = { 'Standard': 100, 'renovierungsbedürftig': 200 };
const RENOBONUS_CAP_PCT = 0.15;
```

- [ ] **Step 4: Bonus-Block in `recalc`** — `public/kalkulator.js`, direkt nach `const afaMo = afaJahr / 12;` (Z.708)

```js
  // --- Renovierungsbonus (Carve-out) ---
  // Darlehen + AfA-Basis bleiben oben unverändert auf vollem K (Käufer
  // beurkundet zu K). Hier nur der Rückfluss: senkt den ausgewiesenen EK-Bedarf.
  const _rbQm   = parseFloat(i.qm) || 0;
  const _rbSatz = RENOBONUS_SATZ_QM[i.zustand] || 0;
  const _rbOv   = i.renovierungsbonusOverride;
  const _rbHasOverride = (_rbOv !== undefined && _rbOv !== null && _rbOv !== '' && isFinite(parseFloat(_rbOv)));
  const _rbRoh  = _rbHasOverride ? parseFloat(_rbOv) : (_rbQm * _rbSatz);
  const renovierungsbonusCap = RENOBONUS_CAP_PCT * gebaeudeAnteilFaktor * kpGesamt;
  const renovierungsbonus = Math.max(0, Math.min(_rbRoh, renovierungsbonusCap));
  const ekBedarfNetto = ekBedarf - renovierungsbonus;
  const renoErstattung = renovierungsbonus * (parseFloat(i.steuersatz) || 0);
```

- [ ] **Step 5: Felder ins Return-Objekt** — `public/kalkulator.js`, Z.1253 erweitern

```js
    kpGesamt, knk, investitionGesamt, ekBedarf, darlehen,
    renovierungsbonus, renovierungsbonusCap, ekBedarfNetto, renoErstattung,
```

- [ ] **Step 6: Tests grün**

Run: `node --test tests/renobonus.test.js`
Expected: PASS (7 Tests).

- [ ] **Step 7: Snapshot-Tests unverändert grün** (Bonus ist additiv, berührt Bestands-Pfade nicht)

Run: `npm test`
Expected: PASS — `tests/kalk.snapshot.test.js` zeigt **keine** Drift (Presets haben kein `zustand`/Override → Bonus = 0).

- [ ] **Step 8: Commit**

```bash
git add public/kalkulator.js tests/renobonus.test.js
git commit -m "feat(kalk): Renovierungsbonus (Carve-out) — gedeckelt, senkt EK-Bedarf netto"
```

---

### Task 2: Airtable-Felder + `tables.js` + Schema-Guard

Field-IDs der echten Base ziehen und in die einzige Quelle der Wahrheit eintragen.

**Files:**
- Modify: `api/_lib/tables.js` (`WE_FIELDS`, Z.162-179)
- Reference: `scripts/schema-guard.js`, `scripts/field-ids.json`

**Interfaces:**
- Produces: `WE_FIELDS.ZUSTAND`, `WE_FIELDS.RENOVIERUNGSBONUS_OVERRIDE` (Field-ID-Strings, von Task 3 konsumiert).

- [ ] **Step 1: `Renovierungsbonus_Override` in Airtable anlegen** — Currency-Feld (€) auf der Wohneinheit-Tabelle. Via Airtable-MCP (`create_field`) oder manuell. Bestätige, dass `Zustand` (Single-Select) existiert und hole **beide** Field-IDs (z.B. via MCP `get_table_schema` oder `scripts/field-ids.json`).

- [ ] **Step 2: Field-IDs in `WE_FIELDS` eintragen** — `api/_lib/tables.js`, nach Z.166 (`KAUFPREIS:`)

```js
  ZUSTAND:     'fldXXXXXXXXXXXXXX', // Single-Select: kernsaniert/renoviert/Standard/renovierungsbedürftig
  RENOVIERUNGSBONUS_OVERRIDE: 'fldYYYYYYYYYYYYYY', // Currency € — manueller Bonus-Override pro WE (leer = Default aus Zustand×qm)
```
(Die `fldXXX`/`fldYYY` durch die echten IDs aus Step 1 ersetzen.)

- [ ] **Step 3: Schema-Guard grün** (prüft Field-IDs gegen die echte Base)

Run: `npm run guard`
Expected: PASS — keine verwaisten IDs (sonst 422-Falle bei listAll).

- [ ] **Step 4: Commit**

```bash
git add api/_lib/tables.js
git commit -m "feat(airtable): WE-Felder Zustand + Renovierungsbonus_Override gebunden"
```

---

### Task 3: Mapper + Durchreichen in `kalkInputs`

Werte aus der WE bis in `state.kalk` ziehen, sodass `recalc` sie sieht.

**Files:**
- Modify: `api/_lib/mappers.js` (`weToApi`, ~Z.260-272)
- Modify: `public/app.js` (`loadWeIntoKalk`, Z.3186-3206)

**Interfaces:**
- Consumes: `WE_FIELDS.ZUSTAND`, `WE_FIELDS.RENOVIERUNGSBONUS_OVERRIDE` (Task 2).
- Produces: WE-API-JSON-Felder `zustand: string`, `renovierungsbonusOverride: number|null`; `state.kalk.zustand`, `state.kalk.renovierungsbonusOverride` (von Task 1/4 konsumiert).

- [ ] **Step 1: `weToApi` erweitern** — `api/_lib/mappers.js`, im Return-Objekt nach `kp:` (Z.265)

```js
    zustand:    firstOrValue(f[WE_FIELDS.ZUSTAND]) || '',
    renovierungsbonusOverride: toNumber(f[WE_FIELDS.RENOVIERUNGSBONUS_OVERRIDE]),
```

- [ ] **Step 2: In `loadWeIntoKalk` durchreichen** — `public/app.js`, nach Z.3187 (`state.kalk.qm = w.qm || 0;`)

```js
  state.kalk.zustand = w.zustand || '';
  state.kalk.renovierungsbonusOverride = (w.renovierungsbonusOverride != null) ? w.renovierungsbonusOverride : '';
```
Und im `resp.we`-Zweig nach Z.3206 (`state.kalk.qm = resp.we.qm || state.kalk.qm;`) dieselben zwei Zeilen mit `resp.we.` statt `w.`.

- [ ] **Step 3: Manuell verifizieren** (kein Unit-Test — API-Schicht) — `npm run dev`, WE mit Zustand=Standard wählen, in der Konsole `state.kalk.zustand` und `state.kalkResult.renovierungsbonus` prüfen (> 0).

- [ ] **Step 4: Guard + Tests grün**

Run: `npm run guard && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/_lib/mappers.js public/app.js
git commit -m "feat(we): Zustand + Renobonus-Override durchgereicht bis kalkInputs"
```

---

### Task 4: Vertriebler-Ansicht — Renobonus-Card + Szenario-Block

**Files:**
- Modify: `public/app.js` (Renobonus-Card-Renderfunktion, eingehängt direkt nach der `subv-status-card`-Ausgabe ~Z.2723-2732)

**Interfaces:**
- Consumes: `state.kalkResult.renovierungsbonus`, `.ekBedarfNetto`, `.ekBedarf`, `.renoErstattung` (Task 1); `state.kalk.steuersatz`.
- Produces: HTML-Card im Kalkulations-Panel (kein Export).

- [ ] **Step 1: Card-Renderer einhängen** — `public/app.js`, unmittelbar nach dem schließenden Template der Subventions-Card (die `subv-status-card` rendert). Neue Funktion + Aufruf:

```js
// Renovierungsbonus-Card (2026-06-21) — spiegelt die subv-status-card.
function renderRenobonusCard() {
  const r = state.kalkResult;
  if (!r) return '';
  const bonus = r.renovierungsbonus || 0;
  if (bonus <= 0) {
    return `<div class="subv-status-card">
      <div class="title">Kein Renovierungsbonus</div>
      <div class="body text-tertiary text-small">Zustand „${state.kalk.zustand || '—'}" — kein Bonus hinterlegt.</div>
    </div>`;
  }
  const erst = r.renoErstattung || 0;
  const fmt = (v) => Math.round(v).toLocaleString('de-DE') + ' €';
  return `<div class="subv-status-card">
    <div class="title">Renovierungsbudget ${fmt(bonus)}</div>
    <div class="body">
      <p style="margin:0 0 6px;">Im Kaufpreis enthalten, <strong>nach dem Notartermin an den Käufer ausgezahlt</strong> — zweckgebunden für die Renovierung.</p>
      <p style="margin:0;"><strong>Wenn der Käufer renoviert:</strong></p>
      <ul style="margin:4px 0 0;padding-left:18px;">
        <li>Steuererstattung ≈ <strong>${fmt(erst)}</strong> (${Math.round((state.kalk.steuersatz||0)*100)} % Steuersatz, mit dem Steuerbescheid des Folgejahres)</li>
        <li>Wertzuwachs der Wohnung um mind. ${fmt(bonus)}</li>
        <li>Höhere erzielbare Miete — sofern noch Luft zur Marktmiete ist</li>
      </ul>
      <p class="text-tertiary text-small" style="margin:6px 0 0;">Renovierungskosten sind steuerlich absetzbar; Details mit dem Steuerberater.</p>
    </div>
  </div>`;
}
```
Den Aufruf `renderRenobonusCard()` an die Stelle setzen, wo die Subv-Card in den Panel-HTML-String konkateniert wird (gleiche Ebene, direkt darunter).

- [ ] **Step 2: EK-Bedarf-Anzeige auf netto** — die Stelle finden, wo `r.ekBedarf` als „EK-Bedarf"/„Kapitaleinsatz" in der KPI-/Belastungs-Ausgabe gezeigt wird (Suche `ekBedarf` in `public/app.js`), und auf `r.ekBedarfNetto` umstellen, mit Sublabel bei Bonus > 0: `davon Renovierungsbudget zurück: ${fmt(bonus)}`. Bei negativem `ekBedarfNetto`: Label „Liquiditätsüberschuss Tag 1" statt „EK-Bedarf".

- [ ] **Step 3: JSC-Syntax-Check** (Frontend-JS ohne Browser, Allow-Liste in `.claude/settings.local.json`).
Expected: kein Syntaxfehler in `public/app.js`.

- [ ] **Step 4: Manuell verifizieren** — `npm run dev`, WE Standard/renovierungsbedürftig wählen → Card erscheint mit Betrag + Erstattung; gute Zustände → „Kein Renovierungsbonus".

- [ ] **Step 5: Commit**

```bash
git add public/app.js
git commit -m "feat(view): Renobonus-Card + EK-Bedarf netto in der Vertriebler-Ansicht"
```

---

### Task 5: PDF — Investitionsrechnung + Reservierung

**Files:**
- Modify: `public/pdf.js` (Annahmen-Block ~Z.689; Investitions-Szenario-Block; Reservierungs-Body ~Z.970-1010)

**Interfaces:**
- Consumes: `r.renovierungsbonus`, `r.ekBedarfNetto`, `r.renoErstattung` (Task 1); `i.steuersatz`.

- [ ] **Step 1: Annahmen-Zeile „Renovierungsbudget"** — `public/pdf.js`, direkt nach der Mietsubventions-Zeile (Z.689). Spiegelt deren Markup exakt:

```js
          <div class="pdf-c-ass-row"><span class="k">Renovierungsbudget</span><span class="v">${r.renovierungsbonus > 0 ? Kalk.fmtEur(r.renovierungsbonus) + ' · nach Notar ausgezahlt' : '—'}</span></div>
```

- [ ] **Step 2: Szenario-Block im Investitions-PDF** — auf der Detail-Seite (gleiche Seite wie die Annahmen, vor dem `pdf-c-page-foot` Z.696) einfügen, nur wenn `r.renovierungsbonus > 0`:

```js
      ${r.renovierungsbonus > 0 ? `
      <div class="pdf-c-reno" style="margin-top:4mm;padding:3mm;border:0.3mm solid #d8d2c6;border-radius:1.5mm;">
        <div style="font-weight:600;margin-bottom:1.5mm;">Renovierungsbudget ${Kalk.fmtEur(r.renovierungsbonus)} — nach dem Notartermin an Dich ausgezahlt</div>
        <div style="font-size:8pt;line-height:1.5;">Im Kaufpreis enthalten und zweckgebunden für die Renovierung. Wenn Du renovierst: Steuererstattung ≈ <strong>${Kalk.fmtEur(r.renoErstattung)}</strong> (mit dem Steuerbescheid des Folgejahres), Wertzuwachs der Wohnung um mind. ${Kalk.fmtEur(r.renovierungsbonus)}, und eine höhere erzielbare Miete — sofern noch Luft zur Marktmiete ist. Renovierungskosten sind steuerlich absetzbar; Details mit Deinem Steuerberater.</div>
      </div>` : ''}
```

- [ ] **Step 3: Reservierungs-Zeile** — `public/pdf.js`, im Reservierungs-Body (`reservierung()`, ~Z.970-1010, dort wo Objekt/Preis/Stellplatz gelistet werden), eine Zeile analog Mietsubvention ergänzen. Den Bonus aus dem frisch gerechneten Result ziehen (in `reservierung()` wird bereits `recalc`/`kalkInputs` genutzt — denselben Wert verwenden):

```js
        ${renoBonus > 0 ? `<p><strong>Renovierungsbudget:</strong> ${dtEur(renoBonus)} — im Kaufpreis enthalten, wird nach dem Notartermin an den Käufer ausgezahlt (zweckgebunden Renovierung).</p>` : ''}
```
Vorher `renoBonus` aus dem Result holen (`const renoBonus = (rr && rr.renovierungsbonus) || 0;`, wo `rr` das in `reservierung()` bereits berechnete recalc-Result ist — die vorhandene Berechnungsstelle im Funktionskopf nutzen).

- [ ] **Step 4: JSC-Syntax-Check** auf `public/pdf.js`.
Expected: kein Syntaxfehler.

- [ ] **Step 5: Manuell verifizieren** — `npm run dev`, Investitions-PDF einer Standard-WE drucken (Druckvorschau) → Annahmen-Zeile + Szenario-Block sichtbar; Reservierung drucken → Renobonus-Zeile sichtbar; gute Zustände → keine Zeile/Block.

- [ ] **Step 6: Commit**

```bash
git add public/pdf.js
git commit -m "feat(pdf): Renobudget in Investitionsrechnung (Annahmen + Szenario) + Reservierung"
```

---

### Task 6: Snapshot-Feld + Wissens-Doku + Master-Referenz

**Files:**
- Modify: `api/_lib/tables.js` (`SNAPSHOT_FIELDS`), `api/snapshots.js` (Klartext-Befüllung), `api/_lib/mappers.js` (Snapshot-Mapper)
- Modify: `api/_lib/assistent-wissen.js` (Z.83-84)
- Modify: `../docs/2026-05-26_Master-Referenz_Berechnungslogik.html` (Renobonus-Abschnitt)

**Interfaces:**
- Consumes: `kalkErgebnis.renovierungsbonus` aus dem Snapshot-POST-Body.

- [ ] **Step 1: Snapshot-Feld anlegen** — Currency-Feld „Renovierungsbonus" auf der Snapshots-Tabelle (Airtable), Field-ID in `SNAPSHOT_FIELDS` eintragen:

```js
  RENOVIERUNGSBONUS: 'fldZZZZZZZZZZZZZZ', // Currency € — Klartext-Basis, auto aus kalkJson/kalkErgebnis
```

- [ ] **Step 2: Befüllung beim Snapshot-POST** — in `api/snapshots.js` dort, wo die Klartext-Basis-Felder aus dem Body gesetzt werden, `renovierungsbonus` analog `KAUFPREIS`/`SUBV_GESAMT` mitschreiben.

- [ ] **Step 3: `assistent-wissen.js` nachziehen** — Z.84 auf das neue Modell:

```
Zustand: kernsaniert +8 %, renoviert +3 %, Standard 0 %, renovierungsbedürftig 0 %. Keine Abschläge mehr. Renovierungsbonus (Carve-out): Teil des Verkaufspreises, nach Notar an Käufer ausgezahlt; Default Standard 100 €/qm, renovierungsbedürftig 200 €/qm, individuell überschreibbar, gedeckelt auf 15 % des Gebäudewerts. Senkt den ausgewiesenen EK-Bedarf; Steuererstattung ≈ Bonus × persönlicher Steuersatz.
```

- [ ] **Step 4: Master-Referenz-HTML** — Renobonus-Abschnitt ergänzen (Formel: effektiv = min(Override ?? qm×Satz, 0,15 × Gebäudeanteil × kpGesamt); ekBedarfNetto; renoErstattung). `kalk-integritaet`-Skill-Checkliste abarbeiten.

- [ ] **Step 5: Guard + Tests grün**

Run: `npm run guard && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/_lib/tables.js api/snapshots.js api/_lib/mappers.js api/_lib/assistent-wissen.js ../docs/2026-05-26_Master-Referenz_Berechnungslogik.html
git commit -m "feat(snapshot+docs): Renobonus in Snapshot, Assistent-Wissen, Master-Referenz"
```

---

### Task 7: Airtable — Migration + KP_VORSCHLAG-Formel + Single-Select reduzieren

**Reine Airtable-Operationen** (kein App-Code). Erst nachdem der Code die neuen Werte lesen kann (Tasks 1-6). Über Airtable-MCP oder Skript.

**Files:**
- Reference: `api/_lib/assistent-wissen.js:83-84` (dokumentiert die Formel)

- [ ] **Step 1: Records migrieren** (Wohneinheit-Tabelle, `Zustand`-Feld):
  - `bezugsfertig` → `Standard`
  - `saniert.bedürftig` → `renovierungsbedürftig`
  - `kernsaniert`, `renoviert`, `renovierungsbedürftig` → unverändert
  - Vorher: Liste aller WEs mit altem Zustand exportieren (Edgar-Review, falls `saniert.bedürftig`-Fälle pro WE anders gewünscht).

- [ ] **Step 2: Single-Select-Optionen reduzieren** — alte Optionen (`bezugsfertig`, `saniert.bedürftig`) erst entfernen, **nachdem** Step 1 alle Records migriert hat (sonst Datenverlust). Zielzustand: 4 Optionen.

- [ ] **Step 3: KP_VORSCHLAG_WOHNUNG-Formel anpassen** (`fldaxnWdFP1mLYVtH`, KALK_STAMMDATEN) — Zustand-Korrektur auf `kernsaniert +0.08`, `renoviert +0.03`, `Standard 0`, `renovierungsbedürftig 0`. Abschläge entfernen.

- [ ] **Step 4: Stichprobe** — 3 WEs (je Zustand) prüfen: KP_VORSCHLAG plausibel, kernsaniert höher als vorher (+8 statt +6), renovierungsbedürftig höher (0 statt −5). Verhandelte KAUFPREISe unverändert.

- [ ] **Step 5: Doku-Commit** (Formel-Stand festhalten, falls noch nicht in Task 6)

```bash
git add api/_lib/assistent-wissen.js
git commit -m "docs(airtable): KP_VORSCHLAG-Zustandskorrektur auf 4-Werte-Modell migriert"
```

---

## Self-Review

**Spec-Coverage:**
- Zustand 4 Werte + Aufschläge → Task 7 (Formel) + Task 6 (Doku). ✓
- Migration 5→4 → Task 7 Step 1-2. ✓
- Renobonus Default/Override/Cap → Task 1. ✓
- EK-Bedarf netto, kein Doppelzählen (IRR/vermoegen unangetastet) → Task 1 (additive Felder) + Task 4 Step 2. ✓
- Reno-Szenario-Block (Erstattung, Wertzuwachs, Miete-Hinweis) → Task 4 Step 1 + Task 5 Step 2. ✓
- Sichtbarkeit: Vertriebler-Card (Task 4), Investitions-PDF (Task 5 Step 1-2), Reservierungs-PDF (Task 5 Step 3). ✓
- Steuersatz pro Kunde reingezogen → Task 1 (`i.steuersatz`), via `state.kalk.steuersatz`. ✓
- Snapshot + assistent-wissen + Master-Referenz → Task 6. ✓
- Field-IDs live ziehen → Task 2 Step 1. ✓

**Modellentscheidung (für Edgar-Review markiert):** `ekBedarf`, `irr`, `vermoegenNetto10` bleiben in der Engine auf dem echten KNK-Kapital — der Bonus erscheint als `ekBedarfNetto` (Anzeige) + Szenario-Block, **nicht** in IRR/Vermögen. Grund: IRR ist bei ~0 € Kapitaleinsatz degeneriert, und so bleiben die Snapshot-Tests stabil. Falls Edgar will, dass IRR/Vermögen den Bonus mitnehmen → separate Folge-Entscheidung (negativer-EK-Sonderfall müsste dann sauber gehandhabt werden).

**Platzhalter-Scan:** `fldXXX/fldYYY/fldZZZ` sind bewusste Marker für live zu ziehende Field-IDs (Task 2/6 Step 1), kein vergessener Platzhalter.

**Typ-Konsistenz:** `renovierungsbonus`, `ekBedarfNetto`, `renoErstattung`, `renovierungsbonusCap` (Result-Felder) und `zustand`, `renovierungsbonusOverride` (Inputs/WE-JSON) durchgängig gleich benannt über Task 1/3/4/5.
