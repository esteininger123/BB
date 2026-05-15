/* we-stammdaten.js — Single Source of Truth für WE-Stammdaten (B&B Immo).
   Quelle: 12 Excel-Kalkulationen aus Google Drive (Stand 2026-05-15).
   Pro WE: alle hausbezogenen / wohnungsbezogenen Daten als strukturiertes Objekt.
   Endkunden-spezifische Werte (Steuersatz, Zinsen, Tilgung) sind NICHT enthalten —
   die kommen aus der Bonität / Profil-Auswahl. */

window.WE_STAMMDATEN = {
  // ---------- Heidelberger Straße 21, 76646 Bruchsal ----------

  'rec4jjmghcBR3NoTT': { /* Heidelberger WE 1 — EG Links */
    excelTitel: 'Kalk_Bruch_Heid_WHG1.xlsx',
    excelDatum: '2026-05-15',
    weNr: '1',
    projekt: 'heidelberger',
    adresse: 'Heidelberger Straße 21, 76646 Bruchsal',
    lage: 'EG Links',
    qm: 83.75,
    kaufpreis: 239000,
    qmPreis: 2854.00,
    stellplatzKp: 0,
    kaltmiete: 921.25,
    marktmieteQmAktuell: null,
    marktmieteQmIn2Jahren: null,
    mietzuschussMo: 0,
    mietzuschussLaufzeitMonate: 0,
    hausverwaltungMo: 30.00,
    hausgeldMo: 41.88,
    ruecklageMo: 0,
    mietverwaltungMoDefault: 29,
    afaRegulaerPct: 2.0,
    afaGutachtenPct: 3.0,
    mieterhoehungSchema: [
      { jahr: 1, mieteMo: 921.25 }, { jahr: 2, mieteMo: 921.25 }, { jahr: 3, mieteMo: 1012.54 },
      { jahr: 4, mieteMo: 1012.54 }, { jahr: 5, mieteMo: 1012.54 }, { jahr: 6, mieteMo: 1073.29 },
      { jahr: 7, mieteMo: 1073.29 }, { jahr: 8, mieteMo: 1073.29 }, { jahr: 9, mieteMo: 1137.69 },
      { jahr: 10, mieteMo: 1137.69 }, { jahr: 11, mieteMo: 1137.69 }, { jahr: 12, mieteMo: 1171.82 },
      { jahr: 13, mieteMo: 1206.97 }, { jahr: 14, mieteMo: 1243.18 }, { jahr: 15, mieteMo: 1280.48 },
      { jahr: 16, mieteMo: 1318.89 }, { jahr: 17, mieteMo: 1358.46 }, { jahr: 18, mieteMo: 1399.21 },
      { jahr: 19, mieteMo: 1441.19 }, { jahr: 20, mieteMo: 1484.42 }, { jahr: 21, mieteMo: 1528.96 },
      { jahr: 22, mieteMo: 1574.83 }, { jahr: 23, mieteMo: 1622.07 }, { jahr: 24, mieteMo: 1670.73 },
      { jahr: 25, mieteMo: 1720.85 }, { jahr: 26, mieteMo: 1772.48 }, { jahr: 27, mieteMo: 1825.65 },
      { jahr: 28, mieteMo: 1880.42 }, { jahr: 29, mieteMo: 1936.84 }, { jahr: 30, mieteMo: 1994.94 }
    ],
    wertsteigerungPctPa: 3.0,
    notizen: 'Hausgeld+Rücklage zusammen (41,88 €/Mo).'
  },

  'recpASa4GuwvUt6lA': { /* Heidelberger WE 2 — EG Mitte */
    excelTitel: 'Kalk_Bruch_Heid_WHG2.xlsx',
    excelDatum: '2026-05-15',
    weNr: '2',
    projekt: 'heidelberger',
    adresse: 'Heidelberger Straße 21, 76646 Bruchsal',
    lage: null,
    qm: 70.85,
    kaufpreis: 220000,
    qmPreis: 3105.00,
    stellplatzKp: 15000,
    kaltmiete: 830.00,
    marktmieteQmAktuell: null,
    marktmieteQmIn2Jahren: null,
    mietzuschussMo: 0,
    mietzuschussLaufzeitMonate: 0,
    hausverwaltungMo: 30.00,
    hausgeldMo: 35.43,
    ruecklageMo: 0,
    mietverwaltungMoDefault: 29,
    afaRegulaerPct: 2.0,
    afaGutachtenPct: 3.0,
    mieterhoehungSchema: [
      { jahr: 1, mieteMo: 830.00 }, { jahr: 2, mieteMo: 830.00 }, { jahr: 3, mieteMo: 988.40 },
      { jahr: 4, mieteMo: 988.40 }, { jahr: 5, mieteMo: 988.40 }, { jahr: 6, mieteMo: 1000.57 },
      { jahr: 7, mieteMo: 1000.57 }, { jahr: 8, mieteMo: 1000.57 }, { jahr: 9, mieteMo: 1057.60 },
      { jahr: 10, mieteMo: 1057.60 }
    ],
    wertsteigerungPctPa: 3.0,
    notizen: 'Stellplatz: Garage 15.000 €. Bestandsmiete 780 €/Mo + 50 € Garage. Hausgeld+Rücklage zusammen.'
  },

  'recrAXSMiykCc9drL': { /* Heidelberger WE 4 */
    excelTitel: 'Kalk_Bruch_Heid_WHG4.xlsx',
    excelDatum: '2026-05-15',
    weNr: '4',
    projekt: 'heidelberger',
    adresse: 'Heidelberger Straße 21, 76646 Bruchsal',
    lage: null,
    qm: 70.47,
    kaufpreis: 185000,
    qmPreis: 2625.00,
    stellplatzKp: 15000,
    kaltmiete: 636.40,
    marktmieteQmAktuell: null,
    marktmieteQmIn2Jahren: null,
    mietzuschussMo: 119.28,
    mietzuschussLaufzeitMonate: 24,
    hausverwaltungMo: 30.00,
    hausgeldMo: 35.24,
    ruecklageMo: 0,
    mietverwaltungMoDefault: 29,
    afaRegulaerPct: 2.0,
    afaGutachtenPct: 3.0,
    mieterhoehungSchema: [
      { jahr: 1, mieteMo: 636.40 }, { jahr: 2, mieteMo: 636.40 }, { jahr: 3, mieteMo: 755.68 },
      { jahr: 4, mieteMo: 755.68 }, { jahr: 5, mieteMo: 755.68 }, { jahr: 6, mieteMo: 898.82 },
      { jahr: 7, mieteMo: 898.82 }, { jahr: 8, mieteMo: 898.82 }, { jahr: 9, mieteMo: 984.70 },
      { jahr: 10, mieteMo: 984.70 }, { jahr: 11, mieteMo: 984.70 }, { jahr: 12, mieteMo: 1014.24 },
      { jahr: 13, mieteMo: 1044.67 }, { jahr: 14, mieteMo: 1076.01 }, { jahr: 15, mieteMo: 1108.29 },
      { jahr: 16, mieteMo: 1141.53 }, { jahr: 17, mieteMo: 1175.78 }, { jahr: 18, mieteMo: 1211.05 },
      { jahr: 19, mieteMo: 1247.39 }, { jahr: 20, mieteMo: 1284.81 }, { jahr: 21, mieteMo: 1323.35 },
      { jahr: 22, mieteMo: 1363.05 }, { jahr: 23, mieteMo: 1403.94 }, { jahr: 24, mieteMo: 1446.06 },
      { jahr: 25, mieteMo: 1489.44 }, { jahr: 26, mieteMo: 1534.13 }, { jahr: 27, mieteMo: 1580.15 },
      { jahr: 28, mieteMo: 1627.56 }, { jahr: 29, mieteMo: 1676.38 }, { jahr: 30, mieteMo: 1726.67 }
    ],
    wertsteigerungPctPa: 3.0,
    notizen: 'Stellplatz: Garage 15.000 €. Mietzuschuss 119,28 €/Mo für 2 Jahre. Hausgeld+Rücklage zusammen.'
  },

  'rectPiqcgL6kuIMRs': { /* Heidelberger WE 6 */
    excelTitel: 'Kalk_Bruch_Heid_WHG6.xlsx',
    excelDatum: '2026-05-15',
    weNr: '6',
    projekt: 'heidelberger',
    adresse: 'Heidelberger Straße 21, 76646 Bruchsal',
    lage: null,
    qm: 53.71,
    kaufpreis: 165000,
    qmPreis: 3072.00,
    stellplatzKp: 0,
    kaltmiete: 537.10,
    marktmieteQmAktuell: null,
    marktmieteQmIn2Jahren: null,
    mietzuschussMo: 107.42,
    mietzuschussLaufzeitMonate: 24,
    hausverwaltungMo: 30.00,
    hausgeldMo: 26.86,
    ruecklageMo: 0,
    mietverwaltungMoDefault: 29,
    afaRegulaerPct: 2.0,
    afaGutachtenPct: 3.0,
    mieterhoehungSchema: [
      { jahr: 1, mieteMo: 537.10 }, { jahr: 2, mieteMo: 537.10 }, { jahr: 3, mieteMo: 644.52 },
      { jahr: 4, mieteMo: 644.52 }, { jahr: 5, mieteMo: 644.52 }, { jahr: 6, mieteMo: 701.45 },
      { jahr: 7, mieteMo: 701.45 }, { jahr: 8, mieteMo: 701.45 }, { jahr: 9, mieteMo: 743.54 },
      { jahr: 10, mieteMo: 743.54 }, { jahr: 11, mieteMo: 743.54 }, { jahr: 12, mieteMo: 765.84 },
      { jahr: 13, mieteMo: 788.82 }, { jahr: 14, mieteMo: 812.48 }, { jahr: 15, mieteMo: 836.86 },
      { jahr: 16, mieteMo: 861.96 }, { jahr: 17, mieteMo: 887.82 }, { jahr: 18, mieteMo: 914.46 },
      { jahr: 19, mieteMo: 941.89 }, { jahr: 20, mieteMo: 970.15 }, { jahr: 21, mieteMo: 999.25 },
      { jahr: 22, mieteMo: 1029.23 }, { jahr: 23, mieteMo: 1060.11 }, { jahr: 24, mieteMo: 1091.91 },
      { jahr: 25, mieteMo: 1124.67 }, { jahr: 26, mieteMo: 1158.41 }, { jahr: 27, mieteMo: 1193.16 },
      { jahr: 28, mieteMo: 1228.95 }, { jahr: 29, mieteMo: 1265.82 }, { jahr: 30, mieteMo: 1303.80 }
    ],
    wertsteigerungPctPa: 3.0,
    notizen: 'Mietzuschuss 107,42 €/Mo für 2 Jahre. Hausgeld+Rücklage zusammen.'
  },

  'receYH3W95jcDf0lL': { /* Heidelberger WE 7 */
    excelTitel: 'Kalk_Bruch_Heid_WHG7.xlsx',
    excelDatum: '2026-05-15',
    weNr: '7',
    projekt: 'heidelberger',
    adresse: 'Heidelberger Straße 21, 76646 Bruchsal',
    lage: null,
    qm: 70.47,
    kaufpreis: 230000,
    qmPreis: 3264.00,
    stellplatzKp: 15000,
    kaltmiete: 784.94,
    marktmieteQmAktuell: 11.73,
    marktmieteQmIn2Jahren: null,
    mietzuschussMo: 147.99,
    mietzuschussLaufzeitMonate: 24,
    hausverwaltungMo: 30.00,
    hausgeldMo: 35.24,
    ruecklageMo: 0,
    mietverwaltungMoDefault: 29,
    afaRegulaerPct: 2.0,
    afaGutachtenPct: 3.0,
    mieterhoehungSchema: [
      { jahr: 1, mieteMo: 784.94 }, { jahr: 2, mieteMo: 784.94 }, { jahr: 3, mieteMo: 932.93 },
      { jahr: 4, mieteMo: 932.93 }, { jahr: 5, mieteMo: 932.93 }, { jahr: 6, mieteMo: 986.20 },
      { jahr: 7, mieteMo: 986.20 }, { jahr: 8, mieteMo: 986.20 }, { jahr: 9, mieteMo: 1042.68 },
      { jahr: 10, mieteMo: 1042.68 }, { jahr: 11, mieteMo: 1042.68 }, { jahr: 12, mieteMo: 1073.96 },
      { jahr: 13, mieteMo: 1106.17 }, { jahr: 14, mieteMo: 1139.36 }, { jahr: 15, mieteMo: 1173.54 },
      { jahr: 16, mieteMo: 1208.75 }, { jahr: 17, mieteMo: 1245.01 }, { jahr: 18, mieteMo: 1282.36 },
      { jahr: 19, mieteMo: 1320.83 }, { jahr: 20, mieteMo: 1360.46 }, { jahr: 21, mieteMo: 1401.27 },
      { jahr: 22, mieteMo: 1443.31 }, { jahr: 23, mieteMo: 1486.61 }, { jahr: 24, mieteMo: 1531.20 },
      { jahr: 25, mieteMo: 1577.14 }, { jahr: 26, mieteMo: 1624.46 }, { jahr: 27, mieteMo: 1673.19 },
      { jahr: 28, mieteMo: 1723.38 }, { jahr: 29, mieteMo: 1775.09 }, { jahr: 30, mieteMo: 1828.34 }
    ],
    wertsteigerungPctPa: 3.0,
    notizen: 'Stellplatz: Garage 15.000 €. Mietspiegel 11,73 €/m². Bestandsmiete 740 € + 45 € Garage. Mietzuschuss 147,99 €/Mo für 2 Jahre.'
  },

  'recGUiC4fol7zSZQd': { /* Heidelberger WE 8 */
    excelTitel: 'Kalk_Bruch_Heid_WHG8.xlsx',
    excelDatum: '2026-05-15',
    weNr: '8',
    projekt: 'heidelberger',
    adresse: 'Heidelberger Straße 21, 76646 Bruchsal',
    lage: null,
    qm: 86.36,
    kaufpreis: 275000,
    qmPreis: 3184.00,
    stellplatzKp: 15000,
    kaltmiete: 1088.00,
    marktmieteQmAktuell: 11.73,
    marktmieteQmIn2Jahren: null,
    mietzuschussMo: 0,
    mietzuschussLaufzeitMonate: 0,
    hausverwaltungMo: 30.00,
    hausgeldMo: 43.18,
    ruecklageMo: 0,
    mietverwaltungMoDefault: 29,
    afaRegulaerPct: 2.0,
    afaGutachtenPct: 3.0,
    mieterhoehungSchema: [
      { jahr: 1, mieteMo: 1088.00 }, { jahr: 2, mieteMo: 1088.00 }, { jahr: 3, mieteMo: 1148.78 },
      { jahr: 4, mieteMo: 1148.78 }, { jahr: 5, mieteMo: 1148.78 }, { jahr: 6, mieteMo: 1213.21 },
      { jahr: 7, mieteMo: 1213.21 }, { jahr: 8, mieteMo: 1213.21 }, { jahr: 9, mieteMo: 1281.50 },
      { jahr: 10, mieteMo: 1281.50 }, { jahr: 11, mieteMo: 1281.50 }, { jahr: 12, mieteMo: 1319.95 },
      { jahr: 13, mieteMo: 1359.55 }, { jahr: 14, mieteMo: 1400.33 }, { jahr: 15, mieteMo: 1442.34 },
      { jahr: 16, mieteMo: 1485.61 }, { jahr: 17, mieteMo: 1530.18 }, { jahr: 18, mieteMo: 1576.09 },
      { jahr: 19, mieteMo: 1623.37 }, { jahr: 20, mieteMo: 1672.07 }, { jahr: 21, mieteMo: 1722.23 },
      { jahr: 22, mieteMo: 1773.90 }, { jahr: 23, mieteMo: 1827.12 }, { jahr: 24, mieteMo: 1881.93 },
      { jahr: 25, mieteMo: 1938.39 }, { jahr: 26, mieteMo: 1996.54 }, { jahr: 27, mieteMo: 2056.44 },
      { jahr: 28, mieteMo: 2118.13 }, { jahr: 29, mieteMo: 2181.67 }, { jahr: 30, mieteMo: 2247.12 }
    ],
    wertsteigerungPctPa: 3.0,
    notizen: 'Stellplatz: Garage 15.000 €. Mietspiegel 11,73 €/m². Miete kann gleich erhöht werden. Bestandsmiete 960 € + 50 € Garage + 25 € Stellplatz.'
  },

  'recAKRfmaXurUi2Qf': { /* Heidelberger WE 12 */
    excelTitel: 'Kalk_Bruch_Heid_WHG12.xlsx',
    excelDatum: '2026-05-15',
    weNr: '12',
    projekt: 'heidelberger',
    adresse: 'Heidelberger Straße 21, 76646 Bruchsal',
    lage: null,
    qm: 40.41,
    kaufpreis: 145000,
    qmPreis: 3588.00,
    stellplatzKp: 10000,
    kaltmiete: 450.00,
    marktmieteQmAktuell: null,
    marktmieteQmIn2Jahren: null,
    mietzuschussMo: 85.00,
    mietzuschussLaufzeitMonate: 24,
    hausverwaltungMo: 30.00,
    hausgeldMo: 20.21,
    ruecklageMo: 0,
    mietverwaltungMoDefault: 29,
    afaRegulaerPct: 2.0,
    afaGutachtenPct: 3.0,
    mieterhoehungSchema: [
      { jahr: 1, mieteMo: 450.00 }, { jahr: 2, mieteMo: 450.00 }, { jahr: 3, mieteMo: 535.00 },
      { jahr: 4, mieteMo: 535.00 }, { jahr: 5, mieteMo: 535.00 }, { jahr: 6, mieteMo: 565.60 },
      { jahr: 7, mieteMo: 565.60 }, { jahr: 8, mieteMo: 565.60 }, { jahr: 9, mieteMo: 598.04 },
      { jahr: 10, mieteMo: 598.04 }, { jahr: 11, mieteMo: 598.04 }, { jahr: 12, mieteMo: 615.98 },
      { jahr: 13, mieteMo: 634.46 }, { jahr: 14, mieteMo: 653.49 }, { jahr: 15, mieteMo: 673.09 },
      { jahr: 16, mieteMo: 693.29 }, { jahr: 17, mieteMo: 714.09 }, { jahr: 18, mieteMo: 735.51 },
      { jahr: 19, mieteMo: 757.57 }, { jahr: 20, mieteMo: 780.30 }, { jahr: 21, mieteMo: 803.71 },
      { jahr: 22, mieteMo: 827.82 }, { jahr: 23, mieteMo: 852.66 }, { jahr: 24, mieteMo: 878.24 },
      { jahr: 25, mieteMo: 904.58 }, { jahr: 26, mieteMo: 931.72 }, { jahr: 27, mieteMo: 959.67 },
      { jahr: 28, mieteMo: 988.46 }, { jahr: 29, mieteMo: 1018.12 }, { jahr: 30, mieteMo: 1048.66 }
    ],
    wertsteigerungPctPa: 3.0,
    notizen: 'Stellplatz 10.000 €. Bestandsmiete 425 € Wohnung + 25 € Stellplatz. Mietzuschuss 85 €/Mo für 2 Jahre.'
  },

  'recEdNr0D8cOnWHOi': { /* Heidelberger WE 15 */
    excelTitel: 'Kalk_Bruch_Heid_WHG15.xlsx',
    excelDatum: '2026-05-15',
    weNr: '15',
    projekt: 'heidelberger',
    adresse: 'Heidelberger Straße 21, 76646 Bruchsal',
    lage: null,
    qm: 41.12,
    kaufpreis: 145000,
    qmPreis: 3526.00,
    stellplatzKp: 10000,
    kaltmiete: 472.32,
    marktmieteQmAktuell: null,
    marktmieteQmIn2Jahren: null,
    mietzuschussMo: 84.71,
    mietzuschussLaufzeitMonate: 24,
    hausverwaltungMo: 30.00,
    hausgeldMo: 20.56,
    ruecklageMo: 0,
    mietverwaltungMoDefault: 29,
    afaRegulaerPct: 2.0,
    afaGutachtenPct: 3.0,
    mieterhoehungSchema: [
      { jahr: 1, mieteMo: 472.32 }, { jahr: 2, mieteMo: 472.32 }, { jahr: 3, mieteMo: 562.78 },
      { jahr: 4, mieteMo: 562.78 }, { jahr: 5, mieteMo: 562.78 }, { jahr: 6, mieteMo: 595.35 },
      { jahr: 7, mieteMo: 595.35 }, { jahr: 8, mieteMo: 595.35 }, { jahr: 9, mieteMo: 629.87 },
      { jahr: 10, mieteMo: 629.87 }, { jahr: 11, mieteMo: 629.87 }, { jahr: 12, mieteMo: 648.77 },
      { jahr: 13, mieteMo: 668.23 }, { jahr: 14, mieteMo: 688.28 }, { jahr: 15, mieteMo: 708.93 },
      { jahr: 16, mieteMo: 730.19 }, { jahr: 17, mieteMo: 752.10 }, { jahr: 18, mieteMo: 774.66 },
      { jahr: 19, mieteMo: 797.90 }, { jahr: 20, mieteMo: 821.84 }, { jahr: 21, mieteMo: 846.50 },
      { jahr: 22, mieteMo: 871.89 }, { jahr: 23, mieteMo: 898.05 }, { jahr: 24, mieteMo: 924.99 },
      { jahr: 25, mieteMo: 952.74 }, { jahr: 26, mieteMo: 981.32 }, { jahr: 27, mieteMo: 1010.76 },
      { jahr: 28, mieteMo: 1041.08 }, { jahr: 29, mieteMo: 1072.32 }, { jahr: 30, mieteMo: 1104.48 }
    ],
    wertsteigerungPctPa: 3.0,
    notizen: 'Stellplatz 10.000 €. Bestandsmiete 452,32 € Wohnung + 20 € Stellplatz. Mietzuschuss 84,71 €/Mo für 2 Jahre.'
  },

  // ---------- Wesseling Rheinstraße 290 ----------

  'rec7svTIribfeHOvg': { /* Wesseling WE 3 R290 */
    excelTitel: 'Kalkulation_Wesseling3.xlsx',
    excelDatum: '2026-05-15',
    weNr: '3',
    projekt: 'wesseling-r290',
    adresse: 'Rheinstraße 290, Wesseling',
    lage: null,
    qm: 61.11,
    kaufpreis: 185000,
    qmPreis: 3027.00,
    stellplatzKp: 10000,
    kaltmiete: 818.88,
    marktmieteQmAktuell: null,
    marktmieteQmIn2Jahren: null,
    mietzuschussMo: 0,
    mietzuschussLaufzeitMonate: 0,
    hausverwaltungMo: 30.00,
    hausgeldMo: 61.11,
    ruecklageMo: 0,
    mietverwaltungMoDefault: 30,
    afaRegulaerPct: 2.0,
    afaGutachtenPct: 3.70,
    mieterhoehungSchema: [
      { jahr: 1, mieteMo: 818.88 }, { jahr: 2, mieteMo: 834.26 }, { jahr: 3, mieteMo: 849.94 },
      { jahr: 4, mieteMo: 865.94 }, { jahr: 5, mieteMo: 882.26 }, { jahr: 6, mieteMo: 898.91 },
      { jahr: 7, mieteMo: 915.88 }, { jahr: 8, mieteMo: 933.20 }, { jahr: 9, mieteMo: 950.87 },
      { jahr: 10, mieteMo: 968.88 }, { jahr: 11, mieteMo: 987.26 }, { jahr: 12, mieteMo: 1006.01 },
      { jahr: 13, mieteMo: 1036.19 }, { jahr: 14, mieteMo: 1067.27 }, { jahr: 15, mieteMo: 1099.29 },
      { jahr: 16, mieteMo: 1132.27 }, { jahr: 17, mieteMo: 1166.24 }, { jahr: 18, mieteMo: 1201.22 },
      { jahr: 19, mieteMo: 1237.26 }, { jahr: 20, mieteMo: 1274.38 }, { jahr: 21, mieteMo: 1312.61 },
      { jahr: 22, mieteMo: 1351.99 }, { jahr: 23, mieteMo: 1392.55 }, { jahr: 24, mieteMo: 1434.32 },
      { jahr: 25, mieteMo: 1477.35 }, { jahr: 26, mieteMo: 1521.67 }, { jahr: 27, mieteMo: 1567.32 },
      { jahr: 28, mieteMo: 1614.34 }, { jahr: 29, mieteMo: 1662.77 }, { jahr: 30, mieteMo: 1712.66 }
    ],
    wertsteigerungPctPa: 3.0,
    notizen: 'Garage 10.000 €. Staffelmietvertrag (2 %/a). Bestandsmiete inkl. Garage 818,88 €/Mo. Grunderwerbsteuer 6,5 %.'
  },

  'reczUcVloFNu1YCUu': { /* Wesseling WE 4 R290 */
    excelTitel: 'Kalkulation_Wesseling4.xlsx',
    excelDatum: '2026-05-15',
    weNr: '4',
    projekt: 'wesseling-r290',
    adresse: 'Rheinstraße 290, Wesseling',
    lage: null,
    qm: 60.72,
    kaufpreis: 185000,
    qmPreis: 3047.00,
    stellplatzKp: 10000,
    kaltmiete: 758.13,
    marktmieteQmAktuell: null,
    marktmieteQmIn2Jahren: null,
    mietzuschussMo: 0,
    mietzuschussLaufzeitMonate: 0,
    hausverwaltungMo: 30.00,
    hausgeldMo: 60.72,
    ruecklageMo: 0,
    mietverwaltungMoDefault: 29,
    afaRegulaerPct: 2.0,
    afaGutachtenPct: 3.45,
    mieterhoehungSchema: [
      { jahr: 1, mieteMo: 758.13 }, { jahr: 2, mieteMo: 758.13 }, { jahr: 3, mieteMo: 803.62 },
      { jahr: 4, mieteMo: 803.62 }, { jahr: 5, mieteMo: 803.62 }, { jahr: 6, mieteMo: 851.83 },
      { jahr: 7, mieteMo: 851.83 }, { jahr: 8, mieteMo: 851.83 }, { jahr: 9, mieteMo: 902.94 },
      { jahr: 10, mieteMo: 902.94 }, { jahr: 11, mieteMo: 902.94 }, { jahr: 12, mieteMo: 930.03 },
      { jahr: 13, mieteMo: 957.93 }, { jahr: 14, mieteMo: 986.67 }, { jahr: 15, mieteMo: 1016.27 },
      { jahr: 16, mieteMo: 1046.76 }, { jahr: 17, mieteMo: 1078.16 }, { jahr: 18, mieteMo: 1110.51 },
      { jahr: 19, mieteMo: 1143.82 }, { jahr: 20, mieteMo: 1178.14 }, { jahr: 21, mieteMo: 1213.48 },
      { jahr: 22, mieteMo: 1249.89 }, { jahr: 23, mieteMo: 1287.38 }, { jahr: 24, mieteMo: 1326.01 },
      { jahr: 25, mieteMo: 1365.79 }, { jahr: 26, mieteMo: 1406.76 }, { jahr: 27, mieteMo: 1448.96 },
      { jahr: 28, mieteMo: 1492.43 }, { jahr: 29, mieteMo: 1537.20 }, { jahr: 30, mieteMo: 1583.32 }
    ],
    wertsteigerungPctPa: 3.0,
    notizen: 'Garage 10.000 € (optional, noch eine verfügbar). Bisher kein Gutachten – Wohnung renoviert. Bestandsmiete inkl. Garage 758,13 €/Mo.'
  },

  'recZiNgahFdBGEG6l': { /* Wesseling WE 5 R290 */
    excelTitel: 'Kalkulation_Wesseling5.xlsx',
    excelDatum: '2026-05-15',
    weNr: '5',
    projekt: 'wesseling-r290',
    adresse: 'Rheinstraße 290, Wesseling',
    lage: null,
    qm: 61.11,
    kaufpreis: 153800,
    qmPreis: 2517.00,
    stellplatzKp: 20000,
    kaltmiete: 500.20,
    marktmieteQmAktuell: null,
    marktmieteQmIn2Jahren: null,
    mietzuschussMo: 60.03,
    mietzuschussLaufzeitMonate: 26,
    hausverwaltungMo: 30.00,
    hausgeldMo: 61.11,
    ruecklageMo: 0,
    mietverwaltungMoDefault: 29,
    afaRegulaerPct: 2.0,
    afaGutachtenPct: 3.45,
    mieterhoehungSchema: [
      { jahr: 1, mieteMo: 500.20 }, { jahr: 2, mieteMo: 560.23 }, { jahr: 3, mieteMo: 560.23 },
      { jahr: 4, mieteMo: 560.23 }, { jahr: 5, mieteMo: 629.26 }, { jahr: 6, mieteMo: 629.26 },
      { jahr: 7, mieteMo: 629.26 }, { jahr: 8, mieteMo: 708.65 }, { jahr: 9, mieteMo: 708.65 },
      { jahr: 10, mieteMo: 708.65 }, { jahr: 11, mieteMo: 799.95 }, { jahr: 12, mieteMo: 823.95 },
      { jahr: 13, mieteMo: 848.67 }, { jahr: 14, mieteMo: 874.13 }, { jahr: 15, mieteMo: 900.35 },
      { jahr: 16, mieteMo: 927.36 }, { jahr: 17, mieteMo: 955.18 }, { jahr: 18, mieteMo: 983.84 },
      { jahr: 19, mieteMo: 1013.36 }, { jahr: 20, mieteMo: 1043.76 }, { jahr: 21, mieteMo: 1075.07 },
      { jahr: 22, mieteMo: 1107.32 }, { jahr: 23, mieteMo: 1140.54 }, { jahr: 24, mieteMo: 1174.76 },
      { jahr: 25, mieteMo: 1210.00 }, { jahr: 26, mieteMo: 1246.30 }, { jahr: 27, mieteMo: 1283.69 },
      { jahr: 28, mieteMo: 1322.20 }, { jahr: 29, mieteMo: 1361.87 }, { jahr: 30, mieteMo: 1402.72 }
    ],
    wertsteigerungPctPa: 3.0,
    notizen: '2 Garagen mit vermietet, KP Garagen 20.000 €. Kaltmiete 400,20 € (kann zum 1.9.28 erhöht werden) + 100 € für 2 Garagen. Mietzuschuss 60,03 €/Mo für 26 Monate.'
  },

  // ---------- Wesseling Rheinstraße 292 ----------

  'recDl2o8H2Fmigm0R': { /* Wesseling WE 8 R292 */
    excelTitel: 'Kalkulation_Wesseling8.xlsx',
    excelDatum: '2026-05-15',
    weNr: '8',
    projekt: 'wesseling-r292',
    adresse: 'Rheinstraße 292, Wesseling',
    lage: null,
    qm: 60.56,
    kaufpreis: 169000,
    qmPreis: 2791.00,
    stellplatzKp: 0,
    kaltmiete: 540.00,
    marktmieteQmAktuell: null,
    marktmieteQmIn2Jahren: null,
    mietzuschussMo: 81.00,
    mietzuschussLaufzeitMonate: 36,
    hausverwaltungMo: 25.00,
    hausgeldMo: 60.56,
    ruecklageMo: 0,
    mietverwaltungMoDefault: 29,
    afaRegulaerPct: 2.0,
    afaGutachtenPct: 3.45,
    mieterhoehungSchema: [
      { jahr: 1, mieteMo: 540.00 }, { jahr: 2, mieteMo: 540.00 }, { jahr: 3, mieteMo: 540.00 },
      { jahr: 4, mieteMo: 714.15 }, { jahr: 5, mieteMo: 714.15 }, { jahr: 6, mieteMo: 714.15 },
      { jahr: 7, mieteMo: 821.27 }, { jahr: 8, mieteMo: 821.27 }, { jahr: 9, mieteMo: 821.27 },
      { jahr: 10, mieteMo: 845.91 }, { jahr: 11, mieteMo: 871.29 }, { jahr: 12, mieteMo: 897.43 },
      { jahr: 13, mieteMo: 924.35 }, { jahr: 14, mieteMo: 952.08 }, { jahr: 15, mieteMo: 980.64 },
      { jahr: 16, mieteMo: 1010.06 }, { jahr: 17, mieteMo: 1040.36 }, { jahr: 18, mieteMo: 1071.57 },
      { jahr: 19, mieteMo: 1103.72 }, { jahr: 20, mieteMo: 1136.83 }, { jahr: 21, mieteMo: 1170.94 },
      { jahr: 22, mieteMo: 1206.07 }, { jahr: 23, mieteMo: 1242.25 }, { jahr: 24, mieteMo: 1279.52 },
      { jahr: 25, mieteMo: 1317.90 }, { jahr: 26, mieteMo: 1357.44 }, { jahr: 27, mieteMo: 1398.16 },
      { jahr: 28, mieteMo: 1440.11 }, { jahr: 29, mieteMo: 1483.31 }, { jahr: 30, mieteMo: 1527.81 }
    ],
    wertsteigerungPctPa: 2.0,
    notizen: 'Bestandsmiete 540 €/Mo. Mietzuschuss 81 €/Mo für 36 Monate. Wertsteigerung in Excel 2,0 % p.a. (nicht 3 %).'
  }
};

