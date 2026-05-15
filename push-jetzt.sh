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

- Cache-Bust auf v=37.

- Iter 40.1 — Admin-Erweiterung:
  * Bugfix: Kunden-Name in 'Alle Kunden'-Tabelle war leer, weil /api/admin/stats
    das NAME-Feld nicht aus Airtable abgefragt hat. Jetzt: name + vorname +
    nachname + email werden geholt, Frontend nutzt name → 'Vorname Nachname'
    → email → 'Kunde {id}' als Fallback-Kaskade.
  * Vertriebler-Tabelle zeigt jetzt: Kunden gesamt, In Bearbeitung, Reserviert,
    Notar-Termin, Beurkundet (pro Vertriebler + Summen-Zeile).
  * Neuer WE-Stammdaten-Block in der Admin-Ansicht: read-only Liste aller
    WEs aus Airtable (gruppiert nach Projekt), inkl. Refresh-Button zum
    Neuladen direkt aus Airtable.

- Iter 40.2 — WE-Stammdaten aus 12 Excel-Kalkulationen:
  * Neue Datei public/we-stammdaten.js — Single Source of Truth pro WE
    (Heidelberger 1, 2, 4, 6, 7, 8, 12, 15 + Wesseling 3, 4, 5, 8).
  * Pro WE: Kaufpreis, qm, Stellplatz-KP, Kaltmiete Jahr 1, Hausgeld+Rücklage,
    Hausverwaltung, AfA-Gutachten %, Wertsteigerung % p.a., Mietzuschuss €/Mo
    + Laufzeit, 30-Jahres-Mietstaffel, Marktmiete-Referenz.
  * Mapper am Ende: überträgt Stammdaten in window.WE_PRESETS_BY_RECID, das
    die App in app.js loadWeIntoKalk() schon liest → zero-touch-Integration.
  * Heidelberger WE 14 hat noch keine Excel — auf der Diff-Liste, bei Domi
    nachfragen.
  * Diff-Report: _Cockpit/status/2026-05-15_excel-vs-airtable-diff.md.

- Iter 40.3 — Individueller Tagesgeldzins:
  * Neuer Slider 'Tagesgeldzins p.a. (Sparen-Vergleich)' in Sektion 5 (Einzel)
    und Sektion 2 (Paket), Range 0-6 %, Step 0,05 %, Default 2,5 %.
  * Schreibt in state.kalk.sparZins → fließt in computeBonitaetDetailed
    und Sparen-vs-Investieren-Hochrechnung ein.
  * Story-Sektion 07 + PDF-Sparen-vs-Investieren-Block zeigen jetzt den
    aktiv gewählten Zins transparent (z.B. '2,50 % p.a.', '3,50 % p.a.').
  * Cache-Bust auf v=38."

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
