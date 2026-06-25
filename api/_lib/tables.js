// Zentrale Table- und Field-IDs (aus SPEC.md).
// Field-IDs werden überall verwendet (NICHT Namen) für Stabilität gegenüber Umbenennungen.

const TABLES = {
  VERTRIEBLER: 'tblXG135L28XocpeY',
  KUNDEN:      'tblHIy1hmbpxspQGW',   // Merge 2026-06-16: war tbld0j0Mo7rre1Vh3 (alte K/I-Tabelle)
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
  // Endkunden-Finanzierungsfall (Finanzierungs-Handover, 2026-06-15).
  FINANZIERUNGSFALL: 'tblM4e4tDae2o9mQz',
  // App-weite Konfiguration (1 Record je Key). 2026-06-19: Finanzierungs-Konditionen.
  APP_KONFIG: 'tbl044p3Vg6zsFAqy',
};

// Felder der Objekt-Tabelle, die wir lesen
const PROJEKT_FIELDS = {
  KURZNAME:     'fldTf1OEHLteVRa7c', // "Heidelberger Str. 21, 76646 Bruchsal" / "WES_RHEIN 290"
  ADRESSE:      'fldE2LFvX5iPBUqTh', // "Heidelberger Straße 21, 76646 Bruchsal"
  OBJEKT_CODE:  'fldgYBkL3Hajuy8uJ', // "Obj: Heidelberger Str. 21, 76646 Bruchsal, 92"
  // Projekt-Link auf der Objekt-Tabelle → übergeordnetes Projekt (z.B. Wesseling = 1 Projekt,
  // umfasst die zwei Objekte WES_RHEIN 290 und 292).
  PROJEKT_LINK: 'fldHYvgI49VDw3xKg',
  // 2026-06-15 — Link auf zentralen Drive-Ordner mit Verkaufsunterlagen (Baustein U,
  // wird im Kunden-Portal read-only eingeblendet).
  VERKAUFSUNTERLAGEN: 'fldKFHZROEU4sASDy',
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
  // Merge 2026-06-16: Tabelle ist jetzt die (umbenannte) Käufer-Tabelle "Kunden".
  // IDs = vorhandene Käufer-Felder (wiederverwendet) bzw. neu angelegte App-Felder
  // (siehe scripts/field-ids.json). QUICK_BON_JSON entfernt (war 0/54, ungenutzt).
  NAME:           'fldUW2JYSMP5sOqM6',   // Käufer.Name (Primary)
  VORNAME:        'fldSVm6uaGZB6AJUQ',
  NACHNAME:       'fldyih69u1mOhFWFK',
  EMAIL:          'fldUkBbJTTEfeQB0J',   // Käufer.E-Mail
  TELEFON:        'fldkiGXTdmbOwodXj',   // Käufer.Telefon
  GEBURTSDATUM:   'fldGmTef7c5ataAUh',
  OWNER:          'fldgxCgviKQpXRnn7',
  PHASE:          'fld1HzZwCgGhKBaMa',
  NOTIZEN:        'fldXBVR7wFnxxd3d1',   // Käufer.Notizen
  SA_JSON:        'flduoV06Bzqz3kQlE',
  CREATED:        'fldYPTEJPsw6p9Y7y',   // Erstellt-am (dateTime)
  LAST_ACTIVITY:  'fldQhTArUrxPrM64V',
  // Iter 52 — Archivierung (Checkbox). Vertrieb archiviert, Admin löscht.
  ARCHIVIERT:     'fldyYYWEy0nqodZoB',
  // 28.05.2026 — Persönlicher Steuersatz pro Kunde (Single Source of Truth, percent
  // als Dezimal z.B. 0.42). Synchron über Quick/SA/Kalkulation, persistent über WE-Wechsel.
  STEUERSATZ:     'flduCGIGwCXvNO3qQ'
};

