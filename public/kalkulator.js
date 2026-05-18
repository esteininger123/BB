/* kalkulator.js — komplette Berechnungslogik aus V1 (BB_Kalkulator.html v1.11)
   1:1 übernommen — recalc(), irr(), computeBonitaetDetailed(), Format-Helper,
   PROFILES und PRESETS für Defaults.
   Alle Funktionen auf window.* exportiert (kein ES-Module-Setup nötig). */

/* ====================================================================
   BERECHNUNGSLOGIK — exakt aus build_template.py portiert
   ==================================================================== */

function fmtEur(v, digits) {
  if (v === null || v === undefined || isNaN(v) || !isFinite(v)) return 'n.v.';
  const opts = { minimumFractionDigits: digits || 0, maximumFractionDigits: digits || 0 };
  return Math.round(v).toLocaleString('de-DE', opts) + ' €';
}
function fmtEurMo(v) {
  if (v === null || v === undefined || isNaN(v) || !isFinite(v)) return 'n.v.';
  return v.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' €/Mo';
}
function fmtEurMoDec(v) {
  if (v === null || v === undefined || isNaN(v) || !isFinite(v)) return 'n.v.';
  return v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €/Mo';
}
function fmtPct(v, digits) {
  if (v === null || v === undefined || isNaN(v) || !isFinite(v)) return 'n.v.';
  const d = digits === undefined ? 1 : digits;
  return (v * 100).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d }) + ' %';
}
function fmtEurQm(v) {
  if (v === null || v === undefined || isNaN(v) || !isFinite(v)) return 'n.v.';
  return Math.round(v).toLocaleString('de-DE') + ' €/qm';
}

/**
 * IRR via Newton-Raphson mit Bisektions-Fallback.
 * Liefert null wenn keine sinnvolle Lösung gefunden wird.
 */
function irr(cashflows, guess) {
  if (!cashflows || cashflows.length < 2) return null;
  // Es muss mindestens ein Wechsel im Vorzeichen geben
  let hasPos = false, hasNeg = false;
  for (const cf of cashflows) {
    if (cf > 0) hasPos = true;
    if (cf < 0) hasNeg = true;
  }
  if (!hasPos || !hasNeg) return null;

  let rate = guess === undefined ? 0.1 : guess;
  for (let it = 0; it < 200; it++) {
    let npv = 0, dnpv = 0;
    for (let t = 0; t < cashflows.length; t++) {
      const denom = Math.pow(1 + rate, t);
      npv += cashflows[t] / denom;
      dnpv -= t * cashflows[t] / (denom * (1 + rate));
    }
    if (Math.abs(npv) < 1e-6) return rate;
    if (Math.abs(dnpv) < 1e-12) break;
    let nextRate = rate - npv / dnpv;
    if (nextRate < -0.99) nextRate = -0.99;
    if (Math.abs(nextRate - rate) < 1e-9) return nextRate;
    rate = nextRate;
  }
  // Fallback: Bisektion zwischen -0.99 und 5.0
  let lo = -0.99, hi = 5.0;
  function npvAt(r) {
    let n = 0;
    for (let t = 0; t < cashflows.length; t++) n += cashflows[t] / Math.pow(1 + r, t);
    return n;
  }
  let fLo = npvAt(lo), fHi = npvAt(hi);
  if (fLo * fHi > 0) return null;
  for (let it = 0; it < 100; it++) {
    const mid = (lo + hi) / 2;
    const fMid = npvAt(mid);
    if (Math.abs(fMid) < 1e-6) return mid;
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; }
    else { lo = mid; fLo = fMid; }
  }
  return (lo + hi) / 2;
}

/**
 * Defaults: Wesseling WE 6 + Profil "Standard-Anleger"
 */
function getDefaults() {
  const base = JSON.parse(JSON.stringify(PRESETS.we6));
  return applyProfile(base, PROFILES.standard);
}

/**
 * Käufer-Profile (Vertriebs-Szenarien)
 * Setzen: zins, tilgung, knkMitfinanziert, steuersatz, bonEinnahmen, bonAusgaben, bonVermoegen
 */
const PROFILES = {
  standard: {
    zins: 0.044,
    tilgung: 0.0125,
    knkMitfinanziert: false,
    steuersatz: 0.30,
    bonEinnahmen: 4000, bonAusgaben: 1800, bonVermoegen: 20000,
  },
  premium: {
    zins: 0.044,
    tilgung: 0.0125,
    knkMitfinanziert: false,
    steuersatz: 0.35,
    bonEinnahmen: 5500, bonAusgaben: 2200, bonVermoegen: 20000,
  },
  spitze: {
    zins: 0.044,
    tilgung: 0.0125,
    knkMitfinanziert: false,
    steuersatz: 0.42,
    bonEinnahmen: 8000, bonAusgaben: 3000, bonVermoegen: 20000,
  },
};
const SPAR_ZINS_DEFAULT = 0.025; // Default Tagesgeldzins p.a. (Vergleichsbasis Sparen vs. Investieren)

function applyProfile(state, profile) {
  Object.assign(state, JSON.parse(JSON.stringify(profile)));
  return state;
}

/**
 * Objekt-Preset-Bibliothek (nur objekt-spezifische Werte —
 * steuersatz, knkMitfinanziert, tilgung und Bonität kommen aus PROFILES)
 */
