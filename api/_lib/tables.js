// Zentrale Table- und Field-IDs (aus SPEC.md).
// Field-IDs werden überall verwendet (NICHT Namen) für Stabilität gegenüber Umbenennungen.

const TABLES = {
  VERTRIEBLER: 'tblXG135L28XocpeY',
  KUNDEN:      'tbld0j0Mo7rre1Vh3',
  SNAPSHOTS:   'tbliqxbITCdSjK0ua',
  // Wohneinheit-/Objekt-/Projekt-Hierarchie aus Base "Objektmanagement" (appikHUetNyeonXBX):
  //   Projekt → enthält Objekte → enthält Wohneinheiten.
  WOHNEINHEIT: process.env.WOHNEINHEIT_TABLE_ID || 'tblAV81mX1MaxqVQi',
  // Objekt-Tabelle (z.B. WES_RHEIN 290, WES_RHEIN 292, Heidelberger Str. 21).
  // PROJEKT bleibt der Schlüssel-Name für historische Kompatibilität — zeigt aber auf Objekt.
  PROJEKT:     process.env.PROJEKT_TABLE_ID     || 'tblbBSh0fyPelFLvz',
  // Echte Projekt-Tabelle (z.B. "WES_RHEIN 290/292" = 1 Projekt mit 2 Objekten).
  PROJEKT_HEAD: process.env.PROJEKT_HEAD_TABLE_ID || 'tblisPG7YixRpd9cD',
  // Stellplatz-Tabelle (1 Datensatz pro physischem Stellplatz).
  STELLPLATZ:   'tblCfcVP5ipG91yHg',
  // Mietvertrag-Tabelle (führt Stellplatz-Miete im Vertrag — siehe SOP-E).
  MIETVERTRAG:  'tblJQWNQaJiLEfNRh',
  // Mieter-Tabelle (Person/en hinter Mietverhältnis).
  MIETER:       'tblGu9FjDuwh2uLdP',
  // Kalkulations-Stammdaten (Single Source of Truth für Web-App, siehe SOP-E).
  KALK_STAMMDATEN: 'tblz5KNtzkLSLHHFo',
};

// Felder der Objekt-Tabelle, die wir lesen
const PROJEKT_FIELDS = {
  KURZNAME:     'fldTf1OEHLteVRa7c', // "Heidelberger Str. 21, 76646 Bruchsal" / "WES_RHEIN 290"
  ADRESSE:      'fldE2LFvX5iPBUqTh', // "Heidelberger Straße 21, 76646 Bruchsal"
  OBJEKT_CODE:  'fldgYBkL3Hajuy8uJ', // "Obj: Heidelberger Str. 21, 76646 Bruchsal, 92"
  // Projekt-Link auf der Objekt-Tabelle → übergeordnetes Projekt (z.B. Wesseling = 1 Projekt,
  // umfasst die zwei Objekte WES_RHEIN 290 und 292).
  PROJEKT_LINK: 'fldHYvgI49VDw3xKg',
};

// Felder der Projekt-Head-Tabelle (tblisPG7YixRpd9cD)
const PROJEKT_HEAD_FIELDS = {
  PRIMARY:    'fld3x0H7y736xKzvj', // "PR: 37, BRUCH_HEID_21" / "PR: 17, WES_RHEIN 290/292"
  CODE:       'fldtpwL6D7E3F746S', // "BRUCH_HEID_21" / "WES_RHEIN 290/292"
};

const VERTRIEBLER_FIELDS = {
  NAME:    'fldpP5XwQr34Kh7Tx',
  EMAIL:   'fldlIpTY2ggI0GTZy',
  TELEFON: 'flddmFv3YXeFaOsVx',
  FOTO:    'fldunwY4YtlhTvmX5',
  ROLLE:   'fldl1WRDwDUCKQhHP',
  STATUS:  'fldVE2h9Yz2Xv598K',
  CREATED: 'fldeI8pitl1I2O12d'
};