const SNAPSHOT_FIELDS = {
  BEZEICHNUNG:    'fldc9T4R4oowvzYeJ',
  KUNDE:          'fldbqv3xkfET0SKfV',   // Merge 2026-06-16: Snapshots."Kunde (neu)" → Kunden (war fldk6jkQu6UEIFv6T → K/I)
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

// --- Endkunden-Finanzierungsfall (2026-06-15, Finanzierungs-Handover Baustein A) ---
// Bestehende Felder (von der Finanzierung angelegt) + neue Felder (2026-06-15).
const FINANZIERUNGSFALL_FIELDS = {
  TITEL:                   'fldBCoC1l9IukRTj8', // Primary singleLineText
  KUNDE:                   'fldMjyyEF2gSvbVct', // Merge 2026-06-16: FF."Kunde (neu)" → Kunden (war fldE6949ttL6XNSqX → K/I)
  WOHNEINHEIT:             'fldBAGky2mCKEJBmb', // Link → Wohneinheit
  STATUS:                  'fldgEgmxmVEMhFOdz', // singleSelect (Finanzierungs-Workflow)
  P100:                    'fldwBkuOlUEhqmi1I', // checkbox 100%
  P107:                    'fldJKQwW8w5S7lNzk', // checkbox 107%
  SNAPSHOT:                'fldioti4H2wFCdTEM', // Link → Kalk-Snapshots
  STAND_VOM:               'fldwOgpH4LWnJvtIY', // date — Snapshot-Datum
  KAUFPREIS:               'fldhZ8f9eGsYcjk6F', // currency
  EK_BEDARF:               'fldlH0LeLg1D0b4hh', // currency — gerechneter EK-Bedarf
  ZINS:                    'fld9Jgn4T9OMx2iyw', // number %
  TILGUNG:                 'fldGX0fBB5vgitGX9', // number %
  WOHNFLAECHE:             'fld70qEIePZihNOVv', // number
  KALTMIETE:               'fldMIQXs27cZOCUl8', // currency
  FINANZIERUNGSFORM_ANDERE:'fldG4zgMyTtPwyS2L', // singleLineText (falls nicht 100/107)
  MAX_EK:                  'fldqOvrlcs6ktQ1Id', // currency — EK-Wunsch-Obergrenze
  HAUSBANK_VORHANDEN:      'fldnQkq5FgLW8zPiM', // checkbox
  HAUSBANK_NAME:           'fld72OcOOx8Bx53Di', // singleLineText
  HAUSBANK_BERATER:        'fldiW2J8rHWJ8iRlC', // singleLineText
  FINANZBERATER_VORHANDEN: 'fldIy78JoGuBcBT9Q', // checkbox "Eigener Finanzierer"
  FINANZBERATER_KONTAKT:   'fldHWua7QpAMKvHfh', // singleLineText "Finanzierer — Kontakt"
  WAS_WICHTIG:             'fldqLLnYssritKMTk', // multilineText
  NOTIZ_VERTRIEB:          'fldt9rwaYVDcm0k8z', // multilineText — Notiz vom Vertrieb an Finanzierung
  NOTARTERMIN_ZIEL:        'fldagIUGINXpFrP0M', // date
  SA_STATUS:               'fld2ycS7SZZB9W9XJ', // singleSelect: fehlt / liegt vor
  KUNDEN_DRIVE:            'fldVLOKeXrgkJLWaD', // url — Link zum Drive-Ordner des Kunden (Baustein D)
  UPLOAD_LINK:             'fldBra4iUkp25viju', // url — Token-Link fürs Kunden-Upload-Portal (Baustein U)
  FINANZIERUNG_UEBER_BB:   'fldtvPsplayOthsqA', // singleSelect — läuft die Finanzierung über uns? (steuert Upload-Teil im Portal)
};

const FINANZIERUNGSFALL_STATUS_START = 'Unterlagen noch anfordern';

// Choice-Werte des Feldes "Finanzierung über B&B". Vertriebler setzt den Default,
// Kunde kann im Portal umschalten. OFFEN/EXTERN = nur Objektunterlagen, kein Upload-Zwang.
const FINANZIERUNG_BB = { JA: 'Über B&B', OFFEN: 'Noch offen', EXTERN: 'Extern' };

// App-Konfiguration (Key/Value-Store, 1 Record pro Key). 2026-06-19.
const APP_KONFIG_FIELDS = {
  KEY:          'fldJWAcW1pYcjds16', // singleLineText (Primary) — Config-Schlüssel
  JSON:         'fldZQ2hCOQOpqGerL', // multilineText — Config-Blob als JSON-String
  AKTUALISIERT: 'fldlZgqDjhUmxAnMr', // multilineText — ISO + Editor-Email (Audit)
};
const APP_KONFIG_KEY_KONDITIONEN = 'konditionen';

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
// Status, bei denen eine WE in der Verkaufs-/Rechen-Liste SICHTBAR ist (Edgar 05.06.2026):
// aktiv vermarktet + reserviert + Notartermin läuft. Ab 'Beurkundet' (und danach) raus = faktisch verkauft.
const WE_STATUS_SICHTBAR = ['Vermarktung / Im Verkauf', 'Reserviert', 'Notartermin'];
// Baut die filterByFormula-OR-Klausel über das Status-Feld (Feld-NAME 'Status').
function weStatusSichtbarFormula() {
  return 'OR(' + WE_STATUS_SICHTBAR.map((s) => `{Status}='${s}'`).join(', ') + ')';
}
const MAKLER_BUB = 'B&B Immo GmbH';
// 2026-06-25 (Edgar): Backstube/Kalkulator zeigte nur 'B&B Immo GmbH', weil der Firma-
// Lookup hart auf diesen einen Namen geprüft wurde. Objekte der Schwester-Gesellschaften
// (B&B Bayern GmbH = z.B. Marktheidenfeld, Bärte Immo GmbH) fielen komplett raus — auch
// wenn ihre WEs aktiv waren und im Verkauf standen. Jetzt: alle drei Vertriebsgesellschaften.
const MAKLER_FIRMEN = ['B&B Immo GmbH', 'B&B Bayern GmbH', 'Bärte Immo GmbH'];
// Baut die OR-Klausel über den Firma-Lookup. Trailing-Spaces ("B&B Immo GmbH  ") sind
// dank FIND()/Substring-Match unkritisch. Keine Substring-Kollisionen zwischen den drei Namen.
function maklerFirmaFormula() {
  return 'OR(' + MAKLER_FIRMEN.map((f) => `FIND('${f}', ARRAYJOIN({Firma (from Projekt) (from Objekt)}))>0`).join(', ') + ')';
}
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
  STELLPLATZ_LINK: 'fldUl2EXwP4gHBPJP',   // ALT: Lookup über WE_LINK (zieht die Stellplätze der WE)
  // NEU 04.06.2026 — echter Direktlink Vertrag->Stellplatz (multipleRecordLinks zur STELLPLATZ-Tabelle).
  // Löst STELLPLATZ_LINK (WE-Lookup) schrittweise ab: Stellplatz folgt künftig dem Mietvertrag.
  NEU_VERMIETETER_STELLPLATZ: 'fldNgvrI6WrZxf1fJ',
  KALTMIETE:       'fldx838HHHMRvD5fT',   // €
  STELLPLATZMIETE: 'fldcGEefFtNEFbatS',   // ALT: manuelle Vertrags-Stellplatzmiete (Fallback)
  VERTRAGSART:     'fld41qYdKxjyIdDlO',
  STATUS_LOOKUP:   'fld02ScVlHI1f4AZr',   // Lookup via WE: Aktiv / Archiviert
  VERTRAGSBEGINN:  'fldDdFKwsytwadjqG',   // Originaldatum Vertrag (bei Neuvertrag)
  GUELTIG_AB:      'fldLkBwWJj8fAZAHJ',   // 'Anpassung gültig ab' (bei Erhöhung/Staffel) — Datum der letzten Mietsteigerung
  VERTRAGSENDE:    'fldZjDwH7aXw5Bwjv',   // Datum — Mietverhältnis endet; NUR dieses Feld eintragen wenn Mieter kündigt (App liest nur VERTRAGSENDE)
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
  // Renovierungsbonus (Carve-out, 2026-06-21): manueller Override € pro WE.
  // Leer => kein Bonus (Bestand bleibt unverändert). Pflege-Vorschlag: Standard
  // 100 €/qm, renovierungsbedürftig 200 €/qm. Engine deckelt auf 15 % Gebäudewert.
  RENOVIERUNGSBONUS:         'fldWkm04lIAhYsfpN', // Currency €
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
  WE_STATUS_SICHTBAR,
  weStatusSichtbarFormula,
  MAKLER_BUB,
  MAKLER_FIRMEN,
  maklerFirmaFormula,
  TEAM_BB_LABEL,
  KALK_STATUS_AKTIV,
  KALK_STATUS_ENTWURF,
  KALK_STATUS_ARCHIV,
  FINANZIERUNGSFALL_FIELDS,
  FINANZIERUNGSFALL_STATUS_START,
  FINANZIERUNG_BB,
  APP_KONFIG_FIELDS,
  APP_KONFIG_KEY_KONDITIONEN,
};