const PRESETS = {
  we6: {
    kaufpreis: 163000, stellplatzKp: 0, qm: 60.65, marktwertProQm: 0,
    kaltmiete: 610, stellplatzMiete: 0, subventionMo: 50, subventionMonate: 24,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.20,
    monateSeitMieterhoehung: 0,
    hausgeld: 60.65, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.037, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  we2: {
    kaufpreis: 139000, stellplatzKp: 10000, qm: 60.65, marktwertProQm: 0,
    kaltmiete: 450, stellplatzMiete: 0, subventionMo: 60.23, subventionMonate: 12,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.137,
    monateSeitMieterhoehung: 0,
    hausgeld: 60.65, hgInflation: 0.02, mietverwaltung: 30, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 1.0, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  we8: {
    kaufpreis: 169000, stellplatzKp: 0, qm: 60.56, marktwertProQm: 0,
    kaltmiete: 540, stellplatzMiete: 0, subventionMo: 81, subventionMonate: 12,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 60.56, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 25,
    zins: 0.045,
    afaSatz: 0.045, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.02,
  },
  we10: {
    kaufpreis: 185000, stellplatzKp: 10000, qm: 60.56, marktwertProQm: 0,
    kaltmiete: 768.13, stellplatzMiete: 50, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'index', steigerungProz: 0.02,
    monateSeitMieterhoehung: 0,
    hausgeld: 60.56, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.037, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  we12: {
    kaufpreis: 145000, stellplatzKp: 0, qm: 60.56, marktwertProQm: 3267,
    kaltmiete: 438, stellplatzMiete: 0, subventionMo: 65.70, subventionMonate: 26,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 60.56, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.0345, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  leer: {
    kaufpreis: 150000, stellplatzKp: 0, qm: 60, marktwertProQm: 0,
    kaltmiete: 600, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.10,
    monateSeitMieterhoehung: 0,
    hausgeld: 60, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  // === Bruchsal Heidelberger Str. 21 (PR-37) ===
  // Default-Annahmen pro WE: AfA 2 % regulär, Subvention 0, Hausgeld = qm × 1 €/Mo gerundet,
  // Hausverwaltung 30 €, Mietsteigerung-Sprung 15 %, Wertsteigerung 3 %.
  br1: {
    kaufpreis: 267000, stellplatzKp: 0, qm: 83.75, marktwertProQm: 0,
    kaltmiete: 529, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 84, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br2: {
    kaufpreis: 235000, stellplatzKp: 0, qm: 70.85, marktwertProQm: 0,
    kaltmiete: 780, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 71, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br3: {
    kaufpreis: 127000, stellplatzKp: 0, qm: 41.17, marktwertProQm: 0,
    kaltmiete: 328, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 41, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br4: {
    kaufpreis: 200000, stellplatzKp: 0, qm: 70.47, marktwertProQm: 0,
    kaltmiete: 497, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 70, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br5: {
    kaufpreis: 269000, stellplatzKp: 0, qm: 86.36, marktwertProQm: 0,
    kaltmiete: 555, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 86, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br6: {
    kaufpreis: 165000, stellplatzKp: 0, qm: 53.71, marktwertProQm: 0,
    kaltmiete: 440, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 54, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br7: {
    kaufpreis: 245000, stellplatzKp: 0, qm: 70.47, marktwertProQm: 0,
    kaltmiete: 595, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 70, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br8: {
    kaufpreis: 290000, stellplatzKp: 0, qm: 86.36, marktwertProQm: 0,
    kaltmiete: 960, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 86, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br9: {
    kaufpreis: 169000, stellplatzKp: 0, qm: 53.71, marktwertProQm: 0,
    kaltmiete: 432, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 54, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br10: {
    kaufpreis: 243000, stellplatzKp: 0, qm: 83.74, marktwertProQm: 0,
    kaltmiete: 559, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 84, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br11: {
    kaufpreis: 295000, stellplatzKp: 0, qm: 86.36, marktwertProQm: 0,
    kaltmiete: 860, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 86, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br12: {
    kaufpreis: 155000, stellplatzKp: 0, qm: 40.41, marktwertProQm: 0,
    kaltmiete: 425, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 40, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br13: {
    kaufpreis: 274000, stellplatzKp: 0, qm: 83.06, marktwertProQm: 0,
    kaltmiete: 980, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 83, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br14: {
    kaufpreis: 290000, stellplatzKp: 0, qm: 86.36, marktwertProQm: 0,
    kaltmiete: 745, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 86, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br15: {
    kaufpreis: 150000, stellplatzKp: 0, qm: 41.12, marktwertProQm: 0,
    kaltmiete: 340, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 41, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br16: {
    kaufpreis: 200000, stellplatzKp: 0, qm: 54.69, marktwertProQm: 0,
    kaltmiete: 0, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 55, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br17: {
    kaufpreis: 195000, stellplatzKp: 0, qm: 66.19, marktwertProQm: 0,
    kaltmiete: 476, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 66, hgInflation: 0.02, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.80, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
};

/**
 * Iter 11: Bank-Standard-Berechnung aus Selbstauskunft.
 * sa = { antragsteller: {...}, mitantragsteller: {...} }
 * gemeinsam = true → Mitantragsteller berücksichtigt; false → nur Antragsteller
 *
 * Bank-Konventionen:
 *   - Netto-Gehalt × Anzahl-Gehälter / 12 (Anrechenbarkeit Gehalt: 100 %)
 *   - Miet-Einnahmen (Vermietung + Bestandsimmo): 80 % Anrechnung (Leerstand/Ausfall)
 *   - Sonstige + Unterhalt + Kindergeld: 100 %
 *   - Haushaltspauschale: 1.100 (1 EW) bzw. 1.600 (2 EW) + 400 pro Kind
 *   - Verbindlichkeiten: mtl. Belastung Bf1+Bf2+Kd1+Kd2 + Vers-Belastung
 *   - Fixkosten: Miete eig. Whg + Unterhaltszahlungen + PKV
 *   - Freies Vermögen (für Bank): Bankguthaben + Wertpapiere + Sparbücher + Bausparen +
 *     Sonstige + Rückkaufwert Versicherung (Bestandsimmobilien-EK NICHT zählen)
 */
function computeBonitaetDetailed(sa, gemeinsam) {
  if (!sa) return null;
  const a = sa.antragsteller || {};
  const m = gemeinsam ? (sa.mitantragsteller || {}) : {};

  // ----- Einkommen -----
  function gehaelter(p) {
    let n = parseFloat(p.anzahlGehaelter || 12);
    if (!isFinite(n)) n = 12;
    const cust = parseFloat(p.anzahlGehaelterCustom);
    if (isFinite(cust) && cust > 0) n = cust;
    return n;
  }
  function einkommen(p) {
    if (!p) return { netto: 0, vermAnr: 0, sonstigeAnr: 0, total: 0 };
    const netto = (parseFloat(p.nettoMo) || 0) * gehaelter(p) / 12;
    const vermBase = (parseFloat(p.vermietungMo) || 0)
      + (p.immo1 ? (parseFloat(p.immo1.mietenMo) || 0) : 0)
      + (p.immo2 ? (parseFloat(p.immo2.mietenMo) || 0) : 0);
    const vermAnr = vermBase * 0.8; // 80 % Mietanrechnung Bank-Standard
    const sonst = (parseFloat(p.sonstigeMo) || 0) + (parseFloat(p.unterhaltMo) || 0) + (parseFloat(p.kindergeldMo) || 0);
    return { netto, vermAnr, sonstigeAnr: sonst, total: netto + vermAnr + sonst };
  }
  const eA = einkommen(a);
  const eM = einkommen(m);
  const einkommenAnrechenbarMo = eA.total + eM.total;

  // ----- Haushaltspauschale (Bank-Standard) -----
  const erwachsene = 1 + (gemeinsam ? 1 : 0);
  const kinder = (parseInt(a.kinderAnzahl) || 0) + (gemeinsam ? (parseInt(m.kinderAnzahl) || 0) : 0);
  const haushaltBasis = erwachsene === 1 ? 1100 : 1600;
  const haushaltPauschale = haushaltBasis + 400 * kinder;

  // ----- Fixkosten (Miete eig. Whg + Unterhalt + PKV) -----
  function fixkosten(p) {
    if (!p) return 0;
    return (parseFloat(p.mieteMo) || 0) + (parseFloat(p.unterhaltZahlungMo) || 0) + (parseFloat(p.pkvMo) || 0);
  }
  const fixA = fixkosten(a);
  const fixM = fixkosten(m);
  const fixkostenMo = fixA + fixM;

  // ----- Verbindlichkeiten (mtl. Belastung) -----
  function verbindMo(p) {
    if (!p) return 0;
    let s = 0;
    ['bf1','bf2','kd1','kd2'].forEach(k => {
      if (p[k]) s += parseFloat(p[k].belastungMo) || 0;
    });
    // Versicherungs-Belastung (z.B. Lebensversicherung mtl.)
    if (p.vers) s += parseFloat(p.vers.belastungMo) || 0;
    return s;
  }
  function verbindRest(p) {
    if (!p) return 0;
    let s = 0;
    ['bf1','bf2','kd1','kd2'].forEach(k => {
      if (p[k]) s += parseFloat(p[k].restsaldo) || 0;
    });
    return s;
  }
  const verbindlichkeitenMo = verbindMo(a) + verbindMo(m);
  const verbindlichkeitenGesamt = verbindRest(a) + verbindRest(m);

  // ----- Liquides Vermögen (Bank-Sicht: "einsetzbar für neue Immobilie") -----
  // Bestandsimmobilien zählen NICHT — sind im Beleihungsauslauf gebunden.
  function liquideVerm(p) {
    if (!p) return 0;
    let s = (parseFloat(p.bankguthaben) || 0)
      + (parseFloat(p.wertpapiere) || 0)
      + (parseFloat(p.sparbuecher) || 0)
      + (parseFloat(p.bausparen) || 0)
      + (parseFloat(p.sonstigeVermoegen) || 0);
    if (p.vers) s += parseFloat(p.vers.rueckkauf) || 0;
    return s;
  }
  const liquidesVermoegen = liquideVerm(a) + liquideVerm(m);

  // ----- Immobilien-Vermögen (Verkehrswert minus Hypotheken) -----
  function immoVerm(p) {
    if (!p) return 0;
    let s = 0;
    ['immo1','immo2'].forEach(k => {
      if (p[k]) {
        const vk = parseFloat(p[k].verkehrswert) || 0;
        const hy = parseFloat(p[k].hypotheken) || 0;
        s += Math.max(0, vk - hy); // Netto-Immobilienvermögen (Wert minus Schulden)
      }
    });
    return s;
  }
  const immobilienVermoegen = immoVerm(a) + immoVerm(m);

  // Gesamt-Vermögen = Liquide + Immobilien. Aber: für die Bank zählt nur "freiesVermoegen" (liquide).
  const gesamtVermoegen = liquidesVermoegen + immobilienVermoegen;

  // ----- Aggregierte Ausgaben (für bon-Vor-Berechnung) -----
  const ausgabenGesamtMo = haushaltPauschale + fixkostenMo + verbindlichkeitenMo;

  // ----- Frei verfügbar (Saldo / Überschuss vor Investment) -----
  const ueberschussMo = einkommenAnrechenbarMo - ausgabenGesamtMo;

  return {
    einkommenAnrechenbarMo,
    einkommenA: eA, einkommenM: eM,
    haushaltPauschale, erwachsene, kinder,
    fixkostenMo, fixkostenA: fixA, fixkostenM: fixM,
    verbindlichkeitenMo, verbindlichkeitenGesamt,
    // Backward-Compatibility: freiesVermoegen = liquidesVermoegen (Bank-Sicht).
    freiesVermoegen: liquidesVermoegen,
    liquidesVermoegen, immobilienVermoegen, gesamtVermoegen,
    ausgabenGesamtMo,
    ueberschussMo,
  };
}

/**
 * Master-Recalc — bildet exakt die Excel-Logik nach
 */
function recalc(i) {
  const kpGesamt = i.kaufpreis + i.stellplatzKp;
  // Kaufnebenkosten: GrESt (variabel pro Bundesland) + Notar 1,5 % + Grundbuch 0,5 %.
  // Keine Maklerprovision — B&B verkauft direkt. GrESt kommt aus Airtable-Stammdaten
  // (i.grEstPct), Fallback 5 % (BaWü).
  const grEstPct = (i.grEstPct !== undefined && i.grEstPct !== null && isFinite(i.grEstPct)) ? i.grEstPct : 0.05;
  const knkPct = grEstPct + 0.015 + 0.005;
  const knk = kpGesamt * knkPct;
  const investitionGesamt = kpGesamt + knk;
  // Iter 7: AfA-Gutachten-Kosten komplett raus aus EK-Bedarf (B&B trägt das,
  // typisch <1.000 €, ist KEINE Käufer-Position). EK-Bedarf = nur KNK (wenn
  // nicht mitfinanziert), sonst 0.
  const ekBedarf = i.knkMitfinanziert ? 0 : knk;
  const darlehen = i.knkMitfinanziert ? investitionGesamt : kpGesamt;

  const annuityMo = darlehen * (i.zins + i.tilgung) / 12;
  const rateM = i.zins / 12;

  // NPER: Detail!B65-Formel:  CEILING(-LN(1 - Darlehen*ratei/(-(-Annuity_year)))/LN(1+ratei), 1)
  // Annuity_year_neg = -G12*(B29+B30) => G16 = -G12*(B29+B30)/12, also -G16 = darlehen*(zins+tilgung)/12 = annuityMo
  // Formel:  CEILING(-LN(1 - L*ri/A_mo)/LN(1+ri), 1)
  let nper;
  const ln1 = 1 - (darlehen * rateM) / annuityMo;
  if (ln1 <= 0 || rateM <= 0) {
    nper = 360;
  } else {
    nper = Math.min(480, Math.ceil(-Math.log(ln1) / Math.log(1 + rateM)));
  }

  // Iter 10: AfA-Bemessung immer auf den Kaufpreis (= das was im Vertrag steht).
  //   Steuerrechtlich gilt: anteilig würden Notar/Grundbuch auf die Anschaffungs-
  //   kosten aktiviert. Pragmatisch nicht — wir nehmen die Vertrags-Basis.
  // AfA-Bemessung: Kaufpreis × Gebäude-Anteil (Boden-Anteil wird abgezogen — der ist nicht abschreibbar).
  // Bei fehlendem gebaeudeAnteil: Default 80 %.
  const gebaeudeAnteilFaktor = (i.gebaeudeAnteil !== undefined && i.gebaeudeAnteil !== null && isFinite(i.gebaeudeAnteil)) ? i.gebaeudeAnteil : 0.8;
  const afaBemessungBetrag = kpGesamt * gebaeudeAnteilFaktor;
  const afaJahr = afaBemessungBetrag * i.afaSatz;
  const afaMo = afaJahr / 12;

  // Excel-CUMIPMT / CUMPRINC mit beliebiger Periodenspanne (von start_p bis end_p, inkl.)
  // PMT (Excel): pmt = -L * r / (1 - (1+r)^-n)  — wir haben aber deutsche Annuität:
  //   annuityMo (positiv aus Sicht der Tilgung). CUMIPMT_negEqExcel.
  function annuityRate(L, r, n) { return -(L * r) / (1 - Math.pow(1 + r, -n)); } // Excel-PMT (negativ)

  function cumipmtExcel(rate, nper_, pv, startP, endP) {
    // Excel: gibt negativen Wert (Zinsen, Auszahlung)
    const pmt = annuityRate(pv, rate, nper_);
    let balance = pv;
    let zinsSum = 0;
    for (let p = 1; p <= endP; p++) {
      const zinsM = balance * rate; // positive Zinsen
      const tilgM = -pmt - zinsM;   // -pmt ist die Annuität als positiver Wert; tilgM positiv
      if (p >= startP) zinsSum += -zinsM; // wie Excel: zinsen negativ
      balance -= tilgM;
    }
    return zinsSum;
  }
  function cumprincExcel(rate, nper_, pv, startP, endP) {
    const pmt = annuityRate(pv, rate, nper_);
    let balance = pv;
    let tilgSum = 0;
    for (let p = 1; p <= endP; p++) {
      const zinsM = balance * rate;
      const tilgM = -pmt - zinsM;
      if (p >= startP) tilgSum += -tilgM; // negativ wie Excel
      balance -= tilgM;
    }
    return tilgSum;
  }

  // 30-Jahres Cashflow — exakt parallel zu Detail!B4:AE15
  const cf = [];
  // Restschuld läuft NACH Excel via "max(0, G12 - SUM($B9:col9))" — also additiv
  // Wir tracken über CUMPRINC echte Restschulden parallel
  let restschuldEcht = darlehen;

  // Iter 10: Mietsteigerungs-Timing — monatlich graduell.
  // monateSeit = Monate seit der letzten Mieterhöhung (0..36).
  // Erste Erhöhung in Monat M1 = max(1, 36 - monateSeit).
  //   monateSeit = 0  → M1 = 36 (= erste Erhöhung Anfang Jahr 4 = ein Monat nach Jahr-3-Ende → mathematisch in Monat 36)
  //   monateSeit = 12 → M1 = 24 (Mitte Jahr 2 als Monat-24-Start)
  //   monateSeit = 24 → M1 = 12 (Anfang Jahr 1 → also de-facto schon im Jahr 1)
  //   monateSeit = 36 → M1 = 1  (sofort)
  // Wir rechnen pro Monat, für jeden Monat m wird die Anzahl der Sprünge ermittelt:
  //   Sprung-Modus: nSprünge(m) = m >= M1 ? floor((m - M1) / 36) + 1 : 0
  //   Index-Modus:  nSprünge(m) = m >= M1 ? floor((m - M1) / 12) + 1 : 0
  //   Faktor(m) = (1 + steigerungProz)^nSprünge(m)
  // Jahresmiete = Summe der Monatsmieten Monate (y-1)*12+1 bis y*12.
  const monateSeit = i.monateSeitMieterhoehung || 0;
  const M1 = Math.max(1, 36 - monateSeit);

  function nSprungeSprung(m) {
    if (m < M1) return 0;
    return Math.floor((m - M1) / 36) + 1;
  }
  function nSprungeIndex(m) {
    if (m < M1) return 0;
    return Math.floor((m - M1) / 12) + 1;
  }
  function nSprungeFor(m) {
    if (i.mietsteigerungsModus === 'sprung') return nSprungeSprung(m);
    if (i.mietsteigerungsModus === 'index')  return nSprungeIndex(m);
    return 0;
  }

  for (let y = 1; y <= 30; y++) {
    // Jahresmiete monats-granular berechnen — gemittelt für mieteJahr
    let kaltmieteJahrSum = 0;
    let kaltmieteMoEndJahr = 0;
    for (let monthOfYear = 1; monthOfYear <= 12; monthOfYear++) {
      const m = (y - 1) * 12 + monthOfYear; // Absoluter Monat 1..360
      const n = nSprungeFor(m);
      const faktor = Math.pow(1 + i.steigerungProz, n);
      const geplanteMo = i.kaltmiete * faktor;
      // Iter 12: Marktmieten-Cap entfernt — Mietsteigerung läuft nur noch über
      // mietsteigerungsModus (sprung/index) und steigerungProz.
      kaltmieteJahrSum += geplanteMo;
      kaltmieteMoEndJahr = geplanteMo; // letzter Monat des Jahres für CF-Anzeige
    }
    const kaltmieteMo = kaltmieteJahrSum / 12; // gemittelt für Anzeige

    // Iter 10: Stellplatzmiete wächst mit Inflation (= i.wertsteigerung),
    // NICHT mit Hausgeld-Inflation, NICHT mit Mietsteigerung (Sprung/Index).
    // Stellplätze sind nicht mietpreisgebunden — folgen marktüblicher Inflation.
    const spMieteMo = i.stellplatzMiete * Math.pow(1 + (i.wertsteigerung || 0), y - 1);

    // Subvention: 2-Phasen-Modell (Iter 41.10).
    // i.subventionPhasen = [{ mo, monate }, { mo, monate }] — falls vorhanden, wird das genutzt.
    // Fallback: 1-Phase über i.subventionMo + i.subventionMonate (Backward-Compat).
    let subventionMoEff = 0;
    if (Array.isArray(i.subventionPhasen) && i.subventionPhasen.length > 0) {
      let monateBisher = 0;
      for (const ph of i.subventionPhasen) {
        if (!ph || !ph.monate || !ph.mo) { monateBisher += (ph && ph.monate) || 0; continue; }
        const phaseStartMo = monateBisher;
        const phaseEndMo   = monateBisher + ph.monate;
        const jahrStartMo  = (y - 1) * 12;
        const jahrEndMo    = y * 12;
        const overlapStart = Math.max(phaseStartMo, jahrStartMo);
        const overlapEnd   = Math.min(phaseEndMo, jahrEndMo);
        const overlap      = Math.max(0, overlapEnd - overlapStart);
        if (overlap > 0) subventionMoEff += ph.mo * overlap / 12;
        monateBisher = phaseEndMo;
      }
    } else {
      // Fallback 1-Phase: B18 × MAX(0, MIN(12, B19 − (n−1)×12)) / 12
      const monatePerJahr = Math.max(0, Math.min(12, (i.subventionMonate || 0) - (y - 1) * 12));
      subventionMoEff = (i.subventionMo || 0) * monatePerJahr / 12;
    }

    const mieteJahr = (kaltmieteMo + spMieteMo + subventionMoEff) * 12;

    // Zinsen + Tilgung Jahr y via CUMIPMT/CUMPRINC
    const startP = (y - 1) * 12 + 1;
    const endP = Math.min(y * 12, nper);

    let zinsenJahr = 0, tilgungJahr = 0;
    if (startP <= nper) {
      zinsenJahr = -cumipmtExcel(rateM, nper, darlehen, startP, endP);   // positiv
      tilgungJahr = -cumprincExcel(rateM, nper, darlehen, startP, endP); // positiv
    }
    // Restschuld parallel via Annuität
    if (y === 1) {
      restschuldEcht = darlehen;
    }
    restschuldEcht = Math.max(0, restschuldEcht - tilgungJahr);

    // Hausgeld + Mietverwaltung + Hausverwaltung (WEG) Jahr (inkl. Inflation)
    const hgFaktor = Math.pow(1 + i.hgInflation, y - 1);
    // hgJahr enthält Hausgeld + Mietverwaltung + Hausverwaltung (Gesamt-Verwaltungs-Block für CF-Anzeige)
    const hausverw = i.hausverwaltung || 0;
    const hgJahr = (i.hausgeld + i.mietverwaltung + hausverw) * 12 * hgFaktor;
    const mvJahr = i.mietverwaltung * 12 * hgFaktor;
    const hvJahr = hausverw * 12 * hgFaktor;

    // Steuervorteil — Werbungskosten = AfA + Zinsen + Mietverwaltung + Hausverwaltung (WEG)
    // Mietverwaltung und Hausverwaltung gelten beide als nicht-umlagefähige Werbungskosten.
    const wkAfa = afaBemessungBetrag * i.afaSatz;
    const stVerlustJahr = wkAfa + zinsenJahr + mvJahr + hvJahr - mieteJahr;
    const stVorteilJahr = stVerlustJahr * i.steuersatz;

    // Cashflow Jahr = mieteJahr - zinsenJahr - tilgungJahr - hgJahr (inkl. MV+HV) + stVorteilJahr
    const cfJahr = mieteJahr - zinsenJahr - tilgungJahr - hgJahr + stVorteilJahr;

    cf.push({
      y,
      kaltmieteMo, spMieteMo, subventionMoEff,
      mieteJahr,
      zinsenJahr, tilgungJahr,
      hgJahr, mvJahr, hvJahr,
      stVorteilJahr,
      cfJahr,
      restschuld: restschuldEcht,
    });
  }

  // Vermögensentwicklung Jahr 0..10 — saubere Begriffshierarchie:
  //   Marktwert(y)       = startwert × (1 + Wertsteigerung)^y
  //   Verkaufserlös(y)   = Marktwert(y) − Restschuld(y)        (= EK im Objekt)
  //   Gesamtvermögen(y)  = Verkaufserlös(y) + kumulierte CFs   (= Endstand inkl. Cashflows)
  //   Vermögenszuwachs(y)= Gesamtvermögen(y) − eingesetztes EK (= Delta gegenüber Start)
  //
  // 'vermoegenBrutto' (alter Name) wird zu Gesamtvermögen,
  // 'vermoegenNetto'  (alter Name) wird zu Vermögenszuwachs.
  // Wert für Vermögenszuwachs ist mathematisch identisch zur alten Netto-Berechnung —
  // nur Gesamtvermögen ist neu definiert (alt: nur Verkaufserlös, neu: + kumCFs).
  const startwert = i.marktwertProQm > 0 ? i.marktwertProQm * i.qm : kpGesamt;
  const vermoegen = [];
  for (let y = 0; y <= 10; y++) {
    const wert = startwert * Math.pow(1 + i.wertsteigerung, y);
    const restschuld = y === 0 ? darlehen : cf[y - 1].restschuld;
    const verkaufserloes = wert - restschuld;
    const kumCf = y === 0 ? 0 : cf.slice(0, y).reduce((s, x) => s + x.cfJahr, 0);
    const vermoegenBrutto = verkaufserloes + kumCf;          // = Gesamtvermögen (neu)
    const vermoegenNetto  = vermoegenBrutto - ekBedarf;      // = Vermögenszuwachs (Delta)
    vermoegen.push({ y, wert, restschuld, verkaufserloes, vermoegenBrutto, kumCf, vermoegenNetto });
  }

  // IRR-Cashflow nutzt den VERKAUFSERLÖS (wert − restschuld) als Endwert in Jahr 9,
  // weil die CFs schon einzeln als irrSeries-Glieder eingehen — sonst würden Cashflows
  // doppelt zählen.
  const irrSeries = [-ekBedarf];
  for (let y = 1; y <= 9; y++) irrSeries.push(cf[y - 1].cfJahr);
  irrSeries.push(cf[9].cfJahr + vermoegen[9].verkaufserloes);

  const irrValue = irr(irrSeries, 0.10);

  // Belastung Jahr 1
  const cf1 = cf[0];
  const belastungMo = cf1.cfJahr / 12;

  // Bonität (Iter 11: Quick-Modus vs. Detail-Selbstauskunft)
  // Quick: bonEinnahmen/bonAusgaben/bonVermoegen + steuersatz
  // Detail: i.selbstauskunft → durch computeBonitaetDetailed() in detaillierte Werte transformiert
  // Backward-Kompatibilität: alte Felder bonNetto/bonLebenshaltung/bonVerbindlichkeiten
  // werden eingelesen, falls neue nicht gesetzt sind.
  let bonEinnahmen, bonAusgaben, bonVermoegen, bonDetail;

  if (i.selbstauskunft && i.bonModus === 'detail') {
    bonDetail = computeBonitaetDetailed(i.selbstauskunft, i.saAntragGemeinsam !== false);
    // Quick-äquivalente Werte aus Selbstauskunft ableiten
    bonEinnahmen = bonDetail.einkommenAnrechenbarMo;
    bonAusgaben = bonDetail.ausgabenGesamtMo; // Mindestausgaben Haushalt + Fixkosten + Verbindlichkeiten
    bonVermoegen = bonDetail.freiesVermoegen;
  } else {
    bonEinnahmen = (i.bonEinnahmen !== undefined) ? i.bonEinnahmen
      : (i.bonNetto || 0);
    bonAusgaben = (i.bonAusgaben !== undefined) ? i.bonAusgaben
      : ((i.bonLebenshaltung || 0) + (i.bonVerbindlichkeiten || 0));
    bonVermoegen = (i.bonVermoegen !== undefined) ? i.bonVermoegen : 0;
    bonDetail = null;
  }

  const bonVor = bonEinnahmen - bonAusgaben;
  const bonMieteAnr = (i.kaltmiete + i.stellplatzMiete + i.subventionMo) * 0.8;
  const bonAnnuMo = annuityMo; // Annuität positiv aus Sicht der Belastung
  // Quick-Modus (kompatibel zu Iter 10): nur Miete − Annuität.
  // Detail-Modus (Iter 11): zusätzlich HG + HV bank-konservativ.
  const bonHgMo = (i.hausgeld || 0);
  const bonHvMo = (i.hausverwaltung || 0);
  const bonDelta = (i.bonModus === 'detail')
    ? (bonMieteAnr - bonAnnuMo - bonHgMo - bonHvMo)
    : (bonMieteAnr - bonAnnuMo);
  const bonNach = bonVor + bonDelta;
  const bonVermoegenVsEk = bonVermoegen - ekBedarf;
  const bonVermoegenAusreichend = bonVermoegen >= ekBedarf;

  // Iter 10: Sparen-vs-Investieren — KNK als verbranntes Geld.
  // Sparen-Pfad: Verfügbares EK bleibt komplett auf Tagesgeld, monatlicher Überschuss (positiv aus CF)
  //   würde theoretisch noch oben drauf — wir nehmen aber keine zusätzliche Sparrate an,
  //   sondern nur das Basis-EK. Das entspricht der konservativen Sparer-Story.
  // Investieren-Pfad: In Jahr 0 verbrennt der EK-Bedarf (= KNK, wenn nicht mitfin.) — er ist weg.
  //   Tagesgeld-Rest = bonVermoegen - ekBedarf, der mit Sparzins wächst.
  //   Dazu kommt: Vermögen brutto aus Immo + kumulierter Cashflow.
  // KEIN nachträglicher Abzug von ekBedarf — der ist bereits am Tag 0 weg.
  const sparZins = (i.sparZins !== undefined && i.sparZins !== null) ? i.sparZins : SPAR_ZINS_DEFAULT;
  const sparen = [];
  let nurSparenLauf = bonVermoegen;
  let tagesgeldRest = Math.max(0, bonVermoegen - ekBedarf);
  sparen.push({
    y: 0,
    nurSparen: nurSparenLauf,
    mitImmo: tagesgeldRest + 0, // Vermögen brutto = 0 in Jahr 0 (Wert = KP = Restschuld; sofern marktwertProQm = KP)
    delta: tagesgeldRest - nurSparenLauf,
  });
  for (let y = 1; y <= 10; y++) {
    nurSparenLauf = nurSparenLauf * (1 + sparZins);
    // Jahres-Cashflow (positiv addiert, negativ abgezogen)
    const cfJ = cf[y - 1].cfJahr;
    tagesgeldRest = tagesgeldRest * (1 + sparZins) + cfJ;
    const immoWert = vermoegen[y].wert;
    const immoRest = vermoegen[y].restschuld;
    const vermBrutto = immoWert - immoRest;
    const mitImmo = Math.max(0, tagesgeldRest) + vermBrutto;
    // wenn tagesgeldRest negativ wurde (= Cashflow hat alles aufgezehrt), zeigen wir den negativen Stand
    // als Schulden-Effekt — pragmatisch: addieren ohne Floor
    const mitImmoEhrlich = tagesgeldRest + vermBrutto;
    sparen.push({
      y,
      nurSparen: nurSparenLauf,
      mitImmo: mitImmoEhrlich,
      delta: mitImmoEhrlich - nurSparenLauf,
    });
  }
  const sparenVsKaufenDelta = sparen[10].mitImmo - sparen[10].nurSparen;

  const kaufpreisProQm = i.qm > 0 ? (i.kaufpreis / i.qm) : 0;
  const markteinkaufVorteil = i.marktwertProQm > 0 ? (i.marktwertProQm - kaufpreisProQm) * i.qm : 0;

  // Erste Erhöhung in Monat M1 (sofern nicht 'sprung'/'index' weg) — Storytelling
  let ersteErhoehungMonat = null;
  let ersteErhoehungJahrLabel = null;
  if (i.mietsteigerungsModus === 'sprung' || i.mietsteigerungsModus === 'index') {
    ersteErhoehungMonat = M1;
    const yEst = Math.ceil(M1 / 12);
    ersteErhoehungJahrLabel = 'Jahr ' + yEst;
  }

  return {
    inputs: i,
    kpGesamt, knk, investitionGesamt, ekBedarf, darlehen,
    annuityMo, nper, afaMo, afaJahr, afaBemessungBetrag,
    cf, vermoegen, irr: irrValue,
    vermoegenBrutto10: vermoegen[10].vermoegenBrutto,
    vermoegenNetto10: vermoegen[10].vermoegenNetto,
    belastungMo,
    mietsubventionGesamt: (Array.isArray(i.subventionPhasen) && i.subventionPhasen.length > 0)
      ? i.subventionPhasen.reduce((s, ph) => s + ((ph.mo || 0) * (ph.monate || 0)), 0)
      : (i.subventionMo || 0) * (i.subventionMonate || 0),
    markteinkaufVorteil, kaufpreisProQm,
    bonEinnahmen, bonAusgaben, bonVermoegen,
    bonVor, bonNach, bonDelta, bonMieteAnr, bonAnnuMo,
    bonVermoegenVsEk, bonVermoegenAusreichend,
    bonDetail, bonModus: i.bonModus || 'quick',
    sparen, sparenVsKaufenDelta,
    hausgeldEffMo: (i.hausgeld + i.mietverwaltung + (i.hausverwaltung || 0)),
    hausgeldNurMo: i.hausgeld,
    mietverwaltungMo: i.mietverwaltung,
    hausverwaltungMo: (i.hausverwaltung || 0),
    stVorteilJ1Mo: cf1.stVorteilJahr / 12,
    stVorteilJ5Mo: cf[4].stVorteilJahr / 12,
    stVorteilJ10Mo: cf[9].stVorteilJahr / 12,
    mieteJ1Mo: cf1.mieteJahr / 12,
    ersteErhoehungMonat,
    ersteErhoehungJahrLabel,
  };
}

/**
 * Paket-Recalc: aggregiert mehrere WEs (Preset-Keys) mit gemeinsamen Person-Settings.
 *
 * weInputsArr: Array von WE-Inputs (objekt-spezifische Felder pro WE — Kaufpreis,
 *              qm, Miete, Hausgeld, Subvention etc.)
 * personSettings: { zins, tilgung, knkMitfinanziert, steuersatz,
 *                   bonEinnahmen, bonAusgaben, bonVermoegen,
 *                   bonModus, selbstauskunft, saAntragGemeinsam, sparZins }
 *
 * Liefert ein Result-Objekt mit aggregierten KPIs + cf-Array (Summen) +
 * vermoegen-Array (Summen) + sparen (gegen Summe-EK).
 */
function recalcPaket(weInputsArr, personSettings) {
  if (!Array.isArray(weInputsArr) || weInputsArr.length === 0) return null;
  const ps = personSettings || {};
  const personFields = [
    'zins', 'tilgung', 'knkMitfinanziert', 'steuersatz',
    'bonEinnahmen', 'bonAusgaben', 'bonVermoegen', 'bonModus',
    'selbstauskunft', 'saAntragGemeinsam', 'sparZins'
  ];

  // 1. Jede WE einzeln berechnen — Person-Settings überlagern.
  const results = weInputsArr.map(weInput => {
    const merged = { ...weInput };
    personFields.forEach(f => {
      if (ps[f] !== undefined) merged[f] = ps[f];
    });
    // Damit Sparen-vs-Inv. nicht in jedem Einzel-Recalc gegen volles Vermögen rechnet:
    // wir aggregieren das auf Paket-Ebene neu.
    return recalc(merged);
  });

  const sum = (key, fn) => results.reduce((s, r) => s + (fn ? fn(r) : (r[key] || 0)), 0);

  // 2. Aggregations-KPIs
  const ekBedarf = sum('ekBedarf');
  const darlehen = sum('darlehen');
  const annuityMo = sum('annuityMo');
  const belastungMo = sum('belastungMo');
  const kpGesamt = sum('kpGesamt');
  const investitionGesamt = sum('investitionGesamt');
  const vermoegenBrutto10 = sum('vermoegenBrutto10');
  const vermoegenNetto10 = sum('vermoegenNetto10');
  const mietsubventionGesamt = sum('mietsubventionGesamt');
  const markteinkaufVorteil = sum('markteinkaufVorteil');

  // 3. CF-Array (30 Jahre): element-weise summieren
  const cfYears = results[0].cf.length;
  const cf = [];
  for (let y = 0; y < cfYears; y++) {
    cf.push({
      y: y + 1,
      cfJahr: sum(null, r => r.cf[y].cfJahr),
      mieteJahr: sum(null, r => r.cf[y].mieteJahr || 0),
      hgJahr: sum(null, r => r.cf[y].hgJahr || 0),
      annuJahr: sum(null, r => r.cf[y].annuJahr || 0),
      stVorteilJahr: sum(null, r => r.cf[y].stVorteilJahr || 0),
      afaJahr: sum(null, r => r.cf[y].afaJahr || 0),
      tilgungJahr: sum(null, r => r.cf[y].tilgungJahr || 0),
      zinsenJahr: sum(null, r => r.cf[y].zinsenJahr || 0),
      restschuld: sum(null, r => r.cf[y].restschuld || 0),
    });
  }

  // 4. Vermögens-Array (0..10): summieren
  const vermoegen = [];
  for (let y = 0; y <= 10; y++) {
    vermoegen.push({
      y,
      wert: sum(null, r => r.vermoegen[y].wert),
      restschuld: sum(null, r => r.vermoegen[y].restschuld),
      verkaufserloes: sum(null, r => r.vermoegen[y].verkaufserloes || 0),
      vermoegenBrutto: sum(null, r => r.vermoegen[y].vermoegenBrutto),
      kumCf: sum(null, r => r.vermoegen[y].kumCf || 0),
      vermoegenNetto: sum(null, r => r.vermoegen[y].vermoegenNetto),
    });
  }

  // 5. IRR auf der aggregierten CF-Reihe (J0 = -ekBedarf, J1..J9 = cfJahr,
  //    J10 = cfJahr + Verkaufserlös). Verkaufserlös (nicht vermoegenBrutto)
  //    weil CFs schon einzeln in der Reihe stehen → sonst Doppelzählung.
  const irrSeries = [-ekBedarf];
  for (let y = 0; y < 9; y++) irrSeries.push(cf[y].cfJahr);
  irrSeries.push(cf[9].cfJahr + vermoegen[10].verkaufserloes);
  const irrValue = irr(irrSeries, 0.10);

  // 6. Sparen-vs-Investieren auf Paket-Ebene
  const bonVermoegen = ps.bonVermoegen || 0;
  const sparZins = (ps.sparZins !== undefined && ps.sparZins !== null) ? ps.sparZins : SPAR_ZINS_DEFAULT;
  const sparen = [];
  let nurSparenLauf = bonVermoegen;
  let tagesgeldRest = Math.max(0, bonVermoegen - ekBedarf);
  sparen.push({ y: 0, nurSparen: nurSparenLauf, mitImmo: tagesgeldRest, delta: tagesgeldRest - nurSparenLauf });
  for (let y = 1; y <= 10; y++) {
    nurSparenLauf = nurSparenLauf * (1 + sparZins);
    const cfJ = cf[y - 1].cfJahr;
    tagesgeldRest = tagesgeldRest * (1 + sparZins) + cfJ;
    // Verkaufserlös (Wert − Restschuld) ohne CFs — die kommen via tagesgeldRest rein,
    // sonst Doppelzählung. (Gesamtvermögen wäre verkaufserloes + kumCf — das wäre
    // hier falsch, weil tagesgeldRest die CFs schon enthält.)
    const vermBrutto = vermoegen[y].verkaufserloes;
    const mitImmoEhrlich = tagesgeldRest + vermBrutto;
    sparen.push({ y, nurSparen: nurSparenLauf, mitImmo: mitImmoEhrlich, delta: mitImmoEhrlich - nurSparenLauf });
  }
  const sparenVsKaufenDelta = sparen[10].mitImmo - sparen[10].nurSparen;

  // 7. Bonität (Paket-Summe) — einmal für gesamtes Paket
  let bonEinnahmen, bonAusgaben, bonDetail = null;
  if (ps.bonModus === 'detail' && ps.selbstauskunft) {
    bonDetail = computeBonitaetDetailed(ps.selbstauskunft, ps.saAntragGemeinsam !== false);
    bonEinnahmen = bonDetail.einkommenAnrechenbarMo;
    bonAusgaben = bonDetail.ausgabenGesamtMo;
  } else {
    bonEinnahmen = ps.bonEinnahmen || 0;
    bonAusgaben = ps.bonAusgaben || 0;
  }
  const bonVor = bonEinnahmen - bonAusgaben;
  const bonMieteAnr = sum('bonMieteAnr');
  const bonAnnuMo = sum('bonAnnuMo');
  const bonHgMo = sum('hausgeldNurMo');
  const bonHvMo = sum('hausverwaltungMo');
  const bonDelta = (ps.bonModus === 'detail')
    ? (bonMieteAnr - bonAnnuMo - bonHgMo - bonHvMo)
    : (bonMieteAnr - bonAnnuMo);
  const bonNach = bonVor + bonDelta;
  const bonVermoegenVsEk = bonVermoegen - ekBedarf;
  const bonVermoegenAusreichend = bonVermoegen >= ekBedarf;

  return {
    inputs: { ...ps, _isPaket: true, _weList: weInputsArr },
    perWe: results,
    kpGesamt, knk: 0, investitionGesamt, ekBedarf, darlehen,
    annuityMo,
    cf, vermoegen, irr: irrValue,
    vermoegenBrutto10, vermoegenNetto10, belastungMo,
    mietsubventionGesamt, markteinkaufVorteil,
    bonEinnahmen, bonAusgaben, bonVermoegen,
    bonVor, bonNach, bonDelta, bonMieteAnr, bonAnnuMo,
    bonVermoegenVsEk, bonVermoegenAusreichend,
    bonDetail, bonModus: ps.bonModus || 'quick',
    sparen, sparenVsKaufenDelta,
    // Zusatz-Felder für Story-Sections (sonst 0 weil pro-WE nicht aggregiert)
    afaJahr: sum('afaJahr'),
    afaBemessungBetrag: sum('afaBemessungBetrag'),
    mieteJ1Mo: sum('mieteJ1Mo'),
    stVorteilJ1Mo: sum('stVorteilJ1Mo'),
    stVorteilJ5Mo: sum('stVorteilJ5Mo'),
    stVorteilJ10Mo: sum('stVorteilJ10Mo'),
    hausgeldNurMo: sum('hausgeldNurMo'),
    hausgeldEffMo: sum('hausgeldEffMo'),
    mietverwaltungMo: sum('mietverwaltungMo'),
    hausverwaltungMo: sum('hausverwaltungMo'),
    kaufpreisProQm: kpGesamt && results.reduce((s,r)=>s+(r.inputs.qm||0),0) > 0
      ? kpGesamt / results.reduce((s,r)=>s+(r.inputs.qm||0),0)
      : 0,
  };
}

/* ====================================================================
   EXPORTS — als window.* nutzbar in app.js / pdf.js
   ==================================================================== */
window.Kalk = {
  recalc, recalcPaket, irr, computeBonitaetDetailed,
  fmtEur, fmtEurMo, fmtEurMoDec, fmtPct, fmtEurQm,
  PROFILES, PRESETS, SPAR_ZINS_DEFAULT,
  getDefaults, applyProfile,
};
