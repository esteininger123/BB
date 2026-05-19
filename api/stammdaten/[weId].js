// GET /api/stammdaten/:weId — kombinierte Stammdaten für eine Wohneinheit:
//   - Wohneinheit (KP, qm, Kaltmiete, Lage)
//   - Verknüpfte Stellplätze (Kaufpreis + Miete aus altem Stellplatz-Feld ODER aus Mietvertrag)
//   - Aktive Kalkulations-Stammdaten-Zeile (Status=Aktiv), falls vorhanden
//
// PUT /api/stammdaten/:weId — Update oder Create der Kalkulations-Stammdaten für diese WE
//   - Body: { status, hausverwaltung, hausgeldRuecklage, mietverwaltungDefault,
//              mietzuschuss, mietzuschussMonate, afaGutachten, wertsteigerung,
//              vermietungsModus, kappungsgrenze, indexmiete, notizen }
//   - Wenn schon ein Aktiv-Datensatz existiert: dieser wird aktualisiert.
//   - Wenn nur Entwurf existiert: dieser wird aktualisiert.
//   - Wenn keiner existiert: neuer wird angelegt mit Quelle = 'App-Edit {Datum}'.
//   - Beim Setzen von status=Aktiv wird ein anderer Aktiv-Datensatz für dieselbe WE auf Archiviert
//     gesetzt (Schutz vor Doppel-Aktiv).
//   - Nur Admins dürfen schreiben.

const { verifySession } = require('../_lib/auth');
const { airtable, listAll } = require('../_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const {
  TABLES,
  WE_FIELDS,
  STELLPLATZ_FIELDS,
  MIETVERTRAG_FIELDS,
  KALK_STAMMDATEN_FIELDS,
  KALK_STATUS_AKTIV,
  KALK_STATUS_ARCHIV,
} = require('../_lib/tables');

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(v);
  return isFinite(n) ? n : null;
}

function firstStringFromLink(v) {
  if (!Array.isArray(v) || v.length === 0) return null;
  const x = v[0];
  if (x && typeof x === 'object' && x.id) return x.id;
  if (typeof x === 'string') return x;
  return null;
}

// Liefert das Stellplatz-Datenobjekt für die App (kombiniert).
async function loadStellplaetzeForWE(weId) {
  try {
    // Audit-Notiz Iter 49 (19.05.2026): serverseitiger Filter über filterByFormula auf
    // RECORD_ID() des verknüpften WE-Links wäre der saubere Weg — Airtable's
    // filterByFormula referenziert Felder aber über Field-NAMEN, nicht Field-IDs.
    // Die Field-Namen werden im Code nicht geführt (würden Drift verursachen wenn umbenannt).
    // Bis ein Mapping (oder ein Reverse-Lookup auf der WE-Tabelle) ergänzt ist, bleibt der
    // clientseitige Filter. Skalierungsrisiko vermerkt im Backlog (§7/§8 QA-Report).
    const recs = await listAll(TABLES.STELLPLATZ, {
      fields: [
        STELLPLATZ_FIELDS.TITEL,
        STELLPLATZ_FIELDS.WE_LINK,
        STELLPLATZ_FIELDS.TYP,
        STELLPLATZ_FIELDS.MIETKOSTEN,
        STELLPLATZ_FIELDS.KAUFPREIS,
      ],
    }, 2000);

    const matched = recs.filter(r => {
      const link = (r.fields && r.fields[STELLPLATZ_FIELDS.WE_LINK]) || [];
      if (!Array.isArray(link)) return false;
      return link.some(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        return id === weId;
      });
    });

    return matched.map(r => {
      const f = r.fields || {};
      const typObj = f[STELLPLATZ_FIELDS.TYP];
      const typ = typObj && typeof typObj === 'object' ? typObj.name : typObj || '';
      return {
        id: r.id,
        titel: f[STELLPLATZ_FIELDS.TITEL] || '',
        typ,
        kaufpreis: num(f[STELLPLATZ_FIELDS.KAUFPREIS]) || 0,
        mieteMo: num(f[STELLPLATZ_FIELDS.MIETKOSTEN]) || 0, // alte Spalte, falls befüllt
      };
    });
  } catch (e) {
    console.error('loadStellplaetzeForWE failed:', e.message);
    return [];
  }
}

