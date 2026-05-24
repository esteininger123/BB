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
    // FS-1 (Tech-Architekt H-7): Early-exit wenn Intervall klein genug
    if (Math.abs(hi - lo) < 1e-6) return mid;
    if (fLo * fMid < 0) { hi = mid; fHi = fMid; }
    else { lo = mid; fLo = fMid; }
  }
  // FS-1 (Tech-Architekt H-7): Plausibilitäts-Check — IRR > 1000% oder < -99%
  // ist Numerik-Artefakt, nicht echtes Resultat. Lieber null als Schwachsinn-Anzeige.
  const final = (lo + hi) / 2;
  if (!isFinite(final) || Math.abs(final) > 10) return null;
  return final;
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
// Iter 60 (20.05.2026): Default-Zinsen + Tilgung neu festgezurrt nach Henry-Durchgang.
//  - Standard (KNK NICHT mitfinanziert): 4,5 % Zins, 1 % Tilgung
//  - KNK mitfinanziert: 4,8 % Zins (wird beim Toggle in app.js gesetzt), 1 % Tilgung
//  saSteuersatz = unabhängiger Steuersatz für den Detail-Modus (aus Selbstauskunft).
//  Wird beim Render und beim recalc-Aufruf verwendet, sodass der Quick-Wert in
//  `steuersatz` nicht überschrieben wird, wenn der Vertriebler im SA-Modus rechnet.
// QA-Sprint 2026-05-23 (Edgar live WE-Liste): Profil-Matrix neu — pro Steuersatz
// nur 2 Varianten, KNK koppelt sich automatisch an den Zins:
//   - „ohne KNK" → 4,5 % Zins (Bank-Standard für reine KP-Finanzierung)
//   - „mit KNK"  → 4,8 % Zins (Bank-Aufschlag wegen höherem Beleihungsauslauf)
// 3 Steuersätze × 2 Varianten = 6 Profile total. Alle mit 1 % Tilgung.
// Die 3 alten Profile (standard/premium/spitze) bleiben für Backward-Compat
// im Kunden-Kalkulator-Profile-Switcher.
//
// Naming-Schema: s{stSatz}{knk|ohne}
//   s30ohne = 30 % StSatz · 4,5 % Zins · KNK NICHT mitfinanziert
//   s42knk  = 42 % StSatz · 4,8 % Zins · KNK mitfinanziert
const PROFILES = {
  // Legacy (Kunden-Kalkulator-Profile-Switcher)
  standard: {
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    steuersatz: 0.30, saSteuersatz: 0.30,
    bonEinnahmen: 4000, bonAusgaben: 1800, bonVermoegen: 20000,
  },
  premium: {
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    steuersatz: 0.35, saSteuersatz: 0.35,
    bonEinnahmen: 5500, bonAusgaben: 2200, bonVermoegen: 20000,
  },
  spitze: {
    zins: 0.045, tilgung: 0.01, knkMitfinanziert: false,
    steuersatz: 0.42, saSteuersatz: 0.42,
    bonEinnahmen: 8000, bonAusgaben: 3000, bonVermoegen: 20000,
  },
  // 6er-Matrix für WE-Liste (3 StSatz × 2 KNK-Varianten)
  s30ohne: { zins: 0.045, tilgung: 0.01, knkMitfinanziert: false, steuersatz: 0.30, saSteuersatz: 0.30, bonEinnahmen: 4000, bonAusgaben: 1800, bonVermoegen: 20000 },
  s30knk:  { zins: 0.048, tilgung: 0.01, knkMitfinanziert: true,  steuersatz: 0.30, saSteuersatz: 0.30, bonEinnahmen: 4000, bonAusgaben: 1800, bonVermoegen: 20000 },
  s35ohne: { zins: 0.045, tilgung: 0.01, knkMitfinanziert: false, steuersatz: 0.35, saSteuersatz: 0.35, bonEinnahmen: 5500, bonAusgaben: 2200, bonVermoegen: 20000 },
  s35knk:  { zins: 0.048, tilgung: 0.01, knkMitfinanziert: true,  steuersatz: 0.35, saSteuersatz: 0.35, bonEinnahmen: 5500, bonAusgaben: 2200, bonVermoegen: 20000 },
  s42ohne: { zins: 0.045, tilgung: 0.01, knkMitfinanziert: false, steuersatz: 0.42, saSteuersatz: 0.42, bonEinnahmen: 8000, bonAusgaben: 3000, bonVermoegen: 20000 },
  s42knk:  { zins: 0.048, tilgung: 0.01, knkMitfinanziert: true,  steuersatz: 0.42, saSteuersatz: 0.42, bonEinnahmen: 8000, bonAusgaben: 3000, bonVermoegen: 20000 },
};

/**
 * Iter-2 (21.05.2026, F-6): zentrale Default-Konstante.
 * Magic-Zahlen, die vorher an mehreren Stellen hardcoded standen, sind hier gebündelt.
 * Wichtig: Diese Werte sind die Fallbacks, wenn aus Airtable-Stammdaten nichts kommt.
 * Wenn Henry für eine WE z.B. Hausverwaltung 25 € pflegt, gilt die — diese 30 greifen nur,
 * wenn das Feld in den Stammdaten leer ist (Iter 49 H1-Fix: kein stilles "0", sondern Default 30).
 */
const BB_DEFAULTS = Object.freeze({
  hausverwaltungMo: 30,        // €/Mo — Default WEG-Hausverwaltung
  mietverwaltungMo: 30,        // €/Mo — Default Mietverwaltung (in PRESETS einzeln gesetzt)
  gebaeudeAnteil: 0.85,        // 85 % Gebäude / 15 % Boden (Henry-Durchgang 20.05.2026)
  grEstPct: 0.05,              // 5 % GrESt — bundesweit häufigster Satz (BW = 5,0 %)
  sparZinsPa: 0.025,           // 2,5 % p.a. — Tagesgeld-Vergleichszins
});
// Backward-Compat: ältere Stellen lesen evtl. noch SPAR_ZINS_DEFAULT
const SPAR_ZINS_DEFAULT = BB_DEFAULTS.sparZinsPa;