const KUNDEN_FIELDS = {
  NAME:           'fldEyLcNBa1Xe3ISs',
  VORNAME:        'fldkRrN0cjBc7z4sx',
  NACHNAME:       'fldjsUvoh3caONyYa',
  EMAIL:          'fldNXcwpC75MuGGhd',
  TELEFON:        'fldaOOiGNE2FVAQA9',
  GEBURTSDATUM:   'fldtdW7rfAXqbIu4q',
  OWNER:          'fld7gmCGOLVsW5S1W',
  PHASE:          'fldZIuFV6LcqodhEM',
  NOTIZEN:        'fldtpjO65JHIbUecZ',
  QUICK_BON_JSON: 'fldwL7VkWLQwz1at8',
  SA_JSON:        'fldl94zd1Oeakj6pN',
  CREATED:        'fld9s7XunLXCfx6pa',
  LAST_ACTIVITY:  'fldRghZ5CtIBw2rWn',
  // Iter 52 — Archivierung (Checkbox). Vertrieb archiviert, Admin löscht.
  ARCHIVIERT:     'fldHIc3gclVok2ggj'
};

const SNAPSHOT_FIELDS = {
  BEZEICHNUNG:    'fldc9T4R4oowvzYeJ',
  KUNDE:          'fldk6jkQu6UEIFv6T',
  WE_BEZ:         'fldCSEFLQgBmSo9ib',
  WE_RECID:       'fldgmCTYq3iFluCQf',
  ERSTELLT_VON:   'fldOfahUEZJOvSzUy',
  PDF_TYP:        'fldXDtsB9FyqDh6Pu',
  KALK_JSON:      'fldi8yTPSesezJRYv',
  CREATED:        'fldGeavlVvA5feJTC',
  // --- Klartext-Basis-Werte (28.05.2026): Backoffice sieht ohne JSON-Parse,
  //     auf welcher Basis gerechnet wurde. Auto-befüllt aus kalkJson beim POST. ---
  KAUFPREIS:        'fldUCIaouk06a9g05',
  WOHNFLAECHE:      'fldy7gMlU6dGu5zZB',
  KAUFPREIS_QM:     'fldCJwSRdGErsxrrP',
  KALTMIETE:        'fldjNSivJDQIdBjiy',
  MIETVERWALTUNG:   'fld6yycNNWeKM30ZN',
  ZINS:             'fld9uABNRIAIEcC0J',
  TILGUNG:          'fldlBjQ7DPDg3NZx3',
  STEUERSATZ:       'fldLB5ICVUlsUyCtE',
  AFA_SATZ:         'fldNeyUHc4kREBYIu',
  WERTSTEIGERUNG:   'flddLfg2S7dgYElzv',
  MARKTWERT_QM:     'fldmg7lNG8zdJKE6M',
  KNK_MITFINANZIERT:'fldKvm1fzMdljWPOh',
  VERMIETUNGSMODUS: 'fldFnbHAeuK8XORjG',
  // --- Subvention-Details ---
  SUBV_MO:          'fldGq9svE7UH4dG6T',
  SUBV_MONATE:      'fld5LJQz3YtEfrkQm',
  SUBV_GESAMT:      'fldxoEKYQzsGRJ81o',
  SUBV_PHASEN:      'fldfZnfcbcElOAIMu',
  SUBV_ERLAEUTERUNG:'fldXtRqKAbrEfxkOV',
  // --- Kern-Ergebnisse (aus body.kalkErgebnis — neue Snapshots; Altbestand bleibt leer) ---
  EK_BEDARF:        'fldtFOGrxFPt648CW',
  CASHFLOW_J1_MO:   'fldu6FxAZ8TR1X5oY',
  VERMOEGEN_NETTO_10:'fldKfP9D08CKFIP8R',
  IRR:              'fldNnqRN4lWSeQvri',
  BRUTTORENDITE:    'fldCq3Q9j6zqcUQay'
};

