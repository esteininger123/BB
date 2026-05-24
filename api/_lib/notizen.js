// notizen.js — gemeinsame Helper für Backend-seitige Notizen-Mutationen.
//
// Hintergrund (FS-1 Tech-Architekt-Audit BLOCKER B-2/B-3 vom 24.05.2026):
// Mehrere Backend-Endpoints schreiben in das gleiche Kunden-Notizen-Field
// (PandaDoc-Webhook, SA-Portal-PUT, SA-Send-for-Signature, Reservierung-Send,
// API-/api/kunden/PUT). Jeder hatte seine eigene Insert-Logik. Race-Conditions
// und Block-Marker-Bugs waren die Folge.
//
// Diese Lib bietet einen einzigen Append-Helper, der:
//  - Re-Read vor dem Write macht (verkürzt Race-Fenster)
//  - Beide Block-Marker erkennt ([KAV-TRACKER] + [WUNSCH-PROFIL])
//  - Neue Zeile vor dem ERSTEN Block einfügt (Blocks bleiben am Ende)
//  - 100-Zeilen-Cutoff macht (älteste Einträge vorne abschneiden, Blocks bleiben)
//  - Idempotenz-Check bei optionalem Pattern-Match (vermeidet Duplikate)
//
// Nicht thread-safe gegen NebenLäufer in derselben Lambda-Instanz — Vercel-
// Serverless ist per Request 1 Instanz, das reicht. Echte Multi-Instanz-Race
// (zwei parallele Lambdas auf gleichen Kunden) bleibt theoretisch möglich,
// ist aber durch Re-Read auf ~50ms-Fenster reduziert. Bei Bedarf wäre ein
// Optimistic-Concurrency-Token-Pattern (Airtable hat noch kein If-Match)
// die nächste Stufe.

const { airtable } = require('./airtable');
const { TABLES, KUNDEN_FIELDS } = require('./tables');

const KAV_START = '[KAV-TRACKER]';
const WUNSCH_START = '[WUNSCH-PROFIL]';

const MAX_ZEILEN = 100;

/**
 * Hängt eine Aktivitäts-Zeile vor den ersten Block-Marker ein.
 *
 * @param {string} kundeId - rec-ID des Kunden
 * @param {string} zeile   - Komplette Zeile (z.B. "[2026-05-24 14:30] Snapshot erstellt")
 * @param {object} opts    - { idempotencyMarker?: RegExp - wenn der Pattern in den letzten Zeilen schon vorhanden, skippen }
 * @returns {Promise<{ok: true, skipped?: 'duplicate'}>}
 */
async function appendActivityZeile(kundeId, zeile, opts = {}) {
  if (!kundeId || !zeile) throw new Error('kundeId + zeile erforderlich');

  // Re-Read frischer Stand (verkürzt Race-Fenster)
  const rec = await airtable('get', TABLES.KUNDEN, { recordId: kundeId });
  const oldNotizen = (rec && rec.fields && rec.fields[KUNDEN_FIELDS.NOTIZEN]) || '';

  // Idempotenz-Check: wenn opts.idempotencyMarker (RegExp) im freeNotes-Bereich
  // matched, wird die Zeile NICHT neu eingefügt. Caller verwendet das z.B. um
  // doppelte Webhook-Events zu deduplizieren (gleiche docId + gleicher Status).
  if (opts.idempotencyMarker instanceof RegExp) {
    const freeOnly = _extractFreeNotes(oldNotizen);
    // Reset lastIndex falls Regex „g"-Flag hat
    opts.idempotencyMarker.lastIndex = 0;
    if (opts.idempotencyMarker.test(freeOnly)) {
      return { ok: true, skipped: 'duplicate' };
    }
  }

  // Position des ersten Block-Markers ermitteln (KAV ODER WUNSCH, was zuerst kommt)
  const kavIdx = oldNotizen.indexOf(KAV_START);
  const wunschIdx = oldNotizen.indexOf(WUNSCH_START);
  let firstBlockIdx = -1;
  if (kavIdx >= 0 && wunschIdx >= 0) firstBlockIdx = Math.min(kavIdx, wunschIdx);
  else if (kavIdx >= 0) firstBlockIdx = kavIdx;
  else if (wunschIdx >= 0) firstBlockIdx = wunschIdx;

  let kombinierte;
  if (firstBlockIdx >= 0) {
    const head = oldNotizen.substring(0, firstBlockIdx).trimEnd();
    const tail = oldNotizen.substring(firstBlockIdx);
    kombinierte = (head ? head + '\n' : '') + zeile + '\n\n' + tail;
  } else {
    kombinierte = oldNotizen ? `${zeile}\n${oldNotizen}` : zeile;
  }

  // 100-Zeilen-Cutoff: Blocks bleiben hinten erhalten, älteste freeNotes-Zeilen vorne abgeschnitten
  const neueNotizen = _enforceLineLimit(kombinierte);

  await airtable('update', TABLES.KUNDEN, {
    recordId: kundeId,
    fields: { [KUNDEN_FIELDS.NOTIZEN]: neueNotizen }
  });

  return { ok: true };
}

/**
 * Schreibt einen kompletten Notizen-String — überschreibt alles.
 * Verwende NUR wenn der Aufrufer den vollen Stand schon kennt (z.B. nach
 * eigenem Re-Read + Mutation). Standard-Append nutzt appendActivityZeile.
 */
async function setNotizen(kundeId, notizen) {
  if (!kundeId) throw new Error('kundeId erforderlich');
  await airtable('update', TABLES.KUNDEN, {
    recordId: kundeId,
    fields: { [KUNDEN_FIELDS.NOTIZEN]: notizen || '' }
  });
  return { ok: true };
}

// === Internal helpers ===

function _extractFreeNotes(notizen) {
  let cleaned = String(notizen || '');
  const stripBlock = (start, end) => {
    const sIdx = cleaned.indexOf(start);
    const eIdx = cleaned.indexOf(end);
    if (sIdx >= 0 && eIdx > sIdx) {
      cleaned = (cleaned.substring(0, sIdx) + cleaned.substring(eIdx + end.length)).trim();
    }
  };
  stripBlock(KAV_START, '[/KAV-TRACKER]');
  stripBlock(WUNSCH_START, '[/WUNSCH-PROFIL]');
  return cleaned;
}

function _enforceLineLimit(notizen) {
  // Block-Bereich (alles ab dem ersten Block-Marker) niemals abschneiden.
  const kavIdx = notizen.indexOf(KAV_START);
  const wunschIdx = notizen.indexOf(WUNSCH_START);
  let blockStart = -1;
  if (kavIdx >= 0 && wunschIdx >= 0) blockStart = Math.min(kavIdx, wunschIdx);
  else if (kavIdx >= 0) blockStart = kavIdx;
  else if (wunschIdx >= 0) blockStart = wunschIdx;

  const head = blockStart >= 0 ? notizen.substring(0, blockStart) : notizen;
  const tail = blockStart >= 0 ? notizen.substring(blockStart) : '';

  const headLines = head.split('\n');
  if (headLines.length <= MAX_ZEILEN) return notizen;

  const cutoff = headLines.length - MAX_ZEILEN;
  const kuerzerKopf = `[… ${cutoff} ältere Einträge abgeschnitten …]\n` + headLines.slice(cutoff).join('\n');
  return tail ? kuerzerKopf + tail : kuerzerKopf;
}

module.exports = {
  appendActivityZeile,
  setNotizen,
  KAV_START,
  WUNSCH_START,
  // intern exportiert für Tests
  _extractFreeNotes,
  _enforceLineLimit,
};
