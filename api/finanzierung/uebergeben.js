// POST /api/finanzierung/uebergeben — legt aus einem gewählten Snapshot einen
// Endkunden-Finanzierungsfall an (Baustein A). Body:
//   { kundeId, snapshotId,
//     hausbankVorhanden, hausbankName, hausbankBerater,
//     finanzberaterVorhanden, finanzberaterKontakt,
//     finanzierungsform, finanzierungsformAndere, maxEigenkapital,
//     wasWichtig, notarterminZiel }

const { verifySession, requireSafeOrigin } = require('../_lib/auth');
const { airtable, listAll } = require('../_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const { TABLES, SNAPSHOT_FIELDS, KUNDEN_FIELDS, FINANZIERUNGSFALL_FIELDS } = require('../_lib/tables');
const { finanzierungsfallBodyToFields } = require('../_lib/mappers');

// Owner-Check (gleiche Logik wie snapshots.js): Admin darf alles, sonst muss
// der eingeloggte Vertriebler Owner des Kunden sein.
async function canAccessKunde(session, kundeId) {
  if (!kundeId) return false;
  if (session.rolle === 'Admin') return true;
  try {
    const rec = await airtable('get', TABLES.KUNDEN, { recordId: kundeId });
    const ownersRaw = (rec.fields && rec.fields[KUNDEN_FIELDS.OWNER]) || [];
    if (!Array.isArray(ownersRaw)) return false;
    const ownerIds = ownersRaw
      .map(o => (o && typeof o === 'object') ? o.id : (typeof o === 'string' && o.startsWith('rec') ? o : null))
      .filter(Boolean);
    return ownerIds.includes(session.vertrieblerId);
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  if (!requireSafeOrigin(req, res)) return;
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

  try {
    // GET — zählt existierende Finanzierungsfälle des Kunden (für den Warn-Dialog
    // im Frontend, bevor ein weiterer Fall angelegt wird).
    if (req.method === 'GET') {
      const kundeId = req.query && req.query.kundeId;
      if (!kundeId) return res.status(400).json({ error: 'kundeId fehlt' });
      const allowedGet = await canAccessKunde(session, kundeId);
      if (!allowedGet) return res.status(403).json({ error: 'Kein Zugriff auf diesen Kunden' });
      const all = await listAll(TABLES.FINANZIERUNGSFALL, { fields: [FINANZIERUNGSFALL_FIELDS.KUNDE] }, 2000);
      const count = all.filter(r => {
        const link = (r.fields && r.fields[FINANZIERUNGSFALL_FIELDS.KUNDE]) || [];
        const ids = Array.isArray(link) ? link.map(x => (x && typeof x === 'object') ? x.id : x) : [];
        return ids.includes(kundeId);
      }).length;
      return res.status(200).json({ count });
    }

    if (req.method !== 'POST') return methodNotAllowed(res, ['GET', 'POST']);

    const body = await readBody(req);
    if (!body.kundeId)    return res.status(400).json({ error: 'kundeId fehlt' });
    if (!body.snapshotId) return res.status(400).json({ error: 'snapshotId fehlt' });

    const allowed = await canAccessKunde(session, body.kundeId);
    if (!allowed) return res.status(403).json({ error: 'Kein Zugriff auf diesen Kunden' });

    // Snapshot-Record laden → Kennzahlen (Klartext-Felder) + WE-Bezug + Kunde-Match
    let snapRec;
    try {
      snapRec = await airtable('get', TABLES.SNAPSHOTS, { recordId: body.snapshotId });
    } catch {
      return res.status(404).json({ error: 'Snapshot nicht gefunden' });
    }
    const sf = snapRec.fields || {};
    const snapKundeLink = sf[SNAPSHOT_FIELDS.KUNDE] || [];
    const snapKundeId = Array.isArray(snapKundeLink) && snapKundeLink.length
      ? (typeof snapKundeLink[0] === 'object' ? snapKundeLink[0].id : snapKundeLink[0]) : null;
    if (snapKundeId && snapKundeId !== body.kundeId) {
      return res.status(400).json({ error: 'Snapshot gehört nicht zu diesem Kunden' });
    }

    // Kundenname für den Fall-Titel
    let kundeName = '';
    try {
      const kRec = await airtable('get', TABLES.KUNDEN, { recordId: body.kundeId });
      kundeName = (kRec.fields && kRec.fields[KUNDEN_FIELDS.NAME]) || '';
    } catch { /* Titel notfalls nur aus WE */ }

    const weRecId = sf[SNAPSHOT_FIELDS.WE_RECID] || '';
    const fields = finanzierungsfallBodyToFields({
      kundeId: body.kundeId,
      weId: weRecId || undefined,
      snapshotId: body.snapshotId,
      kundeName,
      weBezeichnung: sf[SNAPSHOT_FIELDS.WE_BEZ] || '',
      standVom: (sf[SNAPSHOT_FIELDS.CREATED] || snapRec.createdTime || '').slice(0, 10) || undefined,
      snapshot: {
        kaufpreis:        sf[SNAPSHOT_FIELDS.KAUFPREIS],
        wohnflaeche:      sf[SNAPSHOT_FIELDS.WOHNFLAECHE],
        kaltmiete:        sf[SNAPSHOT_FIELDS.KALTMIETE],
        zins:             sf[SNAPSHOT_FIELDS.ZINS],
        tilgung:          sf[SNAPSHOT_FIELDS.TILGUNG],
        ekBedarf:         sf[SNAPSHOT_FIELDS.EK_BEDARF],
        knkMitfinanziert: !!sf[SNAPSHOT_FIELDS.KNK_MITFINANZIERT],
      },
      hausbankVorhanden:      !!body.hausbankVorhanden,
      hausbankName:           body.hausbankName || '',
      hausbankBerater:        body.hausbankBerater || '',
      finanzberaterVorhanden: !!body.finanzberaterVorhanden,
      finanzberaterKontakt:   body.finanzberaterKontakt || '',
      finanzierungsform:      body.finanzierungsform || '',
      finanzierungsformAndere: body.finanzierungsformAndere || '',
      maxEigenkapital:        body.maxEigenkapital,
      wasWichtig:             body.wasWichtig || '',
      notizVertrieb:          body.notizVertrieb || '',
      notarterminZiel:        body.notarterminZiel || '',
    });

    const created = await airtable('create', TABLES.FINANZIERUNGSFALL, { fields });

    // Drive-Ordner anlegen + Link in den Fall schreiben. NICHT kritisch: ein
    // Drive-Fehler darf die Übergabe nicht abbrechen — der Fall bleibt bestehen,
    // der Ordner kann notfalls manuell/erneut angelegt werden.
    let driveLink = '';
    let uploadLink = '';
    try {
      const rootId = process.env.DRIVE_ROOT_FOLDER_ID;
      if (rootId) {
        const { ensureFolder, ensureShortcut } = require('../_lib/drive');
        const { resolveVerkaufsunterlagenFolder } = require('../_lib/objektunterlagen');
        const folderName = (kundeName || 'Kunde') + ' — ' + String(created.id).slice(-6);
        const folder = await ensureFolder(folderName, rootId);
        driveLink = (folder && folder.webViewLink) || '';
        const folderId = (folder && folder.id) || '';

        // Verlinkung statt Kopie (Edgar 2026-06-15): Shortcut auf den zentralen
        // Objektunterlagen-Ordner (immer aktuell) + Unterordner für WE-spezifische
        // manuelle Ergänzungen. Beides wird im Portal eingeblendet.
        let weSpezifischFolderId = '';
        if (folderId) {
          try {
            const centralId = await resolveVerkaufsunterlagenFolder(weRecId);
            if (centralId) {
              try { await ensureShortcut('Objektunterlagen (Objekt)', centralId, folderId); }
              catch (e) { console.error('[uebergeben] Objekt-Shortcut fehlgeschlagen:', e && e.message); }
            }
            const sub = await ensureFolder('Wohnungsspezifische Unterlagen', folderId);
            weSpezifischFolderId = (sub && sub.id) || '';
          } catch (e) {
            console.error('[uebergeben] Objektunterlagen-Verlinkung fehlgeschlagen (nicht kritisch):', e && e.message);
          }
        }

        const updateFields = {};
        if (driveLink) updateFields[FINANZIERUNGSFALL_FIELDS.KUNDEN_DRIVE] = driveLink;
        // Upload-Portal-Token + Link (Baustein U): bindet den Token an Fall + Ordner.
        if (folderId) {
          try {
            const { signUploadToken } = require('../_lib/upload-token');
            const token = signUploadToken({ fallId: created.id, folderId, weId: weRecId || '', weSpezifischFolderId });
            const host = (req.headers && (req.headers['x-forwarded-host'] || req.headers.host)) || '';
            if (host) {
              uploadLink = `https://${host}/portal?t=${token}`;
              updateFields[FINANZIERUNGSFALL_FIELDS.UPLOAD_LINK] = uploadLink;
            }
          } catch (e) {
            console.error('[uebergeben] Upload-Link fehlgeschlagen (nicht kritisch):', e && e.message);
          }
        }
        if (Object.keys(updateFields).length) {
          await airtable('update', TABLES.FINANZIERUNGSFALL, { recordId: created.id, fields: updateFields });
        }
      }
    } catch (e) {
      console.error('[uebergeben] Drive-Ordner/Upload-Link fehlgeschlagen (nicht kritisch):', e && e.message);
    }

    // Kunden-Phase auf "Bank-Einreichung" + Letzte-Aktivität touchen (nicht kritisch)
    try {
      await airtable('update', TABLES.KUNDEN, {
        recordId: body.kundeId,
        fields: {
          [KUNDEN_FIELDS.PHASE]: 'Bank-Einreichung',
          [KUNDEN_FIELDS.LAST_ACTIVITY]: new Date().toISOString(),
        }
      });
    } catch { /* nicht kritisch */ }

    return res.status(201).json({ ok: true, id: created.id, driveLink, uploadLink });
  } catch (e) {
    return sendError(res, e);
  }
};
