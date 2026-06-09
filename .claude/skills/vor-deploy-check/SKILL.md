---
name: vor-deploy-check
description: Use when in der BB-Kalkulator-App vor einem git push / Deploy auf main steht — also bevor eine Änderung live geht. Trigger: "deployen", "pushen", "live stellen", "fertig, kann raus", "commit und push", oder direkt nach einer Code-Änderung die in Produktion soll. Auch wenn unklar ist, was an dieser Änderung getestet werden muss.
---

# Vor-Deploy-Check (BB Kalkulator V2)

## Kernprinzip

`main` geht **direkt live** (Vercel Auto-Deploy), und die App hat keine Browser-Tests in der Pipeline — die einzige echte Prüfung vor echten Vertrieblern ist dieser Check. Niemals pushen ohne grünen Syntax-Check + grüne Tests + bewusste Klick-Liste für genau das, was dieser Commit anfasst.

**REQUIRED BACKGROUND:** superpowers:verification-before-completion — Beweise vor Behauptungen. Dieser Skill ist die BB-konkrete Ausführung davon.

## Ablauf

### 0. Schema-Guard (Airtable-Field-IDs)
```bash
npm run guard     # prüft alle Field-IDs aus tables.js gegen die echte Base
```
Verwaiste ID? → erst fixen (Konstante aus `tables.js` entfernen), sonst droht 422 für die ganze Tabelle. Braucht Token mit Scope `schema.bases:read`.

### 1. Syntax-Check Frontend (ohne Browser)
JavaScriptCore aus dem System-Framework, Befehle stehen in `.claude/settings.local.json` (Allow-Liste, laufen ohne Nachfrage). Für `public/app.js` und `public/pdf.js` jeweils den hinterlegten `jsc -e '… load("public/…") …'`-Befehl laufen lassen. Muss `OK syntax+load` ausgeben. Bricht er → Syntaxfehler, **nicht pushen**.

### 2. Tests
```bash
npm test          # node --test tests/*.test.js
```
Alle grün, besonders `tests/kalk.snapshot.test.js`. Schlägt ein Snapshot fehl, weil du die Rechenlogik bewusst geändert hast → **nicht blind den Erwartungswert anpassen**, sondern erst Skill `kalk-integritaet`.

### 3. Klick-Liste aus dem Diff bauen
`git diff --name-only` ansehen und pro berührter Datei die zu klickenden Fälle ableiten:

| Berührt | Auf der Live-Seite prüfen |
|---|---|
| `public/kalkulator.js` | Rechenblatt: Cashflow J1, EK-Bedarf, IRR plausibel; PDF-Zahlen identisch |
| `public/pdf.js` / `styles.css` @media print | Alle 3 PDFs (Investitionsrechnung, Reservierung, Selbstauskunft) drucken: Seitenumbrüche, keine zerrissene Tabellenzeile, kein überschriebener Footer |
| `api/kunden*.js` / `mappers.js` | Kunde anlegen/öffnen/speichern, Felder bleiben nach Reload |
| `api/snapshots.js` | Snapshot speichern → neu laden → Werte identisch; Backoffice-Klartext-Spalten gefüllt |
| `api/auth/*` | Login + Logout, falscher User abgewiesen |
| `public/app.js` (State) | Betroffene View + View-Wechsel; `window.state` bleibt erhalten |

### 4. Wiederkehrende Fallen (immer kurz gegenchecken)
- Field-ID statt -Name angefasst? (sonst Skill `airtable-feld-binden`)
- State korrekt als `window.state` exportiert? (FS-2f-Bug: Wunsch-Profil wurde sonst gelöscht)
- Bei PDF: kein `position:fixed`-Footer (überschreibt letzte Zeile)
- Keine `localStorage`/`sessionStorage` für Session-Daten (Auth = httpOnly Cookie)

### 5. Erst dann
```bash
git add . && git commit -m "..." && git push
```
Danach Vercel-Deploy abwarten (~30–60 s) und die wichtigste Route der Klick-Liste 1× live prüfen.

## Red Flags — STOP, nicht pushen
- „Tests sind eh grün geblieben" obwohl du die Engine geändert hast → erst prüfen warum sie nicht brachen.
- „Klick-Test mach ich nachher am Handy" → die eine Route aus der Liste **jetzt** prüfen.
- Snapshot-Erwartungswert angepasst, ohne zu wissen warum er sich änderte.
