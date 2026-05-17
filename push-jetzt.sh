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
echo "  B&B Kalkulator V2 — Push Iter 41.8"
echo "==========================================="
echo ""

# 1. Status zeigen
echo "→ Aktuelle Änderungen:"
git status --short
echo ""

# 2. Add + Commit
git add -A
git commit -m "Iter 41.8 — Gewinn-Zone visuell + Maklerprovision aus KNK entfernt

- Hauptchart 'Vermögensaufbau 10 J.' erweitert um 6. Dataset + Füllung:
  * Gefüllte Gewinn-Zone zwischen Gesamtvermögen (Dataset 2) und EK-Linie
    (Dataset 4) — gold transparent über EK (Gewinn) / rot unter EK (Verlust).
    fill: { target: 4, above: 'rgba(176,138,77,0.30)', below: 'rgba(154,62,51,0.20)' }
  * NEUE Linie '★ Vermögenszuwachs (= Gewinn)' als 6. Dataset (grün dünn,
    pointStyle: rectRot) — macht den absoluten Gewinn-Wert direkt am Chart lesbar
    statt nur als KPI über dem Chart.

- KNK-Formel: Maklerprovision 1,5 % rausgenommen.
  Grund: B&B verkauft direkt an den Kapitalanleger — keine externe Käufer-
  Maklerprovision. Die 1,5 % stammten als Historik aus den alten Excel-Kalku-
  lationen (Henry-Setup mit Makler).
  Neu: knkPct = grEstPct + 1,5 % Notar + 0,5 % Grundbuch.
  Wirkung pro Bundesland:
    BaWü/BW   8,5 %  →  7,0 %
    NRW      10,0 %  →  8,5 %
    Bayern    7,0 %  →  5,5 %
    Hessen    9,5 %  →  8,0 %
  EK-Bedarf (= KNK bei 100 %-Finanzierung) sinkt entsprechend.

- Cache-Bust auf v=53.

---

Iter 41.7 — Layout-Fix Charts + Cashflow-Werte-Block + Eigenkapital-Linie

- LAYOUT-BUG gefixt: Sparen-Card war nicht geschlossen → Snapshot wurde hochgezogen,
  Sparen-Bereich nur linke Spalte sichtbar. Schließendes </div> ergänzt + spar-zins-row
  korrekt INNERHALB der Sparen-Card platziert.

- Cashflow-Werte-Block über dem Chart (drei farbige Karten Jahr 1):
  * Operativer CF (grün positiv / rot negativ)
  * Steuervorteil (gold)
  * CF nach Steuer (grün/rot je nach Vorzeichen)
  Jede Karte zeigt Jahres-Wert + Monatswert + Erklärung.

