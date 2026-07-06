// Externer Vertrieb — Provisions-Preislogik (06.07.2026, Henry).
//
// Externe Vertriebler (Rolle 'Extern') sehen in der App NIE den internen Abgabepreis,
// sondern immer den Kundenpreis nach ihrem selbst gewählten Provisionssatz (0–7 %).
// Die Transformation passiert SERVERSEITIG in allen drei Preis-Endpoints
// (/api/wohneinheiten, /api/stammdaten, /api/stammdaten/[weId]) — damit sind alle
// Frontend-Stellen (Picker, WE-Liste, Kalkulator, PDF, Snapshots) automatisch konsistent.
//
// Formel (Henry, 06.07.2026):
//   Basis      = Wohnungs-KP + Stellplatz/Garagen-KP   ← Provision rechnet auf den GESAMT-Abgabepreis
//   Aufschlag  = Satz × Basis                          ← landet aber NUR auf dem Wohnungspreis,
//                                                        Stellplätze/Garagen sind marktüblich eingepreist
//   Kundenpreis Wohnung = Wohnungs-KP + Aufschlag
//   Beispiel: Wohnung 100.000 + Stellplatz 10.000, 7 % → 7 % von 110.000 = 7.700
//             → Wohnung 107.700, Stellplatz bleibt 10.000.
// (Der frühere 1-%-Verhandlungsspielraum wurde am 06.07.2026 auf Henrys Wunsch
//  komplett entfernt — „verwirrt nur".)

const { airtable, listAll } = require('./airtable');
const { TABLES, VERTRIEBLER_FIELDS, STELLPLATZ_FIELDS, MIETVERTRAG_FIELDS } = require('./tables');
const { isExtern } = require('./auth');
const { linkIds, dedupe } = require('./stellplatz');

const PROVISION_MAX = 0.07;   // 7 % — Obergrenze, hart serverseitig

// Normalisiert einen Provisionssatz: Dezimalwert 0…0.07, auf 4 Nachkommastellen
// (= 0,01-%-Punkte) gerundet. Ungültiges → 0 (= Abgabepreis, sicherster Fall).
function clampProvision(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  if (!isFinite(n) || n <= 0) return 0;
  return Math.min(Math.round(n * 10000) / 10000, PROVISION_MAX);
}

// Rechnet den Extern-Kundenpreis für eine WE. Reine Funktion, keine IO.
function externPreis(kpWohnung, stellplatzKp, provisionPct) {
  const kp   = (typeof kpWohnung === 'number' && isFinite(kpWohnung)) ? kpWohnung : 0;
  const stpl = (typeof stellplatzKp === 'number' && isFinite(stellplatzKp)) ? stellplatzKp : 0;
  const prov = clampProvision(provisionPct);
  const basis = kp + stpl;
  const aufschlag = Math.round(prov * basis);      // = Brutto-Provision des Externen in €
  return {
    provisionPct: prov,
    aufschlag,
    kp: kp + aufschlag,                            // Kundenpreis NUR Wohnung
  };
}

// Lädt den gespeicherten Provisionssatz des eingeloggten Externen aus Airtable.
// Nicht-Externe / Fehler → 0 (= Abgabepreis; den kennt der Externe ohnehin als 0-%-Preis).
async function loadProvisionPct(session) {
  if (!isExtern(session)) return 0;
  try {
    const rec = await airtable('get', TABLES.VERTRIEBLER, { recordId: session.vertrieblerId });
    return clampProvision(rec && rec.fields && rec.fields[VERTRIEBLER_FIELDS.PROVISION_EXTERN]);
  } catch (e) {
    return 0;
  }
}

// Stellplatz/Garagen-KP-Summe pro WE für die LISTE (/api/wohneinheiten), die selbst
// keine Stellplatz-Daten lädt. Gleiche Verknüpfungslogik wie stammdaten/index.js:
// Vereinigung aus NEU-Feld der nicht-archivierten Mietverträge + alter WE-Verknüpfung,
// dedupe gegen Doppelzählung. Kaufpreis zählt IMMER (auch Leerstand, Edgar 28.06.2026).
async function ladeStellplatzKpSummen() {
  const [stplRecs, vertragRecs] = await Promise.all([
    listAll(TABLES.STELLPLATZ, {
      fields: [STELLPLATZ_FIELDS.WE_LINK, STELLPLATZ_FIELDS.KAUFPREIS],
    }, 5000),
    listAll(TABLES.MIETVERTRAG, {
      fields: [MIETVERTRAG_FIELDS.WE_LINK, MIETVERTRAG_FIELDS.NEU_VERMIETETER_STELLPLATZ, MIETVERTRAG_FIELDS.STATUS_LOOKUP],
    }, 5000),
  ]);

  const kpById = {};
  const altByWe = {};
  stplRecs.forEach(r => {
    const f = r.fields || {};
    const kp = parseFloat(f[STELLPLATZ_FIELDS.KAUFPREIS]);
    kpById[r.id] = isFinite(kp) ? kp : 0;
    linkIds(f[STELLPLATZ_FIELDS.WE_LINK]).forEach(weId => {
      (altByWe[weId] = altByWe[weId] || []).push(r.id);
    });
  });

  const neuByWe = {};
  vertragRecs.forEach(r => {
    const f = r.fields || {};
    const sl = f[MIETVERTRAG_FIELDS.STATUS_LOOKUP];
    const slName = Array.isArray(sl) ? ((sl[0] && sl[0].name) || sl[0]) : ((sl && sl.name) || sl);
    if (typeof slName === 'string' && /archiv/i.test(slName)) return;
    const stpIds = linkIds(f[MIETVERTRAG_FIELDS.NEU_VERMIETETER_STELLPLATZ]);
    if (!stpIds.length) return;
    linkIds(f[MIETVERTRAG_FIELDS.WE_LINK]).forEach(weId => {
      (neuByWe[weId] = neuByWe[weId] || []).push(...stpIds);
    });
  });

  const summen = {};
  new Set(Object.keys(altByWe).concat(Object.keys(neuByWe))).forEach(weId => {
    const ids = dedupe((neuByWe[weId] || []).concat(altByWe[weId] || []));
    // Orphan-IDs ohne Stellplatz-Datensatz zählen 0 — identisch zu aggregateStellplaetze.
    summen[weId] = ids.reduce((s, id) => s + (kpById[id] || 0), 0);
  });
  return summen;
}

module.exports = { PROVISION_MAX, clampProvision, externPreis, loadProvisionPct, ladeStellplatzKpSummen };
