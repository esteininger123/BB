// Kunden-Upload-Portal (Baustein U) — KEIN Login, Zugang über signierten Token.
//   GET  /api/finanzierung/portal/<token>  → Profil + Dokumentenmodell + Objektunterlagen + Uploads
//   POST /api/finanzierung/portal/<token>
//        Upload:  { name, mimeType, dataBase64, punkt, person?, bezeichnung? }
//        Profil:  { action:'profil', profil:{ miete, pkv, kredite, bestand, bestandN, mit, mitName } }
//
// Adaptiv: ein paar Profil-Fragen (am Drive-Ordner gespeichert) steuern, welche
// situativen Dokumente verlangt werden. Quelle: offizielle Unterlagen-Checkliste
// der B&B-Finanzierungsabteilung (Stand 2026-06-16).

const { requireSafeOrigin } = require('../../_lib/auth');
const { readBody, methodNotAllowed, sendError } = require('../../_lib/http');
const { airtable } = require('../../_lib/airtable');
const { TABLES, FINANZIERUNGSFALL_FIELDS } = require('../../_lib/tables');
const { verifyUploadToken } = require('../../_lib/upload-token');
const { listFiles, uploadFile, getFolderAppProps, setFolderAppProps } = require('../../_lib/drive');
const { resolveVerkaufsunterlagenFolder } = require('../../_lib/objektunterlagen');

// Dokumentenmodell. gruppe: 'person' (pro Antragsteller) · 'allgemein' (Haushalt) ·
// 'bestand' (nur wenn Bestandsimmobilie). kern:true = immer Pflicht. when:<profil-key>
// = situativ, nur wenn die Profil-Frage zutrifft. Selbstauskunft ist NICHT dabei
// (kommt von B&B via PandaDoc).
const DOKUMENTE = [
  // Persönlich — Kern (immer Pflicht, je Antragsteller)
  { key: 'ausweis',     gruppe: 'person', kern: true, label: 'Personalausweis / Reisepass', file: 'Ausweis' },
  { key: 'gehalt',      gruppe: 'person', kern: true, label: 'Gehaltsabrechnungen (letzte 3 Monate)', file: 'Gehaltsabrechnung' },
  { key: 'lohnsteuer',  gruppe: 'person', kern: true, label: 'Lohnsteuerbescheinigung / Dezemberabrechnung', file: 'Lohnsteuerbescheinigung' },
  { key: 'kontoauszug', gruppe: 'person', kern: true, label: 'Kontoauszüge Gehaltskonto (letzte 3 Monate)', file: 'Kontoauszug' },
  // Persönlich — situativ
  { key: 'mietvertrag_eigen', gruppe: 'person', when: 'miete', label: 'Dein Mietvertrag', file: 'Mietvertrag (eigene Wohnung)' },
  { key: 'pkv',         gruppe: 'person', when: 'pkv', label: 'Private Krankenversicherung (letzte Zahlungsmitteilung)', file: 'Private Krankenversicherung' },
  // Allgemein — Haushalt
  { key: 'eigenkapital', gruppe: 'allgemein', kern: true, label: 'Eigenkapitalnachweis (Konto-/Depotauszug)', file: 'Eigenkapitalnachweis' },
  { key: 'privatkredit', gruppe: 'allgemein', when: 'kredite', label: 'Kreditvertrag laufender Verbindlichkeiten (Leasing o.ä.)', file: 'Privatkredit' },
  // Bestandsobjekt — nur wenn vorhanden
  { key: 'darlehensvertrag', gruppe: 'bestand', when: 'bestand', label: 'Darlehensvertrag', file: 'Darlehensvertrag' },
  { key: 'restschuld',  gruppe: 'bestand', when: 'bestand', label: 'Restschuld-Nachweis / letzter Jahreskontoauszug', file: 'Restschuld' },
  { key: 'eigentum',    gruppe: 'bestand', when: 'bestand', label: 'Eigentumsnachweis (Grundbuchauszug / Kaufvertrag)', file: 'Eigentumsnachweis' },
  { key: 'mietvertrag_verm', gruppe: 'bestand', when: 'bestand', label: 'Mietvertrag (wenn vermietet)', file: 'Mietvertrag (vermietet)' },
];
const byKey = (k) => DOKUMENTE.find((d) => d.key === k);
// Persönliche Kern-Dokumente — die braucht auch ein Mitantragsteller.
const PERSON_KERN = DOKUMENTE.filter((d) => d.gruppe === 'person' && d.kern).map((d) => d.key);

