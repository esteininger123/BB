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
echo "  B&B Kalkulator V2 — Push Iter 41.15"
echo "==========================================="
echo ""

# 1. Status zeigen
echo "→ Aktuelle Änderungen:"
git status --short
echo ""

# 2. Add + Commit
git add -A
git commit -m "Iter 41.15 — Audit-Fixes vor Vertriebs-Live-Schaltung (5 Bugs)

Audit-Bericht: _Cockpit/status/2026-05-18_Kalkulator-Audit-Bericht.md
15 Inkonsistenzen identifiziert. Diese Iteration fixt die 5 wichtigsten.

#1 [KRITISCH] Stellplatz sauber zerlegen
- app.js loadWeIntoKalk: state.kalk.kaufpreis enthält jetzt nur WE-Kaufpreis
  (vorher: WE + Stellplatz aggregiert). state.kalk.stellplatzKp enthält den
  Garage/Stellplatz-Kaufpreis separat. Analog state.kalk.kaltmiete (nur WE)
  und state.kalk.stellplatzMiete (nur Stellplatz).
- Behebt auch automatisch:
  * Reservierungs-PDF zeigt Garage wieder (vorher fehlte sie weil spKp=0)
  * Stellplatzmiete wächst mit Inflation (3 %) statt Wohnungskappung (15 %).
    Nachrechnung Wesseling WE 5 Jahr 10: ca. 1.500 € weniger ausgewiesene
    Mieteinnahmen über 10 J vs. App-Stand vorher (= korrekt jetzt).
  * Markteinkauf-Vorteil rechnet mit Wohnungs-Kaufpreis/qm statt Aggregat.

#3 [KRITISCH] Investrechnungs-PDF zeigt 2-Phasen-Subv
- pdf.js: Mietsubvention wird jetzt als Phase 1 + Phase 2 + Gesamt-Summe
  ausgewiesen (vorher nur gewichteter Durchschnitt × Gesamt-Monate).

#5 [MITTEL] Slider-Verstellung bei 2-Phasen-Subv reaktiviert manuellen Modus
- app.js bindKalkInputs: wenn subventionMo oder subventionMonate manuell
  verstellt werden und subventionPhasen[] gesetzt ist → Phasen leeren,
  Quelle auf 'manuell-slider'. Slider hat ab jetzt direkte Wirkung statt
  ignoriert zu werden.

#7 [MITTEL] EK-Bedarf Info-Text dynamisch
- KPI-Info zeigt jetzt tatsächliche KNK-% aus dem Bundesland statt
  pauschal '8,5 %'.

#9 [UX] Cashflow-Story zeigt Miete aufgeschlüsselt
- Mieteinnahmen Jahr 1: Kaltmiete Wohnung + Stellplatzmiete + Subvention
  separat ausgewiesen, plus Summe. Subv bei 2-Phasen als 'Phase 1' markiert.

- Cache-Bust auf v=60.

Restliche 10 Inkonsistenzen siehe Audit-Bericht für nächste Iterationen.

---

Iter 41.14 — Projekt-Mapping komplett aktualisiert (32 Codes)

- api/wohneinheiten.js PROJEKT_PRETTY-Mapping abgeglichen mit Airtable
  PROJEKT_HEAD-Tabelle. Vorher waren Codes wie 'KARL_RUMM6' oder
  'LAHR_GÄRT20' als Raw-Code im Projekt-Dropdown sichtbar.
  Alle 32 Projekt-Codes aus Airtable jetzt mit Pretty-Name gemappt.
  Bisheriges Mapping hatte 4 falsche Codes (BAD_NORDRING_10, LIM_ALTENS_5,
  WALDK_THEOD, KA_HEIN_6, LAHR_GAERTN_20, SINZ_KORNBL_7) und nur
  Heidelberger + Wesseling stimmten.

- Fallback-Logik: bei unbekanntem Code wird Stadt-Präfix transformiert
  (z.B. neue Codes mit 'KARL_*' werden automatisch zu 'Karlsruhe, ...').
  Damit ist die App vor unerwarteten neuen Codes robust.