// Liefert alle Mietvertrag-relevanten Infos für eine WE in einem Pass:
//   - Stellplatzmiete-Summe (aggregiert über verknüpfte Mietverträge)
//   - Vermietungs-Status (vermietet=true, wenn mind. 1 Vertrag mit dieser WE existiert,
//     der nicht offensichtlich archiviert ist)
//   - Letzte Mietsteigerung (Datum) — nimmt das jüngste VERTRAGSBEGINN-Datum,
//     fallback auf das jüngste GUELTIG_AB-Datum (Iter 41.13).
//     Begründung: Stichprobe 18.05.2026 — Vertragsbeginn zu 97,9 % gefüllt,
//     'Anpassung gültig ab' nur zu 58 %. Bei jeder Erhöhung wird laut SOP-E §3.3
//     ein neuer Vertragsdatensatz mit entsprechendem Vertragsbeginn angelegt.
//
// Iter 44 (19.05.2026): Stellplatzmiete pro-rata zur Stellplatz-Verknüpfung.
// Wenn der zweite Parameter `weStpIds` (Array von Stellplatz-Record-IDs der WE)
// übergeben wird, prüfen wir pro Mietvertrag, wie viele der vertraglich verlinkten
// Stellplätze noch zur WE gehören. Beispiel Wess 5: Vertrag = 100 € für [stp1, stp2],
// WE hat nur noch stp1 → Anteil 1/2, effektive Stellplatzmiete = 50 €.
async function loadMietvertragInfoForWE(weId, weStpIds) {
  try {
    const recs = await listAll(TABLES.MIETVERTRAG, {
      fields: [
        MIETVERTRAG_FIELDS.WE_LINK,
        MIETVERTRAG_FIELDS.STELLPLATZ_LINK,
        MIETVERTRAG_FIELDS.STELLPLATZMIETE,
        MIETVERTRAG_FIELDS.STATUS_LOOKUP,
        MIETVERTRAG_FIELDS.VERTRAGSBEGINN,
        MIETVERTRAG_FIELDS.GUELTIG_AB,
        MIETVERTRAG_FIELDS.VERTRAGSART,
      ],
    }, 5000);

    let stplMietsumme = 0;
    let stplMietsummeNominal = 0; // ohne Pro-rata — für Debug/Diff
    let vertraegeMitStellplatz = 0;
    let jungsteMietsteigerung = null; // YYYY-MM-DD
    let jungsterVertragsbeginn = null;
    let vertragVorhanden = false;
    const useProRata = Array.isArray(weStpIds);

    recs.forEach(r => {
      const f = r.fields || {};
      const weLink = f[MIETVERTRAG_FIELDS.WE_LINK] || [];
      const linked = Array.isArray(weLink) && weLink.some(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        return id === weId;
      });
      if (!linked) return;
      vertragVorhanden = true;
      const stpl = f[MIETVERTRAG_FIELDS.STELLPLATZ_LINK];
      const stplMiete = num(f[MIETVERTRAG_FIELDS.STELLPLATZMIETE]) || 0;
      if (stpl && stplMiete > 0) {
        const stplArr = Array.isArray(stpl) ? stpl : [];
        const vertragStpIds = stplArr.map(x => (x && typeof x === 'object' && x.id) ? x.id : x);
        let effektiveMiete = stplMiete;
        if (useProRata && vertragStpIds.length > 0) {
          // Pro-rata: nur Stellplätze zählen, die noch zur WE verknüpft sind
          const gueltigeAnzahl = vertragStpIds.filter(id => weStpIds.includes(id)).length;
          effektiveMiete = stplMiete * (gueltigeAnzahl / vertragStpIds.length);
        }
        stplMietsumme += effektiveMiete;
        stplMietsummeNominal += stplMiete;
        vertraegeMitStellplatz += 1;
      }
      const gueltig = f[MIETVERTRAG_FIELDS.GUELTIG_AB];
      const beginn = f[MIETVERTRAG_FIELDS.VERTRAGSBEGINN];
      if (gueltig && (!jungsteMietsteigerung || gueltig > jungsteMietsteigerung)) {
        jungsteMietsteigerung = gueltig;
      }
      if (beginn && (!jungsterVertragsbeginn || beginn > jungsterVertragsbeginn)) {
        jungsterVertragsbeginn = beginn;
      }
    });

    return {
      stellplatzMietsumme: stplMietsumme,
      stellplatzMietsummeNominal: stplMietsummeNominal,
      stellplatzMieteProRata: useProRata && stplMietsummeNominal !== stplMietsumme,
      vertraegeMitStellplatz,
      vertragVorhanden,
      // Iter 41.13: Vertragsbeginn ist verlässlicher gepflegt als 'Anpassung gültig ab'
      letzteMietsteigerung: jungsterVertragsbeginn || jungsteMietsteigerung || null,
      jungsterVertragsbeginn,
    };
  } catch (e) {
    console.error('loadMietvertragInfoForWE failed:', e.message);
    return {
      stellplatzMietsumme: 0,
      stellplatzMietsummeNominal: 0,
      stellplatzMieteProRata: false,
      vertraegeMitStellplatz: 0,
      vertragVorhanden: false,
      letzteMietsteigerung: null,
      jungsterVertragsbeginn: null,
    };
  }
}

// Findet die Kalkulations-Stammdaten-Zeile für eine WE.
// Priorität: erst aktiv, dann entwurf, dann keinen.
async function loadKalkStammdatenForWE(weId) {
  try {
    const recs = await listAll(TABLES.KALK_STAMMDATEN, {
      fields: Object.values(KALK_STAMMDATEN_FIELDS),
    }, 1000);

    const matched = recs.filter(r => {
      const link = (r.fields && r.fields[KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]) || [];
      if (!Array.isArray(link)) return false;
      return link.some(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        return id === weId;
      });
    });

    if (matched.length === 0) return null;

    // Priorisierung: erst Aktiv, dann Entwurf, dann Archiviert.
    const byStatus = { Aktiv: [], Entwurf: [], Archiviert: [] };
    matched.forEach(r => {
      const s = r.fields && r.fields[KALK_STAMMDATEN_FIELDS.STATUS];
      const name = s && typeof s === 'object' ? s.name : s || '';
      if (byStatus[name]) byStatus[name].push(r);
    });
    const pick = byStatus.Aktiv[0] || byStatus.Entwurf[0] || byStatus.Archiviert[0];
    return pick;
  } catch (e) {
    console.error('loadKalkStammdatenForWE failed:', e.message);
    return null;
  }
}

