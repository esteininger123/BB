// Varianten-Modell für Wohneinheiten (07.09.2026, Henry).
//
// PROBLEM: Möblierte Wohnungen (Spechtweg 205/219) waren als ZWEITER Wohneinheit-Record
// in Airtable angelegt. Damit zählt dieselbe Wohnung doppelt — WE-Anzahl pro Objekt,
// Kaufpreis-Summen, Vermarktungsstand, Margen-/Provisionsauswertungen: alles verfälscht.
//
// LÖSUNG: Eine Variante ist ein zusätzlicher Kalkulations-Stammdatensatz mit
// Status = 'Variante', der auf die BESTEHENDE Wohneinheit verlinkt. In Airtable
// bleibt es eine Wohnung; nur die Backstube zeigt daraus eine zweite Angebots-Karte
// ("Add-on"). Die Karte trägt die zusammengesetzte ID
//
//     <weRecId>~<stammRecId>      z.B. recOVuIsot18BpO75~rec4h53kvjaD9SCMx
//
// die durch die App läuft wie eine normale WE-ID. JEDER Airtable-Zugriff muss vorher
// durch parseWeId()/baseWeId() — Links und Record-Gets vertragen nur die echte WE-ID.
//
// Preis der Variante = (Variante-Basis-KP || KP der WE) + Ausstattungspaket.

const { airtable, listAll } = require('./airtable');
const {
  TABLES,
  WE_FIELDS,
  KALK_STAMMDATEN_FIELDS,
  KALK_STATUS_VARIANTE,
} = require('./tables');

const SEP = '~';
const REC_RE = /^rec[A-Za-z0-9]{14}$/;

// "recAAA~recBBB" → { weId:'recAAA', variantId:'recBBB' }
// "recAAA"        → { weId:'recAAA', variantId:null }
// Unsinn          → { weId:null,     variantId:null }
function parseWeId(raw) {
  const s = String(raw == null ? '' : raw).trim();
  const parts = s.split(SEP);
  const weId = REC_RE.test(parts[0]) ? parts[0] : null;
  const variantId = (parts.length > 1 && REC_RE.test(parts[1])) ? parts[1] : null;
  return { weId, variantId, raw: s };
}

function composeWeId(weId, variantId) {
  return variantId ? `${weId}${SEP}${variantId}` : weId;
}

// Die echte Airtable-WE-ID — für Record-Gets, Link-Felder und Link-Filter.
function baseWeId(raw) {
  return parseWeId(raw).weId;
}

function isVarianteId(raw) {
  return !!parseWeId(raw).variantId;
}

function num(v) {
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
}

function linkIdsOf(v) {
  if (!Array.isArray(v)) return [];
  return v.map(x => (x && typeof x === 'object' && x.id) ? x.id : x).filter(Boolean);
}

function statusNameOf(rec) {
  const s = rec && rec.fields && rec.fields[KALK_STAMMDATEN_FIELDS.STATUS];
  return (s && typeof s === 'object') ? s.name : (s || '');
}

// Varianten-Infos aus einem Stammdaten-Record. null, wenn es kein Varianten-Satz ist.
function varianteInfo(stammRec) {
  if (!stammRec || statusNameOf(stammRec) !== KALK_STATUS_VARIANTE) return null;
  const f = stammRec.fields || {};
  return {
    stammId: stammRec.id,
    weId: linkIdsOf(f[KALK_STAMMDATEN_FIELDS.WOHNEINHEIT])[0] || null,
    label: (f[KALK_STAMMDATEN_FIELDS.VARIANTE_LABEL] || 'Variante').trim(),
    basisKp: num(f[KALK_STAMMDATEN_FIELDS.VARIANTE_BASIS_KP]),
    paket: num(f[KALK_STAMMDATEN_FIELDS.VARIANTE_PAKET]),
    expose: f[KALK_STAMMDATEN_FIELDS.VARIANTE_EXPOSE] || '',
  };
}

// Effektiver Wohnungs-Kaufpreis der Variante (inkl. Ausstattungspaket).
function variantenKp(weFields, info) {
  const basis = info && info.basisKp > 0 ? info.basisKp : num((weFields || {})[WE_FIELDS.KAUFPREIS]);
  return basis + (info ? info.paket : 0);
}

// Legt eine Variante über die Felder der echten WE: Preis, Bezeichnung, Exposé.
// Liefert ein NEUES fields-Objekt (der Original-Record bleibt unangetastet).
function applyVariante(weFields, info) {
  const f = Object.assign({}, weFields || {});
  if (!info) return f;
  const suffix = ` (${info.label})`;
  const kp = variantenKp(weFields, info);
  f[WE_FIELDS.KAUFPREIS] = kp;
  const qm = num(f[WE_FIELDS.QM]);
  if (qm > 0) f[WE_FIELDS.QM_PREIS] = Math.round((kp / qm) * 100) / 100;
  const lage = f[WE_FIELDS.LAGE_BEZ];
  const lageStr = Array.isArray(lage) ? lage[0] : lage;
  if (lageStr) {
    // "WE: 205, EG, Spechtweg 35, …" → "WE: 205 (möbliert), EG, Spechtweg 35, …"
    const s = String(lageStr);
    f[WE_FIELDS.LAGE_BEZ] = /^WE:\s*[^,]+/.test(s)
      ? s.replace(/^(WE:\s*[^,]+)/, `$1${suffix}`)
      : `${s}${suffix}`;
  }
  if (f[WE_FIELDS.WE_NR]) f[WE_FIELDS.WE_NR] = `${f[WE_FIELDS.WE_NR]}${suffix}`;
  if (info.expose) f[WE_FIELDS.OBJEKTVORSTELLUNG] = info.expose;
  return f;
}

// Alle Varianten-Stammdatensätze (Status = 'Variante').
async function listVariantenStamm(fields) {
  const recs = await listAll(TABLES.KALK_STAMMDATEN, {
    filterByFormula: `{${KALK_STAMMDATEN_FIELDS.STATUS}}='${KALK_STATUS_VARIANTE}'`,
    fields: fields || Object.values(KALK_STAMMDATEN_FIELDS),
    pageSize: 100,
  }, 1000);
  return recs;
}

// Einen Varianten-Stammsatz laden und gegen die WE prüfen.
// Liefert null, wenn er nicht existiert, kein Varianten-Satz ist oder zu einer
// anderen WE gehört (Schutz gegen manipulierte IDs aus dem Client).
async function loadVariante(weId, variantId) {
  if (!variantId) return null;
  try {
    const rec = await airtable('get', TABLES.KALK_STAMMDATEN, { recordId: variantId });
    const info = varianteInfo(rec);
    if (!info) return null;
    if (weId && info.weId && info.weId !== weId) return null;
    return { rec, info };
  } catch (e) {
    return null;
  }
}

module.exports = {
  SEP,
  parseWeId,
  composeWeId,
  baseWeId,
  isVarianteId,
  varianteInfo,
  variantenKp,
  applyVariante,
  listVariantenStamm,
  loadVariante,
};