- Cache-Bust auf v=59.

---

Iter 41.13 — Vertragsbeginn-Priorität + Auto-Entwurf-Automation live + SOP-E v1.3

- api/stammdaten/[weId].js: in loadMietvertragInfoForWE Priorität von
  GUELTIG_AB ('Anpassung gültig ab') auf VERTRAGSBEGINN umgedreht.
  Grund: Stichprobe 18.05.2026 zeigt 97,9 % Pflegequote bei Vertragsbeginn
  vs. nur 58 % bei Anpassung gültig ab. Bei jeder Erhöhung wird laut SOP-E
  §3.3 ein neuer Vertragsdatensatz mit entsprechendem Vertragsbeginn
  angelegt — das ist das verlässliche Signal.

- Quellen-Label in der App-Response umbenannt:
  'mietvertrag' → 'mietvertrag-vertragsbeginn'.

- Airtable-Automation 'Auto-Entwurf — Stammdaten geändert' (Iter 41.9)
  erweitert: jetzt 16 watched fields, inkl. zwei Lookup-Felder, die
  Änderungen aus anderen Tabellen propagieren:
  * 'Verkaufspreis (geplant) (from Wohneinheit)' — Lookup auf
    WE.Kaufpreis. Fängt Kaufpreis-Änderungen auf der Wohneinheit-Tabelle ab.
  * 'Vertragsbeginn (from Mietvertrag) (from Wohneinheit)' — Rollup
    MAX(Vertragsbeginn) über alle verlinkten Mietverträge, dann Lookup
    auf Kalk-Stammdaten. Fängt neue/geänderte Mietverträge ab.
  Mit nur EINER Automation decken wir alle drei Eskalations-Pfade ab
  (Stammdaten direkt, WE-Kaufpreis, Mietvertrag-Änderungen).

- SOP-E v1.3:
  * §3.1 um Vertragsart 'Modernisierungserhöhung' ergänzt (existierte
    de facto im Bestand, war in SOP nicht dokumentiert — 3 Records in
    Stichprobe).
  * Pflichtfeld-Hinweis Vertragsbeginn + Backup-Hinweis Anpassung-gültig-ab.
  * Versionsgeschichte v1.3 dokumentiert.

- SOP-Cockpit aktualisiert: SOP-E auf v1.3, Verteilungs-Punkt offen.

- Cache-Bust auf v=58.

---

Iter 41.12 — Staffelmiete LINEAR (statt exponentiell) + Airtable-Feld umbenannt

- kalkulator.js: neuer Mietsteigerungs-Modus 'staffel' eingeführt.
  Logik: Startmiete × (1 + n × %)  ← LINEAR
  (statt vorher exponentiell wie 'index' (1+%)^n.)
  Beispiel 500 € × 3 % linear: J1=500, J2=515, J3=530, J4=545, J5=560, J6=575.
  Bestand (Modus 'sprung') und Altverträge (Modus 'index') bleiben unverändert
  exponentiell wie bisher.

- app.js loadWeIntoKalk: Bei Vermietungs-Modus 'Neuvermietung' wird jetzt
  'staffel' (linear) gewählt statt 'index' (exponentiell). Default 3 %, Override
  über Airtable-Feld 'Staffelmiete %'.

- Airtable: Feld 'Indexmiete' (fldFlwdAP4xQ2muO5) umbenannt zu 'Staffelmiete %'.
  Beschreibung aktualisiert: lineare Berechnung, Default 3 %, keine Index-
  Verträge im Bestand.

- Airtable: Beschreibung des Single-Select-Felds 'Vermietungs-Modus' aktuali-
  siert. Die Option 'Neuvermietung (Indexmiete)' kann manuell in Airtable
  umbenannt werden zu 'Neuvermietung' oder 'Neuvermietung (Staffelmiete)' —
  die App akzeptiert alle Strings die 'neuvermietung' enthalten.

- SOP-E §3.6 präzisiert: Staffel = lineare Erhöhung (festes Euro-Plus pro
  Jahr), nicht exponentiell. Beispiel mit konkreten Jahreswerten. Hinweis
  dass es keine Index-Altverträge gibt.