function kalkStammRecordToApi(rec) {
  if (!rec) return null;
  const f = rec.fields || {};
  const statusObj = f[KALK_STAMMDATEN_FIELDS.STATUS];
  const status = statusObj && typeof statusObj === 'object' ? statusObj.name : statusObj || null;
  const vermObj = f[KALK_STAMMDATEN_FIELDS.VERMIETUNGS_MODUS];
  const vermietungsModus = vermObj && typeof vermObj === 'object' ? vermObj.name : vermObj || null;
  const kappObj = f[KALK_STAMMDATEN_FIELDS.KAPPUNGSGRENZE];
  const kappungsgrenze = kappObj && typeof kappObj === 'object' ? kappObj.name : kappObj || null;
  return {
    id: rec.id,
    status,
    bezeichnung:           f[KALK_STAMMDATEN_FIELDS.BEZEICHNUNG] || null,
    hausverwaltung:        num(f[KALK_STAMMDATEN_FIELDS.HAUSVERWALTUNG]),
    hausgeldRuecklage:     num(f[KALK_STAMMDATEN_FIELDS.HAUSGELD_RUECKLAGE]),
    mietverwaltungDefault: num(f[KALK_STAMMDATEN_FIELDS.MIETVERWALTUNG_DEF]),
    mietzuschuss:          num(f[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS]),
    mietzuschussMonate:    num(f[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS_MONATE]),
    afaGutachten:          num(f[KALK_STAMMDATEN_FIELDS.AFA_GUTACHTEN]),
    wertsteigerung:        num(f[KALK_STAMMDATEN_FIELDS.WERTSTEIGERUNG]),
    vermietungsModus,
    kappungsgrenze,
    indexmiete:            num(f[KALK_STAMMDATEN_FIELDS.INDEXMIETE]),
    letzteMietsteigerung:  f[KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG] || null,
    grEst:                 num(f[KALK_STAMMDATEN_FIELDS.GRESt]),
    gebaeudeAnteil:        num(f[KALK_STAMMDATEN_FIELDS.GEBAEUDE_ANTEIL]),
    hgInflation:           num(f[KALK_STAMMDATEN_FIELDS.HG_INFLATION]),
    notizen:               f[KALK_STAMMDATEN_FIELDS.NOTIZEN] || '',
    quelle:                f[KALK_STAMMDATEN_FIELDS.QUELLE] || '',
    // Iter 41.9 — Henry-Feedback 17.05.2026:
    mieteBeiVerkauf:       num(f[KALK_STAMMDATEN_FIELDS.MIETE_BEI_VERKAUF]),
    marktpreisImmoscout:   num(f[KALK_STAMMDATEN_FIELDS.MARKTPREIS_IS]),
    marktpreisHomeday:     num(f[KALK_STAMMDATEN_FIELDS.MARKTPREIS_HD]),
    marktmiete:            num(f[KALK_STAMMDATEN_FIELDS.MARKTMIETE]),
    // Iter 41.17 — Lookup „Miet-status (ist)" aus WE. Roher Wert wird in
    // resolveVermietungsstatus() normalisiert.
    weVermietungsstatusRaw: f[KALK_STAMMDATEN_FIELDS.WE_VERMIETUNGSSTATUS] || null,
  };
}

// Iter 41.17 (18.05.2026) — Vermietungs-Status aus dem WE-Lookup ableiten.
// Erwartete Werte aus der Wohneinheit-Tabelle: "vermietet" oder "leerstehend"
// (bzw. Varianten wie "leer", "frei"). Lookups kommen aus Airtable typischerweise
// als Array; Single-Selects (auch via Lookup) werden vom airtable-Wrapper bereits
// auf .name reduziert. Wir nehmen den ersten nicht-leeren Eintrag.
// Rückgabe: 'vermietet' | 'leer' | null (wenn Lookup leer/unklar → Fallback).
function resolveVermietungsstatusFromLookup(rawVal) {
  if (rawVal == null) return null;
  let v = rawVal;
  if (Array.isArray(v)) v = v.find(x => x != null && x !== '') || null;
  if (v == null) return null;
  if (typeof v === 'object' && v.name) v = v.name;
  const s = String(v).toLowerCase().trim();
  if (!s) return null;
  if (s.startsWith('vermiet')) return 'vermietet';
  if (s.startsWith('leer') || s.startsWith('frei') || s.includes('leerstehend')) return 'leer';
  return null;
}

// --- Iter 41.10: 2-Phasen-Mietsubvention (Edgar/Henry-Modell 18.05.2026) ---
//
// Logik:
// - Käufer sieht ab Tag 1 die konstante Käufer-Miete = MbV + X über bis zu 6 Jahre.
// - X = Käufer-Aufschlag pro Monat. Ideal: X = MbV × ((1+Kapp)² − 1), gedeckelt durch
//   die Marktmiete (rechtl. Erhöhungslimit) und durch den Subv-Cap (€).
// - Phase 1 läuft (36 − Mo seit letzter Erhöhung) Monate. Subv P1/Mo = X.
//   (Mieter zahlt MbV; B&B legt X drauf, sodass Käufer MbV + X sieht.)
// - Phase 2 läuft 36 Monate, sofern nach Phase 1 die Käufer-Miete noch
//   > 10 % unter Marktmiete liegt. Sonst entfällt P2.
//   (Mieter wird in P2 legal um MbV × Kapp erhöht; Subv P2/Mo = X − MbV × Kapp.)
// - Cap = max(5.000 €, qm × 150 €/qm). Override per Stammdaten möglich (heute nicht).
// - Wenn (P1-Subv + P2-Subv) > Cap, wird X so reduziert, dass die Summe genau dem
//   Cap entspricht. Käufer-Miete bleibt 6 Jahre konstant, nur niedriger als ideal.
// - Manueller Mietzuschuss in Stammdaten hat Vorrang vor der Auto-Berechnung
//   (wird als einzige Phase ausgewiesen).
// - Vermietungsmodus ≠ 'Bestand' (Neuvermietung, Index, leer) → keine Subvention.
function parseKappPct(kappRaw) {
  if (typeof kappRaw === 'string') {
    const m = kappRaw.match(/(\d+([.,]\d+)?)/);
    if (m) return parseFloat(m[1].replace(',', '.')) / 100;
  }
  if (typeof kappRaw === 'number') {
    return kappRaw > 1 ? kappRaw / 100 : kappRaw;
  }
  return 0;
}

