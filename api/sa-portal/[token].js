// GET  /api/sa-portal/[token] → Kunden-Basis + saJson zurück
// PUT  /api/sa-portal/[token] → saJson speichern + Aktivitäts-Log
//
// Kein Vertriebler-Login nötig — Auth über das Token in der URL.
// Token-Payload: { kind: 'sa-portal', kundeId, generatedBy, exp }
// Nur Read+Write auf das eine Kunden-Record + saJson-Feld.

const jwt = require('jsonwebtoken');
const { airtable } = require('../_lib/airtable');
const { TABLES, KUNDEN_FIELDS } = require('../_lib/tables');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const { appendActivityZeile } = require('../_lib/notizen');

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET nicht gesetzt');
  return s;
}

function verifyPortalToken(token) {
  if (!token) return null;
  try {
    const decoded = jwt.verify(String(token), getJwtSecret(), { algorithms: ['HS256'] });
    if (!decoded || decoded.kind !== 'sa-portal' || !decoded.kundeId) return null;
    return decoded;
  } catch (e) {
    return null;
  }
}

// Das SA-Portal nutzt seit dem Vollausbau (2026-06-19) exakt dieselben saJson-Keys
// wie App + PDF (App-Schema). Diese Funktion migriert ALT-Daten, die noch im
// früheren Portal-Schema vorliegen (offener Link / noch offener alter Browser-Tab),
// verlustfrei aufs App-Schema. Läuft in GET (beim Ausliefern) UND PUT (beim Speichern).
//   antragGemeinsam → gemeinsam · nachname → name · arbeitgeber → firma
//   Immobilie.adresse → Immobilie.anschrift · pep-Default "nein"
// Mutiert das übergebene Objekt (im GET wird auf einer Kopie gearbeitet).
function normalizeToAppSchema(sa) {
  if (!sa || typeof sa !== 'object') return sa;
  const take = (obj, oldKey, newKey) => {
    if (obj[oldKey] === undefined) return;
    if (obj[newKey] === undefined || obj[newKey] === '' || obj[newKey] === null) obj[newKey] = obj[oldKey];
    delete obj[oldKey];
  };
  take(sa, 'antragGemeinsam', 'gemeinsam');
  ['antragsteller', 'mitantragsteller'].forEach(role => {
    const p = sa[role];
    if (!p || typeof p !== 'object') return;
    take(p, 'nachname', 'name');
    take(p, 'arbeitgeber', 'firma');
    if (Array.isArray(p.immobilien)) {
      p.immobilien.forEach(immo => { if (immo && typeof immo === 'object') take(immo, 'adresse', 'anschrift'); });
    }
    if (!p.pep) p.pep = 'nein'; // PEP wird im Portal nicht abgefragt → still "nein"
  });
  return sa;
}

module.exports = async (req, res) => {
  // Token aus URL-Param holen
  const token = (req.query && req.query.token) || '';
  const decoded = verifyPortalToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Link ungültig oder abgelaufen' });
  }
  const kundeId = decoded.kundeId;

  try {
    if (req.method === 'GET') {
      // Kunden-Daten holen
      let rec;
      try {
        rec = await airtable('get', TABLES.KUNDEN, { recordId: kundeId });
      } catch (e) {
        return res.status(404).json({ error: 'Kunde nicht gefunden' });
      }
      const f = rec.fields || {};

      // Nur die nötigen Felder zurück — KEIN owner, ownerId, notizen etc.
      // (Datenminimierung — Kunde soll keinen Backoffice-Datenzugang bekommen)
      const saJsonRaw = f[KUNDEN_FIELDS.SA_JSON];
      let saJson = null;
      if (saJsonRaw) {
        try { saJson = JSON.parse(saJsonRaw); } catch {}
      }
      // FS-1 (24.05.2026, Maurice/Pen-Tester): Token-Ablauf als ISO-String
      // zurückgeben, damit das Portal-UI das im Header anzeigen kann.
      // FS-1 (24.05.2026, Pen-Tester #8): Email NICHT zurückgeben — Datenminimierung
      // bei Token-Leak (Vorname reicht für Begrüßung).
      // 2026-06-19: Portal liest jetzt App-Keys direkt. saJson auf App-Schema
      // normalisieren (migriert evtl. vorhandene Alt-Portal-Felder verlustfrei) und
      // auf einer Kopie arbeiten, damit der gespeicherte Record unangetastet bleibt.
      const _saMigrated = normalizeToAppSchema(
        saJson && typeof saJson === 'object' ? JSON.parse(JSON.stringify(saJson)) : {}
      );
      const expiresAtIso = decoded.exp ? new Date(decoded.exp * 1000).toISOString() : null;
      return res.status(200).json({
        kundeId,
        vorname: f[KUNDEN_FIELDS.VORNAME] || '',
        nachname: f[KUNDEN_FIELDS.NACHNAME] || '',
        saJson: _saMigrated,
        expiresAt: expiresAtIso,
      });
    }

    if (req.method === 'PUT') {
      const body = await readBody(req);
      // Nur saJson akzeptieren — alle anderen Felder ignorieren
      if (typeof body.saJson !== 'object' && body.saJson !== null) {
        return res.status(400).json({ error: 'saJson muss ein Object sein' });
      }
      // 2026-06-19: Das neue Portal schickt bereits App-Keys. normalizeToAppSchema
      // ist hier vor allem Rückwärts-Schutz: ein noch offener ALTER Browser-Tab
      // könnte das frühere Portal-Schema (antragGemeinsam/nachname/arbeitgeber/
      // Immo.adresse) senden — das wird verlustfrei aufs App-Schema gemappt.
      const _sa = normalizeToAppSchema(body.saJson || {});
      // Größenbegrenzung: typische SA ~30 KB, Notbremse bei 200 KB
      const saStr = JSON.stringify(_sa);
      if (saStr.length > 200000) {
        return res.status(413).json({ error: 'saJson zu groß (max 200 KB)' });
      }

      await airtable('update', TABLES.KUNDEN, {
        recordId: kundeId,
        fields: {
          [KUNDEN_FIELDS.SA_JSON]: saStr,
          [KUNDEN_FIELDS.LAST_ACTIVITY]: new Date().toISOString(),
        }
      });

      // Aktivitäts-Log via gemeinsamer Helper-Lib (FS-1 24.05.):
      // Re-Read + Block-aware Insert + 100-Zeilen-Cutoff. Nicht-blocking —
      // wenn Append fehlschlägt, ist der SA-Save trotzdem durch.
      try {
        const stempel = new Date().toISOString().substring(0, 16).replace('T', ' ');
        const zeile = `[${stempel}] Selbstauskunft vom Kunden über Portal-Link aktualisiert`;
        await appendActivityZeile(kundeId, zeile);
      } catch (e) {
        console.warn('[sa-portal] Aktivitäts-Log fehlgeschlagen:', e && e.message);
      }

      return res.status(200).json({ ok: true });
    }

    return methodNotAllowed(res, ['GET', 'PUT']);
  } catch (e) {
    return sendError(res, e);
  }
};
