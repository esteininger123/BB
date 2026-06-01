# Spec — Team-Feedback Backstube (6 Punkte)

> **Stand:** 2026-06-01 · **Autor:** Edgar + Claude · **Status:** zur Freigabe
> Quelle: Team-Feedback aus dem Vertrieb (Edgar gesammelt). Designentscheidungen im Brainstorming geklärt.

## Ziel

Sechs Verbesserungen an der B&B-Backstube aus dem Vertriebs-Feedback. Vier Themenblöcke, jeder einzeln auf Preview-Branch testbar und einzeln deploybar. Reihenfolge: **A → B → C → D**.

**Leitprinzip:** Die Berechnungs-Engine (`kalkulator.js`) bleibt unangetastet. Alle sechs Punkte sind nach aktuellem Verständnis ohne Formel-Änderung lösbar (Datennutzung + Frontend). Damit kein `ENGINE_VERSION`-Bump und keine neuen Snapshot-Erwartungswerte nötig. Sollte sich im Bau zeigen, dass eine Formel doch angefasst werden muss, wird das eskaliert (Snapshot-Tests + Master-Referenz-Doku nachziehen).

---

## Block A — Cashflow-Chart (Punkte 1 + 2 + 3)

Betrifft den Chart „Effektive Belastung / Die nächsten zehn Jahre" in der Magazin-/Story-Ansicht.
Code: `public/app.js` → `_drawCMagazinCharts` (~Z4520–4572), Datenaufbau aus `r.cf` (~Z4536).

### Punkt 2 — Erhöhung zum richtigen Zeitpunkt
- **Problem:** Der Chart aggregiert auf Jahresebene (`cf[].cfJahr / 12`, 10 Punkte J1–J10). Eine Mieterhöhung, die unterjährig greift, wird über zwei Jahre verschmiert → optisch ein langgezogener Anstieg statt eines Sprungs an der echten Stelle.
- **Entscheidung (Edgar):** Keine Stufen/Treppe. Die Kurve bleibt geschwungen wie bisher. Nur die **Zeitauflösung** wechselt von Jahr auf Monat.
- **Ansatz:** Datenquelle des Charts von `cf[]` (Jahres-Aggregat) auf `cfMonate[]` (120 Monatswerte, bereits in der Engine vorhanden) umstellen. X-Achse fein (monatlich), beschriftet mit Jahres-Labels J0…J10. Glättung (`tension`) bleibt grundsätzlich erhalten; bei sichtbarem Überschwingen an scharfen Sprüngen wird `tension` leicht reduziert. Der Erhöhungs-Anstieg sitzt dadurch automatisch am echten Monat.
- **Engine:** keine Änderung.

### Punkt 1 — Jahr 0
- **Entscheidung:** J0 = Startzustand heute (erster Monat: aktuelle Miete, laufende Subvention, Annuität, vor jeder Steigerung).
- **Ansatz:** Mit der Monatsauflösung aus Punkt 2 ist J0 der erste Monatspunkt links. X-Achse beginnt sichtbar bei J0.
- **Engine:** keine Änderung (`cfMonate[0]` ist der Startmonat; `vermoegen[0]` als Startzustand existiert bereits).

### Punkt 3 — Ereignis-Annotationen
- **Entscheidung:** Marker am echten Ereignis-Zeitpunkt + kurze Ereignis-Legende unter dem Chart.
- **Ereignisse:**
  - **Mieterhöhung:** Monat, in dem `kaltmieteM` gegenüber dem Vormonat springt → Label „Mieterhöhung +X €/Mo".
  - **Subventionsende:** Monat, in dem `subvM` von >0 auf 0 fällt → Label „Subvention endet".
- **Ansatz:** Ereignisse im Frontend aus dem Monatsverlauf (`cfMonate[]`) ableiten (Vergleich aufeinanderfolgender Monate). Marker selbst auf das Canvas zeichnen (dezente vertikale Linie + kleines Label), **kein** neues Chart-Plugin, kein Build-Schritt.
- **Engine:** keine Änderung.

### Block A — betroffen
- `public/app.js` (Chart-Render + Datenaufbau + Marker-Zeichnung)
- evtl. `public/styles.css` (Marker-/Legenden-Styling)

### Block A — bewusst NICHT
- Vermögens-Chart bleibt unverändert (Entscheidung Edgar: Vermögen wächst real kontinuierlich, Stufen/Marker dort unpassend).
- Andere Charts (Sensitivität, Sparbuch-Vergleich) bleiben unberührt.

---

## Block B — Rechenblatt-Monatsansicht (Punkt 5)

Betrifft den „Excel-Rechner": `public/rechenblatt.js` (CSV-Export mit BOM für deutsches Excel + druckbare HTML-Ansicht). Geöffnet über `openRechenblatt()` in `public/app.js` (~Z5317–5336).

- **Entscheidung (Edgar):** Monatsansicht = **Jahresansicht ÷ 12**. Pro Jahr J1–J10 ein Monatsschnitt (alle Monate eines Jahres gleich). Keine echten Einzelmonate. Zeigt „was geht pro Monat rein/raus".
- **Ansatz:** Zusätzlich zur bestehenden Jahres-Tabelle eine zweite Tabelle „pro Monat" — jeder Jahreswert geteilt durch 12. In HTML-Ansicht und CSV-Export. Reine Division, keine Monatsrohdaten nötig, kein Engine-Eingriff.
- **Betroffen:** `public/rechenblatt.js` (`build`, `toCsv`, `renderHtml`).
- **Bewusst NICHT:** kein echter XLSX-Export (CSV + HTML reicht), keine neue Library.

---

## Block C — Beratene Wohnungen in der Kundenansicht (Punkt 6)

