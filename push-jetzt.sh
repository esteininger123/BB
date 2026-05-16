#!/bin/bash
# Push-Skript für die aktuelle Iteration (Iter 41 — Airtable-Stammdaten-Migration).
# Ausführen mit:
#   bash ~/Documents/Claude-Cowork/02_BB_Immo/Kalkulations-Vorlage/webapp-v2/push-jetzt.sh
#
# Es committet alle Änderungen, die Claude im Mount gemacht hat,
# und pusht zu GitHub. Vercel deployed dann automatisch (~30 Sek).

set -e
cd "$(dirname "$0")"

echo ""
echo "==========================================="
echo "  B&B Kalkulator V2 — Push Iter 41"
echo "==========================================="
echo ""

# 1. Status zeigen
echo "→ Aktuelle Änderungen:"
git status --short
echo ""

# 2. Add + Commit
git add -A
git commit -m "Iter 41-Hotfix — Doppeltes 'async'-Keyword vor loadWeIntoKalk entfernt (verursachte weißen Screen). Cache-Bust v=45.

---

Vorherige Iter-41-Beschreibung:
Iter 41 — Airtable als Single Source für Kalkulations-Stammdaten

- Iter 41a — Stellplatz-Tabelle erweitert:
  * Neues Currency-Feld 'Kaufpreis' in tblCfcVP5ipG91yHg.
  * Bestehende Spalte 'Mietkosten Stellplatz' bleibt als Übergang stehen
    (laut SOP-E §6.3 wird sie zugunsten der Mietvertrag-Spalte 'Stellplatzmiete'
    migriert — Schenki bereinigt im Tagesgeschäft).

- Iter 41b — Neue Airtable-Tabelle 'Kalkulations-Stammdaten':
  * tblz5KNtzkLSLHHFo mit 15 Feldern: Bezeichnung, Wohneinheit-Link, Status
    (Entwurf/Aktiv/Archiviert), Hausverwaltung, Hausgeld+Rücklage,
    Mietverwaltung Default, Mietzuschuss, Mietzuschuss-Laufzeit, AfA-Gutachten,
    Wertsteigerung p.a., Vermietungs-Modus, Kappungsgrenze, Indexmiete,
    Notizen, Quelle.
  * Owner Henry (Kaufpreise + Kalkulations-Stammdaten) +
    Schenki (Mieten + Mietverträge).

- Iter 41c — 28 WEs initial befüllt:
  * 12 WEs mit Excel-Werten aus we-stammdaten.js als Status=Entwurf
    (Heidelberger 1,2,4,6,7,8,12,15 + Wesseling 3,4,5,8).
  * 1 WE leer (Heidelberger 14, Excel fehlt) — Henry pflegt nach.
  * 15 WEs leer für Henry-Pflege (Sandweier, Limeshain, Waldkirch,
    Karlsruhe, Pfaffenhofen, Lahr, Sinzheim).
  * Status durchgängig Entwurf → App nutzt noch Excel-Fallback; Henry
    schaltet pro WE auf Aktiv wenn fertig.

- Iter 41e — Neuer Backend-Endpoint api/stammdaten/[weId].js:
  * GET: kombinierte Daten WE + Stellplätze (Aggregat KP + Miete aus
    altem Stellplatz-Feld ODER aus aktivem Mietvertrag mit Vorrang) +
    aktive Kalkulations-Stammdaten-Zeile.
  * PUT: Update oder Create der Kalk-Stammdaten via App (nur Admin).
    Beim Setzen auf Aktiv wird ein anderer Aktiv-Datensatz für die
    gleiche WE auf Archiviert gesetzt (Doppel-Aktiv-Schutz).
  * Quelle wird automatisch gesetzt auf 'App-Edit {email} {datum}'.

- Iter 41f — Projekt-Filter im Wohneinheiten-Endpoint entfernt:
  * Heidelberger+Wesseling-Substring-Filter raus.
  * App zeigt jetzt alle B&B-Projekte in Status=Vermarktung.
  * Projekt-Pretty-Mapping erweitert um Sandweier, Limeshain, Waldkirch,
    Karlsruhe, Pfaffenhofen, Lahr, Sinzheim.

- Iter 41g — Frontend public/app.js loadWeIntoKalk:
  * Asynchroner Lade-Pfad: ruft /api/stammdaten/:weId, kombiniert
    Wohneinheit + Stellplatz-Aggregat + Kalk-Stammdaten.
  * Wenn Status=Aktiv in Airtable: überschreibt Excel-Fallback.
  * Wenn Entwurf/null: nutzt we-stammdaten.js als Fallback.
  * Mieterhöhungs-Logik abgeleitet aus vermietungsModus + kappungsgrenze
    (Bestand 15/20 % alle 3 J → mietsteigerungsModus=sprung;
    Neuvermietung → mietsteigerungsModus=index mit indexmiete).
  * Stellplatz-Anzeige: separate Info-Box unter WE-Selektor mit
    Anzahl, KP-Summe und Miete-Quelle.
  * Stammdaten-Quelle transparent angezeigt ('airtable-aktiv' /
    'excel-fallback' / 'we-basics' / 'excel-fallback-airtable-entwurf').

- tables.js erweitert um STELLPLATZ_FIELDS, MIETVERTRAG_FIELDS,
  MIETER_FIELDS, KALK_STAMMDATEN_FIELDS und Status-Konstanten.

- SOP-E v1.0 → v1.1: Verantwortungs-Split Henry/Schenki dokumentiert.
- Neue Anleitung für Henry: _Cockpit/anleitungen/2026-05-15_Henry-Auftrag-Kalkulations-Stammdaten.md
- Cockpit aktualisiert.

- Cache-Bust auf v=44."

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
echo "damit der Browser die neue v=45-Version lädt."
echo ""
