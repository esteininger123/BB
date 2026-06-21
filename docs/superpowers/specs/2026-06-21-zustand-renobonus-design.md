# Design: Zustand-Umbau (4 Werte) + Renovierungsbonus

**Datum:** 2026-06-21
**Status:** In Umsetzung — siehe Realitäts-Addendum unten (Schema wich vom Entwurf ab)

> ## ⚠️ Umsetzungs-Realität (2026-06-21, nach Airtable-Introspektion)
> Beim Anbinden via Airtable-API stellten sich drei Annahmen des Entwurfs als falsch heraus — korrigiert:
> 1. **Feld-Heimat:** Das preiswirksame Zustand-Feld ist **„Zustand WE" (`fldcB9Q4vmoLYWCjr`) auf Kalkulations-Stammdaten** (`tblz5KNtzkLSLHHFo`), nicht auf der Wohneinheit. Die Wohneinheit-Zustandsfelder („Zustand (IST)", „Zustand (Einkauf)") sind beschreibend, nicht preiswirksam.
> 2. **Bonus = Override-only:** Edgar („bestehende Einheiten bleiben wie sie sind") → **kein zustandsbasierter Auto-Default**. Aktiver Bonus = manuelles Currency-Feld **„Renovierungsbonus (€)" (`fldWkm04lIAhYsfpN`)** auf Kalk-Stammdaten (neu angelegt). Leer = 0. Die 100/200 €/qm leben als Pflege-Vorschlag in der Feld-Beschreibung, nicht als Auto-Wert. Engine deckelt auf 15 % Gebäudewert.
> 3. **Labels:** Airtable-API kann Select-Choices nicht ändern (nur `name`/`description`/Formel). Die **Formel** wurde via API auf das neue %-Modell gesetzt und matcht **alte UND neue** Labels (kernsaniert +8, renoviert +3, Rest 0) → bruchfrei. Die **Label-Umbenennung** (Bezugsfertig→Standard, Renov.bed.(−5%)→Renovierungsbedürftig, Renoviert(+3%)→Renoviert, Kernsaniert(+6%)→Kernsaniert, Sanierungsbedürftig löschen) macht Edgar **manuell im Airtable-UI**.
> 4. **Engine-Outputs unverändert additiv:** `renovierungsbonus`, `renovierungsbonusCap`, `ekBedarfNetto`, `renoErstattung`. `ekBedarf`/`irr`/`vermoegenNetto10` bleiben auf KNK-Brutto (per Test abgesichert).

**Status (Original):** Brainstorming abgeschlossen, Spec zur Review
**Auslöser:** Das Zustand-Feld soll keine Abschläge mehr fahren. Statt „schlechter Zustand → Preisabschlag" arbeiten wir mit einem **Renovierungsbonus**: ein Teil des Verkaufspreises, der nach dem Notartermin an den Käufer zurückfließt, damit er renovieren kann. Aufschläge für gute Zustände bleiben.

---

## 1. Ziel & Scope

**Im Scope:**
- `Zustand`-Single-Select auf **4 Werte** umbauen, Aufschlag-Logik anpassen, Abschläge entfernen.
- Neues Feld **Renovierungsbonus** pro Wohneinheit (€, individuell überschreibbar, Default aus Zustand × €/qm, hart auf 15 % Gebäudewert gedeckelt).
- Bonus als **Carve-out**: Teil des vollen Kaufpreises K. Senkt im Base-Case den **EK-Bedarf** (Tag-1-Liquidität zurück). Darlehen + AfA-Basis bleiben auf K.
- Getrennter, sichtbarer **Renovierungs-Szenario-Block** mit Steuererstattung (persönlicher Steuersatz), Wertzuwachs, Miete-Hinweis.
- Bonus + Erklärung in **Vertriebler-Ansicht**, **Investitionsrechnung-PDF** und **Reservierungs-PDF**.

**Nicht im Scope (bewusst, YAGNI):**
- Keine Modellierung der Mietsteigerung als Zahl (zu individuell, würde erfundene Werte erzeugen → nur Textzeile).
- Keine 15-%-Ampel/Warnung — durch den **harten Cap** ersetzt, dann stimmt `R × Steuersatz` immer.
- WE-Listen-6er-Matrix bleibt vorerst preisbasiert (Bonus nur im Haupt-Rechner + PDF).
- €/qm-Sätze (100/200) und der Cap-Prozentsatz (15 %) bleiben dokumentierte Konstanten in `kalkulator.js` — kein Admin-UI (später optional in die Konditionen-Karte hebbar).
- Bestehende, verhandelte KAUFPREISe werden **nicht** neu berechnet — nur die `KP_VORSCHLAG`-Formel verschiebt sich.

---

## 2. Ist-Zustand (Code-/Daten-Fakten)

- `Zustand` ist ein Single-Select auf der **Wohneinheit** (Airtable). Werte heute: `saniert.bedürftig`, `renovierungsbedürftig`, `bezugsfertig`, `renoviert`, `kernsaniert`.
- Der Zustand fließt **nur** in **eine** Airtable-Formel: `KP_VORSCHLAG_WOHNUNG` (`fldaxnWdFP1mLYVtH`, KALK_STAMMDATEN). Ertragswert = `(Käufer-Miete + Subv) × 12 × Lage-Multiplikator × (1 + Zustand-Korrektur)`.
- Zustand-Korrektur heute: saniert.bed. **−10 %**, renov.bed. **−5 %**, bezugsfertig **0 %**, renoviert **+3 %**, kernsaniert **+6 %**. (dokumentiert in `api/_lib/assistent-wissen.js:84`)
- Die **App liest `Zustand` heute nicht** — `WE_FIELDS` (`tables.js:162`) hat kein Zustand-Feld. Die App rechnet mit `KAUFPREIS` (`fldKQ5ZpGvEzuc5qc`, was der Käufer zahlt) und zeigt daneben `KP_VORSCHLAG`.
- EK-Bedarf-Logik: `kalkulator.js:664-675`. `knk = kpGesamt × knkPct`; `ekBedarf = knkMitfinanziert ? 0 : knk`; `darlehen = knkMitfinanziert ? investitionGesamt : kpGesamt`. AfA-Basis = `kpGesamt + knk` (`kalkulator.js:705`). Gebäudeanteil-Default **0,85** (`kalkulator.js:200`).
- Persönlicher Steuersatz liegt **pro Kunde**: `KUNDEN.STEUERSATZ` (`flduCGIGwCXvNO3qQ`, `tables.js:79`), als Dezimal (z. B. 0,42), und ist als `state.kalk.steuersatz` im Rechner verfügbar.
- `renovierungsStress(baseInputs, kostenArr)` (`kalkulator.js:1653`) existiert, ist aber **toter Export** (nirgends in `app.js`/`pdf.js` aufgerufen) und modelliert die **Aktivierung/AfA** (anschaffungsnahe HK) — also das *Gegenteil* des hier gewünschten Sofort-Absetzungs-Modells. Wird **nicht** wiederverwendet.
- Mietsubvention als Vorbild: PDF-Annahmen-Zeile `pdf.js:689`, Reservierungs-Doc `pdf.js:898-1022`, Vertriebler-Card `subv-status-card` `app.js:2640+`.

---

## 3. Zustand-Modell (neu)

Single-Select **4 Werte**:

| Zustand | Aufschlag (KP_VORSCHLAG) | Renobonus-Default |
|---|---|---|
| `kernsaniert` | **+8 %** | 0 |
| `renoviert` | **+3 %** | 0 |
| `Standard` | **0 %** | **100 €/qm** |
| `renovierungsbedürftig` | **0 %** | **200 €/qm** |

**Migration der Bestands-Records:**
- `kernsaniert` → `kernsaniert`
- `renoviert` → `renoviert`
- `renovierungsbedürftig` → `renovierungsbedürftig`
- `bezugsfertig` → `Standard`
- `saniert.bedürftig` → `renovierungsbedürftig`

**Airtable-Änderungen:**
1. Records auf die 4 Zielwerte migrieren (per MCP/Script), erst dann die alten Optionen aus dem Single-Select entfernen.
2. `KP_VORSCHLAG_WOHNUNG`-Formel: Zustand-Korrektur auf `+8 / +3 / 0 / 0` umstellen. Abschläge raus.
3. `assistent-wissen.js:84` auf das neue Modell nachziehen.

**Preis-Wirkung (transparent, kein Hübschen):** `kernsaniert` +6→+8 % (Vorschlag steigt), `renovierungsbedürftig` −5→0 % (Vorschlag steigt, dafür Renobonus). Verhandelte KAUFPREISe bleiben unangetastet.

---

## 4. Renovierungsbonus

### 4.1 Wert-Ermittlung
- **Override** (€, pro WE, optional) sticht immer.
- Sonst **Default = `qm × €/qm-Satz`** mit Satz nach Zustand: `Standard` 100, `renovierungsbedürftig` 200, sonst 0.
- **Harter Cap:** `min(wert, 0.15 × gebäudeAnteil × kpGesamt)`. Garantiert, dass die Reno als Erhaltungsaufwand unter der anschaffungsnahe-HK-Grenze bleibt → `R × Steuersatz` immer gültig, unabhängig vom Renovierungszeitpunkt.
- Default-Sätze (100/200), Cap-Prozent (15 %) und die Aufschlag-Werte: dokumentierte Konstanten in `kalkulator.js`.

### 4.2 Felder-Heimat (Airtable, Wohneinheit)
- `Zustand` (bestehend, 4 Werte) — **neu in `WE_FIELDS` + Mapper aufnehmen**.
- `Renovierungsbonus_Override` (Currency €, neu) — manueller Pricing-Eingriff pro WE.
- Die effektive Wert-Ermittlung (Default/Override/Cap) passiert **im Rechner** (`kalkulator.js`), weil Cap an `gebäudeAnteil` + `kpGesamt` koppelt (Single Source of Truth). Kein redundantes Airtable-Formel-Feld.

### 4.3 Wirkung im Base-Case (`kalkulator.js`)
- `darlehen` und AfA-Basis **unverändert** auf vollem K (Käufer beurkundet zu K).
- Neuer Output `renovierungsbonus` (effektiv, gecappt).
- `ekBedarf_netto = ekBedarf − renovierungsbonus`. Bei KNK-mitfinanziert wird das negativ = **Liquiditätsüberschuss Tag 1** (so ausweisen, nicht auf 0 klemmen).
- `vermoegenNetto = vermoegenBrutto − ekBedarf_netto` (zieht den reduzierten EK-Einsatz konsistent durch — Modellannahme: Base-Case = „Bonus eingesteckt", Renovierung ist das separate Szenario, kein Doppelzählen).

### 4.4 Renovierungs-Szenario-Block (getrennt, sichtbar)
Reiner Anzeige-/Delta-Block, **ändert die Headline-Zahlen nicht**:
- **Renovierungsbudget:** R €
- **Steuererstattung:** `≈ R × persönlicher Steuersatz` (aus `state.kalk.steuersatz`) — „kommt mit dem Steuerbescheid des Folgejahres".
- **Wertzuwachs:** „mind. +R, Zustand Standard→renoviert".
- **Miete:** Textzeile ohne Zahl — „hebt die erzielbare Miete, sofern noch Luft zur Marktmiete ist".
- **Steuerberater-Hinweis:** eine Zeile (Exoten-Fall Standanhebung).

---

## 5. Sichtbarkeit & Texte

### 5.1 Vertriebler-Ansicht (`app.js`)
- Eigene **Renobonus-Card** analog `subv-status-card`: Betrag (effektiv) + Erklär-Block + Reno-Szenario-Delta.
- Wenn Bonus = 0 (kernsaniert/renoviert, kein Override): neutrale „Kein Renovierungsbonus"-Card.

### 5.2 Investitionsrechnung-PDF (`pdf.js`)
- Annahmen-Zeile **„Renovierungsbudget"** (analog Mietsubvention `pdf.js:689`).
- EK-Bedarf **netto** ausgewiesen.
- Reno-Szenario-Block + Erklärtext.

### 5.3 Reservierungs-PDF (`pdf.js:898`)
- Renobonus als **eigene Zeile** (wie Mietsubvention), damit's im unterschriebenen Doc steht.

### 5.4 Erklär-Text (einfach, Vorteile drin, ehrlich)
> „Renovierungsbudget: **X €** — im Kaufpreis enthalten, nach dem Notartermin an Dich ausgezahlt. Damit modernisierst Du die Wohnung. Drei Hebel: **höhere Miete** (renoviert bringt am Markt mehr Kaltmiete, sofern noch Luft nach oben ist) · **höherer Wiederverkaufswert** · **steuerlich absetzbar** (≈ X € zurück mit Deinem Steuersatz; Details mit Deinem Steuerberater)."

---

## 6. Durchstich (airtable-feld-binden-Pfad)

1. **`api/_lib/tables.js`** — `WE_FIELDS`: `ZUSTAND` + `RENOVIERUNGSBONUS_OVERRIDE` (neue Field-IDs). `npm run guard` muss grün bleiben.
2. **`api/_lib/mappers.js`** — `weToApi`: `zustand` + `renovierungsbonusOverride` ausgeben.
3. **Stammdaten-/WE-API** — Werte mit ausliefern (dort wo die App WE-Daten lädt).
4. **`public/app.js`** — `zustand` + `renovierungsbonusOverride` in `kalkInputs`; Renobonus-Card + Szenario-Block rendern.
5. **`public/kalkulator.js`** — effektiven Bonus (Default/Override/Cap) berechnen; `ekBedarf_netto`; neue Outputs (`renovierungsbonus`, `renoEstattung`, `gebaeudewert15`). Master-Referenz-HTML in `../docs/` nachziehen (`kalk-integritaet`-Skill).
6. **`public/pdf.js`** — Investitionsrechnung (Annahmen-Zeile + Szenario-Block + Text) + Reservierung (Bonus-Zeile).
7. **Snapshot** (`SNAPSHOT_FIELDS`) — `renovierungsbonus` als Klartext-Feld speichern (für Backoffice-Nachvollziehbarkeit). Snapshot-Tests bewusst entscheiden (`kalk-integritaet`).
8. **`api/_lib/assistent-wissen.js`** — Zustand-Korrektur + Renobonus-Logik dokumentieren.
9. **Airtable** — Records migrieren, `KP_VORSCHLAG`-Formel anpassen, Single-Select auf 4 Werte reduzieren, `Renovierungsbonus_Override`-Feld anlegen.

---

## 7. Tests

- **`tests/kalk.snapshot.test.js`** — Snapshot-Werte neu bewerten (EK-Bedarf-Logik ändert sich nur wenn Bonus > 0; Bestands-Snapshots ohne Bonus bleiben identisch → bewusst prüfen).
- **Neuer Test:** Bonus-Default je Zustand (100/200 €/qm), Override sticht, Cap greift bei großem Override, `ekBedarf_netto = ekBedarf − bonus`, Steuererstattung = `bonus × steuersatz`.
- **`tests/edge-cases.test.js`** — Bonus = 0 (gute Zustände), Bonus > EK-Bedarf (negativer EK = Überschuss), KNK-mitfinanziert.
- **`npm run guard`** + JSC-Syntax-Check vor Push (`vor-deploy-check`-Skill).

---

## 8. Offene/zu bestätigende Punkte

- **Steuer-Block sichtbar ohne Feature-Flag** (Edgar: „weiß schon dass es so funktioniert"). Steuerberater-Hinweis bleibt als PDF-Zeile.
- **Bank-Offenlegung** der Kaufpreis-Rückzahlung: Business-/Notar-/Banker-Thema, kein Code-Gate. PDF-Wording „Renovierungsbudget" transparent, nicht als versteckter Rabatt.
- **Field-IDs** für `Zustand` (bestehend) + `Renovierungsbonus_Override` (neu) in der echten Base holen, bevor `tables.js` final wird.
- **`saniert.bedürftig` → `renovierungsbedürftig`** als Migrations-Default gesetzt (Edgar kann pro WE korrigieren).
