// Field-Mappings: Airtable-Record → API-Object und API-Body → Airtable-Fields.

const { KUNDEN_FIELDS, SNAPSHOT_FIELDS, VERTRIEBLER_FIELDS, WE_FIELDS } = require('./tables');

// --- Kunden ---

function kundeRecordToBasic(rec, ownerNameById = {}, snapshotsByKunde = {}) {
  const f = rec.fields || {};
  const ownerIds = f[KUNDEN_FIELDS.OWNER] || [];
  const ownerId = Array.isArray(ownerIds) ? ownerIds[0] : null;
  // Beratene WE (Team-Feedback 2026-06-01): {recId, bez} pro Snapshot, dedupliziert.
  // recId erlaubt dem Frontend, die aktuelle WE-Nummer aufzulösen (statt der Lage).
  const _berateneWE = (() => {
    const arr = snapshotsByKunde[rec.id] || [];
    const seen = {}; const out = [];
    arr.forEach(o => {
      const recId = (o && o.recId) || '';
      const bez = String((o && o.bez) || '').trim();
      const key = recId || bez;
      if (!key || seen[key]) return;
      seen[key] = 1; out.push({ recId, bez });
    });
    return out;
  })();
  return {
    id: rec.id,
    name:     f[KUNDEN_FIELDS.NAME]     || '',
    vorname:  f[KUNDEN_FIELDS.VORNAME]  || '',
    nachname: f[KUNDEN_FIELDS.NACHNAME] || '',
    email:    f[KUNDEN_FIELDS.EMAIL]    || '',
    telefon:  f[KUNDEN_FIELDS.TELEFON]  || '',
    phase:    f[KUNDEN_FIELDS.PHASE]    || '',
    ownerId:   ownerId || null,
    ownerName: ownerId ? (ownerNameById[ownerId] || '') : '',
    lastActivity: f[KUNDEN_FIELDS.LAST_ACTIVITY] || null,
    // QA-Fix 2026-05-23 (Edgar live Aylin): notizen IM LIST-Endpoint mitliefern,
    // damit das Dashboard den KAV-Tracker parsen kann. Vorher fehlte das Feld
    // → kavListeBadges sah immer leere tasks → ALLE Kunden auf P1 0/5,
    // egal was Edgar in der Detail-Ansicht abgehakt hat.
    notizen:  f[KUNDEN_FIELDS.NOTIZEN]  || '',
    // Bug-Fix 2026-05-24 (Edgar): saJson auch in Basic-List durchreichen, damit
    // die Kundenliste „EK FREI / EINKOMMEN FREI/MO" aus computeBonitaetDetailed
    // rechnen kann. Größe akzeptabel bei <100 Kunden pro Vertriebler.
    saJson:   parseJsonField(f[KUNDEN_FIELDS.SA_JSON]),
    // Iter 52: archiviert-Flag durchreichen (für Vertrieb-Filter und Admin-Ansicht)
    archiviert: !!f[KUNDEN_FIELDS.ARCHIVIERT],
    // Team-Feedback 2026-06-01: beratene WE (aus Snapshots) für die Kundenliste
    berateneWE: _berateneWE
  };
}

function kundeRecordToFull(rec, ownerNameById = {}) {
  const basic = kundeRecordToBasic(rec, ownerNameById);
  const f = rec.fields || {};
  return {
    ...basic,
    geburtsdatum:  f[KUNDEN_FIELDS.GEBURTSDATUM]   || null,
    notizen:       f[KUNDEN_FIELDS.NOTIZEN]        || '',
    quickBonJson:  parseJsonField(f[KUNDEN_FIELDS.QUICK_BON_JSON]),
    saJson:        parseJsonField(f[KUNDEN_FIELDS.SA_JSON]),
    // Persönlicher Steuersatz (Dezimal, z.B. 0.42) — null wenn nie gesetzt (Altbestand).
    steuersatz:    (typeof f[KUNDEN_FIELDS.STEUERSATZ] === 'number') ? f[KUNDEN_FIELDS.STEUERSATZ] : null,
    created:       f[KUNDEN_FIELDS.CREATED]        || null
  };
}