// Welle 0 (2026-05-24): ENGINE_VERSION wird in jedem recalc-Ergebnis mitgeschrieben.
// Bei Engine-Änderungen (z.B. Welle 1: Sensitivitäts-Matrix, Sondertilgung) Major-Bump,
// damit Snapshots beim Anzeigen markieren können „mit alter Engine-Version berechnet".
// Format: 'major.minor' — minor für additive Outputs, major für Logik-Bruch.
const ENGINE_VERSION = '3.0';

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
    hausgeld: 60.65, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.037, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  we2: {
    kaufpreis: 139000, stellplatzKp: 10000, qm: 60.65, marktwertProQm: 0,
    kaltmiete: 450, stellplatzMiete: 0, subventionMo: 60.23, subventionMonate: 12,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.137,
    monateSeitMieterhoehung: 0,
    hausgeld: 60.65, hgInflation: 0, mietverwaltung: 30, hausverwaltung: 30,
    zins: 0.045,
    // Iter-2 (21.05.2026, N-4): vorher gebaeudeAnteil:1.0 (Test-Daten-Rest aus V1-Excel).
    // Auf den neuen Standard-Default 0.85 gebracht — einheitlich mit allen anderen PRESETS.
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  we8: {
    kaufpreis: 169000, stellplatzKp: 0, qm: 60.56, marktwertProQm: 0,
    kaltmiete: 540, stellplatzMiete: 0, subventionMo: 81, subventionMonate: 12,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 60.56, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 25,
    zins: 0.045,
    afaSatz: 0.045, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.02,
  },
  we10: {
    kaufpreis: 185000, stellplatzKp: 10000, qm: 60.56, marktwertProQm: 0,
    kaltmiete: 768.13, stellplatzMiete: 50, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'index', steigerungProz: 0.02,
    monateSeitMieterhoehung: 0,
    hausgeld: 60.56, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.037, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  we12: {
    kaufpreis: 145000, stellplatzKp: 0, qm: 60.56, marktwertProQm: 3267,
    kaltmiete: 438, stellplatzMiete: 0, subventionMo: 65.70, subventionMonate: 26,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 60.56, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.0345, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  leer: {
    kaufpreis: 150000, stellplatzKp: 0, qm: 60, marktwertProQm: 0,
    kaltmiete: 600, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.10,
    monateSeitMieterhoehung: 0,
    hausgeld: 60, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
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
    hausgeld: 84, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br2: {
    kaufpreis: 235000, stellplatzKp: 0, qm: 70.85, marktwertProQm: 0,
    kaltmiete: 780, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 71, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br3: {
    kaufpreis: 127000, stellplatzKp: 0, qm: 41.17, marktwertProQm: 0,
    kaltmiete: 328, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 41, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br4: {
    kaufpreis: 200000, stellplatzKp: 0, qm: 70.47, marktwertProQm: 0,
    kaltmiete: 497, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 70, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br5: {
    kaufpreis: 269000, stellplatzKp: 0, qm: 86.36, marktwertProQm: 0,
    kaltmiete: 555, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 86, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br6: {
    kaufpreis: 165000, stellplatzKp: 0, qm: 53.71, marktwertProQm: 0,
    kaltmiete: 440, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 54, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br7: {
    kaufpreis: 245000, stellplatzKp: 0, qm: 70.47, marktwertProQm: 0,
    kaltmiete: 595, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 70, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br8: {
    kaufpreis: 290000, stellplatzKp: 0, qm: 86.36, marktwertProQm: 0,
    kaltmiete: 960, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 86, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br9: {
    kaufpreis: 169000, stellplatzKp: 0, qm: 53.71, marktwertProQm: 0,
    kaltmiete: 432, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 54, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br10: {
    kaufpreis: 243000, stellplatzKp: 0, qm: 83.74, marktwertProQm: 0,
    kaltmiete: 559, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 84, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br11: {
    kaufpreis: 295000, stellplatzKp: 0, qm: 86.36, marktwertProQm: 0,
    kaltmiete: 860, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 86, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br12: {
    kaufpreis: 155000, stellplatzKp: 0, qm: 40.41, marktwertProQm: 0,
    kaltmiete: 425, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 40, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br13: {
    kaufpreis: 274000, stellplatzKp: 0, qm: 83.06, marktwertProQm: 0,
    kaltmiete: 980, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 83, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br14: {
    kaufpreis: 290000, stellplatzKp: 0, qm: 86.36, marktwertProQm: 0,
    kaltmiete: 745, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 86, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br15: {
    kaufpreis: 150000, stellplatzKp: 0, qm: 41.12, marktwertProQm: 0,
    kaltmiete: 340, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 41, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br16: {
    kaufpreis: 200000, stellplatzKp: 0, qm: 54.69, marktwertProQm: 0,
    kaltmiete: 0, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 55, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
    wertsteigerung: 0.03,
  },
  br17: {
    kaufpreis: 195000, stellplatzKp: 0, qm: 66.19, marktwertProQm: 0,
    kaltmiete: 476, stellplatzMiete: 0, subventionMo: 0, subventionMonate: 0,
    mietsteigerungsModus: 'sprung', steigerungProz: 0.15,
    monateSeitMieterhoehung: 0,
    hausgeld: 66, hgInflation: 0, mietverwaltung: 0, hausverwaltung: 30,
    zins: 0.045,
    afaSatz: 0.02, gebaeudeAnteil: 0.85, afaBemessung: 'kaufpreis',
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
 *   - Haushaltspauschale: Iter 69 (21.05.2026) — NICHT mehr automatisch angesetzt.
 *     Ausgaben kommen ausschließlich aus den SA-Eingaben (Fixkosten + Baukasten + Verbindlichkeiten).
 *   - Verbindlichkeiten: mtl. Belastung Bf1+Bf2+Kd1+Kd2 + Vers-Belastung + Baukasten-Schulden
 *   - Fixkosten: Miete eig. Whg + Unterhalt + PKV + Lebenshaltung + Leasing + Sonstige + Baukasten-Ausgaben + Sparplan-Raten
 *   - Freies Vermögen (für Bank): Bankguthaben + Wertpapiere + Sparbücher + Bausparen +
 *     Sonstige + Rückkaufwert Versicherung (Bestandsimmobilien-EK NICHT zählen)
 */
function computeBonitaetDetailed(sa, gemeinsam) {
  if (!sa) return null;
  const a = sa.antragsteller || {};
  const m = gemeinsam ? (sa.mitantragsteller || {}) : {};

  // Iter 66 (20.05.2026): Baukasten-Zusatzpositionen — pro Antragsteller können
  //   beliebig viele Einträge in zusatzEinnahmen / zusatzAusgaben / zusatzVermoegen
  //   / zusatzSchulden / zusatzSparplaene gepflegt werden. Jede Position hat Titel,
  //   Notiz, Betrag. Sparpläne haben Mo-Rate UND Wert — Mo läuft in Ausgaben, Wert
  //   in Vermögen. Alle Beträge fließen in die Bonität ein.
  function sumZusatz(p, kategorie, feld) {
    if (!p || !Array.isArray(p[kategorie])) return 0;
    return p[kategorie].reduce((s, x) => s + (parseFloat(x && x[feld]) || 0), 0);
  }

  // ----- Einkommen -----
  function gehaelter(p) {
    let n = parseFloat(p.anzahlGehaelter || 12);
    if (!isFinite(n)) n = 12;
    const cust = parseFloat(p.anzahlGehaelterCustom);
    if (isFinite(cust) && cust > 0) n = cust;
    return n;
  }
  function einkommen(p) {
    // Iter 73 (21.05.2026): Legacy-Felder (vermietungMo, immo1, immo2) komplett raus
    //   aus der Berechnung. Mieteinnahmen kommen ausschließlich aus p.immobilien[].
    //   Damit ist die Doppelzählung von Marcels SA (Immobilie + altes vermietungMo)
    //   beseitigt.
    if (!p) return { netto: 0, vermAnr: 0, sonstigeAnr: 0, zusatz: 0, total: 0 };
    const netto = (parseFloat(p.nettoMo) || 0) * gehaelter(p) / 12;
    const immoMieten = Array.isArray(p.immobilien)
      ? p.immobilien.reduce((s, x) => s + (parseFloat(x && x.mietenMo) || 0), 0)
      : 0;
    const vermAnr = immoMieten * 0.8; // 80 % Mietanrechnung Bank-Standard
    const sonst = (parseFloat(p.unterhaltMo) || 0) + (parseFloat(p.kindergeldMo) || 0);
    const zusatz = sumZusatz(p, 'zusatzEinnahmen', 'mo');
    return { netto, vermAnr, sonstigeAnr: sonst, zusatz, total: netto + vermAnr + sonst + zusatz };
  }
  const eA = einkommen(a);
  const eM = einkommen(m);
  const einkommenAnrechenbarMo = eA.total + eM.total;

  // ----- Haushalt -----
  // Iter 69 (21.05.2026): Edgar-Vorgabe — KEINE Bank-Standard-Pauschale mehr
  //   (vorher 1100/1600 € + 400 €/Kind). Die tatsächlichen Ausgaben kommen
  //   ausschließlich aus der SA: Fixkosten (Miete, PKV, Unterhalt, Lebenshaltung,
  //   Leasing, Sonstiges) + Baukasten-Zusatzausgaben + Sparplan-Raten + Verbindlichkeiten.
  //   Pauschale wird im Output mit 0 zurückgegeben für Backward-Compat.
  const erwachsene = 1 + (gemeinsam ? 1 : 0);
  const kinder = (parseInt(a.kinderAnzahl) || 0) + (gemeinsam ? (parseInt(m.kinderAnzahl) || 0) : 0);
  const haushaltPauschale = 0;

  // ----- Fixkosten (monatliche Ausgaben) -----
  // Iter 73 (21.05.2026): Legacy-Felder (pkvMo, leasingMo, unterhaltZahlungMo) komplett
  //   raus aus der Berechnung. Wenn der Kunde noch alte Werte hat, kann der Vertriebler
  //   sie via „Legacy-Daten bereinigen"-Button im Stammdaten-Tab entfernen.
  // QA-Fix 2026-05-23 (Audit-P3 / Edgar-Doc B6): Iter-73-Entscheidung war zu strikt.
  //   Maurice hatte 760 €/Mo PKV als Pflichtfeld eingetragen → wurde komplett ignoriert
  //   → App-Bonität war 760 € zu optimistisch im Vergleich zu SA-PDF (das B6-Fix
  //   die Felder reinholt). Konsistent: auch hier pkvMo/leasingMo/unterhaltZahlungMo
  //   wieder zählen.
  function fixkosten(p) {
    if (!p) return 0;
    return (parseFloat(p.mieteMo) || 0)
         + (parseFloat(p.lebenshaltungMo) || 0)
         + (parseFloat(p.pkvMo) || 0)
         + (parseFloat(p.leasingMo) || 0)
         + (parseFloat(p.unterhaltZahlungMo) || 0)
         + sumZusatz(p, 'zusatzAusgaben', 'mo');
  }
  const fixA = fixkosten(a);
  const fixM = fixkosten(m);
  const fixkostenMo = fixA + fixM;

  // ----- Verbindlichkeiten (mtl. Belastung) -----
  // Iter 73: Legacy-Felder (bf1, bf2, zusatzSchulden) raus.
  function verbindMo(p) {
    if (!p) return 0;
    let s = 0;
    if (Array.isArray(p.immobilien)) {
      p.immobilien.forEach(immo => { if (immo) s += parseFloat(immo.baufiBelastungMo) || 0; });
    }
    s += sumZusatz(p, 'zusatzVerbindlichkeiten', 'mo');
    return s;
  }
  function verbindRest(p) {
    if (!p) return 0;
    let s = 0;
    if (Array.isArray(p.immobilien)) {
      p.immobilien.forEach(immo => { if (immo) s += parseFloat(immo.baufiRestsaldo) || 0; });
    }
    s += sumZusatz(p, 'zusatzVerbindlichkeiten', 'wert');
    return s;
  }
  const verbindlichkeitenMo = verbindMo(a) + verbindMo(m);
  const verbindlichkeitenGesamt = verbindRest(a) + verbindRest(m);

  // ----- Liquides Vermögen (Bank-Sicht: "einsetzbar für neue Immobilie") -----
  // Iter 73: Legacy-Felder (wertpapiere, sparbuecher, bausparen, zusatzSparplaene) raus.
  function liquideVerm(p) {
    if (!p) return 0;
    let s = (parseFloat(p.bankguthaben) || 0);
    s += sumZusatz(p, 'zusatzVermoegen', 'wert');
    return s;
  }
  const liquidesVermoegen = liquideVerm(a) + liquideVerm(m);

  // ----- Immobilien-Vermögen (Verkehrswert minus Baufi-Restsaldo) -----
  // Iter 74 (21.05.2026): Math.max(0, …)-Cap entfernt — wenn Restsaldo > Verkehrswert,
  //   ist die Immobilie „underwater" und das negative Delta fließt ehrlich ins
  //   Gesamtvermögen. Bei Marcel: 125k VW − 136k Saldo = −11.000 €.
  function immoVerm(p) {
    if (!p) return 0;
    let s = 0;
    if (Array.isArray(p.immobilien)) {
      p.immobilien.forEach(immo => {
        if (!immo) return;
        const vk = parseFloat(immo.verkehrswert) || 0;
        const sa = parseFloat(immo.baufiRestsaldo) || 0;
        s += (vk - sa);
      });
    }
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
  // Iter 60 (20.05.2026): Bonitäts-Modus „Detail" hat eigenen Steuersatz.
  //   Der Wert aus dem Quick-Eingabefeld (`i.steuersatz`) bleibt erhalten —
  //   im Detail-Modus wird `i.saSteuersatz` benutzt, falls gesetzt. So kann
  //   der Vertriebler im SA-Tab einen anderen Steuersatz anlegen, ohne den
  //   Quick-Wert zu überschreiben (Anforderung Henry-Durchgang 20.05.2026).
  if (i && i.bonModus === 'detail' && typeof i.saSteuersatz === 'number' && isFinite(i.saSteuersatz)) {
    i = Object.assign({}, i, { steuersatz: i.saSteuersatz });
  }
  // QA-Fix 2026-05-23 (Audit E-1 HIGH): Hard-Guard gegen kaufpreis=0. Vorher
  // silent NaN-Kaskade durch die ganze Engine (annuityMo=0, ln1=NaN, nper=NaN,
  // CF=0/NaN-Mischung). User sah leere oder „n.v."-Werte ohne Verständnis warum.
  const kpGesamt = (parseFloat(i.kaufpreis) || 0) + (parseFloat(i.stellplatzKp) || 0);
  if (!(kpGesamt > 0)) return null;
  // QA-Fix 2026-05-23 (Audit E-3 HIGH): zins=0 (Volltilgung / Promo-Darlehen)
  // hat im cumipmtExcel-Pfad eine NaN-Kaskade ausgelöst (rate=0 → division
  // durch 0).
  // FS-4 Edge-Case-Test 24.05.2026 10:50: Original-Guard hatte einen Logik-Bug —
  // bei zins=0 wurde der Fallback NICHT getriggert (isFinite(0)=true), NaN-
  // Kaskade trotzdem ausgelöst. Fix: bei zins<=0 ODER NaN/Infinity → Default
  // 4.5%. Echte Volltilger werden in der Praxis bei B&B nicht modelliert.
  if (typeof i.zins !== 'number' || !isFinite(i.zins) || i.zins <= 0) {
    i = Object.assign({}, i, { zins: 0.045 });
  }
  // Kaufnebenkosten: GrESt (variabel pro Bundesland) + Notar 1,5 % + Grundbuch 0,5 %.
  // Keine Maklerprovision — B&B verkauft direkt. GrESt kommt aus Airtable-Stammdaten
  // (i.grEstPct), Fallback 5 % (BaWü).
  const grEstPct = (i.grEstPct !== undefined && i.grEstPct !== null && isFinite(i.grEstPct)) ? i.grEstPct : BB_DEFAULTS.grEstPct;
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

  // AfA-Bemessung (§7 EStG, §6 EStG):
  //   Bemessungsgrundlage = Anschaffungskosten = Kaufpreis + Anschaffungsnebenkosten
  //   (= Notar, Grunderwerbsteuer, Grundbuch, ggf. Maklergebühren).
  //   Grund und Boden ist nicht abnutzbar → vor AfA herausrechnen (Gebäude-Anteil-Faktor).
  //   KNK werden proportional auf Gebäude/Boden aufgeteilt — wir multiplizieren also
  //   die gesamten Anschaffungskosten mit dem Gebäude-Anteil.
  //
  // Iter 61 (20.05.2026): Standard-Default 85 % Gebäude / 15 % Boden.
  // Iter 79 (21.05.2026, Edgar als Steuer-Experte): KNK in die AfA-Bemessung integriert.
  //   Vorher: nur `kpGesamt × Gebäudeanteil` — KNK fehlten komplett, das ist
  //   steuerrechtlich falsch (BFH-Rechtsprechung: Anschaffungsnebenkosten gehören
  //   zur Bemessungsgrundlage). Wirkung bei 7 % KNK + 85 % Geb-Anteil: ~6 % höhere
  //   AfA-Bemessung → spürbarer Steuervorteil-Hebel.
  const gebaeudeAnteilFaktor = (i.gebaeudeAnteil !== undefined && i.gebaeudeAnteil !== null && isFinite(i.gebaeudeAnteil)) ? i.gebaeudeAnteil : BB_DEFAULTS.gebaeudeAnteil;
  const anschaffungskosten = kpGesamt + knk;
  const afaBemessungBetrag = anschaffungskosten * gebaeudeAnteilFaktor;
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
  //   Sprung-Modus (Bestand):     nSprünge(m) = m >= M1 ? floor((m - M1) / 36) + 1 : 0
  //   Staffel-Modus (Neuvermietung, linear, Iter 41.11):
  //                               nSprünge(m) = m >= M1 ? floor((m - M1) / 12) + 1 : 0
  //   Index-Modus (Altverträge mit Index, exponentiell):
  //                               wie Staffel, aber Faktor exponentiell
  //
  //   Faktor(m):
  //     Sprung + Index:  (1 + steigerungProz)^nSprünge(m)   ← exponentiell
  //     Staffel:         1 + nSprünge(m) × steigerungProz    ← linear (Iter 41.11)
  //
  // Jahresmiete = Summe der Monatsmieten Monate (y-1)*12+1 bis y*12.
  // Iter 41.16 (18.05.2026, Audit-Fix #6): Wenn ein Datum letzteMietsteigerung
  // vorhanden ist, leiten wir monate FRISCH ab — so altert der Wert mit der Zeit
  // (vorher: beim WE-Load fixiert, veraltete dann).
  let monateSeit = i.monateSeitMieterhoehung || 0;
  if (i.letzteMietsteigerung) {
    const lastDate = new Date(i.letzteMietsteigerung);
    if (!isNaN(lastDate.getTime())) {
      const now = new Date();
      monateSeit = Math.max(0, Math.round((now - lastDate) / (1000 * 60 * 60 * 24 * 30.44)));
    }
  }
  const M1 = Math.max(1, 36 - monateSeit);

  function nSprungeSprung(m) {
    if (m < M1) return 0;
    return Math.floor((m - M1) / 36) + 1;
  }
  function nSprungeJaehrlich(m) {
    if (m < M1) return 0;
    return Math.floor((m - M1) / 12) + 1;
  }
  function nSprungeFor(m) {
    if (i.mietsteigerungsModus === 'sprung') return nSprungeSprung(m);
    if (i.mietsteigerungsModus === 'index')  return nSprungeJaehrlich(m);
    if (i.mietsteigerungsModus === 'staffel') return nSprungeJaehrlich(m);
    return 0;
  }
  function faktorFor(m) {
    const n = nSprungeFor(m);
    if (i.mietsteigerungsModus === 'staffel') {
      // Staffelmiete linear: Startmiete × (1 + n × %).
      // Beispiel 500 € · 3 % · n=2 → 500 × 1,06 = 530 € (nicht 530,45 wie bei exp.).
      return 1 + n * i.steigerungProz;
    }
    return Math.pow(1 + i.steigerungProz, n);
  }

  // Iter 70 (21.05.2026): Marktmiete-Cap auf die Kaltmiete-Projektion zurück.
  //
  // History: Iter 12 hat den Cap entfernt, weil damals der Verkaufswert €/qm
  //   (z.B. 3.117 €/qm) fälschlich als Mieten-Cap interpretiert wurde → Cap-
  //   Schwelle ~2 Mio €/Mo, griff faktisch nie. Iter 65 (20.05.2026) hat das
  //   richtige Feld eingeführt: `marktmieteEurQm` = €/qm/Mo Kaltmiete (z.B. 12).
  //   Iter 62/63 hat den Cap zwar in der Subv-Berechnung wieder eingebaut, aber
  //   nicht in der Kaltmiete-Projektion selbst — Folge: Käufer-Miete in Jahr 10
  //   stieg im Modell auf 20 €/qm bei einer Marktmiete von 12 €/qm. Mit dem
  //   richtigen Feld kann der Cap jetzt sauber zurück.
  //
  // Iter 77 (21.05.2026): Marktmiete wächst mit `wertsteigerung` p.a.
  //   Vorher war der Cap statisch über 10 Jahre — das war konservativ-falsch:
  //   wenn die Vermögensbasis (Verkaufswert) jährlich 3 % zulegt, dann tun
  //   das die Vergleichsmieten in derselben Region auch. Sonst rechnet die
  //   App eine zukunftsfreie Marktmiete, was den Käufer-Cashflow ab Jahr 7
  //   unrealistisch deckelt. Wir nutzen denselben Inflations-Parameter wie
  //   für die Vermögensbasis (i.wertsteigerung), damit Verkaufswert und
  //   Mietniveau konsistent in dieselbe Richtung laufen.
  //
  // Cap(Jahr y) = i.marktmieteEurQm × i.qm × (1 + wertsteigerung)^(y-1).
  // Wenn marktmieteEurQm oder qm fehlt → kein Cap (Fallback, Status-Card warnt).
  function marktCapForMonth(m) {
    if (!(i.marktmieteEurQm > 0 && i.qm > 0)) return Infinity;
    const y = Math.ceil(m / 12); // Jahr 1..30 (Mo 1-12 → J1, 13-24 → J2, …)
    const inflRate = (i.wertsteigerung != null && isFinite(i.wertsteigerung)) ? i.wertsteigerung : 0;
    return i.marktmieteEurQm * i.qm * Math.pow(1 + inflRate, y - 1);
  }

  function kaltmieteForMonth(m) {
    const raw = i.kaltmiete * faktorFor(m);
    // Iter 91.5 (22.05.2026): Im Sprung-Modus den Marktmiete-Cap zwischen
    // den Sprüngen einfrieren — sonst überlagert der jährlich wachsende
    // Cap (Iter 77) die Sprung-Logik und die effektive Miete steigt jährlich
    // statt alle 3 Jahre. Edgar-Befund: Belastung J7-J10 sollte konstant
    // bleiben (Sprung-Periode), stieg aber +20 €/Mo pro Jahr durch
    // jährliches Cap-Wachstum.
    if (i.mietsteigerungsModus === 'sprung') {
      const n = nSprungeSprung(m);
      // Cap am letzten Sprung-Übergang einfrieren; vor dem ersten Sprung
      // gilt der Cap am Anfang (m=1).
      const lastSprungM = (n > 0) ? (M1 + (n - 1) * 36) : 1;
      return Math.min(raw, marktCapForMonth(lastSprungM));
    }
    return Math.min(raw, marktCapForMonth(m));
  }

  // Iter 47/48: Globale Effektivmiete über alle Subv-Phasen konstant.
  // Ziel-Effektivmiete = MbV + Phase-1-Subv (die höchste). Solange wir in irgendeiner
  // Subv-Phase sind, gleichen wir die Subv so an, dass Effektivmiete = Ziel.
  // Damit gibt es kein Tal mehr zwischen Phase 1 und Phase 2 — Käufer sieht konstanten
  // Cashflow, bis alle Subv-Phasen durch sind UND die Bestandsmiete das Niveau erreicht hat.
  function subvForMonth(m) {
    const kaltmieteM = kaltmieteForMonth(m);
    // QA-Fix 2026-05-23 (Audit-BB-7): Marktmiete-Cap auch auf effektivZielGlobal.
    // Vorher: bei Bestandsmieter mit Kaltmiete > Marktmiete „pumpte" subv über Plan
    // hinaus (Beispiel: Bestand 800€, Cap 600€, Phase1=200€ → Engine zahlte 400€
    // statt versprochener 200€ Subv). Cap auf Tag 1, weil die Subv-Vereinbarung mit
    // dem Käufer am Tag 1 fixiert wird — wächst nicht mit Marktmiete mit.
    const capDay1 = marktCapForMonth(1);
    const kaltmieteCapped = Math.min(i.kaltmiete || 0, capDay1);
    if (Array.isArray(i.subventionPhasen) && i.subventionPhasen.length > 0) {
      const phase1Mo = (i.subventionPhasen[0] && i.subventionPhasen[0].mo) || 0;
      const effektivZielGlobal = kaltmieteCapped + phase1Mo;
      let monateBisher = 0;
      for (const ph of i.subventionPhasen) {
        const phaseStartMo = monateBisher;
        const phaseEndMo   = monateBisher + (ph && ph.monate ? ph.monate : 0);
        if (ph && ph.mo && m > phaseStartMo && m <= phaseEndMo) {
          return Math.max(0, effektivZielGlobal - kaltmieteM);
        }
        monateBisher = phaseEndMo;
      }
      return 0;
    }
    if ((i.subventionMonate || 0) > 0 && m <= (i.subventionMonate || 0)) {
      const effektivZiel = kaltmieteCapped + (i.subventionMo || 0);
      return Math.max(0, effektivZiel - kaltmieteM);
    }
    return 0;
  }

  for (let y = 1; y <= 30; y++) {
    // Jahresmiete monats-granular berechnen — gemittelt für mieteJahr
    let kaltmieteJahrSum = 0;
    let kaltmieteMoEndJahr = 0;
    for (let monthOfYear = 1; monthOfYear <= 12; monthOfYear++) {
      const m = (y - 1) * 12 + monthOfYear; // Absoluter Monat 1..360
      // Iter 70: Kaltmiete wird durch Marktmiete-Cap begrenzt (siehe kaltmieteForMonth).
      const geplanteMo = kaltmieteForMonth(m);
      kaltmieteJahrSum += geplanteMo;
      kaltmieteMoEndJahr = geplanteMo; // letzter Monat des Jahres für CF-Anzeige
    }
    const kaltmieteMo = kaltmieteJahrSum / 12; // gemittelt für Anzeige

    // Iter 10: Stellplatzmiete wächst mit Inflation (= i.wertsteigerung),
    // NICHT mit Hausgeld-Inflation, NICHT mit Mietsteigerung (Sprung/Index).
    // Stellplätze sind nicht mietpreisgebunden — folgen marktüblicher Inflation.
    const spMieteMo = i.stellplatzMiete * Math.pow(1 + (i.wertsteigerung || 0), y - 1);

    // Subvention monats-präzise via subvForMonth() (Iter 43: Subv-Glättung).
    // Subv wird pro Monat geglättet — Effektivmiete bleibt während der Phase konstant.
    // Jahres-Summe = Summe aller Monats-Subventionen, dann /12 für Ø-Monat-Anzeige.
    let subvJahrSumme = 0;
    for (let mm = (y - 1) * 12 + 1; mm <= y * 12; mm++) {
      subvJahrSumme += subvForMonth(mm);
    }
    const subventionMoEff = subvJahrSumme / 12;

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

    // Hausgeld + Mietverwaltung + Hausverwaltung (WEG) Jahr
    // QA-Fix 2026-05-24 (Edgar): Hausgeld-Inflation komplett raus aus der
    // Engine. Edgar's Entscheidung: HG bleibt konstant über die Laufzeit.
    // Folge: kein jährlicher CF-Drift mehr durch HG-Wachstum.
    const hgFaktor = 1;
    // hgJahr enthält Hausgeld + Mietverwaltung + Hausverwaltung (Gesamt-Verwaltungs-Block für CF-Anzeige)
    // Audit-Fix Iter 49 (19.05.2026): Defensive Default 30 €/Mo, wenn Stammdaten-Feld
    // leer geladen wurde (z.B. Karlsruhe WE 7 in Pre-Flight 19.05.). Sonst null/undefined → 0,
    // und Belastung Jahr 1 wäre ~21 €/Mo zu optimistisch (= Werbungskostenausfall WEG).
    // Default analog zum we6-Preset (alle aktiven Presets nutzen 25 oder 30).
    const hausverw = (i.hausverwaltung == null || !isFinite(i.hausverwaltung)) ? BB_DEFAULTS.hausverwaltungMo : i.hausverwaltung;
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

  // Iter 41.17 (18.05.2026): Monats-granulare Cashflow-Serie für die Visualisierung.
  // Edgar will den Cashflow Monat für Monat über 10 Jahre sehen, mit CF nach Steuern
  // im Vordergrund. Wir leiten die Monatswerte direkt aus den Inputs ab (statt nur
  // jährlich) — Mietsteigerungs-Sprünge werden so im Chart korrekt sichtbar.
  const cfMonate = []; // 120 Einträge (10 Jahre × 12 Mo)
  let balanceM = darlehen;
  // QA-Fix 2026-05-22 (Phase-2a Bug #2): cfMonate nutzt jetzt die Excel-PMT (-annuityRate),
  // identisch zu cf[]'s cumipmtExcel/cumprincExcel. Vorher liefen cf[] (Excel-PMT, ~746,74 €)
  // und cfMonate (deutsche Formel, ~747,08 €) parallel mit ~4 €/Jahr Drift. annuityMo selbst
  // (UI-Anzeige) bleibt auf deutscher Formel = Bank-Standard.
  const annuityMoExcel = (nper > 0 && rateM > 0) ? -annuityRate(darlehen, rateM, nper) : annuityMo;
  for (let m = 1; m <= 120; m++) {
    const y = Math.ceil(m / 12);
    // QA-Fix 2026-05-22 (Phase-2a Bug #1): cfMonate nutzte i.kaltmiete*faktor direkt und
    // umging damit den Marktmiete-Cap UND die Iter-91.5-Sprung-Einfrierung. Folge:
    // Cashflow-Chart konnte bei aktivem Cap (z.B. WE 9 Bruchsal) ~720 €/Mo zeigen, während
    // die Jahres-KPI cf[] mit gecappten ~300 €/Mo rechnete. kaltmieteForMonth() macht beides
    // korrekt: Faktor + Cap-Einfrierung im Sprung-Modus.
    const kaltmieteM = kaltmieteForMonth(m);
    const spMieteM = (i.stellplatzMiete || 0) * Math.pow(1 + (i.wertsteigerung || 0), y - 1);
    // Subv-Glättung (Iter 43): siehe subvForMonth() — Effektivmiete bleibt in jeder
    // Phase konstant, Subv schmilzt mit Bestandsmieten-Steigerung. Kein Spike mehr.
    const subvM = subvForMonth(m);
    const mieteM = kaltmieteM + spMieteM + subvM;
    // Zinsen + Tilgung pro Monat (Annuitäten-Formel iterativ)
    // QA-Fix 2026-05-22 (Phase-2a Bug #2): annuityMoExcel statt annuityMo.
    let zinsM = 0, tilgM = 0;
    if (m <= nper) {
      zinsM = balanceM * rateM;
      tilgM = annuityMoExcel - zinsM;
      balanceM = Math.max(0, balanceM - tilgM);
    }
    // HG + MV + HV pro Monat (jährliche Inflation)
    // QA-Fix 2026-05-24 (Edgar): HG-Inflation komplett raus — Faktor = 1 fix.
    const hgFaktorM = 1;
    // Audit-Fix Iter 49: gleicher Default-30-Pfad wie oben (siehe Kommentar bei `hausverw`).
    const hausverwBase = (i.hausverwaltung == null || !isFinite(i.hausverwaltung)) ? BB_DEFAULTS.hausverwaltungMo : i.hausverwaltung;
    const hausverwM = hausverwBase * hgFaktorM;
    const mvM = (i.mietverwaltung || 0) * hgFaktorM;
    const hgM = (i.hausgeld || 0) * hgFaktorM + mvM + hausverwM;
    // Steuervorteil pro Monat — AfA + Zinsen + MV + HV als Werbungskosten gegen Miete
    const afaM_ = afaJahr / 12;
    const stVerlustM = afaM_ + zinsM + mvM + hausverwM - mieteM;
    const stVorteilM = stVerlustM * (i.steuersatz || 0);
    const cfNachStM = mieteM - zinsM - tilgM - hgM + stVorteilM;
    const cfOperativM = cfNachStM - stVorteilM; // = vor Steuer
    cfMonate.push({
      m, y,
      kaltmieteM, spMieteM, subvM, mieteM,
      zinsM, tilgM, hgM, mvM, hausverwM,
      stVorteilM, cfNachStM, cfOperativM,
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
  // Iter 76 (21.05.2026, Edgar-Bug): Marktwert war = marktwertProQm × qm — Stellplatz
  //   komplett vergessen, obwohl er im Darlehen steckt. Schere zwischen Marktwert und
  //   Restschuld war dadurch verschoben. Fix: wohnungMarktwert + stellplatzKp. Der
  //   Stellplatz hat keinen separaten „Markt-Vorteil" — sein Marktwert ist sein Kaufpreis.
  //   Beide wachsen mit der gleichen Wertsteigerung mit (siehe Math.pow unten).
  const wohnungMarktwert = i.marktwertProQm > 0 ? i.marktwertProQm * i.qm : i.kaufpreis;
  const startwert = wohnungMarktwert + (parseFloat(i.stellplatzKp) || 0);
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

  // IRR-Cashflow nutzt den VERKAUFSERLÖS (wert − restschuld) als Endwert in Jahr 10,
  // weil die CFs schon einzeln als irrSeries-Glieder eingehen — sonst würden Cashflows
  // doppelt zählen.
  // FS-3-Fix (Audit Engine-Mathe 25.05.2026): vorher vermoegen[9] — off-by-one.
  // vermoegen[10] ist der Endwert nach Jahr 10 (recalcPaket nutzt das schon korrekt).
  // Folge des Bugs: Einzel-IRR ~0.3-0.8 pp zu niedrig, inkonsistent mit Paket-IRR
  // und mit vermoegenNetto10 (das vermoegen[10] verwendet).
  const irrSeries = [-ekBedarf];
  for (let y = 1; y <= 9; y++) irrSeries.push(cf[y - 1].cfJahr);
  irrSeries.push(cf[9].cfJahr + vermoegen[10].verkaufserloes);

  // QA-Fix 2026-05-22 (Phase-2a Bug #3): Bei knkMitfinanziert=true ist EK=0, IRR-Reihe
  // startet mit -0. Newton-Raphson kann in solchen Fällen auf rein technische Lösungen
  // (~30-49 %) konvergieren, obwohl mathematisch keine sinnvolle Anfangsinvestition
  // existiert. Semantisch ist die Rendite-Aussage „Eigenkapital-Rendite" bei EK=0
  // undefiniert — Frontend ersetzt das durch den Zuwachs-Satz (renditeSatz).
  // QA-Fix 2026-05-23 (Audit E-10): Cap-Schwelle 0.01 → 1 €. Bei sehr
  // kleinem ekBedarf (z.B. 0,50 € durch Rundung) konvergierte irr() auf
  // absurde Raten (500%+) → User sah Schwachsinn-IRR.
  const irrValue = (ekBedarf <= 1) ? null : irr(irrSeries, 0.10);

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
    bonAusgaben = bonDetail.ausgabenGesamtMo; // Iter 69: Fixkosten + Verbindlichkeiten aus SA (keine Pauschale mehr)
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
  // Iter 45: Bank-Bonität nutzt die ECHTE Mieteinnahme in Monat 1 (kaltmiete + sp + Subv-geglättet),
  // nicht die nominale Initial-Subv. Sonst zeigt der Bank-Bogen eine höhere Mieteinnahme
  // als tatsächlich fließt (Subv-Glättung greift, wenn Bestandsmiete seit Vertrag gestiegen ist).
  const subvMo1 = subvForMonth(1);
  const bonMieteAnr = (i.kaltmiete + i.stellplatzMiete + subvMo1) * 0.8;
  const bonAnnuMo = annuityMo; // Annuität positiv aus Sicht der Belastung
  // Quick-Modus (kompatibel zu Iter 10): nur Miete − Annuität.
  // Detail-Modus (Iter 11): zusätzlich HG + HV bank-konservativ.
  const bonHgMo = (i.hausgeld || 0);
  // Audit-Fix Iter 49: gleicher Default-30-Pfad — Bank-Bonität würde sonst optimistisch sein.
  const bonHvMo = (i.hausverwaltung == null || !isFinite(i.hausverwaltung)) ? BB_DEFAULTS.hausverwaltungMo : i.hausverwaltung;
  const bonDelta = (i.bonModus === 'detail')
    ? (bonMieteAnr - bonAnnuMo - bonHgMo - bonHvMo)
    : (bonMieteAnr - bonAnnuMo);
  const bonNach = bonVor + bonDelta;
  const bonVermoegenVsEk = bonVermoegen - ekBedarf;
  const bonVermoegenAusreichend = bonVermoegen >= ekBedarf;

  // Iter 67 (21.05.2026): Sparen-vs-Investieren auf eingesetztes EK umgestellt.
  // Vorher: Vergleich des gesamten verfügbaren Vermögens (bonVermoegen).
  // Jetzt: 1:1-Vergleich des in die Immobilie eingebrachten EK (= ekBedarf = KNK,
  //   wenn nicht mitfinanziert). Frage: was würde aus diesem EK, wenn ich es
  //   stattdessen nur anlege?
  // Sparen-Pfad: ekBedarf wächst rein mit Sparzins.
  // Investieren-Pfad: ekBedarf ist am Tag 0 als KNK weg. Stattdessen entstehen
  //   die jährlichen Cashflows aus der Immobilie — die landen auf einem
  //   Tagesgeldkonto und verzinsen sich dort. Endstand mit Immo = Verkaufserlös
  //   (Marktwert − Restschuld) + verzinster kumulierter CF.
  const sparZins = (i.sparZins !== undefined && i.sparZins !== null) ? i.sparZins : SPAR_ZINS_DEFAULT;
  const sparen = [];
  let nurSparenLauf = ekBedarf;
  let tagesgeldRest = 0; // Immo-Pfad: EK ist als KNK weg, Konto leer am Tag 0
  sparen.push({
    y: 0,
    nurSparen: nurSparenLauf,
    mitImmo: tagesgeldRest + 0,
    delta: tagesgeldRest - nurSparenLauf,
  });
  for (let y = 1; y <= 10; y++) {
    nurSparenLauf = nurSparenLauf * (1 + sparZins);
    const cfJ = cf[y - 1].cfJahr;
    tagesgeldRest = tagesgeldRest * (1 + sparZins) + cfJ;
    const immoWert = vermoegen[y].wert;
    const immoRest = vermoegen[y].restschuld;
    const vermBrutto = immoWert - immoRest;
    // tagesgeldRest kann negativ werden, wenn CFs negativ sind → ehrlich addieren
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

  // Erste Erhöhung in Monat M1 (sofern Mietsteigerung aktiv) — Storytelling
  let ersteErhoehungMonat = null;
  let ersteErhoehungJahrLabel = null;
  if (['sprung', 'index', 'staffel'].includes(i.mietsteigerungsModus)) {
    ersteErhoehungMonat = M1;
    const yEst = Math.ceil(M1 / 12);
    ersteErhoehungJahrLabel = 'Jahr ' + yEst;
  }

  return {
    inputs: i,
    engineVersion: ENGINE_VERSION,
    kpGesamt, knk, investitionGesamt, ekBedarf, darlehen,
    annuityMo, nper, afaMo, afaJahr, afaBemessungBetrag, anschaffungskosten, gebaeudeAnteilFaktor,
    cf, cfMonate, vermoegen, irr: irrValue,
    vermoegenBrutto10: vermoegen[10].vermoegenBrutto,
    vermoegenNetto10: vermoegen[10].vermoegenNetto,
    belastungMo,
    // Mietsubvention-Gesamt = tatsächlicher Liquiditätsabfluss durch Subv-Glättung (Iter 43).
    // NICHT nominal (ph.mo × monate), sondern echte Summe nach Glättung — wenn Bestandsmiete
    // in der Phase steigt, schmilzt die Subv, also wird real weniger gezahlt.
    mietsubventionGesamt: cfMonate.reduce((s, mo) => s + (mo.subvM || 0), 0),
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
    // Iter 67 (20.05.2026): €/qm-Werte + Bruttorendite für Vertriebler-UI.
    //   - kaufpreisWohnungProQm: nur Wohnung (ohne Stellplatz), damit der Vertriebler
    //     die Wohnungs-Marktwert-Vergleich auf einen Blick hat.
    //   - mieteWohnungProQm: Tag-1-Kaltmiete der Wohnung (ohne Stellplatz, ohne Subv).
    //   - subventionProQm: Aufschlag aus Phase 1 / qm — was B&B effektiv pro qm draufpackt.
    //   - bruttorendite: Tag-1-Brutto-Mieteinnahme inkl. Subv (Kaltmiete + Stellplatzmiete
    //     + Phase-1-Aufschlag) × 12 / Gesamtkaufpreis. Bewusst Tag-1 statt CF-Jahr-1, damit
    //     keine Staffel-Schritte schon eingerechnet sind — der Wert bleibt deterministisch
    //     und nachvollziehbar. Edgar-Vorgabe 20.05.2026.
    kaufpreisWohnungProQm: (i.qm > 0 && i.kaufpreis > 0) ? (i.kaufpreis / i.qm) : 0,
    mieteWohnungProQm: (i.qm > 0 && i.kaltmiete > 0) ? (i.kaltmiete / i.qm) : 0,
    subventionProQm: (i.qm > 0 && Array.isArray(i.subventionPhasen) && i.subventionPhasen[0])
      ? ((i.subventionPhasen[0].mo || 0) / i.qm)
      : ((i.qm > 0 && i.subventionMo) ? (i.subventionMo / i.qm) : 0),
    bruttorendite: (() => {
      const kpG = (parseFloat(i.kaufpreis) || 0) + (parseFloat(i.stellplatzKp) || 0);
      if (!(kpG > 0)) return 0;
      const tag1Miete = (parseFloat(i.kaltmiete) || 0) + (parseFloat(i.stellplatzMiete) || 0);
      const phase1Subv = (Array.isArray(i.subventionPhasen) && i.subventionPhasen[0])
        ? (parseFloat(i.subventionPhasen[0].mo) || 0)
        : (parseFloat(i.subventionMo) || 0);
      return (tag1Miete + phase1Subv) * 12 / kpG;
    })(),
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
    'zins', 'tilgung', 'knkMitfinanziert', 'steuersatz', 'saSteuersatz',
    'bonEinnahmen', 'bonAusgaben', 'bonVermoegen', 'bonModus',
    'selbstauskunft', 'saAntragGemeinsam', 'sparZins'
  ];

  // 1. Jede WE einzeln berechnen — Person-Settings überlagern.
  const results = weInputsArr.map(weInput => {
    const merged = { ...weInput };
    personFields.forEach(f => {
      if (ps[f] !== undefined) merged[f] = ps[f];
    });
    return recalc(merged);
  }).filter(Boolean); // QA-Fix 2026-05-23 (Audit E-1): recalc kann jetzt null
                      // returnen (KP=0). Diese WEs aus der Paket-Aggregation rausfiltern.

  if (results.length === 0) return null;
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

  // 3b. cfMonate (120 Monate): element-weise summieren (Iter 45-Fix).
  // Vorher: recalcPaket lieferte kein cfMonate → Cashflow-Chart war im Paket-Modus leer.
  const cfMonate = [];
  const moCount = (results[0].cfMonate || []).length;
  for (let m = 0; m < moCount; m++) {
    cfMonate.push({
      m: m + 1,
      y: Math.ceil((m + 1) / 12),
      kaltmieteM:   sum(null, r => (r.cfMonate && r.cfMonate[m]) ? (r.cfMonate[m].kaltmieteM || 0) : 0),
      spMieteM:     sum(null, r => (r.cfMonate && r.cfMonate[m]) ? (r.cfMonate[m].spMieteM   || 0) : 0),
      subvM:        sum(null, r => (r.cfMonate && r.cfMonate[m]) ? (r.cfMonate[m].subvM      || 0) : 0),
      mieteM:       sum(null, r => (r.cfMonate && r.cfMonate[m]) ? (r.cfMonate[m].mieteM     || 0) : 0),
      zinsM:        sum(null, r => (r.cfMonate && r.cfMonate[m]) ? (r.cfMonate[m].zinsM      || 0) : 0),
      tilgM:        sum(null, r => (r.cfMonate && r.cfMonate[m]) ? (r.cfMonate[m].tilgM      || 0) : 0),
      hgM:          sum(null, r => (r.cfMonate && r.cfMonate[m]) ? (r.cfMonate[m].hgM        || 0) : 0),
      mvM:          sum(null, r => (r.cfMonate && r.cfMonate[m]) ? (r.cfMonate[m].mvM        || 0) : 0),
      hausverwM:    sum(null, r => (r.cfMonate && r.cfMonate[m]) ? (r.cfMonate[m].hausverwM  || 0) : 0),
      stVorteilM:   sum(null, r => (r.cfMonate && r.cfMonate[m]) ? (r.cfMonate[m].stVorteilM || 0) : 0),
      cfNachStM:    sum(null, r => (r.cfMonate && r.cfMonate[m]) ? (r.cfMonate[m].cfNachStM  || 0) : 0),
      cfOperativM:  sum(null, r => (r.cfMonate && r.cfMonate[m]) ? (r.cfMonate[m].cfOperativM|| 0) : 0),
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
  // QA-Fix 2026-05-22 (Phase-2a Bug #3): Paket-IRR ebenfalls null bei EK=0
  // (Konvergenz-Artefakte vermeiden, semantisch undefiniert).
  // QA-Fix 2026-05-23 (Audit E-10): Cap-Schwelle 0.01 → 1 €. Bei sehr
  // kleinem ekBedarf (z.B. 0,50 € durch Rundung) konvergierte irr() auf
  // absurde Raten (500%+) → User sah Schwachsinn-IRR.
  const irrValue = (ekBedarf <= 1) ? null : irr(irrSeries, 0.10);

  // 6. Sparen-vs-Investieren auf Paket-Ebene
  // Iter 67 (21.05.2026): siehe kalkRecalc — 1:1-Vergleich des in die Immobilie
  // eingebrachten EK (Paket-EK-Summe), nicht des gesamten verfügbaren Vermögens.
  const sparZins = (ps.sparZins !== undefined && ps.sparZins !== null) ? ps.sparZins : SPAR_ZINS_DEFAULT;
  const sparen = [];
  let nurSparenLauf = ekBedarf;
  let tagesgeldRest = 0;
  sparen.push({ y: 0, nurSparen: nurSparenLauf, mitImmo: tagesgeldRest, delta: tagesgeldRest - nurSparenLauf });
  for (let y = 1; y <= 10; y++) {
    nurSparenLauf = nurSparenLauf * (1 + sparZins);
    const cfJ = cf[y - 1].cfJahr;
    tagesgeldRest = tagesgeldRest * (1 + sparZins) + cfJ;
    // Verkaufserlös (Wert − Restschuld) ohne CFs — die kommen via tagesgeldRest rein,
    // sonst Doppelzählung.
    const vermBrutto = vermoegen[y].verkaufserloes;
    const mitImmoEhrlich = tagesgeldRest + vermBrutto;
    sparen.push({ y, nurSparen: nurSparenLauf, mitImmo: mitImmoEhrlich, delta: mitImmoEhrlich - nurSparenLauf });
  }
  const sparenVsKaufenDelta = sparen[10].mitImmo - sparen[10].nurSparen;

  // 7. Bonität (Paket-Summe) — einmal für gesamtes Paket
  const bonVermoegen = ps.bonVermoegen || 0;
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
    cf, cfMonate, vermoegen, irr: irrValue,
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
    // Iter 67 (20.05.2026): Aggregierte €/qm-Werte + Bruttorendite für Paket-Modus.
    kaufpreisWohnungProQm: (() => {
      const totalQm = results.reduce((s,r)=>s+(r.inputs.qm||0),0);
      const totalWohnungKp = results.reduce((s,r)=>s+(r.inputs.kaufpreis||0),0);
      return totalQm > 0 ? (totalWohnungKp / totalQm) : 0;
    })(),
    mieteWohnungProQm: (() => {
      const totalQm = results.reduce((s,r)=>s+(r.inputs.qm||0),0);
      const totalKaltmiete = results.reduce((s,r)=>s+(r.inputs.kaltmiete||0),0);
      return totalQm > 0 ? (totalKaltmiete / totalQm) : 0;
    })(),
    subventionProQm: (() => {
      const totalQm = results.reduce((s,r)=>s+(r.inputs.qm||0),0);
      const totalSubvMo = results.reduce((s,r)=>{
        const ph = r.inputs.subventionPhasen;
        return s + (Array.isArray(ph) && ph[0] ? (ph[0].mo||0) : (r.inputs.subventionMo||0));
      }, 0);
      return totalQm > 0 ? (totalSubvMo / totalQm) : 0;
    })(),
    bruttorendite: (() => {
      // Iter 67: Tag-1-Bruttorendite über das ganze Paket — analog zur Einzel-WE.
      if (!(kpGesamt > 0)) return 0;
      const tag1MieteSum = results.reduce((s, r) => {
        const inp = r.inputs || {};
        return s + (parseFloat(inp.kaltmiete) || 0) + (parseFloat(inp.stellplatzMiete) || 0);
      }, 0);
      const phase1SubvSum = results.reduce((s, r) => {
        const inp = r.inputs || {};
        const ph = inp.subventionPhasen;
        return s + (Array.isArray(ph) && ph[0]
          ? (parseFloat(ph[0].mo) || 0)
          : (parseFloat(inp.subventionMo) || 0));
      }, 0);
      return (tag1MieteSum + phase1SubvSum) * 12 / kpGesamt;
    })(),
  };
}

/* ====================================================================
   WELLE 1 (2026-05-24): SENSITIVITÄTS-MATRIX + STRESS-SZENARIEN
   Pure Wrapper um recalc() — keine Engine-Änderung, kein Bruch-Risiko.
   ==================================================================== */

/**
 * Sensitivitäts-Matrix: rechnet recalc() für ein Raster aus
 * Zins-Deltas × Leerstand-Monaten. Liefert die Schlüssel-KPIs pro Zelle.
 *
 * Anwendung:
 *   const m = sensitivitaetsMatrix(weInputs, {
 *     zinsDeltas: [-0.005, 0, 0.005, 0.01, 0.02],     // -0,5 % .. +2 %
 *     leerstandMonateProJahr: [0, 1, 2, 3]
 *   });
 *   m.cells[y][x] = { cfJ1, cfJ10, vermoegenNetto10, irr, belastungMo }
 *
 * Leerstand-Modell: Kaltmiete + Stellplatzmiete werden um (12-x)/12 reduziert,
 * Hausgeld bleibt voll (Käufer trägt es weiter). Pragmatischer Ansatz — keine
 * Modellierung von „Leerstand nur in einem Jahr".
 */
function sensitivitaetsMatrix(baseInputs, opts) {
  opts = opts || {};
  const zinsDeltas = opts.zinsDeltas || [-0.005, 0, 0.005, 0.01, 0.02];
  const leerstandMonate = opts.leerstandMonateProJahr || [0, 1, 2, 3];

  const baseZins = parseFloat(baseInputs.zins) || 0.045;
  const cells = [];
  for (let yi = 0; yi < leerstandMonate.length; yi++) {
    const lMo = leerstandMonate[yi];
    const mietFaktor = Math.max(0, (12 - lMo) / 12);
    const row = [];
    for (let xi = 0; xi < zinsDeltas.length; xi++) {
      const dz = zinsDeltas[xi];
      const i2 = Object.assign({}, baseInputs, {
        zins: baseZins + dz,
        kaltmiete:       (parseFloat(baseInputs.kaltmiete) || 0)       * mietFaktor,
        stellplatzMiete: (parseFloat(baseInputs.stellplatzMiete) || 0) * mietFaktor,
      });
      const r = recalc(i2);
      if (!r) {
        row.push(null);
        continue;
      }
      row.push({
        zinsDelta: dz,
        zinsAbs: baseZins + dz,
        leerstandMo: lMo,
        cfJ1: r.cf[0].cfJahr,
        cfJ10: r.cf[9].cfJahr,
        belastungMo: r.belastungMo,
        vermoegenNetto10: r.vermoegenNetto10,
        irr: r.irr,
      });
    }
    cells.push(row);
  }
  return {
    engineVersion: ENGINE_VERSION,
    zinsDeltas, leerstandMonate,
    baseZins,
    cells,
    base: recalc(baseInputs),
  };
}

/**
 * Stress-Szenario: 1-Klick-Worst-Case. Edgar/Vertriebler kann dem
 * Käufer zeigen: „Auch unter widrigen Bedingungen sieht's so aus."
 *
 * Default-Worst-Case: Zins +2 %, dauerhaft 3 Mo Leerstand p.a., +0,5 %
 * Mietausfall (uneinbringliche Mietforderungen).
 */
function stressSzenario(baseInputs, opts) {
  opts = opts || {};
  const zinsDelta = opts.zinsDelta !== undefined ? opts.zinsDelta : 0.02;
  const leerstandMo = opts.leerstandMonateProJahr !== undefined ? opts.leerstandMonateProJahr : 3;
  const mietausfallPct = opts.mietausfallPct !== undefined ? opts.mietausfallPct : 0.005;

  const mietFaktor = Math.max(0, (12 - leerstandMo) / 12) * (1 - mietausfallPct);
  const baseZins = parseFloat(baseInputs.zins) || 0.045;
  const i2 = Object.assign({}, baseInputs, {
    zins: baseZins + zinsDelta,
    kaltmiete:       (parseFloat(baseInputs.kaltmiete) || 0)       * mietFaktor,
    stellplatzMiete: (parseFloat(baseInputs.stellplatzMiete) || 0) * mietFaktor,
  });
  const stress = recalc(i2);
  const base = recalc(baseInputs);
  if (!stress || !base) return null;
  return {
    engineVersion: ENGINE_VERSION,
    annahmen: { zinsDelta, leerstandMonateProJahr: leerstandMo, mietausfallPct },
    base, stress,
    delta: {
      cfJ1: stress.cf[0].cfJahr - base.cf[0].cfJahr,
      cfJ10: stress.cf[9].cfJahr - base.cf[9].cfJahr,
      belastungMo: stress.belastungMo - base.belastungMo,
      vermoegenNetto10: stress.vermoegenNetto10 - base.vermoegenNetto10,
      irr: (stress.irr || 0) - (base.irr || 0),
    },
  };
}

/**
 * Renovierungs-Stress (Edgar 24.05.2026): zeigt wie sich die Kennzahlen
 * verschieben, wenn der Käufer Renovierung in die Wohnung steckt.
 * Modellierung: Renovierungskosten werden zum Kaufpreis addiert (BFH-Sicht:
 * anschaffungsnahe Aufwendungen innerhalb 3 Jahre sind Teil der AKK,
 * AfA-fähig). Heißt: KP steigt um X € → KNK + EK + AfA wachsen mit.
 * Käufer-Mehrwert = die Renovierung → spiegelt sich in der Wert-
 * steigerung nicht extra wider; Engine rechnet das durch.
 */
function renovierungsStress(baseInputs, kostenArr) {
  kostenArr = Array.isArray(kostenArr) ? kostenArr : [0, 5000, 10000, 15000, 20000];
  const zellen = kostenArr.map(kosten => {
    const i2 = Object.assign({}, baseInputs, {
      kaufpreis: (parseFloat(baseInputs.kaufpreis) || 0) + kosten,
    });
    const r = recalc(i2);
    if (!r) return null;
    return {
      kosten,
      cfJ1: r.cf[0].cfJahr,
      cfJ10: r.cf[9] ? r.cf[9].cfJahr : null,
      belastungMo: r.belastungMo,
      ekBedarf: r.ekBedarf,
      vermoegenNetto10: r.vermoegenNetto10,
      irr: r.irr,
      isBase: kosten === 0,
    };
  }).filter(Boolean);
  return { kostenArr, zellen, engineVersion: ENGINE_VERSION };
}

/* ====================================================================
   EXPORTS — als window.* nutzbar in app.js / pdf.js
   ==================================================================== */
window.Kalk = {
  recalc, recalcPaket, irr, computeBonitaetDetailed,
  sensitivitaetsMatrix, stressSzenario, renovierungsStress,
  fmtEur, fmtEurMo, fmtEurMoDec, fmtPct, fmtEurQm,
  PROFILES, PRESETS, BB_DEFAULTS, SPAR_ZINS_DEFAULT,
  ENGINE_VERSION,
  getDefaults, applyProfile,
};
