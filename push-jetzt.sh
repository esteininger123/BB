#!/bin/bash
# Push-Skript für die Nacht-Iteration (Iter 15-20).
# Ausführen mit:
#   bash ~/Documents/Claude-Cowork/02_BB_Immo/Kalkulations-Vorlage/webapp-v2/push-jetzt.sh
#
# Es committet alle Änderungen, die Claude über Nacht im Mount gemacht hat,
# und pusht zu GitHub. Vercel deployed dann automatisch (~30 Sek).

set -e
cd "$(dirname "$0")"

echo ""
echo "==========================================="
echo "  B&B Kalkulator V2 — Push Iter 15-20"
echo "==========================================="
echo ""

# 1. Status zeigen
echo "→ Aktuelle Änderungen:"
git status --short
echo ""

# 2. Add + Commit
git add -A
git commit -m "Iter 33 — Korrekte Objekt-Tabelle + Projekt-Namen aus Kurzname-Feld, WE 15 Heidelberger in Presets

- Iter 15 (Stabilisierung):
  * airtable.js: normalizeAirtableResponse — Single-Select-Objekte zu name-Strings reduziert.
    Fixt: 'Hallo {Name}' fehlte, Admin-Check session.rolle === 'Admin' funktionierte nicht.
  * kunden.js / wohneinheiten.js / snapshots.js: Response-Format als direktes Array
    (statt {kunden:[...]}); fixt: 'Kunde nach Reload weg'.
  * app.js + pdf.js: Vermögensaufbau Brutto → Netto an KPI-Kachel, Chart, PDF.
  * index.html: ?v=16 Cache-Bust auf JS + CSS.

- Iter 16 (Selbstauskunft auf Hypovision-Standard):
  * Frontend-Form: Persönliche Verhältnisse, Einkommen, Fixkosten, Vermögen,
    Versicherungen, Immobilien 1+2, Verbindlichkeiten (bf1/bf2/kd1/kd2).
  * Verschachtelte Sub-Felder via Dot-Notation (a.immo1.verkehrswert etc.).
  * Persistenz: saJson direkt als Object an Backend (kein doppeltes Stringify).

- Iter 17 (PDFs Bank-tauglich):
  * Investitionsrechnung: Cover + KPIs + Cashflow (10J) + Vermögensaufbau Netto-Tabelle
    + Sparen-vs-Investieren-Tabelle + Bonität (Bank-Sicht) + Annahmen + Disclaimer.
  * Selbstauskunft: 3 Seiten im Hypovision-Layout (Persönlich/Einkommen/Fixkosten,
    Vermögen/Immobilien/Verbindlichkeiten, Bonitäts-Auswertung + Unterschrift).
  * Reservierungs-PDF: B&B-Template (Kaufabsichtserklärung +
    Reservierungsvereinbarung) — Verkäufer-Block, Käufer-Block (Adresse aus SA),
    Objekt-Zeile mit Adresse/WE-Nr/QM/KP/Stellplatz, Reservierungsfrist +30T,
    Unterschriften-Zeilen 2-spaltig.

- Iter 17.5 (Käuferprofile + Multi-WE):
  * Profil-Auto-Detect: erkennt Standard/Premium/Spitze anhand Steuersatz +
    Bonität, oder über _profil-Tag (aus letzter Profil-Auswahl).
  * Bonitäts-Quelle umschaltbar: 'Quick' (Profil-Defaults) vs.
    'Detail' (Selbstauskunft). Bonitäts-KPIs werden gerendert.
  * Multi-WE / Paket-Modus: kalkulator.js recalcPaket() aggregiert mehrere WEs
    mit gemeinsamen Person-Settings. UI-Toggle 'Einzel-WE / Paket' im Kalkulator-Tab.
  * Snapshot-saveSnapshot: kennt Paket-Modus, schreibt 'Paket: WE 1 + WE 2 + ...'.

- Iter 18 (Funktions-Lücken):
  * Snapshot-Load: doppeltes JSON.parse weggeräumt; greift jetzt das vom Backend
    bereits geparste Object direkt.
  * Snapshot speichern: kalkJson als Object an Backend (saubere Round-Trip).
  * Admin-Stats: liefert jetzt totalKunden, byPhase, inBearbeitung, alleKunden
    so wie Frontend erwartet. kundeRecordToBasic-Mapper für alleKunden.
  * Wohneinheiten-Filter: Maklerfirma jetzt via FIND() + ARRAYJOIN(), weil das
    Feld Lookup ist und Trailing-Spaces enthalten kann.
  * loadProjektNames: Fallback auf TABLES.PROJEKT wenn ENV-Var fehlt.

- Iter 19: Bruchsal-WEs sind in Airtable schon angelegt (Maklerfirma B&B Immo
  GmbH, Status Vermarktung), werden ab dem WE-Dropdown im Kalkulator gruppiert
  nach Projekt angeboten.

- Iter 20: End-to-End Code-Review + ÜBERGABE.md."

# 3. Push
echo ""
echo "→ Push zu GitHub..."
git push origin main

echo ""
echo "==========================================="
echo "  ✓ Push erfolgreich"
echo "==========================================="
echo ""
echo "Vercel deployed jetzt automatisch in ca. 30 Sekunden."
echo "Status:  https://vercel.com/dashboard"
echo "App:     https://bb-brown-pi.vercel.app"
echo ""
echo "Bitte einmal mit Cmd+Shift+R (Hard-Reload) öffnen,"
echo "damit der Browser die neue v=16-Version lädt."
echo ""