// Body-Body-Fields → Airtable-Field-ID-Map. Nur gesetzte Werte werden geschrieben.
function kundeBodyToFields(body, opts = {}) {
  const out = {};
  if (body.vorname  !== undefined) out[KUNDEN_FIELDS.VORNAME]  = body.vorname || '';
  if (body.nachname !== undefined) out[KUNDEN_FIELDS.NACHNAME] = body.nachname || '';
  if (body.email    !== undefined) out[KUNDEN_FIELDS.EMAIL]    = body.email    || '';
  if (body.telefon  !== undefined) out[KUNDEN_FIELDS.TELEFON]  = body.telefon  || '';
  if (body.geburtsdatum !== undefined) out[KUNDEN_FIELDS.GEBURTSDATUM] = body.geburtsdatum || null;
  if (body.phase    !== undefined) out[KUNDEN_FIELDS.PHASE]    = body.phase    || 'Lead';
  if (body.notizen  !== undefined) out[KUNDEN_FIELDS.NOTIZEN]  = body.notizen  || '';
  if (body.quickBonJson !== undefined) out[KUNDEN_FIELDS.QUICK_BON_JSON] = stringifyJson(body.quickBonJson);
  if (body.saJson       !== undefined) out[KUNDEN_FIELDS.SA_JSON]       = stringifyJson(body.saJson);
  if (body.archiviert   !== undefined) out[KUNDEN_FIELDS.ARCHIVIERT]    = !!body.archiviert;
  if (body.steuersatz   !== undefined) {
    const st = Number(body.steuersatz);
    out[KUNDEN_FIELDS.STEUERSATZ] = (isFinite(st) && st > 0) ? st : null;
  }

  // Name = "Vorname Nachname" (Primary)
  if (body.vorname !== undefined || body.nachname !== undefined) {
    const vn = (body.vorname  || '').trim();
    const nn = (body.nachname || '').trim();
    const combined = [vn, nn].filter(Boolean).join(' ').trim();
    if (combined) out[KUNDEN_FIELDS.NAME] = combined;
  }

  if (opts.ownerId) {
    out[KUNDEN_FIELDS.OWNER] = [opts.ownerId];
  }
  if (opts.touchLastActivity) {
    out[KUNDEN_FIELDS.LAST_ACTIVITY] = new Date().toISOString();
  }

  return out;
}

// --- Snapshots ---

function snapshotRecordToApi(rec) {
  const f = rec.fields || {};
  const kundeIds = f[SNAPSHOT_FIELDS.KUNDE] || [];
  const ersteltVonIds = f[SNAPSHOT_FIELDS.ERSTELLT_VON] || [];
  // Linked-Records kommen je nach Airtable-Variante als String-Array ['rec...'] oder
  // als Object-Array [{id, name}]. Hier auf reine IDs reduzieren.
  const flattenLinks = (v) => {
    if (!Array.isArray(v)) return [];
    return v.map(x => (x && typeof x === 'object' && x.id) ? x.id : x).filter(Boolean);
  };
  const kundeArr = flattenLinks(kundeIds);
  const erstellerArr = flattenLinks(ersteltVonIds);
  return {
    id: rec.id,
    bezeichnung:   f[SNAPSHOT_FIELDS.BEZEICHNUNG] || '',
    kundeId:       kundeArr[0] || null,
    weBezeichnung: f[SNAPSHOT_FIELDS.WE_BEZ]      || '',
    weRecordId:    f[SNAPSHOT_FIELDS.WE_RECID]    || '',
    erstelltVon:   erstellerArr[0] || null,
    pdfTyp:        f[SNAPSHOT_FIELDS.PDF_TYP]     || '',
    kalkJson:      parseJsonField(f[SNAPSHOT_FIELDS.KALK_JSON]),
    created:       f[SNAPSHOT_FIELDS.CREATED] || rec.createdTime || null
  };
}

