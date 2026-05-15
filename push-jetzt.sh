#!/bin/bash
# Push-Skript für die aktuelle Iteration (Iter 40).
# Ausführen mit:
#   bash ~/Documents/Claude-Cowork/02_BB_Immo/Kalkulations-Vorlage/webapp-v2/push-jetzt.sh
#
# Es committet alle Änderungen, die Claude über Nacht im Mount gemacht hat,
# und pusht zu GitHub. Vercel deployed dann automatisch (~30 Sek).

set -e
cd "$(dirname "$0")"

echo ""
echo "==========================================="
echo "  B&B Kalkulator V2 — Push Iter 40"
echo "==========================================="
echo ""

# 1. Status zeigen
echo "→ Aktuelle Änderungen:"
git status --short
echo ""

# 2. Add + Commit
git add -A
git commit -m "Iter 40 — Bonität-Detail komplett überarbeitet + SA-Auswertung live + Hypovision-PDF mit B&B-Branding form-fillable + Datenschutz-Texte

- Bonität-Detail-Logik (kalkulator.js):
  * computeBonitaetDetailed() liefert jetzt sauber: liquidesVermoegen,
    immobilienVermoegen, gesamtVermoegen, ueberschussMo.
  * Klarere Trennung: Liquide Assets (Bank-Sicht, einsetzbar für neue Imm.)
    vs. Bestandsimmobilien (im Beleihungsauslauf gebunden, NICHT einsetzbar).
  * Backward-compat: freiesVermoegen = liquidesVermoegen.

- SA-Auswertung live (app.js):
  * Neuer saAuswertungHtml()-Block am Ende der Selbstauskunft-Form.
  * Drei KPI-Boxen: Anrechenbarer Überschuss, Gesamtvermögen,
    'Einsetzbar für Immobilie' (nur liquide — wichtigste Bank-Kennzahl).
  * Aufschlüsselung im Detail-Akkordeon (Einnahmen/Ausgaben/Vermögen).
  * Live-Recalc bei jedem input-Event, ohne Server-Roundtrip.

- Selbstauskunft-Felder (app.js):
  * Immo1/Immo2: Baujahr und Erwerbsjahr in 2 getrennte Felder.

- SA-PDF Hypovision-Layout mit B&B-Branding (pdf.js):
  * Form-fillable: alle Eingabe-Zellen rendern als <input> mit dotted
    Unterlinie wenn leer — Kunde kann am Bildschirm ausfüllen oder
    auf Papier eintragen.
  * Filled cells: Wert in fetter Schrift (sa-fld-filled).
  * Checkboxen mit ☑/☐, gefärbtes Häkchen wenn aktiv.
  * Baujahr + Erwerbsjahr getrennt.
  * Versicherungs-Block immer sichtbar (auch leer).
  * NEU Seite 4: Datenschutz I. Darlehensvermittlung, II. SCHUFA/Creditreform,
    III. Finanzierungsanfrage-DSGVO.
  * NEU Seite 5: IV. Steuer-ID-Mitwirkungspflicht, V. Grundbuch-Abrufverfahren,
    VI. Vollständigkeits-/Wahrheitserklärung + Unterschriften.

- Styles (styles.css):
  * .sa-fld + input.sa-fld für form-fillable Look.
  * .sa-legal + .legal-h/.legal-p für die Datenschutz-Seiten.
  * .sa-auswertung-card + Aufschluss-Tabellen.

- Cache-Bust auf v=37."

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
echo "damit der Browser die neue v=37-Version lädt."
echo ""