// Situative Zusatznachweise (Catch-all-Dropdown). Alles optional.
const WEITERE_TYPEN = [
  { key: 'arbeitsvertrag', label: 'Arbeitsvertrag' },
  { key: 'schufa',         label: 'SCHUFA-Selbstauskunft' },
  { key: 'rente',          label: 'Renten- / Pensionsbescheid, private Altersvorsorge' },
  { key: 'mieteinnahmen',  label: 'Nachweis weiterer Mieteinnahmen' },
  { key: 'bwa',            label: 'BWA / Jahresabschluss (Selbstständige)' },
  { key: 'depot',          label: 'Depot- / Wertpapierauszug' },
  { key: 'versicherung',   label: 'Bauspar- / Lebensversicherungs-Nachweis' },
  { key: 'schenkung',      label: 'Schenkungs- / Eigenkapital-Nachweis' },
  { key: 'sonstiges',      label: 'Sonstiges (mit eigener Beschreibung)' },
];

const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // ~4 MB (Vercel-Body-Limit ~4,5 MB)
const STATUS_VOLLSTAENDIG = 'Unterlagen vollständig';
const FRUEH_STATI = ['Unterlagen noch anfordern', 'Unterlagen angefordert', 'Unterlagen unvollständig'];

// Profil aus den Ordner-appProperties lesen (mit sinnvollen Defaults).
function readProfil(props) {
  const bool = (k, def) => (props['p_' + k] === undefined ? def : props['p_' + k] === '1');
  return {
    miete:    bool('miete', true),   // die meisten wohnen zur Miete → Mietvertrag erstmal sichtbar
    pkv:      bool('pkv', false),
    kredite:  bool('kredite', false),
    bestand:  bool('bestand', false),
    bestandN: props['p_bestandN'] ? (parseInt(props['p_bestandN'], 10) || 0) : 0,
    mit:      bool('mit', false),
    mitName:  props['p_mitName'] || '',
  };
}
function profilToProps(p) {
  return {
    p_miete:    p.miete ? '1' : '0',
    p_pkv:      p.pkv ? '1' : '0',
    p_kredite:  p.kredite ? '1' : '0',
    p_bestand:  p.bestand ? '1' : '0',
    p_bestandN: String(p.bestand ? (p.bestandN || 1) : 0),
    p_mit:      p.mit ? '1' : '0',
    p_mitName:  p.mit ? String(p.mitName || '').slice(0, 80) : '',
  };
}

// Welche {key, person}-Kombinationen sind nach Profil Pflicht?
function requiredItems(profil) {
  const items = [];
  for (const d of DOKUMENTE) {
    if (d.kern || (d.when && profil[d.when])) items.push({ key: d.key, person: 'haupt' });
  }
  if (profil.mit) PERSON_KERN.forEach((k) => items.push({ key: k, person: 'mit' }));
  return items;
}

const slim = (f) => ({
  id: f.id, name: f.name, webViewLink: f.webViewLink,
  punkt: (f.appProperties && f.appProperties.punkt) || '',
  person: (f.appProperties && f.appProperties.person) || 'haupt',
  typ: (f.appProperties && f.appProperties.typ) || '',
});