const WE_FIELDS = {
  LAGE_BEZ:    'fldhlG1CH22gG3Ta6',
  STATUS:      'fld9zBkxSrrviMw96',
  MAKLER:      'fldiwYeFDiKlf5UVX',
  KAUFPREIS:   'fldKQ5ZpGvEzuc5qc',
  QM:          'fldzF0RSb8xjKdjDc',
  KALTMIETE:   'fldAoKLxSak5OnPao',
  LAGE_TEXT:   'fldL2xgJwlFcGDUfx',
  QM_PREIS:    'fldGClYivJ0IdvAyG',
  WE_NR:       'fldGia0unyS8cBaE5',
  PROJEKT:     'fld1cp8nYcq6wXZx6',
  // Iter 41.9 — zusätzlicher Vertriebsfilter (Team B&B):
  ZUSTAENDIGER_MAKLER: 'fldNWc3458mHkH01m', // Link-Feld auf Makler-Tabelle
  MAKLER_LOOKUP:       'fldVgHqxy7zVKynsg', // Lookup spiegelt den Makler-Namen
  // Iter 51 (19.05.2026) — Link zur Objektvorstellung. Domi pflegt pro WE/Projekt.
  // Vertriebler nutzt den Link parallel zur Kalkulation im Kundengespräch.
  OBJEKTVORSTELLUNG: 'fldITEQwhu9tDi7Iy',
};

const WE_STATUS_VERMARKTUNG = 'Vermarktung / Im Verkauf';
const MAKLER_BUB = 'B&B Immo GmbH';
// Iter 41.9 — Vertriebs-Filter aus Henry-Feedback. Wenn die WE im Eigenvertrieb (KAV)
// verkauft wird, weist Henry/Schenki den Makler-Record "Team B&B" zu. Der Filter ist
// derzeit NICHT zwingend (Edgar 17.05.: "kann auch jemand anderes sein oder niemand"),
// daher reicht für den App-Filter Kalk-Stammdaten.Status=Aktiv.
const TEAM_BB_LABEL = 'Team B&B';

// --- Stellplatz-Tabelle ---
const STELLPLATZ_FIELDS = {
  TITEL:       'fldkuLZ19YIo56qzo', // "StPl: 207, 2, Garage"
  WE_LINK:     'fldauQ7MzcvZvHVk3', // Link zur Wohneinheit
  TYP:         'fldyZ1H5JqRQdiH3b', // SingleSelect: Garage / Fläche
  MIETKOSTEN:  'fld1M0EJ4VLZGVh3l', // Currency € (alte Spalte „Mietkosten Stellplatz" — wird laut SOP-E migriert in Mietvertrag)
  KAUFPREIS:   'fldcoVGhBtTWF6QRv', // NEU 15.05.2026 — Kaufpreis-Anteil pro Stellplatz (Currency €)
};

// --- Mietvertrag-Tabelle ---
const MIETVERTRAG_FIELDS = {
  TITEL:           'fldiP1aT7hgMYMEoc',   // "Neuvertrag - 540 € kalt, ab 1.1.24 (#226)"
  WE_LINK:         'fldaGWDfYOiFxLoiy',   // Link Wohneinheit
  MIETER_LINK:     'fldJwZXEVGFvrvz4D',   // Link Mieter
  STELLPLATZ_LINK: 'fldUl2EXwP4gHBPJP',   // Link Stellplatz
  KALTMIETE:       'fldx838HHHMRvD5fT',   // €
  STELLPLATZMIETE: 'fldcGEefFtNEFbatS',   // € (bestätigt von Edgar 15.05.2026)
  VERTRAGSART:     'fld41qYdKxjyIdDlO',
  STATUS_LOOKUP:   'fld02ScVlHI1f4AZr',   // Lookup via WE: Aktiv / Archiviert
  VERTRAGSBEGINN:  'fldDdFKwsytwadjqG',   // Originaldatum Vertrag (bei Neuvertrag)
  GUELTIG_AB:      'fldLkBwWJj8fAZAHJ',   // 'Anpassung gültig ab' (bei Erhöhung/Staffel) — Datum der letzten Mietsteigerung
};