- Cache-Bust auf v=57.

---

Iter 41.11 — Neuvermietung Staffel 3 % p.a. + SOP-E v1.2 Pflege-Disziplin

- app.js loadWeIntoKalk: Bei Vermietungs-Modus = 'Neuvermietung*' wird ab jetzt
  3 % p.a. (Staffelmiete) als Default genutzt, NICHT mehr 2 % Indexmiete.
  Wenn das Stammdaten-Feld 'Indexmiete' explizit > 0 gesetzt ist (Altvertrag),
  wird dieser Wert weiter respektiert.

- Hintergrund: Edgar-Beschluss 18.05.2026 — für alle künftigen Neuvermietungen
  werden Staffelmietverträge mit 3 % jährlicher Erhöhung abgeschlossen, keine
  Indexmieten mehr. Begründung: Staffel = planbare Kalkulation, Index
  schwankt.

- SOP-E auf v1.2 angehoben:
  * §1 Henry als 'Owner Kalkulation' präzisiert (zuständig für Miete bei
    Verkauf, Marktmiete, Marktpreis IS+HD, Letzte Mietsteigerung).
  * Trennschärfe 'Letzte Mietsteigerung': Schenki im Mietvertrag, Henry in
    Kalkulations-Stammdaten — Henry prüft, ob Schenkis Eintrag durch Beleg
    gedeckt ist.
  * Neues §3.5 Beleg-Pflicht für Mieterhöhungen: schriftliche Bestätigung,
    Übernahme beim Kauf, Staffel-Stufe oder Mietspiegel-Zustellnachweis.
    Wenn kein Beleg → Notiz im Mieter-Datensatz, aber nicht in Mietvertrag.
  * Neues §3.6 Policy Neuvermietung = Staffel 3 % p.a. — Indexmieten werden
    bei Neuvermietungen ab 18.05.2026 nicht mehr abgeschlossen. Altbestand
    läuft weiter.
  * §8 Schnittstelle Kalkulator komplett auf Iter 41.11 aktualisiert
    (2-Phasen-Subv, Markt-Schnitt, Aktiv-Filter, Stellplatz/Garage,
    Auto-Entwurf bei Änderungen).

- SOP-Cockpit aktualisiert: SOP-E auf v1.2, Verteilungs-Punkt offen
  (v1.1 wurde nie verteilt, v1.2 enthält den vollen Stand).

- Cache-Bust auf v=56.

---

Iter 41.10 — Mietsubvention 2-Phasen-Modell + Cap qm-skaliert

- Neues Feld 'Marktmiete' (€/Mo) in Kalkulations-Stammdaten (fldnrgRONiWWsSxZb).
  Henry pflegt; deckelt die Subvention auf den rechtl. Erhöhungsspielraum.

- Mietsubvention komplett neu modelliert (computeAutoSubvention in
  api/stammdaten/[weId].js):
  Käufer sieht ab Tag 1 die End-Miete = MbV + 2 Kappung-Stufen, konstant
  über bis zu 6 Jahre. B&B legt 6 Jahre lang die Differenz drauf.

  * Phase 1 (Mo 0 bis 36 − verstrichene-Mo-seit-letzter-Erhöhung):
    B&B zahlt vollen Aufschlag X.
  * Phase 2 (36 Mo, beginnt nach P1): Mieter erhöht legal um 1 Kappung,
    B&B zahlt nur noch (X − MbV × Kapp).

- Markt-Deckelung: X kann max. (Marktmiete − MbV) sein. Wenn MbV ≥ Markt
  → keine Subv möglich.

- 10-%-Schwelle: Phase 2 entfällt, wenn nach Phase 1 die Käufer-Miete
  schon ≤ 10 % unter Marktmiete liegt (kein Erhöhungsspielraum mehr).

- Cap = max(5.000 €, qm × 150 €/qm). Wenn rechnerisch (P1+P2) > Cap →
  Käufer-Aufschlag X wird reduziert, sodass Summe = Cap. Beide Phasen
  laufen weiter (Laufzeit bleibt), Käufer-Miete bleibt 6 Jahre konstant,
  nur niedriger als ideal.