/* ====================================================================
   Mapper Stammdaten → Kalk-Inputs-Shape
   ====================================================================
   Die App liest in app.js loadWeIntoKalk() aus window.WE_PRESETS_BY_RECID.
   Damit wir nichts an app.js anfassen müssen, bauen wir hier die Brücke:
   WE_STAMMDATEN (Excel-Wahrheit) → WE_PRESETS_BY_RECID (Kalk-Inputs).
   Reihenfolge in index.html: zuerst we-presets.js (alte Werte), dann
   we-stammdaten.js — dieser Mapper überschreibt die alten Presets mit
   den Excel-Werten pro WE.
   ==================================================================== */
(function buildPresetsFromStammdaten() {
  const stam = window.WE_STAMMDATEN || {};
  const out = Object.assign({}, window.WE_PRESETS_BY_RECID || {});
  Object.keys(stam).forEach(function(recId) {
    const s = stam[recId];
    if (!s) return;
    // Hausgeld + Rücklage: in den Heidelberger-Excels als 1 Wert. Wenn Rücklage
    // separat gepflegt ist, addieren — sonst nur Hausgeld.
    const hausgeldGesamt = (s.hausgeldMo || 0) + (s.ruecklageMo || 0);
    // Mietsteigerung: bei sprung-Schema 15 % als Standard-Annahme; wir lassen
    // das Schema aus der Excel in mieterhoehungSchema, falls die Kalk-Logik
    // später darauf zugreifen will.
    out[recId] = {
      kaufpreis:       s.kaufpreis || 0,
      stellplatzKp:    s.stellplatzKp || 0,
      qm:              s.qm || 0,
      marktwertProQm:  0,                    // wird vom Vertriebler / Paket-UI gesetzt
      kaltmiete:       s.kaltmiete || 0,
      stellplatzMiete: 0,                    // in Excel nicht separat
      subventionMo:      s.mietzuschussMo || 0,
      subventionMonate:  s.mietzuschussLaufzeitMonate || 0,
      mietsteigerungsModus: 'sprung',
      steigerungProz:       0.15,
      monateSeitMieterhoehung: 0,
      hausgeld:        hausgeldGesamt || Math.round((s.qm || 0)),
      hgInflation:     0.02,
      mietverwaltung:  0,                    // optional 29 €, default 0
      hausverwaltung:  s.hausverwaltungMo || 30,
      afaSatz:         ((s.afaGutachtenPct || 2.0) / 100),
      gebaeudeAnteil:  0.80,
      afaBemessung:    'kaufpreis',
      wertsteigerung:  ((s.wertsteigerungPctPa || 3.0) / 100),
      // Meta für Anzeige / PDF (nicht für Berechnung)
      _stammdatenQuelle: s.excelTitel || null,
      _stammdatenStand:  s.excelDatum  || null,
      _mieterhoehungSchema: s.mieterhoehungSchema || null,
      _marktmieteQmAktuell: s.marktmieteQmAktuell || null,
      _marktmieteQmIn2Jahren: s.marktmieteQmIn2Jahren || null,
    };
  });
  window.WE_PRESETS_BY_RECID = out;
  // Debug: anzahl überschriebener Presets in der Console loggen
  try {
    console.log('[we-stammdaten] Presets aus Excel überschrieben:', Object.keys(stam).length, 'WEs');
  } catch (e) {}
})();
