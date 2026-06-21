// Wissens-Briefing für den Backstube-Assistenten.
// FAKTENQUELLE — der Assistent kombiniert dies mit seinem Allgemeinwissen + Live-Kontext.
// STATUS: code-gegroundet (Workflow-Recherche 2026-06, gegen kalkulator.js verifiziert).
//         Vor Breiteinsatz von Edgar fachlich freigeben.
// Pflege: Bei Engine-Änderungen (kalkulator.js) oder Pricing/Subventionsmodell nachziehen.

const WISSEN = `
# B&B Backstube — Fachwissen für den Assistenten

Die B&B Backstube ist die interne Vertriebs-App der B&B Immo GmbH für Kapitalanlage-Wohneinheiten (KAV).
Ablauf: Kunde anlegen → Kalkulation mit Live-Stammdaten → Investitionsanalyse-PDF → Reservierung (PandaDoc) → Selbstauskunft → Bank.
Engine-Version 3.0. Alle Geldbeträge in Euro; Zinssätze/Quoten als Dezimal (0,045 = 4,5 %; 0,30 = 30 % Steuersatz).

## Rechen-Engine im Detail

Logik in 'public/kalkulator.js', exportiert als window.Kalk. Einstieg: recalc(inputs) für eine WE, recalcPaket(weArray, personSettings) für mehrere.

### Grundgrößen der Finanzierung
- Gesamtkaufpreis 'kpGesamt' = Kaufpreis + Stellplatz-Kaufpreis. ≤ 0 → recalc() gibt null zurück.
- Kaufnebenkosten 'knk' = kpGesamt × knkPct, mit knkPct = Grunderwerbsteuer + 1,5 % Notar + 0,5 % Grundbuch. GrESt-Fallback 5 % (BaWü). KEINE Maklerprovision (B&B verkauft direkt).
- Investition gesamt 'investitionGesamt' = kpGesamt + knk.
- Eigenkapital-Bedarf 'ekBedarf' = knk (wenn KNK NICHT mitfinanziert), sonst 0 (bei KNK mitfinanziert). Einzige EK-Position.
- Darlehen 'darlehen' = investitionGesamt (KNK mitfinanziert) sonst kpGesamt.
- Zins-Guard: zins ≤ 0 oder NaN → Default 0,045.

### Annuität, Tilgung, Restschuld
- Annuität monatlich 'annuityMo' = darlehen × (zins + tilgung) / 12 (deutsche Annuität, Belastung).
- Laufzeit 'nper' bis Volltilgung, gedeckelt 480 Mo, Fallback 360.
- Zinsen/Tilgung pro Jahr via Excel-CUMIPMT/CUMPRINC. Pro Jahr: 'zinsenJahr', 'tilgungJahr' (positiv), 'annuJahr' = Summe.
- Restschuld-Verlauf: startet bei darlehen, jährlich restschuld = max(0, restschuld − tilgungJahr).

### AfA & Steuereffekt
- AfA-Bemessung 'afaBemessungBetrag' = anschaffungskosten × Gebäudeanteil (Default 0,85). anschaffungskosten = kpGesamt + knk (KNK gehören rein, BFH-konform). Boden (15 %) ist nicht abnutzbar.
- AfA/Jahr 'afaJahr' = afaBemessungBetrag × afaSatz. AfA/Monat 'afaMo' = afaJahr/12.
- Werbungskosten = AfA + Zinsen + Mietverwaltung + Hausverwaltung. Hausgeld und Tilgung sind KEINE Werbungskosten.
- Steuerlicher Verlust 'stVerlustJahr' = Werbungskosten − Mieteinnahme (meist negativ = Verlust).
- Steuervorteil 'stVorteilJahr' = stVerlustJahr × Steuersatz. Positiv = Erstattung. Geht POSITIV in den Cashflow ein.

### Marktmiete-Cap (realistisch erzielbare Miete — KEIN Mietspiegel)
'marktmieteEurQm' = realistisch erzielbare Kaltmiete €/qm/Monat (eigene Einschätzung), NICHT Mietspiegel, NICHT Verkaufswert-€/qm.
- Cap(Jahr y) = marktmieteEurQm × qm × (1 + wertsteigerung)^(y−1) — wächst jährlich mit der Wertsteigerung mit.
- Wirkung: effektive Miete = max(baseMbv, min(raw, cap)). Der Cap deckelt nur künftige Erhöhungen; eine bereits über Markt liegende Vertragsmiete (MbV) wird NICHT nach unten gekürzt.
- Im Sprung-Modus wird der Cap zwischen den Sprüngen eingefroren (Belastung bleibt in der Sprung-Periode konstant).

### Mietsteigerung (3 Modi)
Erste Erhöhung im Monat M1 = max(1, 36 − monateSeitMieterhoehung).
- 'sprung' (Bestand): alle 36 Monate, Faktor (1 + steigerungProz)^n. Default-Steigerung 15 %.
- 'index': jährlich, exponentiell.
- 'staffel' (Neuvermietung): jährlich, linear 1 + n × steigerungProz.

### Mietsubvention (2-Phasen) inkl. Regler
Die Subvention glättet die Effektivmiete (kein Tal zwischen den Phasen).
- Neue Form (subventionPhasen[] = [{label, mo, monate}]): Ziel-Effektivmiete = Kaltmiete(capped) + Phase-1-Aufschlag. Subvention pro Monat = max(0, Ziel − aktuelle Kaltmiete) × subventionFaktor. Schmilzt, wenn die Bestandsmiete steigt.
- subventionFaktor (Default 1) = Regler im Frontend für den Trade-off Subvention ↔ Kaufpreis; skaliert jeden Subventions-Monatsbetrag.
- Subv-Cap auf Tag-1-Marktmiete fixiert (wächst nicht mit).

### Cashflow — jährlich & monatlich
- Jährlich (Feld cfJahr je 'cf'-Eintrag): cfJahr = mieteJahr − zinsenJahr − tilgungJahr − hgJahr + stVorteilJahr.
  mieteJahr = (Kaltmiete + Stellplatzmiete + geglättete Subvention) × 12. hgJahr = (Hausgeld + Mietverwaltung + Hausverwaltung) × 12. Hausgeld-Inflation deaktiviert (konstant). Stellplatzmiete wächst mit wertsteigerung.
- Monatlich (Feld cfNachStM je 'cfMonate'-Eintrag): Cashflow nach Steuern; cfOperativM = cfNachStM − stVorteilM (vor Steuer).
- Belastung Monat 1 'belastungMo' = cf[0].cfJahr / 12 (negativ = monatlicher Zuschuss des Käufers, positiv = Überschuss).

### IRR (interner Zinsfuß)
- IRR-Reihe: Jahr 0 = −ekBedarf; Jahre 1–9 = cfJahr; Jahr 10 = cfJahr + Verkaufserlös.
- 'irr' = null, wenn ekBedarf ≤ 1 € (EK ≈ 0 / 110-%-Finanzierung → EK-Rendite undefiniert). Sonst Dezimal-Rendite p.a.

### Wertsteigerung & Vermögen (Array 'vermoegen', Jahre 0–10)
Startwert = Marktwert + Stellplatz. Pro Jahr: wert = startwert × (1 + wertsteigerung)^y; restschuld; verkaufserloes = wert − restschuld; kumCf = Σ cfJahr bis y; vermoegenBrutto = verkaufserloes + kumCf (= Gesamtvermögen); vermoegenNetto = vermoegenBrutto − ekBedarf (= Vermögenszuwachs).
- 'vermoegenBrutto10' = Gesamtvermögen nach 10 J. 'vermoegenNetto10' = Vermögenszuwachs nach 10 J.

### Sparen-vs-Investieren (Array 'sparen', Jahre 0–10)
nurSparen = ekBedarf mit Sparzins (Default 2,5 %); mitImmo = verzinster kumulierter Cashflow + Verkaufserlös; delta = mitImmo − nurSparen. 'sparenVsKaufenDelta' = Vorteil nach 10 J.

### Ergebnis-Felder von recalc() (so heißen die Zahlen im Live-Kontext)
Top-Level: inputs, engineVersion, kpGesamt, knk, investitionGesamt, ekBedarf, darlehen, annuityMo (€/Mo), nper (Monate), afaMo, afaJahr, afaBemessungBetrag, anschaffungskosten, gebaeudeAnteilFaktor, cf (Array jährlich 30), cfMonate (Array monatlich 120), vermoegen (Array jährlich 0–10), irr (Dezimal p.a. oder null), vermoegenBrutto10 (= Gesamtvermögen 10 J.), vermoegenNetto10 (= Vermögenszuwachs 10 J.), belastungMo (€/Mo Jahr 1), mietsubventionGesamt (echter Subv-Abfluss über 10 J., geglättet), markteinkaufVorteil, kaufpreisProQm, bruttorendite (Dezimal), bonEinnahmen, bonAusgaben, bonVermoegen (frei verfügbar/liquide), bonVor, bonNach, bonDelta, bonMieteAnr, sparen (Array 0–10), sparenVsKaufenDelta, hausgeldEffMo, hausgeldNurMo, mietverwaltungMo, hausverwaltungMo, stVorteilJ1Mo, stVorteilJ5Mo, stVorteilJ10Mo, mieteJ1Mo, ersteErhoehungMonat, ersteErhoehungJahrLabel, kaufpreisWohnungProQm, mieteWohnungProQm, subventionProQm.
- cf-Eintrag (jährlich): y, kaltmieteMo, spMieteMo, subventionMoEff, mieteJahr, zinsenJahr, tilgungJahr, annuJahr, afaJahr, hgJahr, mvJahr, hvJahr, stVorteilJahr, cfJahr, restschuld.
- cfMonate-Eintrag (monatlich): m, y, kaltmieteM, spMieteM, subvM, mieteM, zinsM, tilgM, hgM, mvM, hausverwM, stVorteilM, cfNachStM, cfOperativM.
- vermoegen-Eintrag: wert, restschuld, verkaufserloes, kumCf, vermoegenBrutto, vermoegenNetto.

## Pricing & Methodik

### Wie der Angebots-Kaufpreis zustande kommt
KP-Vorschlag Wohnung = ROUND( (Ertragswert + Vergleichswert) / 2 − 0,5 × Subv-Total , 0). Fehlt ein Verfahren, zählt das andere allein. Stellplatz steht separat: Käufer-Komplettpreis = KP-Vorschlag Wohnung + Stellplatz-KP.
- A) Ertragswert = (Käufer-Miete + Subv €/Mo) × 12 × Lage-Multiplikator × (1 + Zustand-Korrektur). Lage-Multiplikator (Brutto-Rendite): Innenstadt 23,3 (4,3 %) · Mittlere Lage 22,2 (4,5 %, Default) · Speckgürtel 21,3 (4,7 %) · Land 20,0 (5,0 %). Zustand-Korrektur (ab 2026-06-21): Kernsaniert +8 %, Renoviert +3 %, Standard 0 %, Renovierungsbedürftig 0 %. Keine Abschläge mehr. Statt Abschlag arbeiten wir mit dem Renovierungsbonus: ein Teil des Kaufpreises, der nach dem Notartermin an den Käufer ausgezahlt wird (zweckgebunden Renovierung). Manueller Override € pro WE (Kalk-Stammdaten, Feld „Renovierungsbonus (€)"), Pflege-Vorschlag Standard 100 €/qm · renovierungsbedürftig 200 €/qm, von der App auf 15 % Gebäudewert gedeckelt. Der Bonus senkt den ausgewiesenen EK-Bedarf (Tag-1-Liquidität zurück); Steuererstattung ≈ Bonus × persönlicher Steuersatz. Leer = kein Bonus, Bestandseinheiten bleiben unverändert.
- B) Vergleichswert = Marktpreis €/qm × Wohnfläche; Marktpreis €/qm = (ImmoScout + Homeday)/2.
- C) Risiko-Abzug = 0,5 × Subv-Total. Begründung: Käufer trägt das Restrisiko der Anschlussfinanzierung (die rechnet die echte, nicht subventionierte Miete an) → die Hälfte der Subvention wird wieder abgezogen.

### Cross-Checks
- Diff Vorschlag − Geplant: positiv = wir sind günstig (Hochpotenzial); negativ = über Markt. > +20k intern besprechen; ±5k passt; < −20k Überpreisung.
- Markteinkauf-Vorteil = (Marktpreis €/qm − Kaufpreis €/qm) × qm. Positiv = günstig gekauft.
- Subv-Cap: Käufer-Miete = min(Mieter-Miete + Subv-Aufschlag, Marktmiete × qm).

### Wichtige Default-Annahmen
- Zinssatz 4,5 % p.a. (ohne KNK-Finanzierung) bzw. 4,8 % (mit KNK mitfinanziert).
- Tilgung 1 % p.a. (Bank-Standard 4,5 %/1 % ≈ 360 Mo).
- Wertsteigerung 3 % p.a. — bewusster VORSICHTS-Default (historischer Bulwiengesa-Median 2010–2024 lag bei ~4 %).
- AfA-Satz 2 % linear (§ 7 EStG); mit Restnutzungsdauer-Gutachten (Sprengnetter) höher, z.B. 3,0–3,7 %.
- Gebäude-Anteil 85 % (Boden 15 %, nicht abschreibbar). AfA-Basis inkl. KNK.
- Grunderwerbsteuer 5 % (BaWü/Bayern/Sachsen/Hessen/Sachsen-Anhalt); NRW/Saarland/Brandenburg/Thüringen 6,5 %; Berlin/SH 6,0 %; HH 5,5 %.
- KNK = GrESt + 1,5 % Notar + 0,5 % Grundbuch (= 7 % in BaWü). Keine Maklerprovision.
- Steuersatz 30 % (Stufen 30/35/42 %). Sparzins-Vergleich 2,5 % p.a. Hausverwaltung 30 €/Mo. Subv-Laufzeit Phase 1 = 36 Mo. Hausgeld-Inflation 0 %.

### Kennzahlen, die ein Vertriebler erklären können muss
- Brutto-Rendite = (Käufer-Miete + Subv) × 12 / KP, gedeckelt durch Marktmiete. Banker-Erstblick: 3,5–4,5 % Spitzenlage, 4,5–5,5 % mittlere Lage, 5,5–6 % Speckgürtel, > 6 % Land/zu billig.
- Mein Anteil J10 (vermoegenNetto10) = Marktwert(J10) − Restschuld(J10) + Σ Cashflow(J1–10) − EK. Der Headliner.
- IRR (10 J) — interne Verzinsung des eingesetzten EK; 15–25 % typisch. Bei EK ≈ 0 undefiniert → Zuwachs-Satz zeigen.
- Selbsttragung % = (Mieteinnahme + Steuervorteil) / (Annuität + HG + HV + MV) × 100. 100 % = trägt sich selbst.
- Subv-Risiko-Abschlag: "Subv ist eingepreist, aber wir ziehen die Hälfte wieder ab als Belohnung dafür, dass du das Restrisiko der Anschlussfinanzierung trägst."
- Drei Verkaufs-Kernsätze: Wir sind günstig (90 % unter ImmoScout/Homeday-Schnitt) · wir rechnen ehrlich (zwei unabhängige Verfahren) · kein Marketingschmus.

### Engine-Grenzen (nicht improvisieren, ehrlich benennen)
Keine Hausgeld-Inflation, keine Sondertilgung, keine Anschlussfinanzierung (fixer 30-J-Zins), kein anschaffungsnaher Aufwand § 6 EStG, kein Markt-Crash, keine Spekulationssteuer-Berechnung, kein Mieterausfall (Engine 100 %, nur Bank-Bonität rechnet mit 80 %).

## Datenmodell & Subvention

- Wohneinheit (WE): eine Eigentumswohnung in einem B&B-Projekt. Stammdaten aus WE_STAMMDATEN (Excel-Wahrheit) + WE_PRESETS_BY_RECID (Kalk-Input-Defaults). Felder: kaufpreis, qmPreis, stellplatzKp, qm, kaltmiete (MbV), stellplatzMiete, marktmiete €/qm, AfA (regulär 2 % / Gutachten höher), Hausgeld + Rücklage, Hausverwaltung (~30 €), Mietverwaltung, wertsteigerung, Vermietungsmodus/Kappungsgrenze.
- Kunde: Vertriebs-Interessent. Felder: name, email, telefon, phase (Default "Lead"), ownerName (Vertriebler), notizen, steuersatz (persönlich, Dezimal), berateneWE (aus Snapshots).
- Snapshot: eingefrorene Kalkulation eines Kunden zu einer WE (Investitionsrechnung). Enthält das volle kalkJson + Klartext-Basiswerte + Kern-Ergebnisse (EK-Bedarf, Cashflow J1, Vermögen netto 10 J., IRR, Bruttorendite).
- Der Steuersatz gehört zum KUNDEN, nicht zur WE.

### 2-Phasen-Subventionsmodell
B&B zahlt dem Käufer einen Mietzuschuss, der die Lücke zwischen aktueller Kaltmiete und marktgerechter Soll-Miete in den ersten Jahren überbrückt, solange die Kappungsgrenze eine sofortige Anhebung verbietet.
- Phase 1 (Jahr 1–3): voller Mietzuschuss.
- Phase 2 (Jahr 4–6): reduzierter Zuschuss (nach erster zulässiger Mieterhöhung).
- Ab Jahr 7: kein Zuschuss mehr (Miete hat Marktniveau erreicht). NIE drei Stufen.
- Hebel: X_ideal = MbV × ((1 + Kappung)^2 − 1); X_max_markt = Marktmiete − MbV; X_final = min(beides). Kappungsgrenze typisch 15–20 % alle 3 Jahre. Cap auf Subv-Total = max(5.000 €, qm × 200 €, MbV × 18). Total < 1.000 € → keine Subv-Story.
- Subventionsregler (subventionFaktor): skaliert die Subvention; Trade-off Subvention ↔ Kaufpreis (mehr Subvention zulasten Kaufpreis-Spielraum). Gesamt-Subvention = echte Engine-Summe mietsubventionGesamt (geglättet), NICHT der nominale Wert.

## Kundensicht & Begriffe

So präsentiert die App dem Kunden die Zahlen — dieselbe Sprache nutzen. Grundton: immer Du-Form, ruhig, ehrlich ("Wir zeigen Dir nicht nur die schöne Sicht"). Produkt heißt nach außen "Investitionsanalyse" (9-Seiten-PDF). Die Tool-Darstellung ist die "Magazin-Story" (Sektionen 01–09).

### Gesamtvermögen-Story (Kern-Pitch)
- Hero: "In zehn Jahren baust Du nach unserer Rechnung X € Nettovermögen auf."
- Zwei Werte, die Kunden verwechseln: Gesamtvermögen J10 (brutto, inkl. EK) = Marktwert J10 − Restschuld J10 + kumulierte Cashflows. Vermögenszuwachs (netto) = Gesamtvermögen − eingesetztes EK (Dein echter Mehrwert).
- Drei Hebel: Wertsteigerung, Tilgung, Markteinkauf-Vorteil.
- Bei 110-%-Finanzierung (EK 0): keine IRR/Sparbuch-Story, sondern "Ohne Eigenkapital-Einsatz zum Sachwert".
- IRR heißt Kunden gegenüber "Eigenkapital-Rendite / interner Zinsfuß".

### Belastungs-Chart ("02 · Die nächsten zehn Jahre")
- Leitzahl "Effektive Belastung im ersten Jahr: X €/Mo" (nach Steuern, nicht "Rate").
- Rechenweg: Mieteinnahmen (Kaltmiete + Stellplatz + Subvention) − Annuität − Rücklage − Mietverwaltung − Hausverwaltung + Steuervorteil.
- Positiv = "Dein Überschuss/Monat" (trägt sich ab Tag 1 selbst); negativ = "Deine Belastung/Monat" + Selbsttragungs-Quote in %. Nie "Verlust".
- Crossover: "Ab Jahr X dreht die Belastung ins Plus" (Mieten steigen, Annuität konstant).

### Steuervorteil ("03")
- "AfA + Werbungskosten = Dein Cashflow-Hebel." Sinkt über die Jahre (Zinsen fallen, Mieten steigen, AfA konstant). Wird nach Notar monatlich über Lohnsteuerermäßigung geholt, nicht erst mit der Steuererklärung.

### Markteinkauf / Brot & Butter
- Markteinkauf-Vorteil: "Du kaufst unter Marktpreis — Dein Vorteil steckt im Kaufpreis." Brot-&-Butter-Modell: Bestände zu Volumenpreisen kaufen, aufwerten, einzeln an Privatanleger weitergeben. "Keine zusätzliche Vermittlungs-Provision" — Marge steckt im Spread.

### Mietsubvention (Kundensicht)
- Vom Verkäufer (B&B): "Wir fangen Deine Anlaufphase ab." Schon in allen Cashflows enthalten. Bankentauglich eingerichtet → wird wie Miete zu 80 % angerechnet (positiver Bonitätseffekt für Folgekäufe).

### Annahmen-Modal (Transparenz)
- "Jeder Parameter hat eine Quelle — Du kannst nachfragen." Quellen: Kaufpreis notariell; Zins aktuelles Bank-Angebot; Wertsteigerung Vorsichts-Default 3 % (Median ~4 %); Mietsteigerung § 558 BGB max. 15 %/3 J.; AfA Standard 2 % bzw. Restnutzungsdauer-Gutachten.
- Pflicht-Disclaimer: "Modell-Rechnung, kein verbindliches Angebot, keine Anlageberatung (WpHG). Vermittlung § 34c GewO. Verbindlich ist nur der notarielle Kaufvertrag. Steuerliches mit dem Steuerberater abstimmen."

### Reservierung & nächste Schritte
- "Wohneinheit sichern": Kaufabsichtserklärung & Reservierungsvereinbarung, bis zu einer Ablauffrist, Vorbehalt von Dokumentation/Besichtigung/Finanzierung. Via PandaDoc (E-Signatur), vorher Snapshot speichern.
- Sechs Schritte bis Notar: 1) Selbstauskunft 2) WE sichern 3) Objektunterlagen prüfen 4) Finanzierungszusage 5) Besichtigung 6) Notar. Beurkundung nur bei erfüllter Finanzierung + Unterlagen + Besichtigung.
- Selbstauskunft: "Bonität-Grundlage für die Bank, 20–30 Min." Portal-Link 14 Tage gültig.
- Bonität: Bank rechnet Miete zu 80 % an (Mietausfallreserve). Positives Saldo nach Kauf erhöht Kreditfähigkeit; negativ frisst Bonität. Vermögen aus Bank-Sicht = nur liquide/beleihbare Werte, nicht Eigenheim.
- Exit: nach 10 J. Spekulationsfrist (§ 23 EStG) Veräußerungsgewinn steuerfrei, sofern Drei-Objekt-Grenze nicht überschritten.

### Typische Fragen & Antwort-Logik
- "Was kostet mich die Wohnung im Monat?" → effektive Belastung Jahr 1 (belastungMo); Rechenweg s.o.
- "Wie kommt ihr auf das Gesamtvermögen?" → Marktwert J10 − Restschuld J10 + kumulierte Cashflows; minus EK = Netto-Zuwachs.
- "Warum zwei 10-Jahres-Zahlen?" → größere = Gesamtvermögen (inkl. EK), kleinere = Netto-Zuwachs (EK abgezogen).
- "Warum EK, wenn der Kaufpreis finanziert wird?" → EK = Kaufnebenkosten; Kaufpreis 100 % finanziert. Bei mitfinanzierten KNK: EK 0.
- "Wie viel Steuer spare ich und warum sinkt das?" → (AfA + Zinsen + MV + HV) × Steuersatz; sinkt, weil Zinsen fallen und Mieten steigen.
- "Lohnt sich das ggü. Sparbuch?" → sparen-Array (Tagesgeld 2,5 %) vs. mitImmo; delta.
- "Was bei Zinsanstieg/Leerstand?" → Szenarien (Konservativ Zins +1 %, 1 Mo Leerstand; Stress-Test Zins +2 %, 3 Mo Leerstand).
- "Verbessert die Wohnung meine Bonität?" → anrechenbare Miete 80 % − Annuität = Saldo-Delta.
- "Was kostet euer Service?" → keine zusätzliche Provision; Marge im Einkaufs-Verkauf-Spread.

## App-Bedienung (so macht der Vertriebler die Dinge — bei „wo klicke ich für X?" diese Pfade nennen)
Ein kompletter Fall (entspricht der eingebauten 30-Schritte-Tour):
- Kunde anlegen: „Meine Kunden" → „Neuer Kunde". Im Kunden-Cockpit oben der Phasen-Tracker.
- Wiedervorlage setzen, Phasen-Aufgabe abhaken, Aktivität festhalten, Notiz schreiben, Investment-Profil (Wunschregion, Min-EK, Einkommen) ausfüllen: alles im Tab „Übersicht" des Kunden.
- Rechnen: Tab „Kalkulator" → Projekt wählen → Wohneinheit wählen. Oben Standort + Eckdaten, dann die Hero-Headline (wichtigste Zahl). Das „Annahmen"-Modal zeigt die Quelle jeder Zahl.
- Snapshot speichern (friert die Berechnung ein) — nötig vor der Reservierung.
- Investitionsanalyse: Button „Als PDF herunterladen" (Druckdialog → 9-Seiten-PDF) oder „Mail-Vorlage öffnen".
- Selbstauskunft: Tab „Selbstauskunft" → Bonität selbst eintragen oder digital per Link an den Kunden senden (Portal-Link 14 Tage gültig); Status/Webhook im SA-/Snapshots-Tab.
- Reservierung: digital via PandaDoc senden; nach Signatur bestätigt der Webhook.
- Freie Einheiten: „Wohnungen"-Liste (WE-Liste), nach Projekt gruppiert; Bank-Szenario (Zins) oben umschaltbar.
- „Meine Kunden" hat eine Filter-Leiste; erledigte Test-Kunden archivieren.

## Magazin-Aufbau der Investitionsanalyse (Sektionen 01–09)
Die Story (= das 9-seitige PDF) läuft so: 01 Das Objekt · 02 Die nächsten zehn Jahre (Belastungs-Chart, Cashflow heute) · 03 Dein Vermögenszuwachs · 04 Die Alternative (Sparbuch-Vergleich) bzw. Der Hebel (bei EK 0) · 05 Im Detail (Drilldowns: Bonitäts-Saldo, Cashflow, Vermögen, Annahmen) · 06 Was wäre wenn (Szenarien Basis/Konservativ/Stress + Renovierung) · 07 Wie es weitergeht (6 Schritte bis Notar) · 08 Nach dem Notartermin · 09 Wer wir sind (Brot & Butter). Frag jemand „wo finde ich die Szenarien / die Annahmen?", nenne die Sektionsnummer.

## Nach dem Notartermin (Sektion 08 — B&B-Leistungsversprechen / After-Sales)
Was B&B nach dem Kauf übernimmt: Mietsubvention bankentauglich einrichten; den monatlichen Steuereffekt via Lohnsteuerermäßigung anstoßen; Restnutzungsdauer-Gutachten (Sprengnetter) für höhere AfA; Übergabe & WEG-Integration; erste Neuvermietung kostenlos; Mieterhöhungen und Steuerformulare übernehmen; WhatsApp-Direktdraht. Das ist die Antwort auf „Was passiert nach dem Kauf?".

## Vertriebs-Methodik (Henry) — Hinweis
Es gibt hauseigene Skripte (Goldstandard-Qualifizierung, CC1 11-Schritte-Erstgespräch, CC3 Kauf-Skala 1–10). Die Detail-Inhalte sind hier noch NICHT hinterlegt. Bis dahin: bei konkreten Skript-/Qualifizierungs-Fragen auf Henrys Methodik verweisen und allgemeine Vertriebs-Prinzipien geben — aber generisches Verkaufswissen NICHT als „B&B-Standard" ausgeben.

## Wie du den Live-Kontext nutzt
Du bekommst pro Frage: Bereich/Seite + Tab, den offenen Kunden (Name, Phase, Notizen/Profil), die Kalkulations-Eingaben, die berechneten Ergebnis-Felder (s.o.), die Jahres-Trajektorien (Cashflow J1–J10, Vermögen J0–J10), die ausgewertete Bonität/Selbstauskunft, die WE-Stammdaten (Klartext), die früheren Snapshots des Kunden und eine kompakte Pipeline (andere Kunden mit Phase + letzter Aktivität). Nutze diese echten Werte für konkrete Antworten. Fehlt ein Wert, rechne ihn aus den vorhandenen her oder sag, was fehlt.

## Was der Assistent NICHT tut
- Keine verbindliche Steuer- oder Rechtsberatung (nur Modell-Einschätzung).
- Keine konkreten B&B-Zahlen frei erfinden — die echten aus dem Kontext nehmen oder nachvollziehbar herleiten.
- Über die Pipeline und frühere Snapshots darfst du sprechen (sie stehen im Kontext). Aber rate nicht über Kunden, WEs oder Zahlen, die NICHT im Kontext stehen.
`.trim();

module.exports = { WISSEN };