function computeAutoSubvention(kalkApi, vermietung, weQm) {
  const empty = { phasen: [], totalEur: 0, mo: 0, monate: 0, quelle: 'keine', erlaeuterung: '' };

  if (!kalkApi) return Object.assign({}, empty, { quelle: 'keine-stammdaten' });

  // Manueller Override → eine Phase
  const manMo  = kalkApi.mietzuschuss;
  const manMon = kalkApi.mietzuschussMonate;
  if ((manMo != null && manMo > 0) || (manMon != null && manMon > 0)) {
    const mo = manMo || 0, monate = manMon || 0;
    return {
      phasen: [{ mo, monate, label: 'Manuell (Override)' }],
      totalEur: Math.round(mo * monate),
      mo, monate, quelle: 'manuell',
      erlaeuterung: 'Manuell gepflegter Mietzuschuss in Stammdaten hat Vorrang.'
    };
  }

  // Vermietungsmodus checken
  const modus = (kalkApi.vermietungsModus || '').toLowerCase();
  if (modus !== 'bestand') {
    // Iter 41.16: Quelle-Label klarer differenziert
    let quelleLabel = 'auto-neuvermietung';
    let erlText = 'Keine Mietsubvention bei Neuvermietung — Du übernimmst einen frischen Mietvertrag zur aktuellen Marktmiete.';
    if (modus.includes('leer') || modus.includes('frei')) {
      quelleLabel = 'auto-leerstand';
      erlText = 'Keine Mietsubvention bei Leerstand — wir vermieten die Wohnung für Dich frisch, bevor Du sie übernimmst.';
    } else if (!modus) {
      quelleLabel = 'auto-modus-fehlt';
      erlText = 'Vermietungs-Modus in Stammdaten nicht gepflegt — keine Subvention berechnet.';
    }
    return Object.assign({}, empty, {
      quelle: quelleLabel,
      erlaeuterung: erlText,
    });
  }

  const mbv = kalkApi.mieteBeiVerkauf;
  if (!mbv || mbv <= 0) return Object.assign({}, empty, { quelle: 'auto-mbv-fehlt', erlaeuterung: 'Miete bei Verkauf in Stammdaten fehlt.' });

  const kappPct = parseKappPct(kalkApi.kappungsgrenze);
  if (!kappPct || kappPct <= 0) return Object.assign({}, empty, { quelle: 'auto-kappung-fehlt', erlaeuterung: 'Kappungsgrenze in Stammdaten fehlt.' });

  const marktmiete = kalkApi.marktmiete || 0;

  // Phase-1-Laufzeit aus letzter Mietsteigerung
  const letzte = (vermietung && vermietung.letzteMietsteigerung) || kalkApi.letzteMietsteigerung;
  let monateSeit = null; // null = unbekannt → konservativ 0 Mo verstrichen
  if (letzte) {
    const datum = new Date(letzte);
    const heute = new Date();
    monateSeit = Math.max(0, (heute.getFullYear() - datum.getFullYear()) * 12 + (heute.getMonth() - datum.getMonth()));
  }
  const p1Monate = monateSeit !== null ? Math.max(0, 36 - monateSeit) : 36;
  const p2Monate = 36;

  // X_ideal = MbV × ((1+Kapp)² − 1)   (= 2 Erhöhungsstufen drauf)
  // Markt-Deckelung: X kann max. (Marktmiete − MbV) sein, sonst rechtl. nicht haltbar.
  const xIdealEhneMarkt = mbv * ((1 + kappPct) * (1 + kappPct) - 1);
  const xMaxMarkt = marktmiete > 0 ? Math.max(0, marktmiete - mbv) : xIdealEhneMarkt;
  const xIdeal = Math.min(xIdealEhneMarkt, xMaxMarkt);

  if (xIdeal <= 0) {
    return Object.assign({}, empty, {
      quelle: 'auto-kein-spielraum',
      erlaeuterung: 'Miete bei Verkauf ≥ Marktmiete — keine legale Erhöhung möglich.'
    });
  }

  // 10-%-Schwelle: Phase 2 nur wenn Käufer-Miete nach P1 (= MbV + 1×Kapp) noch > 10 % unter Markt.
  // Käufer-Miete nach P1 wäre MbV + MbV × Kapp = MbV × (1+Kapp). Wenn der Abstand
  // zur Marktmiete ≤ 10 %, brauchen wir keine 2. Stufe.
  let p2Aktiv = true;
  if (marktmiete > 0) {
    const kaufermieteNachP1 = mbv * (1 + kappPct);
    const abstandPct = (marktmiete - kaufermieteNachP1) / marktmiete;
    if (abstandPct <= 0.10) p2Aktiv = false;
  }

  // X_ideal in der 2-Stufen-Variante
  // Wenn nur P1 aktiv ist, beträgt X höchstens MbV × Kapp (= 1 Stufe).
  let xFinal = xIdeal;
  if (!p2Aktiv) {
    const xEinStufe = Math.min(mbv * kappPct, xMaxMarkt);
    xFinal = xEinStufe;
  }

  // Iter 47/48: Effektivmiete bleibt für den Käufer über alle Phasen konstant.
  // Phase 1: B&B legt vollen Aufschlag (xFinal) drauf — Mieter zahlt noch MbV.
  // Phase 2: Mieter wird legal erhöht auf MbV×(1+kapp). B&B legt nur noch (xFinal − MbV×kapp)
  //          drauf — Summe für den Käufer bleibt MbV+xFinal. Beide Phasen → gleiche Mieteinnahme.
  // phasen[] zeigt die ECHTEN monatlichen Subv-Werte, die der Käufer in jeder Phase erhält.
  let p1Mo = xFinal;
  let p2Mo = p2Aktiv ? Math.max(0, xFinal - mbv * kappPct) : 0;

  let p1Eur = p1Mo * p1Monate;
  let p2Eur = p2Aktiv ? p2Mo * p2Monate : 0;
  let totalEurRaw = p1Eur + p2Eur;

  // Cap auf den echten Subv-Abfluss
  const cap = Math.max(5000, (weQm || 0) * 150);
  let capGreift = false;
  let capDetail = '';

  if (totalEurRaw > cap && cap > 0) {
    capGreift = true;
    // Cap: X so kürzen, dass X×p1 + (X−MbV×kapp)×p2 = Cap
    // → X = (Cap + p2Monate×MbV×kapp) / (p1Monate + p2Monate)
    const denom = p1Monate + (p2Aktiv ? p2Monate : 0);
    if (denom > 0) {
      const xNew = (cap + (p2Aktiv ? p2Monate * mbv * kappPct : 0)) / denom;
      xFinal = Math.max(0, xNew);
      p1Mo = xFinal;
      p2Mo = p2Aktiv ? Math.max(0, xFinal - mbv * kappPct) : 0;
      p1Eur = p1Mo * p1Monate;
      p2Eur = p2Aktiv ? p2Mo * p2Monate : 0;
      totalEurRaw = p1Eur + p2Eur;
      capDetail = `Maximal-Subvention ${Math.round(cap).toLocaleString('de-DE')} € erreicht. Monatlicher Aufschlag auf ${Math.round(xFinal)} €/Mo angepasst.`;
    }
  }

  const phasen = [];
  if (p1Monate > 0 && p1Mo > 0) {
    phasen.push({
      mo: Math.round(p1Mo * 100) / 100,
      monate: p1Monate,
      label: 'Phase 1 (bis zur 1. Mieterhöhung)'
    });
  }
  if (p2Aktiv && p2Monate > 0 && p2Mo > 0) {
    phasen.push({
      mo: Math.round(p2Mo * 100) / 100,
      monate: p2Monate,
      label: 'Phase 2 (nach 1. Mieterhöhung)'
    });
  }

  // Erläuterung an Dich (Du-Form, direkt an Endkunde).
  let erlaeuterung = '';
  const gesamtMonate = p1Monate + (p2Aktiv ? p2Monate : 0);
  const gesamtJahre = Math.round(gesamtMonate / 12 * 10) / 10;
  if (p2Aktiv && phasen.length === 2) {
    erlaeuterung = `Deine Mieteinnahme bleibt ${Math.round(mbv + xFinal)} €/Mo konstant über ${gesamtJahre} Jahre — auch wenn sich die Mietzahlung Deines Mieters durch die gesetzliche Erhöhung anpasst.`;
  } else if (phasen.length === 1) {
    erlaeuterung = `Wir stocken Deine Mieteinnahme um ${Math.round(p1Mo)} €/Mo auf, über ${p1Monate} Monate.`;
  }
  if (capDetail) erlaeuterung = capDetail + ' ' + erlaeuterung;

  // Für Backward-Compat: mo + monate als Durchschnitt aus beiden Phasen.
  const totalMo = (phasen.reduce((s, p) => s + p.monate, 0)) || 0;
  const totalEur = Math.round(totalEurRaw);
  const moDurchschnitt = totalMo > 0 ? Math.round(totalEur / totalMo * 100) / 100 : 0;

  return {
    phasen,
    totalEur,
    mo: moDurchschnitt,
    monate: totalMo,
    capEur: Math.round(cap),
    capGreift,
    quelle: capGreift ? 'auto-cap' : (p2Aktiv ? 'auto-2-phasen' : 'auto-1-phase'),
    erlaeuterung,
  };
}