- Eigenkapital-Linie im Hauptchart (Vermögensaufbau):
  * Konstante horizontale gestrichelte Linie (blau, #2c5282) auf Höhe ekBedarf.
  * Visualisiert: 'das ist was reingesteckt wurde, alles darüber ist Vermögenszuwachs.'
  * Formel-Box erklärt: 'Vermögenszuwachs = Gesamtvermögen − eingesetztes EK.'

- Cache-Bust auf v=52.

---

Iter 41.6 — Charts umgebaut: großer Vermögensaufbau-Graph + 2 kleine darunter + Formeln

- Layout neu:
  * GROSSER Hauptchart oben: 'Vermögensaufbau 10 Jahre' (Höhe 420px).
    4 Linien: Marktwert (grün), Restschuld (rot gestrichelt), Gesamtvermögen
    (gold, dick), kum. CF (grau gestrichelt). Die Fläche zwischen Marktwert
    und Restschuld ist gefüllt — das ist die 'Schere', die sich Jahr für Jahr
    öffnet (= Vermögensaufbau visuell).
  * Darunter 2 kleinere Charts nebeneinander: Cashflow + Sparen vs. Investieren.

- Cashflow-Chart neu:
  * 10 Jahre statt 30.
  * Gestapeltes Bar-Chart: Operativer CF (vor Steuer, grün/rot je nach Vorzeichen)
    + Steuervorteil (gold). Summe = CF nach Steuer.
  * Tooltip zeigt: Operativer CF + Steuervorteil + 'CF nach Steuer' als Footer.

- Erklär-Boxen mit Formel unter jedem Chart:
  * Vermögensaufbau: 'Gesamtvermögen = (Marktwert × Wertsteigerung^n) − Restschuld + kum. Cashflows'
  * Cashflow: 'Operativer CF = Miete − Zinsen − Tilgung − Hausgeld − Verwaltung. CF nach Steuer = + Steuervorteil (AfA × Steuersatz)'
  * Sparen vs. Investieren: 'Nur Sparen = EK × (1 + Zins)^n. Mit Immobilie = Verkaufserlös + kum. CF'

- Cache-Bust auf v=51.

---

Iter 41.5 — Saubere Vermögens-Begriffe: Verkaufserlös, Gesamtvermögen, Vermögenszuwachs

- kalkulator.js: Vermögens-Hierarchie umstrukturiert.
  Bisher: Vermögen brutto = Wert − Restschuld
          Vermögen netto = Brutto − EK + kumCF
  Neu:    Verkaufserlös   = Wert − Restschuld
          Gesamtvermögen  = Verkaufserlös + kumCF
          Vermögenszuwachs = Gesamtvermögen − eingesetztes EK
  vermoegenBrutto10 wird jetzt zu Gesamtvermögen (alter Wert + kumCF).
  vermoegenNetto10 (Vermögenszuwachs) bleibt mathematisch unverändert.

- IRR-Endwert nutzt jetzt explizit 'verkaufserloes' statt vermoegenBrutto,
  um Doppelzählung der CFs zu vermeiden (CFs sind schon einzeln in irrSeries).
  Gleicher Fix in recalcPaket (Paket-Modus).
- Sparen-vs-Investieren-Vergleich nutzt verkaufserloes statt vermoegenBrutto
  (Single + Paket).

- UI-Labels umbenannt:
  * KPI 'Vermögen brutto 10 J.' → 'Gesamtvermögen 10 J.'
  * KPI 'Vermögen netto 10 J.'  → 'Vermögenszuwachs 10 J.'
  * Info-Boxen mit klarer Erklär-Kaskade.
  * Story-Section 'Exit nach 10 J.' zeigt jetzt die volle Kaskade transparent:
    Marktwert → Restschuld → Verkaufserlös → +kumCF → =Gesamtvermögen
    → −EK → =Vermögenszuwachs.

- PDF Investrechnung: Header-KPIs umbenannt + Vermögensaufbau-Tabelle
  bekommt zusätzliche Spalten Verkaufserlös, Gesamtvermögen, Zuwachs.

- Cache-Bust auf v=50.

---

Iter 41.4 — AfA-Bemessung Bug-Fix (Gebäude-Anteil wurde nicht abgezogen in Anzeige) + Excel-Daten Lahr/Karlsruhe

- BUG-FIX kalkulator.js: afaBemessungBetrag jetzt sauber = kpGesamt × gebaeudeAnteil.
  Bisher war afaBemessungBetrag = kpGesamt (voller Kaufpreis), und afaJahr rechnete
  doppelt mit × gebaeudeAnteil. Endwerte stimmten, aber Display-Wert AfA-Basis
  war fälschlich 173.800 € statt 139.040 € (Beispiel Wesseling WE 5).
- UI: AfA-Basis-Label zeigt jetzt explizit '× Gebäude-Anteil 80 %' im Klartext.
- UI: AfA-Satz mit 2 Nachkommastellen (3,45 % statt 3,5 %).

- Excel-Daten Lahr WE 6: aus Kalk_Lahr_WHG6.xlsx auf Status Aktiv gepflegt
  (Hausgeld 62,70, Hausverwaltung 41,65, AfA 4,5 %, Mietzuschuss 0, Wertsteig. 3 %).

- Excel-Daten Karlsruhe WE 7: aus KA Heinstr. 6 REV01 — Vermietungsstatus 'Leer
  seit 09.03.2025', Soll-Miete 900 €/Mo, letzte Mietsteigerung 2025-03-09.
  Hausgeld/Hausverwaltung pro WE müssen noch ermittelt werden (Cockpit auf
  Hausebene).

- 5 Cockpit-Projekte (Haueneberstein, Offenburg August-Hund, Sandweier,
  Limeshain, Pfaffenhofen) bleiben auf Entwurf — Henry pflegt im Wochenend-Auftrag.

- Cache-Bust auf v=49.

---

Iter 41.3 — Grunderwerbsteuer + Gebäude-Anteil + Hausgeld-Inflation als pflegbare Felder

- Drei neue Felder in Kalkulations-Stammdaten:
  * 'Grunderwerbsteuer' (Percent) — pro Bundesland: BaWü 5 %, Bayern 3,5 %,
    NRW 6,5 %, Hessen 6 %. Wird in der Kalkulation für KNK statt hardcoded 5 %
    verwendet.
  * 'Gebäude-Anteil' (Percent) — für AfA-Bemessung, Default 80 %.
  * 'Hausgeld-Inflation p.a.' (Percent) — Default 2 %.

- Werte initial befüllt für alle 43 WEs anhand PLZ → Bundesland:
  * 76xxx / 77xxx / 79xxx → BaWü 5,0 %
  * 50xxx (Wesseling) → NRW 6,5 %
  * 63xxx (Limeshain) → Hessen 6,0 %
  * 85xxx (Pfaffenhofen) → Bayern 3,5 %
  Gebäude-Anteil 80 % + HG-Inflation 2 % als Default für alle —
  Henry/Steuerberater pflegt individuell nach.

- Kalkulator-Logik:
  * recalc() in kalkulator.js: KNK-Berechnung jetzt
    grEstPct + 1,5 % Notar + 0,5 % Grundbuch + 1,5 % Provision
    statt hardcoded 8,5 %. Fallback 5 % (BaWü) bei fehlenden Stammdaten.
  * Wesseling-WEs: bisher 8,5 % KNK → ab jetzt 10 % (korrekt).
  * Pfaffenhofen-WEs: bisher 8,5 % → ab jetzt 7 %.

- Frontend: loadWeIntoKalk übernimmt grEstPct, gebaeudeAnteil, hgInflation
  aus Airtable in state.kalk.

- Admin-Audit-Tabelle erweitert um 3 Spalten: Geb.-Anteil, HG-Inflation, GrESt.

- Cache-Bust auf v=48.

---

Iter 41.2 — Stammdaten-Audit + einheitliche Bezeichnungen + Excel-Daten live aus Airtable

- Bezeichnung aller 43 WEs einheitlich auf Format 'WE: X, Lage, Straße, PLZ Ort'
  (= identisch mit WE-Titel aus Wohneinheit-Tabelle).

- 12 Excel-WEs (Heidelberger + Wesseling) auf Status=Aktiv geschaltet:
  Heidelberger 1, 2, 4, 6, 7, 8, 12, 15 + Wesseling 3, 4, 5, 8.
  App liest jetzt LIVE aus Airtable, nicht mehr aus we-stammdaten.js.
  WE 14 Heidelberger bleibt Entwurf (Excel fehlt, Henry pflegt nach).

- Frontend public/app.js loadWeIntoKalk:
  * KEIN Fallback mehr auf we-stammdaten.js. Bei Status != Aktiv oder
    keinen Datensatz: state.kalk wird mit getDefaults() initialisiert
    (Wertsteigerung 3 %, AfA 2 %, Hausgeld 1 €/m² etc.).
  * Stammdaten-Quelle-Indikator: 'airtable-aktiv' / 'airtable-entwurf-defaults'
    / 'airtable-fehlt-defaults'.

- Backend api/stammdaten/index.js (neu):
  * GET /api/stammdaten — alle Stammdaten-Records (Admin-only) inkl.
    WE-Basis + Stellplatz-Aggregat + Mietvertrag-Info pro WE.
  * Für die Admin-Audit-Ansicht.

- Admin-Frontend: Stammdaten-Audit-Karte ersetzt die alte
  Wohneinheiten-Stammdaten-Karte. Zeigt pro WE:
  Status, Vermietungs-Status, Kaufpreis, m², Kaltmiete, Stellplatz-KP+Miete,
  Hausgeld+Rücklage, Hausverwaltung, Mietzuschuss+Laufzeit, AfA-Gutachten,
  Wertsteigerung, Vermietungs-Modus+Kappungsgrenze, Letzte Mietsteigerung
  (mit Quelle), Quelle/Notiz. Lücken werden rot markiert. Gruppiert nach
  Projekt. Statistik oben: Aktiv / Entwurf / fehlt.

- Cache-Bust auf v=47.

---

Iter 41.1 — Erweiterung: 15 fehlende WEs nachgepflegt + Letzte Mietsteigerung + Vermietungs-Status

- 15 neue WEs in Kalkulations-Stammdaten (alle Status Entwurf, leer für Henry):
  Haueneberstein (6 WEs Am Mühlwäldle 5), Offenburg (7 WEs August-Hund-Str. 4),
  Heidelberger Bruchsal (WE 13 + WE 16 nachgepflegt).
  Gesamt jetzt: 43 WEs in Vermarktung in der Kalkulations-Tabelle.

- Neues Feld in Kalkulations-Stammdaten: 'Letzte Mietsteigerung' (Date, europäisch).
  Henry/Schenki kann pflegen; wenn leer, fällt Backend zurück auf den jüngsten
  Mietvertrag-GUELTIG_AB oder VERTRAGSBEGINN.

- Backend api/stammdaten/[weId].js erweitert:
  * loadMietvertragInfoForWE: aggregiert Stellplatzmiete UND ermittelt
    'vermietet/leer' UND letzte Mietsteigerung über alle verlinkten Verträge.
  * Response um 'vermietung'-Block ergänzt:
    { status: 'vermietet'|'leer', vertragVorhanden, letzteMietsteigerung,
      letzteMietsteigerungQuelle }
  * PUT akzeptiert jetzt 'letzteMietsteigerung' als Date-String.

- Frontend public/app.js:
  * loadWeIntoKalk speichert state.kalk._vermietungsStatus +
    _letzteMietsteigerung. Berechnet state.kalk.monateSeitMieterhoehung
    automatisch aus Datum (für recalc).
  * UI: 'vermietet' (grünes Badge) / 'leer' (rotes Badge) direkt am
    aktiven WE im Kalkulator + 'letzte Mietsteig.: DD.MM.YYYY'.

- Henry-Anleitung aktualisiert (31 leere WEs statt 16, plus die 15 neuen).
- Cache-Bust auf v=46.

---

Hotfix Iter 41 — Doppeltes 'async'-Keyword vor loadWeIntoKalk entfernt (verursachte weißen Screen).

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
echo "damit der Browser die neue v=53-Version lädt."
echo ""