- Maximal 2 Erhöhungsstufen, nie 3 — auch wenn Sperrfrist lange vorbei.

- Manueller Mietzuschuss in Stammdaten hat Vorrang (1-Phase-Override).

- Kalkulator-recalc verarbeitet jetzt subventionPhasen[] korrekt
  (Monatsweise Aggregation pro Jahr aus Array von Phasen).

- UI Cashflow-Block zeigt:
  * Phase 1 Subv/Mo × Mo
  * Phase 2 Subv/Mo × Mo (wenn aktiv)
  * Gesamt-Subv-Summe
  * Cap-Warnung wenn Cap greift
  * Erklär-Text aus dem Backend (warum 1 oder 2 Phasen)

- Datenquelle 'Letzte Mietsteigerung' Hierarchie unverändert:
  1) Kalk-Stammdaten manuell, 2) Mietvertrag.Anpassung-gültig-ab,
  3) Mietvertrag.Vertragsbeginn, 4) Annahme 36 Mo. App zeigt Quelle.

- Cache-Bust auf v=55.

- Henry-Anleitung 'Mietsubvention 2-Phasen-Modell' im
  _Cockpit/anleitungen/ als Referenz.

---

Iter 41.9 — Henry-Feedback: MbV, Subv-Auto, Markt-Schnitt, Aktiv-Filter, Garage/Stellplatz

- Drei neue Felder in Kalkulations-Stammdaten:
  * 'Miete bei Verkauf' (Currency €/Mo) — fldy0UJDRV7CNoN6D
  * 'Marktpreis ImmoScout' (Currency €/qm) — fldhMmMxLn1PSjbwN
  * 'Marktpreis Homeday' (Currency €/qm) — fldvlXM6pBUzVYdpF
  Henry pflegt sie pro Aktiv-WE.

- Datenquelle Kalkulator restriktiver:
  Filter jetzt zusätzlich auf Kalk-Stammdaten.Status = Aktiv. WEs ohne aktiven
  Stammdaten-Eintrag (z.B. Eigennutzer-Verkäufe, Makler-Einheiten) erscheinen
  nicht mehr im Vertriebs-Kalkulator. Henry entscheidet pro WE explizit.

- Mietsubvention auto-berechnet (Server-side in stammdaten/[weId].js):
  * Vermietungsmodus Bestand + Kappung > 0 → subv/Mo = MbV × Kappung,
    Laufzeit = max(0, 36 − Monate_seit_letzter_Mietsteigerung).
  * Modus Neuvermietung / Leerstand → subv = 0 (B&B vermietet vor Verkauf neu).
  * Manueller Mietzuschuss in Stammdaten hat Vorrang (Override).
  Beispiel: MbV 920 € × 15 % = 138 €/Mo · letzte Erhöhung 01.01.2026 → 32 Mo
  Subvention (heute Mai 2026).

- Markteinkauf-Hebel: Schnitt aus ImmoScout + Homeday (vorher: Single-Wert).
  Wenn nur eines gepflegt → der vorhandene. UI-Hinweis welche Quelle.

- Stellplatz vs. Garage: Backend liefert garageCount + flaecheCount separat,
  Frontend zeigt z.B. '+ 2 Garagen + 1 Stellplatz' statt '+ 3 Stellplätze'.
  Stellplatz-TYP-Feld in Airtable wird konsumiert (war schon da).

- Miete bei Verkauf überschreibt WE-Kaltmiete im Kalkulator wenn gepflegt.
  Stellplatzmiete wird separat addiert (unverändert).

- Field-IDs ZUSTAENDIGER_MAKLER + MAKLER_LOOKUP in tables.js ergänzt für
  spätere Filter-Erweiterung (Edgar 17.05.: Makler-Feld 'Team B&B' optional).

- Cache-Bust auf v=54.

---

Iter 41.8 — Gewinn-Zone visuell + Maklerprovision aus KNK entfernt

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
echo "damit der Browser die neue v=60-Version lädt."
echo ""
