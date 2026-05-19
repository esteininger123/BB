// Field-Mappings: Airtable-Record → API-Object und API-Body → Airtable-Fields.

const { KUNDEN_FIELDS, SNAPSHOT_FIELDS, VERTRIEBLER_FIELDS, WE_FIELDS } = require('./tables');

// --- Kunden ---

function kundeRecordToBasic(rec, ownerNameById = {}) {
  const f = rec.fields || {};
  const ownerIds = f[KUNDEN_FIELDS.OWNER] || [];
  const ownerId = Array.isArray(ownerIds) ? ownerIds[0] : null;
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
    // Iter 52: archiviert-Flag durchreichen (für Vertrieb-Filter und Admin-Ansicht)
    archiviert: !!f[KUNDEN_FIELDS.ARCHIVIERT]
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