// --- Iter 41.9: Markteinkauf-Hebel Schnitt aus IS+HD ---
function computeMarktpreisGemittelt(kalkApi) {
  if (!kalkApi) return { wert: 0, quelle: 'keine' };
  const is = kalkApi.marktpreisImmoscout;
  const hd = kalkApi.marktpreisHomeday;
  const hasIs = is != null && is > 0;
  const hasHd = hd != null && hd > 0;
  if (hasIs && hasHd) return { wert: Math.round((is + hd) / 2), quelle: 'schnitt' };
  if (hasIs) return { wert: is, quelle: 'nur-is' };
  if (hasHd) return { wert: hd, quelle: 'nur-hd' };
  return { wert: 0, quelle: 'keine' };
}

module.exports = async (req, res) => {
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  const weId = req.query && req.query.weId;
  if (!weId || !weId.startsWith('rec')) return res.status(400).json({ error: 'weId fehlt oder ungültig' });

  try {
    if (req.method === 'GET') {
      // --- 1) Wohneinheit-Datensatz lesen ---
      const weResp = await airtable('get', TABLES.WOHNEINHEIT, { recordId: weId });
      if (!weResp || !weResp.fields) return res.status(404).json({ error: 'WE nicht gefunden' });
      const wf = weResp.fields || {};
      const we = {
        id: weResp.id,
        weNr:      wf[WE_FIELDS.WE_NR] || '',
        lage:      (Array.isArray(wf[WE_FIELDS.LAGE_BEZ]) ? wf[WE_FIELDS.LAGE_BEZ][0] : wf[WE_FIELDS.LAGE_BEZ]) || '',
        lageText:  (Array.isArray(wf[WE_FIELDS.LAGE_TEXT]) ? wf[WE_FIELDS.LAGE_TEXT][0] : wf[WE_FIELDS.LAGE_TEXT]) || '',
        kp:        num(wf[WE_FIELDS.KAUFPREIS]),
        qm:        num(wf[WE_FIELDS.QM]),
        kaltmiete: num(wf[WE_FIELDS.KALTMIETE]),
        qmPreis:   num(wf[WE_FIELDS.QM_PREIS]),
      };

      // --- 2) Stellplätze zuerst (für Pro-rata-Mietberechnung), dann Mietvertrag + Kalk parallel ---
      // Iter 44: Stellplatz-IDs werden an loadMietvertragInfoForWE übergeben, damit
      // die Stellplatzmiete proportional zur aktuellen WE-Verknüpfung berechnet wird.
      const stellplaetze = await loadStellplaetzeForWE(weId);
      const weStpIds = stellplaetze.map(s => s.id);
      const [vertragInfo, kalkRec] = await Promise.all([
        loadMietvertragInfoForWE(weId, weStpIds),
        loadKalkStammdatenForWE(weId),
      ]);

      // Stellplatz-Aggregat: Kaufpreis-Summe + Miete
      // Iter 46: Stellplatz-Tabelle hat Vorrang vor Mietvertrag-Pauschale, sobald sie
      // gepflegt ist (mind. 1 Stellplatz mit Miete > 0). Damit kann Vivien pro Stellplatz
      // pflegen, und beim Entfernen eines Stellplatzes aus der WE sinkt die Summe
      // automatisch. Wess 5: 1 Garage à 50 € statt 100 € Vertragspauschale.
      const stpKaufpreisSumme = stellplaetze.reduce((s, x) => s + (x.kaufpreis || 0), 0);
      const stpAlteMieteSumme = stellplaetze.reduce((s, x) => s + (x.mieteMo || 0), 0);
      const stpMieteEffektiv = stpAlteMieteSumme > 0
        ? stpAlteMieteSumme
        : vertragInfo.stellplatzMietsumme;

      // --- Vermietungs-Status bestimmen (Iter 41.17, 18.05.2026) ---
      // Single Source of Truth: Lookup „Miet-status (ist)" aus WE-Tabelle, gespiegelt
      // in Kalk-Stammdaten. Edgar 18.05.: vorher leitete die App aus „Vertrag + Kaltmiete>0"
      // ab — bei leerstehenden Einheiten mit Excel-Altmiete > 0 war das falsch.
      // Reihenfolge:
      //  1) Lookup-Wert (autoritativ, wenn vorhanden)
      //  2) Heuristik „Vertrag vorhanden ODER Kaltmiete>0" (Fallback)
      const kalkApi = kalkStammRecordToApi(kalkRec);
      const statusVomLookup = resolveVermietungsstatusFromLookup(kalkApi && kalkApi.weVermietungsstatusRaw);
      let statusFinal, statusQuelle;
      if (statusVomLookup) {
        statusFinal = statusVomLookup;
        statusQuelle = 'we-lookup';
      } else {
        // Audit-Fix Iter 49 (19.05.2026): Heuristik konservativer — `we.kaltmiete > 0`
        // ist UNZUVERLÄSSIG (leerstehende WEs behalten die alte Bestandsmiete im Feld).
        // Nur ein echter Mietvertragsdatensatz gilt als Vermietungs-Beweis.
        statusFinal = vertragInfo.vertragVorhanden ? 'vermietet' : 'leer';
        statusQuelle = vertragInfo.vertragVorhanden ? 'fallback-mietvertrag' : 'fallback-keine-daten';
      }

      // Letzte Mietsteigerung:
      // - status='vermietet' → erst Kalk-Stammdaten (manuell gepflegt), sonst Mietvertrag, sonst null
      // - status='leer'      → IMMER null (alte Vertragsdaten dürfen nicht in die Steigerungs-Logik!)
      const kalkLetzte = (kalkRec && kalkRec.fields && kalkRec.fields[KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG]) || null;
      let letzteMietsteigerung, letzteMietsteigerungQuelle;
      if (statusFinal === 'leer') {
        letzteMietsteigerung = null;
        letzteMietsteigerungQuelle = 'leerstand-keine';
      } else {
        letzteMietsteigerung = kalkLetzte || vertragInfo.letzteMietsteigerung || null;
        letzteMietsteigerungQuelle = kalkLetzte ? 'kalk-stammdaten' :
          (vertragInfo.letzteMietsteigerung ? 'mietvertrag-vertragsbeginn' : 'unbekannt');
      }

      // Stellplatz-Typ-Aufteilung (Garage vs. Fläche/Stellplatz)
      const garageCount  = stellplaetze.filter(s => /garage/i.test(s.typ)).length;
      const flaecheCount = stellplaetze.length - garageCount;

      const vermietungObj = {
        status:                 statusFinal,
        statusQuelle,           // 'we-lookup' | 'fallback-...'
        vertragVorhanden:       vertragInfo.vertragVorhanden,
        letzteMietsteigerung,
        letzteMietsteigerungQuelle,
      };

      // Subvention auto + Markt-Schnitt direkt vom Backend liefern
      const subv = computeAutoSubvention(kalkApi, vermietungObj, we.qm);
      const marktSchnitt = computeMarktpreisGemittelt(kalkApi);

      return res.status(200).json({
        we,
        stellplaetze: {
          anzahl:        stellplaetze.length,
          garageCount,
          flaecheCount,
          kaufpreisSumme: stpKaufpreisSumme,
          mieteMoSumme:   stpMieteEffektiv,
          mieteMoQuelle:  vertragInfo.stellplatzMietsumme > 0 ? 'mietvertrag' : (stpAlteMieteSumme > 0 ? 'stellplatz-alt' : 'keine'),
          details:        stellplaetze,
        },
        vermietung: vermietungObj,
        kalkStammdaten: kalkApi,
        // Abgeleitete Werte:
        derived: {
          // Backward-Compat (Iter 41.9): Aggregat-Werte für alte Pfade
          subventionMo:     subv.mo,
          subventionMonate: subv.monate,
          subventionQuelle: subv.quelle,
          // Iter 41.10: 2-Phasen-Modell
          subventionPhasen:      subv.phasen || [],
          subventionTotalEur:    subv.totalEur || 0,
          subventionCapEur:      subv.capEur,
          subventionCapGreift:   subv.capGreift,
          subventionErlaeuterung: subv.erlaeuterung || '',
          marktpreisGemittelt:        marktSchnitt.wert,
          marktpreisGemitteltQuelle:  marktSchnitt.quelle,
        },
      });
    }

    if (req.method === 'PUT') {
      // Schreibrechte: nur Admin
      if (session.rolle !== 'Admin') {
        return res.status(403).json({ error: 'Nur Admins dürfen Stammdaten ändern.' });
      }
      const body = await readBody(req);
      if (!body || typeof body !== 'object') return res.status(400).json({ error: 'Body fehlt' });

      // Existierenden Datensatz finden (egal welcher Status)
      const existing = await loadKalkStammdatenForWE(weId);

      // Body → Airtable-Field-IDs (nur gesetzte Felder)
      // Iter 45 (19.05.2026): Reihenfolge gefixt — fields VOR Aktiv-Validierung, sonst ReferenceError.
      const fields = {};
      if (body.status !== undefined)                fields[KALK_STAMMDATEN_FIELDS.STATUS]               = body.status;
      if (body.hausverwaltung !== undefined)        fields[KALK_STAMMDATEN_FIELDS.HAUSVERWALTUNG]       = num(body.hausverwaltung);
      if (body.hausgeldRuecklage !== undefined)     fields[KALK_STAMMDATEN_FIELDS.HAUSGELD_RUECKLAGE]   = num(body.hausgeldRuecklage);
      if (body.mietverwaltungDefault !== undefined) fields[KALK_STAMMDATEN_FIELDS.MIETVERWALTUNG_DEF]   = num(body.mietverwaltungDefault);
      if (body.mietzuschuss !== undefined)          fields[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS]         = num(body.mietzuschuss);
      if (body.mietzuschussMonate !== undefined)    fields[KALK_STAMMDATEN_FIELDS.MIETZUSCHUSS_MONATE]  = num(body.mietzuschussMonate);
      if (body.afaGutachten !== undefined)          fields[KALK_STAMMDATEN_FIELDS.AFA_GUTACHTEN]        = num(body.afaGutachten);
      if (body.wertsteigerung !== undefined)        fields[KALK_STAMMDATEN_FIELDS.WERTSTEIGERUNG]       = num(body.wertsteigerung);
      if (body.vermietungsModus !== undefined)      fields[KALK_STAMMDATEN_FIELDS.VERMIETUNGS_MODUS]    = body.vermietungsModus;
      if (body.kappungsgrenze !== undefined)        fields[KALK_STAMMDATEN_FIELDS.KAPPUNGSGRENZE]       = body.kappungsgrenze;
      if (body.indexmiete !== undefined)            fields[KALK_STAMMDATEN_FIELDS.INDEXMIETE]           = num(body.indexmiete);
      if (body.letzteMietsteigerung !== undefined)  fields[KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG] = body.letzteMietsteigerung || null;
      if (body.grEst !== undefined)                 fields[KALK_STAMMDATEN_FIELDS.GRESt]                = num(body.grEst);
      if (body.gebaeudeAnteil !== undefined)        fields[KALK_STAMMDATEN_FIELDS.GEBAEUDE_ANTEIL]      = num(body.gebaeudeAnteil);
      if (body.hgInflation !== undefined)           fields[KALK_STAMMDATEN_FIELDS.HG_INFLATION]         = num(body.hgInflation);
      if (body.notizen !== undefined)               fields[KALK_STAMMDATEN_FIELDS.NOTIZEN]              = body.notizen || '';
      // Iter 41.9 — neue Felder
      if (body.mieteBeiVerkauf !== undefined)       fields[KALK_STAMMDATEN_FIELDS.MIETE_BEI_VERKAUF]    = num(body.mieteBeiVerkauf);
      if (body.marktpreisImmoscout !== undefined)   fields[KALK_STAMMDATEN_FIELDS.MARKTPREIS_IS]        = num(body.marktpreisImmoscout);
      if (body.marktpreisHomeday !== undefined)     fields[KALK_STAMMDATEN_FIELDS.MARKTPREIS_HD]        = num(body.marktpreisHomeday);
      // Iter 41.10
      if (body.marktmiete !== undefined)            fields[KALK_STAMMDATEN_FIELDS.MARKTMIETE]           = num(body.marktmiete);

      // Iter 41.16 (Audit-Fix #14): Pflichtfeld-Validierung beim Aktiv-Setzen.
      // Eine WE darf nur dann auf Status=Aktiv gesetzt werden, wenn die für den
      // Vertriebs-Pitch zwingend benötigten Felder gepflegt sind.
      if (body.status === KALK_STATUS_AKTIV) {
        const merged = Object.assign({}, existing ? (existing.fields || {}) : {}, fields);
        const missing = [];
        const mbv = num(merged[KALK_STAMMDATEN_FIELDS.MIETE_BEI_VERKAUF]);
        const marktmiete = num(merged[KALK_STAMMDATEN_FIELDS.MARKTMIETE]);
        const marktIs = num(merged[KALK_STAMMDATEN_FIELDS.MARKTPREIS_IS]);
        const marktHd = num(merged[KALK_STAMMDATEN_FIELDS.MARKTPREIS_HD]);
        const vermObj = merged[KALK_STAMMDATEN_FIELDS.VERMIETUNGS_MODUS];
        const vermietungsModusName = vermObj && typeof vermObj === 'object' ? vermObj.name : vermObj;
        const letzteMietsteig = merged[KALK_STAMMDATEN_FIELDS.LETZTE_MIETSTEIGERUNG];

        if (!mbv || mbv <= 0) missing.push('Miete bei Verkauf');
        if (!marktmiete || marktmiete <= 0) missing.push('Marktmiete');
        if ((!marktIs || marktIs <= 0) && (!marktHd || marktHd <= 0))
          missing.push('Marktpreis (ImmoScout oder Homeday — mindestens einer)');
        if (!vermietungsModusName) missing.push('Vermietungs-Modus');
        if (vermietungsModusName === 'Bestand' && !letzteMietsteig)
          missing.push('Letzte Mietsteigerung (Pflicht bei Modus Bestand)');

        if (missing.length > 0) {
          return res.status(400).json({
            error: 'Pflichtfelder fehlen — die WE darf nicht auf Aktiv gesetzt werden',
            missingFields: missing,
            hint: 'Bitte fehlende Felder in Airtable pflegen und erneut speichern.',
          });
        }
      }

      // Quelle automatisch setzen: "App-Edit {VertrieblerName} {YYYY-MM-DD}"
      const datum = new Date().toISOString().slice(0, 10);
      fields[KALK_STAMMDATEN_FIELDS.QUELLE] = `App-Edit ${session.email || 'unbekannt'} ${datum}`;

      let updatedRec;
      if (existing) {
        if (body.status === KALK_STATUS_AKTIV) {
          await archiveOtherAktivForWE(weId, existing.id);
        }
        updatedRec = await airtable('update', TABLES.KALK_STAMMDATEN, { recordId: existing.id, fields });
      } else {
        // Neu anlegen — wenn keiner existiert
        if (body.status === KALK_STATUS_AKTIV) {
          await archiveOtherAktivForWE(weId, null);
        }
        const createFields = Object.assign({}, fields, {
          [KALK_STAMMDATEN_FIELDS.BEZEICHNUNG]: body.bezeichnung || `WE ${weId.slice(-6)}`,
          [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]: [weId],
        });
        updatedRec = await airtable('create', TABLES.KALK_STAMMDATEN, { fields: createFields });
      }
      return res.status(200).json({ ok: true, kalkStammdaten: kalkStammRecordToApi(updatedRec) });
    }

    return methodNotAllowed(res, ['GET', 'PUT']);
  } catch (e) {
    return sendError(res, e);
  }
};

// Archiviert alle Aktiv-Datensätze für eine WE außer dem aktuellen.
async function archiveOtherAktivForWE(weId, exceptId) {
  try {
    const recs = await listAll(TABLES.KALK_STAMMDATEN, {
      fields: [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT, KALK_STAMMDATEN_FIELDS.STATUS],
    }, 1000);
    const others = recs.filter(r => {
      if (r.id === exceptId) return false;
      const s = r.fields && r.fields[KALK_STAMMDATEN_FIELDS.STATUS];
      const name = s && typeof s === 'object' ? s.name : s || '';
      if (name !== KALK_STATUS_AKTIV) return false;
      const link = (r.fields && r.fields[KALK_STAMMDATEN_FIELDS.WOHNEINHEIT]) || [];
      return Array.isArray(link) && link.some(x => {
        const id = (x && typeof x === 'object' && x.id) ? x.id : x;
        return id === weId;
      });
    });
    for (const r of others) {
      await airtable('update', TABLES.KALK_STAMMDATEN, {
        recordId: r.id,
        fields: { [KALK_STAMMDATEN_FIELDS.STATUS]: KALK_STATUS_ARCHIV },
      });
    }
  } catch (e) {
    console.error('archiveOtherAktivForWE failed:', e.message);
  }
}