function snapshotBodyToFields(body, opts = {}) {
  const out = {};
  if (body.bezeichnung   !== undefined) out[SNAPSHOT_FIELDS.BEZEICHNUNG] = body.bezeichnung || '';
  if (body.kundeId       !== undefined) out[SNAPSHOT_FIELDS.KUNDE]       = body.kundeId ? [body.kundeId] : [];
  if (body.weBezeichnung !== undefined) out[SNAPSHOT_FIELDS.WE_BEZ]      = body.weBezeichnung || '';
  if (body.weId          !== undefined) out[SNAPSHOT_FIELDS.WE_RECID]    = body.weId || '';
  if (body.pdfTyp        !== undefined) out[SNAPSHOT_FIELDS.PDF_TYP]     = body.pdfTyp || 'Investitionsrechnung';
  if (body.kalkJson      !== undefined) out[SNAPSHOT_FIELDS.KALK_JSON]   = stringifyJson(body.kalkJson);
  if (opts.erstelltVon) out[SNAPSHOT_FIELDS.ERSTELLT_VON] = [opts.erstelltVon];

  // --- Klartext-Basis-Werte aus kalkJson (28.05.2026) ---
  // Backoffice sieht in der Grid-Ansicht ohne JSON-Parse, auf welcher Basis gerechnet wurde.
  const num = (v) => (v == null || v === '' || isNaN(Number(v))) ? null : Number(v);
  const setIf = (field, val) => { if (val != null) out[field] = val; };

  const k = (body.kalkJson && typeof body.kalkJson === 'object') ? body.kalkJson : null;
  if (k) {
    setIf(SNAPSHOT_FIELDS.KAUFPREIS, num(k.kaufpreis));
    setIf(SNAPSHOT_FIELDS.WOHNFLAECHE, num(k.qm));
    const kp = num(k.kaufpreis), qmv = num(k.qm);
    setIf(SNAPSHOT_FIELDS.KAUFPREIS_QM, (kp != null && qmv) ? Math.round(kp / qmv) : null);
    setIf(SNAPSHOT_FIELDS.KALTMIETE, num(k.kaltmiete));
    setIf(SNAPSHOT_FIELDS.MIETVERWALTUNG, num(k.mietverwaltung));
    setIf(SNAPSHOT_FIELDS.ZINS, num(k.zins));
    setIf(SNAPSHOT_FIELDS.TILGUNG, num(k.tilgung));
    setIf(SNAPSHOT_FIELDS.STEUERSATZ, num(k.steuersatz));
    setIf(SNAPSHOT_FIELDS.AFA_SATZ, num(k.afaSatz));
    setIf(SNAPSHOT_FIELDS.WERTSTEIGERUNG, num(k.wertsteigerung));
    setIf(SNAPSHOT_FIELDS.MARKTWERT_QM, num(k.marktwertProQm));
    out[SNAPSHOT_FIELDS.KNK_MITFINANZIERT] = !!k.knkMitfinanziert;
    const vmod = k.vermietungsModus || k._vermietungsModus || '';
    if (vmod) out[SNAPSHOT_FIELDS.VERMIETUNGSMODUS] = String(vmod);

    // Subvention-Details
    setIf(SNAPSHOT_FIELDS.SUBV_MO, num(k.subventionMo));
    setIf(SNAPSHOT_FIELDS.SUBV_MONATE, num(k.subventionMonate));
    setIf(SNAPSHOT_FIELDS.SUBV_GESAMT, num(k._subventionTotalEur));
    if (Array.isArray(k.subventionPhasen) && k.subventionPhasen.length) {
      const phasenTxt = k.subventionPhasen.map((p, idx) => {
        const mo = num(p.mo), monate = num(p.monate);
        const label = p.label || ('Phase ' + (idx + 1));
        return `${label}: ${mo != null ? Math.round(mo) : '?'} €/Mo × ${monate != null ? monate : '?'} Mo`;
      }).join('\n');
      if (phasenTxt) out[SNAPSHOT_FIELDS.SUBV_PHASEN] = phasenTxt;
    }
    if (k._subventionErlaeuterung) out[SNAPSHOT_FIELDS.SUBV_ERLAEUTERUNG] = String(k._subventionErlaeuterung);
  }

  // --- Kern-Ergebnisse aus kalkErgebnis (Frontend sendet sie mit; Altbestand bleibt leer) ---
  const e = (body.kalkErgebnis && typeof body.kalkErgebnis === 'object') ? body.kalkErgebnis : null;
  if (e) {
    setIf(SNAPSHOT_FIELDS.EK_BEDARF, num(e.ekBedarf));
    const cf = num(e.cfJ1Mo);
    setIf(SNAPSHOT_FIELDS.CASHFLOW_J1_MO, cf != null ? Math.round(cf) : null);
    setIf(SNAPSHOT_FIELDS.VERMOEGEN_NETTO_10, num(e.vermoegenNetto10));
    setIf(SNAPSHOT_FIELDS.IRR, num(e.irr));
    setIf(SNAPSHOT_FIELDS.BRUTTORENDITE, num(e.bruttorendite));
  }

  return out;
}

// --- Wohneinheiten ---

function weRecordToApi(rec, projektNameById = {}) {
  const f = rec.fields || {};
  const projektLinks = f[WE_FIELDS.PROJEKT] || [];
  // Linked-Records kommen als String-Array ODER als [{id, name}]-Array zurück.
  // Auf reine Record-ID reduzieren.
  const flattenLinks = (v) => {
    if (!Array.isArray(v)) return [];
    return v.map(x => (x && typeof x === 'object' && x.id) ? x.id : x).filter(Boolean);
  };
  const projektIdsArr = flattenLinks(projektLinks);
  const projektId = projektIdsArr[0] || null;
  return {
    id: rec.id,
    lage:       firstOrValue(f[WE_FIELDS.LAGE_BEZ])  || '',
    weNr:       f[WE_FIELDS.WE_NR]                   || '',
    lageText:   firstOrValue(f[WE_FIELDS.LAGE_TEXT]) || '',
    kp:         toNumber(f[WE_FIELDS.KAUFPREIS]),
    qm:         toNumber(f[WE_FIELDS.QM]),
    kaltmiete:  toNumber(f[WE_FIELDS.KALTMIETE]),
    qmPreis:    toNumber(f[WE_FIELDS.QM_PREIS]),
    // Iter 51: Link zur Objektvorstellung (Domi pflegt). Wenn leer → kein Anzeige.
    objektvorstellungLink: f[WE_FIELDS.OBJEKTVORSTELLUNG] || '',
    projektId,
    projektName: projektId ? (projektNameById[projektId] || '') : ''
  };
}

// --- Hilfsmittel ---

function parseJsonField(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); }
  catch { return v; }
}

function stringifyJson(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch { return ''; }
}

function toNumber(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function firstOrValue(v) {
  if (Array.isArray(v)) return v[0];
  return v;
}

module.exports = {
  kundeRecordToBasic,
  kundeRecordToFull,
  kundeBodyToFields,
  snapshotRecordToApi,
  snapshotBodyToFields,
  weRecordToApi,
  parseJsonField,
  stringifyJson
};