module.exports = async (req, res) => {
  try {
    const token = req.query && req.query.token;
    const payload = token ? verifyUploadToken(token) : null;
    if (!payload || !payload.folderId) {
      return res.status(401).json({ error: 'Link ungültig oder abgelaufen' });
    }

    const centralFolderId = payload.weId ? await resolveVerkaufsunterlagenFolder(payload.weId) : '';
    const weSpezFolderId = payload.weSpezifischFolderId || '';

    if (req.method === 'GET') {
      let kundeName = '';
      if (payload.fallId) {
        try {
          const fall = await airtable('get', TABLES.FINANZIERUNGSFALL, { recordId: payload.fallId });
          kundeName = (fall.fields && fall.fields[FINANZIERUNGSFALL_FIELDS.TITEL]) || '';
        } catch { /* Titel optional */ }
      }
      const profil = readProfil(await getFolderAppProps(payload.folderId).catch(() => ({})));
      const uploads = (await listFiles(payload.folderId).catch(() => [])).map(slim);
      const objCentral = centralFolderId ? (await listFiles(centralFolderId).catch(() => [])).map(slim) : [];
      const objSpez = weSpezFolderId ? (await listFiles(weSpezFolderId).catch(() => [])).map(slim) : [];
      return res.status(200).json({
        kundeName, profil, dokumente: DOKUMENTE, personKern: PERSON_KERN,
        weitereTypen: WEITERE_TYPEN, uploads, objektunterlagen: [...objCentral, ...objSpez],
      });
    }

    if (req.method === 'POST') {
      if (!requireSafeOrigin(req, res)) return;
      const body = await readBody(req);

      // — Profil-Update —
      if (body.action === 'profil') {
        const p = body.profil || {};
        const profil = {
          miete: !!p.miete, pkv: !!p.pkv, kredite: !!p.kredite,
          bestand: !!p.bestand, bestandN: parseInt(p.bestandN, 10) || 0,
          mit: !!p.mit, mitName: (p.mitName || '').toString().trim().slice(0, 80),
        };
        await setFolderAppProps(payload.folderId, profilToProps(profil));
        return res.status(200).json({ ok: true, profil });
      }

      // — Datei-Upload —
      const origName = (body.name || '').toString().trim();
      const mimeType = (body.mimeType || 'application/octet-stream').toString();
      const dataBase64 = (body.dataBase64 || '').toString();
      const punkt = (body.punkt || '').toString();
      const person = body.person === 'mit' ? 'mit' : 'haupt';
      const bezeichnung = (body.bezeichnung || '').toString().trim().slice(0, 100);
      if (!origName || !dataBase64) return res.status(400).json({ error: 'name und dataBase64 erforderlich' });
      const buffer = Buffer.from(dataBase64, 'base64');
      if (!buffer.length) return res.status(400).json({ error: 'Leere Datei' });
      if (buffer.length > MAX_UPLOAD_BYTES) return res.status(413).json({ error: 'Datei zu groß — max. ~4 MB pro Datei.' });

      const def = byKey(punkt);
      const cleanOrig = origName.replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 120);
      const prefix = def ? def.file : (bezeichnung || 'Weiterer Nachweis');
      let personPrefix = '';
      if (person === 'mit') {
        const mp = readProfil(await getFolderAppProps(payload.folderId).catch(() => ({})));
        const nm = (mp.mitName || '').replace(/[\\/:*?"<>|\r\n]/g, '_').slice(0, 40);
        personPrefix = 'Mitantragsteller' + (nm ? ' ' + nm : '') + ' — ';
      }
      const finalName = (personPrefix + prefix + ' — ' + cleanOrig).slice(0, 200);
      const appProps = { punkt: def ? def.key : 'weitere', person };
      if (!def && bezeichnung) appProps.typ = bezeichnung;
      const uploaded = await uploadFile(payload.folderId, finalName, mimeType, buffer, appProps);

      // Vollständigkeit (profilbasiert) → Fall-Status hochsetzen, nur aus frühen Stati.
      try {
        if (payload.fallId) {
          const profil = readProfil(await getFolderAppProps(payload.folderId).catch(() => ({})));
          const all = (await listFiles(payload.folderId).catch(() => [])).map(slim);
          const have = new Set(all.filter((f) => f.punkt).map((f) => f.punkt + '|' + f.person));
          const complete = requiredItems(profil).every((it) => have.has(it.key + '|' + it.person));
          if (complete) {
            const fall = await airtable('get', TABLES.FINANZIERUNGSFALL, { recordId: payload.fallId });
            const cur = (fall.fields && fall.fields[FINANZIERUNGSFALL_FIELDS.STATUS]) || '';
            const curName = (cur && typeof cur === 'object') ? cur.name : cur;
            if (FRUEH_STATI.includes(curName)) {
              await airtable('update', TABLES.FINANZIERUNGSFALL, {
                recordId: payload.fallId,
                fields: { [FINANZIERUNGSFALL_FIELDS.STATUS]: STATUS_VOLLSTAENDIG },
              });
            }
          }
        }
      } catch (e) { /* Status-Update nicht kritisch */ }

      return res.status(201).json({ ok: true, file: slim(uploaded) });
    }

    return methodNotAllowed(res, ['GET', 'POST']);
  } catch (e) {
    return sendError(res, e);
  }
};
