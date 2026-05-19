/* we-presets.js — Pro Airtable-WE-Record-ID ein vollständiger Default-Datensatz.
 * Werte stammen aus den Excel-Kalkulationen (Wesseling WE 8 + 12 direkter Match aus
 * BB_Kalk_Test_Wesseling_*.xlsx) und gepflegten Standards (alle anderen).
 *
 * Wenn Edgar im Kalkulator-Tab eine WE wählt, übernimmt loadWeIntoKalk() ALLE Felder
 * dieses Presets — Hausgeld, Subvention, AfA, Wertsteigerung etc. Airtable-Felder
 * sind in der Praxis nicht immer vollständig, deshalb sind diese Presets die
 * verbindliche Quelle für die Kalkulation.
 *
 * Generiert: 15.05.2026, 17 WEs (6 Wesseling + 11 Heidelberger Bruchsal).
 */
window.WE_PRESETS_BY_RECID = {
  // --- Wesseling, Rheinstraße 290 ---
  // WE 3, 1.OG Links — leerstehend, Marktmiete-Schätzung analog WE 1 (518€ neuvereinbart 1.5.26).
  'rec7svTIribfeHOvg': {
    kaufpreis: 195000, stellplatzKp: 0, qm: 61.11,
    kaltmiete: 518, stellplatzMiete: 0,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 61, hgInflation: 0, mietverwaltung: 30, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
  // WE 4, 1.OG Rechts — leerstehend, renoviert. Marktanker WE 6 290 (500€ ab 1.3.26).
  'reczUcVloFNu1YCUu': {
    kaufpreis: 185000, stellplatzKp: 0, qm: 60.72,
    kaltmiete: 500, stellplatzMiete: 0,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 61, hgInflation: 0, mietverwaltung: 30, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
  // WE 5, 2.OG Links — 2 Garagen!
  'recZiNgahFdBGEG6l': {
    kaufpreis: 173800, stellplatzKp: 20000, qm: 61.11,
    kaltmiete: 400.20, stellplatzMiete: 100,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 61, hgInflation: 0, mietverwaltung: 30, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },

  // --- Wesseling, Rheinstraße 292 ---
  // WE 8, EG Rechts — V1-Excel-Werte 1:1
  'recDl2o8H2Fmigm0R': {
    kaufpreis: 169000, stellplatzKp: 0, qm: 60.56,
    kaltmiete: 540, stellplatzMiete: 0,
    subventionMo: 81, subventionMonate: 12,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 60.56, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 25,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.045, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.02, marktwertProQm: 0,
  },
  // WE 10, 1.OG Rechts — laut Airtable einvernehmliche Erhöhung 593€ ab 1.4.26
  'recpWd0fVaCofq87a': {
    kaufpreis: 195000, stellplatzKp: 0, qm: 60.56,
    kaltmiete: 593, stellplatzMiete: 0,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 60.56, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.037, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
  // WE 12, 2.OG Rechts — V1-Excel-Werte 1:1, mit Marktwert!
  'rec0HGkjl1Ts7ZhVt': {
    kaufpreis: 145000, stellplatzKp: 0, qm: 60.56,
    kaltmiete: 438, stellplatzMiete: 0,
    subventionMo: 65.7, subventionMonate: 26,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 60.56, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.0345, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 3267,
  },

  // --- Heidelberger Str. 21, 76646 Bruchsal ---
  // WE 1, EG Links
  'rec4jjmghcBR3NoTT': {
    kaufpreis: 267000, stellplatzKp: 0, qm: 83.75,
    kaltmiete: 529, stellplatzMiete: 0,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 71, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
  // WE 2, EG Mitte
  'recpASa4GuwvUt6lA': {
    kaufpreis: 235000, stellplatzKp: 0, qm: 70.85,
    kaltmiete: 780, stellplatzMiete: 0,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 60, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
  // WE 3, EG Rechts — mit Garage
  'reck9eRIiDz92vJy2': {
    kaufpreis: 127000, stellplatzKp: 5000, qm: 41.17,
    kaltmiete: 328, stellplatzMiete: 30,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 35, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
  // WE 4, 1.OG Links — mit Garage
  'recrAXSMiykCc9drL': {
    kaufpreis: 200000, stellplatzKp: 5000, qm: 70.47,
    kaltmiete: 497, stellplatzMiete: 30,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 60, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
  // WE 6, 1.OG Rechts
  'rectPiqcgL6kuIMRs': {
    kaufpreis: 165000, stellplatzKp: 0, qm: 53.71,
    kaltmiete: 440, stellplatzMiete: 0,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 46, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
  // WE 7, 2.OG Links
  'receYH3W95jcDf0lL': {
    kaufpreis: 245000, stellplatzKp: 0, qm: 70.47,
    kaltmiete: 595, stellplatzMiete: 0,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 60, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
  // WE 8, 2.OG Mitte — Stellplatz + Garage
  'recGUiC4fol7zSZQd': {
    kaufpreis: 290000, stellplatzKp: 5000, qm: 86.36,
    kaltmiete: 960, stellplatzMiete: 30,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 73, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
  // WE 12, 3.OG Rechts — mit Stellplatz
  'recAKRfmaXurUi2Qf': {
    kaufpreis: 155000, stellplatzKp: 5000, qm: 40.41,
    kaltmiete: 425, stellplatzMiete: 30,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 34, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
  // WE 13, 4.OG Links — mit Garage
  'recqdmuBmE1vAbi9E': {
    kaufpreis: 274000, stellplatzKp: 5000, qm: 83.06,
    kaltmiete: 980, stellplatzMiete: 30,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 71, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
  // WE 14, 4.OG Mitte — Stellplatz + Garage
  'recauQeN6gYLaF7QF': {
    kaufpreis: 290000, stellplatzKp: 5000, qm: 86.36,
    kaltmiete: 745, stellplatzMiete: 30,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 73, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
  // WE 15, 4.OG Rechts — mit Stellplatz (Fläche)
  'recEdNr0D8cOnWHOi': {
    kaufpreis: 150000, stellplatzKp: 3000, qm: 41.12,
    kaltmiete: 340, stellplatzMiete: 20,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 35, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
  // WE 16, DG Links — mit Garage. Miete in Airtable leer → realistisch geschätzt anhand qm
  'recrClPmoAEdLCfhu': {
    kaufpreis: 200000, stellplatzKp: 5000, qm: 54.69,
    kaltmiete: 410, stellplatzMiete: 30,
    subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15, monateSeitMieterhoehung: 0,
    hausgeld: 47, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03, marktwertProQm: 0,
  },
};
