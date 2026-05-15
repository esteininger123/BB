// Zentrale Table- und Field-IDs (aus SPEC.md).
// Field-IDs werden überall verwendet (NICHT Namen) für Stabilität gegenüber Umbenennungen.

const TABLES = {
  VERTRIEBLER: 'tblXG135L28XocpeY',
  KUNDEN:      'tbld0j0Mo7rre1Vh3',
  SNAPSHOTS:   'tbliqxbITCdSjK0ua',
  // Wohneinheit + Objekt: aus Base "Objektmanagement" (appikHUetNyeonXBX).
  // Env-Override optional (WOHNEINHEIT_TABLE_ID / PROJEKT_TABLE_ID).
  WOHNEINHEIT: process.env.WOHNEINHEIT_TABLE_ID || 'tblAV81mX1MaxqVQi',
  // Objekt-Tabelle (in Airtable "Objekt" benannt). Das ist die Tabelle, auf die
  // das WE-Feld "Objekt" zeigt — enthält Heidelberger Str. 21 / WES_RHEIN 290 etc.
  PROJEKT:     process.env.PROJEKT_TABLE_ID     || 'tblbBSh0fyPelFLvz'
};

// Felder der Objekt-Tabelle, die wir lesen
const PROJEKT_FIELDS = {
  KURZNAME:    'fldTf1OEHLteVRa7c', // "Heidelberger Str. 21, 76646 Bruchsal" / "WES_RHEIN 290"
  ADRESSE:     'fldE2LFvX5iPBUqTh', // "Heidelberger Straße 21, 76646 Bruchsal"
  OBJEKT_CODE: 'fldgYBkL3Hajuy8uJ', // "Obj: Heidelberger Str. 21, 76646 Bruchsal, 92"
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
  LAST_ACTIVITY:  'fldRghZ5CtIBw2rWn'
};

const SNAPSHOT_FIELDS = {
  BEZEICHNUNG:    'fldc9T4R4oowvzYeJ',
  KUNDE:          'fldk6jkQu6UEIFv6T',
  WE_BEZ:         'fldCSEFLQgBmSo9ib',
  WE_RECID:       'fldgmCTYq3iFluCQf',
  ERSTELLT_VON:   'fldOfahUEZJOvSzUy',
  PDF_TYP:        'fldXDtsB9FyqDh6Pu',
  KALK_JSON:      'fldi8yTPSesezJRYv',
  CREATED:        'fldGeavlVvA5feJTC'
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
  PROJEKT:     'fld1cp8nYcq6wXZx6'
};

const WE_STATUS_VERMARKTUNG = 'Vermarktung / Im Verkauf';
const MAKLER_BUB = 'B&B Immo GmbH';

module.exports = {
  TABLES,
  VERTRIEBLER_FIELDS,
  KUNDEN_FIELDS,
  SNAPSHOT_FIELDS,
  WE_FIELDS,
  PROJEKT_FIELDS,
  WE_STATUS_VERMARKTUNG,
  MAKLER_BUB
};