Zeigt pro Kunde, zu welchen WE bereits beraten wurde (= WE, zu denen Snapshots existieren).
Datenmodell vorhanden: Tabelle `SNAPSHOTS` mit `KUNDE`-Link und `WE_BEZ` (Text, z.B. „WE 3 Wesseling"). API `GET /api/snapshots?kundeId=…` lädt Snapshots pro Kunde.

- **Entscheidung (Edgar):** Kundendetail **+** Kundenliste.
- **Kundendetail:** Neue kompakte Sektion „Beratene Wohnungen" in der Übersicht — dedupliziert aus den Snapshots des Kunden („WE 3 Wesseling, WE 7 Bruchsal"). Daten sind beim Kundendetail-Load bereits geladen → kein neuer API-Call.
- **Kundenliste:** Dieselbe Info kompakt pro Zeile (`_renderKundeRow`, ~Z588–635). Dafür müssen die Snapshots für die Liste mitgeladen werden — kleine API-Erweiterung, bewusst schlank (pro Kunde nur Anzahl + WE-Bezeichnungen, nicht der volle Kalk-State).
- **Betroffen:** `public/app.js` (Kundendetail-Übersicht, `_renderKundeRow`), `api/kunden.js` (schlanke Snapshot-Aggregation für die Liste), ggf. `api/snapshots.js`.
- **Bewusst NICHT:** WE-Bezeichnung bleibt der beim Snapshot gespeicherte Text (Konservenprinzip — kein Live-Lookup auf umbenannte WE). Kein neues Airtable-Rollup-Feld, solange die Aggregation im Backend schlank bleibt.

---

## Block D — Subventionsregler (Punkt 4)

Ein Regler im Kalkulator, mit dem der Vertriebler die Mietsubvention gegen Kaufpreis tauscht — für Endkunden, die statt Subvention lieber einen niedrigeren Kaufpreis wollen.
Code-Kontext: bestehende Slider für `kaufpreis` (~Z2353) und `subventionMo`/`subventionMonate` (~Z2364) in `public/app.js`; Recalc-Pipeline `recalcAndRender()` (~Z3108); Snapshot-Save (~Z5139); Investitionsanalyse-PDF in `public/pdf.js`.

- **Entscheidung (Edgar):**
  - **Umrechnung 1:1 nominal:** Weggenommene Subvention (€/Mo × Monate) senkt den Kaufpreis um genau diesen Betrag. Symmetrisch: Regler hoch → Subvention rauf, KP rauf; Regler runter → Subvention runter, KP runter.
  - **Persistenz:** Der eingestellte Zustand fließt in Snapshot **und** Investitionsanalyse-PDF (echtes Angebot an den Kunden, nicht nur Live-Spielerei).
- **Ansatz:**
  - Default = vereinbarte Subvention (aus Stammdaten / 2-Phasen-Modell). Referenz für den Trade-off ist die volle Subventionssumme (`mietsubventionGesamt` aus dem Recalc-Ergebnis).
  - Regler ändert den effektiven Subventionsbetrag und koppelt den Kaufpreis gegengleich um den nominalen Differenzbetrag. Danach `recalcAndRender()` → Cashflow + KPIs aktualisieren live.
  - Da `kaufpreis` und Subventionswerte bereits Inputs der Engine sind und im `kalkJson` gespeichert werden, landen sie automatisch in Snapshot + PDF. Voraussichtlich **keine Engine-Änderung**, nur Frontend-Slider-Logik + Trade-off-Kopplung.
- **Risiko / Sorgfalt:** Berührt KP, Subvention, Snapshot und PDF gleichzeitig. Deshalb als letzter Block, isoliert. Snapshot-Tests müssen grün bleiben (Beweis, dass keine Formel verändert wurde). Defensive Defaults beim Laden alter Snapshots ohne neue Felder.
- **Betroffen:** `public/app.js` (Regler-UI, Handler, Trade-off-Kopplung, Snapshot-Save), `public/pdf.js` (eingestellter Zustand im PDF), `public/kalkulator.js` (nur falls doch nötig — zu vermeiden), `tests/`.
- **Offen für den Plan (selbst zu entscheiden, nicht blockierend):** Skala des Reglers (% der vereinbarten Subvention vs. absoluter €-Betrag), Verhalten im Paket-Modus (mehrere WE), Interaktion mit dem bestehenden separaten KP-Slider (Konflikt vermeiden).

---

## Reihenfolge & Deploy

1. **Block A** (Chart) — sichtbarster Effekt, geringstes Risiko, kein Engine-/Backend-Eingriff.
2. **Block B** (Rechenblatt-Monatsansicht) — klein, isoliert.
3. **Block C** (Beratene WE) — Frontend + schlanke API-Erweiterung.
4. **Block D** (Subventionsregler) — komplexester, berührt Snapshot + PDF, zuletzt.

Pro Block: `npm run guard` + `npm test` grün → Feature-Branch → Vercel-Preview → am Handy testen → merge auf `main` (= live).

## Verifikation (alle Blöcke)

- `npm test` bleibt grün nach jedem Block. Bleibt es nicht grün, wurde versehentlich Engine-Logik verändert → stoppen und prüfen.
- `npm run guard` (Airtable-Field-IDs) grün, besonders relevant für Block C (Snapshot-Felder).
- Manueller Klick-Test pro Block am Preview (echte WE, z.B. WE 12 Wesseling aus dem Feedback-Screenshot).

## Nicht im Scope (YAGNI)

- Echter XLSX-Export mit Multi-Sheet/Styling.
- Barwert-/NPV-Logik für den Subventionsregler (bewusst 1:1 nominal).
- Live-Lookup umbenannter WE in alten Snapshots.
- Stufen-/Treppen-Chart (verworfen zugunsten der Monatsauflösung).
- Engine-/Formel-Änderungen jeder Art.