// --- Mieter-Tabelle ---
const MIETER_FIELDS = {
  NAME:        'fldWvNPHHQophnDNp',
  WE_LINK:     'fldotm9D1VDoM08P8',
  VERTRAEGE:   'fldQwNUd8mmsa7mwR',
};

// --- Kalkulations-Stammdaten (neu 15.05.2026, siehe SOP-E) ---
const KALK_STAMMDATEN_FIELDS = {
  BEZEICHNUNG:           'fldclI3ygaQa6Ewvm',
  WOHNEINHEIT:           'flduMs8t49N1gLIBs',
  STATUS:                'fldTOy2kV3SkCkhw6',
  HAUSVERWALTUNG:        'fldhiKD2iB4NekByK',
  HAUSGELD_RUECKLAGE:    'fldrYNoUkgtGaTQWW',
  MIETVERWALTUNG_DEF:    'fldhteQkjFBA0J447',
  MIETZUSCHUSS:          'fldcvKf7Snlw2RJI3',
  MIETZUSCHUSS_MONATE:   'fld1eVXIlDx3DM3LX',
  AFA_GUTACHTEN:         'fldF36zoKE6Foiu5f',
  WERTSTEIGERUNG:        'fldhB9tsIkpcLGDur',
  VERMIETUNGS_MODUS:     'fldZmkdo4sEAeJqnV',
  KAPPUNGSGRENZE:        'fldna2Hj1m1ST94Z3',
  INDEXMIETE:            'fldFlwdAP4xQ2muO5', // ab 18.05.2026 in Airtable umbenannt zu "Staffelmiete %" — JS-Key bleibt INDEXMIETE für Backward-Compat
  LETZTE_MIETSTEIGERUNG: 'fldpLwMLe2PTCO3t7',
  GRESt:                 'fld8pmE00wfH0v7jR',
  GEBAEUDE_ANTEIL:       'fld56AAbrC4yPJQrb',
  // HG_INFLATION entfernt (Edgar 26.05.2026): Feld in Airtable physisch gelöscht.
  // Solange die Field-ID in dieser Liste stand, scheiterte JEDER listAll-Call
  // auf KALK_STAMMDATEN mit Airtable-422 — Folge: kalkStammdaten=null → Frontend
  // zeigte für ALLE WEs „Keine Stammdaten gepflegt — läuft mit Defaults".
  // hgInflation wird seit 24.05.2026 ohnehin als 0 hartcodiert (siehe
  // kalkStammRecordToApi + maybeWriteBackAutoSubv).
  NOTIZEN:               'fld097ACU9qRS5kwq',
  QUELLE:                'fldrMUcQs06YF0lGi',
  // Iter 41.9 — Henry-Feedback 17.05.2026:
  MIETE_BEI_VERKAUF:     'fldy0UJDRV7CNoN6D', // Currency €/Mo — die Miete, die der Käufer übernimmt
  MARKTPREIS_IS:         'fldhMmMxLn1PSjbwN', // Currency €/m² — ImmoScout-Marktpreis
  MARKTPREIS_HD:         'fldvlXM6pBUzVYdpF', // Currency €/m² — Homeday-Marktpreis
  // Iter 41.10 — Mietsubvention 2-Phasen-Modell:
  MARKTMIETE:            'fldnrgRONiWWsSxZb', // Currency €/qm — Markt-Kaltmiete pro qm (Iter 65, 20.05.2026: vorher €/Mo, jetzt €/qm zur Projekt-Pflege). Backend multipliziert beim Bedarf mit WE.qm.
  // Iter 41.17 (18.05.2026) — Edgar-Fix: Vermietungs-Status der WE als Lookup in
  // die Kalk-Stammdaten gespiegelt („Miet-status (ist)"). Single Source of Truth
  // für leer/vermietet — vorher leitete das Backend den Status aus Vertrag + Kaltmiete>0
  // ab, was bei leerstehenden Einheiten zu falscher Mietsteigerungs-Logik führte
  // (alter Vertragsbeginn wurde als „letzte Mieterhöhung" weiterverwendet).
  WE_VERMIETUNGSSTATUS:  'fld22W6xF260RHuNv', // Lookup aus Wohneinheit: "vermietet" | "leerstehend"
  // GEPLANTE_ERHOEHUNG_DATUM + GEPLANTE_ERHOEHUNG_KALTMIETE entfernt
  // (Edgar 26.05.2026): die zwei Stammdaten-Override-Felder wurden in Airtable
  // physisch gelöscht — sie waren ein manueller Edgar-Override neben dem
  // Mietvertrag-Default-Pfad (Schenki pflegt Anpassung gültig ab + Kaltmiete
  // direkt in der Mietvertrag-Tabelle, das Backend liest das auto). Override
  // wurde nie genutzt → weg.
  //
  // Solange die Field-IDs noch in dieser Liste standen, scheiterte JEDER
  // listAll-Call auf KALK_STAMMDATEN mit Airtable-422 (gleiche Falle wie
  // FS-3v / HG_INFLATION heute Vormittag) — Folge: WE-Liste „Backend-Fehler".
  // Iter-4 (21.05.2026) — Auto-Subv-Write-back. Backend schreibt nach jeder
  // /api/stammdaten/[weId]-Berechnung die computeAutoSubvention-Ergebnisse zurück,
  // damit die Airtable-KP-Vorschlag-Formel auch dann eine Subvention drin hat,
  // wenn der manuelle Mietzuschuss leer ist (Standardfall bei Bruchsal-WEs).
  // Henry/Vertrieb pflegt diese Felder NICHT manuell — sie sind Backend-Output.
  AUTO_SUBV_MO:    'fldLV8CC1wvrRSJ6x', // Currency €/Mo — Phase-1-Subv-Rate
  AUTO_SUBV_TOTAL: 'fld99AS9ebipT5TSO', // Currency € — Total über alle Phasen
  // FS-3u (Edgar 26.05.2026): Pricing-Felder konsolidiert. Eine einzige
  // Mega-Formel im KP_VORSCHLAG_WOHNUNG-Feld rechnet alles inline:
  // Ertragswert + Vergleichswert (Mittelwert) − ½ × Subv-Total (Risiko-Abzug).
  // Stellplatz bleibt separat. Die früheren Helper-Felder (KP_VORSCHLAG_INKL_SUBV,
  // KP_VORSCHLAG_GESAMT, Marktpreis-Mittel, KP-Ertragswert, KP-Vergleichswert,
  // KP-Diff-Warnung, Brutto-Rendite-Ist) wurden in Airtable mit [LÖSCHEN]-Präfix
  // markiert und werden physisch entfernt.
  KP_VORSCHLAG_WOHNUNG:      'fldaxnWdFP1mLYVtH', // Haupt-Pricing-Feld (inkl. Subv-Risiko-Abzug)
  STELLPLATZ_KP_GESAMT:      'fldwNFyzAk2EaQ15Q', // SUM aller verlinkten Stellplatz-KPs
};

const KALK_STATUS_AKTIV    = 'Aktiv';
const KALK_STATUS_ENTWURF  = 'Entwurf';
const KALK_STATUS_ARCHIV   = 'Archiviert';

module.exports = {
  TABLES,
  VERTRIEBLER_FIELDS,
  KUNDEN_FIELDS,
  SNAPSHOT_FIELDS,
  WE_FIELDS,
  PROJEKT_FIELDS,
  PROJEKT_HEAD_FIELDS,
  STELLPLATZ_FIELDS,
  MIETVERTRAG_FIELDS,
  MIETER_FIELDS,
  KALK_STAMMDATEN_FIELDS,
  WE_STATUS_VERMARKTUNG,
  MAKLER_BUB,
  TEAM_BB_LABEL,
  KALK_STATUS_AKTIV,
  KALK_STATUS_ENTWURF,
  KALK_STATUS_ARCHIV,
};
