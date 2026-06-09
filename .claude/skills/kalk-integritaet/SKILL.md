---
name: kalk-integritaet
description: Use when in der BB-Kalkulator-App die Rechenlogik geändert wird — also jede Änderung an public/kalkulator.js (recalc, IRR, Cashflow, Steuer, AfA, Subvention, Sensitivität) oder an den Steuersatz-/Snapshot-Werten. Trigger: "Formel ändern", "IRR anpassen", "Cashflow", "Steuersatz", "recalc", "Snapshot-Werte stimmen nicht", "Zahl im PDF falsch".
---

# Kalk-Integrität (BB Kalkulator V2)

## Kernprinzip

Die Engine in `public/kalkulator.js` rechnet mit echtem Kundengeld — ein stiller Fehler hier ist teurer als jeder UI-Bug. Drei Dinge müssen nach **jeder** Engine-Änderung stimmen: die Snapshot-Tests (Schutzlinie), die **Wert-Synchronität** über alle Speicherorte, und die Doku.

## Ablauf nach einer Änderung an `recalc()` & Co.

### 1. Snapshot-Tests fahren — alt vs. neu bewusst entscheiden
```bash
npm test          # bzw. node --test tests/kalk.snapshot.test.js
```
Die Werte sind hand-festgezurrt (24.05.2026, echte WE-Presets: Wesseling WE8, Bruchsal WE1 u.a.) mit Toleranzen (1 Cent €, 1 € gerundet, 0,01 %). Bei Bruch:
- **War die Änderung gewollt?** → neue Werte sind korrekt → Erwartungswerte aktualisieren **mit Begründung im Commit** (welche Formel, warum welcher neue Wert).
- **War sie nicht gewollt?** → Engine-Fehler, fixen statt Test anpassen.
Niemals den Erwartungswert „grün machen", ohne den neuen Wert von Hand nachvollzogen zu haben.

### 2. Wert-Synchronität prüfen (die teure Falle)
Manche Werte existieren an mehreren Orten und müssen identisch bleiben. Insbesondere der **persönliche Steuersatz** (Dezimal, z.B. 0.42):
- `KUNDEN_FIELDS.STEUERSATZ` (Single Source pro Kunde)
- `kalkJson.steuersatz` im Snapshot
- `SNAPSHOT_FIELDS.STEUERSATZ` (Klartext-Spalte fürs Backoffice)
- Quick-Bonität- und SA-JSON
Wenn deine Änderung einen solchen Wert berührt: an allen Orten gleich? Sonst rechnet Reload/PDF/Backoffice auseinander.

### 3. Edge-Cases mitdenken
`tests/edge-cases.test.js` deckt die fragilen Stellen ab: IRR (Newton-Raphson kann divergieren/negativ werden → Bisektions-Fallback muss greifen), 0-Division (kpGesamt-Guard → `recalc` gibt `null`), Subvention mit Mietzuschuss=0. Neue Formel-Pfade → Edge-Case ergänzen.

### 4. Doku nachziehen (Pflicht laut CLAUDE.md)
Jede Formel-Änderung in die Master-Referenz spiegeln:
`../docs/2026-05-26_Master-Referenz_Berechnungslogik.html`
(Container-Ebene, nicht im Repo). Sonst driftet Doku von Code weg — und die Doku ist die Quelle, gegen die Henry/Backoffice argumentieren.

### 5. Commit
Code **und** Doku im selben Commit. Danach Skill `vor-deploy-check`.

## Häufige Fehler

| Fehler | Folge | Fix |
|---|---|---|
| Snapshot blind grün gemacht | echter Rechenfehler geht live | neuen Wert von Hand prüfen |
| Steuersatz nur an 1 Ort geändert | Reload/PDF rechnet anders | alle 4 Orte (s. Schritt 2) |
| Master-Referenz nicht aktualisiert | Doku ≠ Code | im selben Commit |
| Klartext-Snapshot-Feld vergessen | Backoffice sieht alte Basis | `snapshotBodyToFields` `setIf` |

## Red Flags — STOP
- „Ist nur eine kleine Formel-Anpassung" → trotzdem Snapshot + Doku.
- Test bricht, du kennst den neuen erwarteten Wert nicht von Hand → noch nicht verstanden, was du geändert hast.
