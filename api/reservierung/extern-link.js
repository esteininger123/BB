// POST /api/reservierung/extern-link — 06.07.2026 (Henry)
//
// Reservierungs-Flow für EXTERNE Vertriebler: KEIN PandaDoc. Stattdessen wird ein
// vorausgefülltes Muster („Kaufabsichtserklärung und Reservierungsvereinbarung")
// eingefroren und ein Token-Link erzeugt, unter dem der Kunde das Dokument liest
// und direkt online unterschreibt (public/reservierung.html + portal/[token].js).
//
// Body: { kundeId, weId, adresse: {strasse, plz, ort}, kaeufer2?, doc: {…} }
//   doc = Anzeige-Werte aus dem Kalkulator des Externen (Subvention, RenoBudget, qm, Lage).
//   Die PREISE (Wohnung + Stellplatz) rechnet der Server selbst — Abgabepreis +
//   Provisionsaufschlag des Externen (api/_lib/extern.js) — damit sie nicht
//   clientseitig manipulierbar sind.
//
// Eingefroren wird alles in kunde.saJson.reservierungExtern; die Kundenadresse
// wandert zusätzlich in saJson.antragsteller (Single Source für spätere SA/PDFs).

const jwt = require('jsonwebtoken');
const { verifySession, requireSafeOrigin, isExtern } = require('../_lib/auth');
const { externPreis, loadProvisionPct, ladeStellplatzKpSummen } = require('../_lib/extern');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const { airtable, listAll } = require('../_lib/airtable');
const { appendActivityZeile } = require('../_lib/notizen');
const { TABLES, KUNDEN_FIELDS, VERTRIEBLER_FIELDS, WE_FIELDS, KALK_STAMMDATEN_FIELDS, KALK_STATUS_AKTIV } = require('../_lib/tables');

const TOKEN_KIND = 'reserv-sign';
const TOKEN_TAGE = 14;

function getJwtSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET nicht gesetzt');
  return s;
}

function num(v) {
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
}

module.exports = async (req, res) => {
  if (!requireSafeOrigin(req, res)) return;
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  const session = verifySession(req);
  if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });
  if (!isExtern(session)) {
    return res.status(403).json({ error: 'Dieser Reservierungs-Weg ist für externe Vertriebler — intern läuft die Reservierung über PandaDoc.' });
  }

  try {
    const body = await readBody(req);
    const kundeId = (body.kundeId || '').trim();
    const weId = (body.weId || '').trim();
    if (!/^rec[A-Za-z0-9]{14}$/.test(kundeId)) return res.status(400).json({ error: 'kundeId fehlt oder ungültig' });
    if (!/^rec[A-Za-z0-9]{14}$/.test(weId)) return res.status(400).json({ error: 'weId fehlt oder ungültig' });
    const adr = body.adresse || {};
    const strasse = (adr.strasse || '').trim();
    const plz = (adr.plz || '').trim();
    const ort = (adr.ort || '').trim();
    if (!strasse || !plz || !ort) return res.status(400).json({ error: 'Adresse des Kunden (Straße, PLZ, Ort) fehlt' });
    const kaeufer2 = (body.kaeufer2 || '').trim();
    // 20.07.2026 (Henry): freie Zusatzvereinbarung des Vertrieblers, z.B.
    // "Es wird eine Anzahlung in Höhe von 5.000 € geleistet." — erscheint
    // wörtlich im eingefrorenen Dokument (reservierung.html).
    const zusatz = String(body.zusatz || '').trim().slice(0, 1000);
    const clientDoc = (body.doc && typeof body.doc === 'object') ? body.doc : {};

    // --- Kunde + Owner-Check (Pattern aus sa-portal/generate.js) ---
    let kundeRec;
    try {
      kundeRec = await airtable('get', TABLES.KUNDEN, { recordId: kundeId });
    } catch (e) {
      return res.status(404).json({ error: 'Kunde nicht gefunden' });
    }
    const kf = (kundeRec && kundeRec.fields) || {};
    const ownerIds = kf[KUNDEN_FIELDS.OWNER] || [];
    if (!Array.isArray(ownerIds) || !ownerIds.includes(session.vertrieblerId)) {
      return res.status(403).json({ error: 'Dieser Kunde gehört nicht zu Dir' });
    }
    const kaeuferName = (((kf[KUNDEN_FIELDS.VORNAME] || '') + ' ' + (kf[KUNDEN_FIELDS.NACHNAME] || '')).trim())
      || kf[KUNDEN_FIELDS.NAME] || 'Kaufinteressent';

    // --- Freigabe-Check (06.07.2026): nur explizit für Extern freigegebene
    // Einheiten sind reservierbar — auch gegen manipulierte Requests. ---
    const stammRecs = await listAll(TABLES.KALK_STAMMDATEN, {
      filterByFormula: `{${KALK_STAMMDATEN_FIELDS.STATUS}}='${KALK_STATUS_AKTIV}'`,
      fields: [KALK_STAMMDATEN_FIELDS.WOHNEINHEIT, KALK_STAMMDATEN_FIELDS.EXTERN_FREIGABE],
    }, 1000);
    const freigegeben = stammRecs.some(r => {
      const f = r.fields || {};
      if (!f[KALK_STAMMDATEN_FIELDS.EXTERN_FREIGABE]) return false;
      const links = f[KALK_STAMMDATEN_FIELDS.WOHNEINHEIT] || [];
      return Array.isArray(links) && links.some(x => ((x && typeof x === 'object' && x.id) ? x.id : x) === weId);
    });
    if (!freigegeben) {
      return res.status(403).json({ error: 'Diese Einheit ist für den externen Vertrieb nicht freigegeben.' });
    }

    // --- Preise SERVERSEITIG (Abgabepreis + Provision des Externen) ---
    const [weRec, vertrieblerRec, prov, stplKpByWe] = await Promise.all([
      airtable('get', TABLES.WOHNEINHEIT, { recordId: weId }),
      airtable('get', TABLES.VERTRIEBLER, { recordId: session.vertrieblerId }).catch(() => null),
      loadProvisionPct(session),
      ladeStellplatzKpSummen(),
    ]);
    const wf = (weRec && weRec.fields) || {};
    const kpBasis = num(wf[WE_FIELDS.KAUFPREIS]);
    if (kpBasis <= 0) return res.status(400).json({ error: 'Für diese Wohneinheit ist kein Kaufpreis gepflegt' });
    const stellplatzKp = num(stplKpByWe[weId]);
    const e = externPreis(kpBasis, stellplatzKp, prov);
    const vertrieblerName = (vertrieblerRec && vertrieblerRec.fields && vertrieblerRec.fields[VERTRIEBLER_FIELDS.NAME]) || session.email;

    // --- Frist: heute + RESERV_FRIST_TAGE (wie PandaDoc-Flow) ---
    const fristTage = parseInt(process.env.RESERV_FRIST_TAGE || '14', 10) || 14;
    const reservBisDate = new Date(Date.now() + fristTage * 24 * 60 * 60 * 1000);
    const fmtDatum = (d) => d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });

    // --- Dokument einfrieren (saJson.reservierungExtern) ---
    let sa = kf[KUNDEN_FIELDS.SA_JSON];
    if (typeof sa === 'string') { try { sa = JSON.parse(sa); } catch (err) { sa = null; } }
    if (!sa || typeof sa !== 'object') sa = {};
    sa.antragsteller = sa.antragsteller || {};
    sa.antragsteller.strasse = strasse;
    sa.antragsteller.plz = plz;
    sa.antragsteller.ort = ort;

    const subvPhasen = Array.isArray(clientDoc.subvPhasen)
      ? clientDoc.subvPhasen
          .map(p => ({ mo: Math.round(num(p && p.mo)), monate: Math.round(num(p && p.monate)) }))
          .filter(p => p.mo > 0 && p.monate > 0)
          .slice(0, 5)
      : [];

    sa.reservierungExtern = {
      erstelltAm: new Date().toISOString(),
      reservBis: fmtDatum(reservBisDate),
      vertrieblerName,
      kaeufer: kaeufer2 ? `${kaeuferName} und ${kaeufer2}` : kaeuferName,
      adresse: { strasse, plz, ort },
      weId,
      doc: {
        // Preise = Server-Wahrheit (Kundenpreis inkl. Provision, Stellplatz unverändert)
        kpWohnung: e.kp,
        stellplatzKp,
        kpGesamt: e.kp + stellplatzKp,
        // Anzeige-Werte aus dem Kalkulator (Subvention/RenoBudget/Objektdaten)
        subvPhasen,
        subvMo: Math.round(num(clientDoc.subvMo)),
        subvMonate: Math.round(num(clientDoc.subvMonate)),
        subvGesamt: Math.round(num(clientDoc.subvGesamt)),
        renoBudget: Math.round(num(clientDoc.renoBudget)),
        qm: num(clientDoc.qm) || num(wf[WE_FIELDS.QM]),
        weNr: String(clientDoc.weNr || wf[WE_FIELDS.WE_NR] || ''),
        lage: String(clientDoc.lage || '').slice(0, 200),
        projektName: String(clientDoc.projektName || '').slice(0, 120),
        zusatz,
      },
      signiert: null,
    };

    await airtable('update', TABLES.KUNDEN, {
      recordId: kundeId,
      fields: {
        [KUNDEN_FIELDS.SA_JSON]: JSON.stringify(sa),
        [KUNDEN_FIELDS.LAST_ACTIVITY]: new Date().toISOString(),
      },
    });

    // --- Token + URL (Host-Allowlist wie sa-portal/generate.js) ---
    const expiresInSec = 60 * 60 * 24 * TOKEN_TAGE;
    const token = jwt.sign({ kind: TOKEN_KIND, kundeId, generatedBy: session.vertrieblerId }, getJwtSecret(), { expiresIn: expiresInSec });
    const protoHeader = (req.headers['x-forwarded-proto'] || 'https');
    const rawHost = req.headers['x-forwarded-host'] || req.headers.host || '';
    const ALLOWED_HOSTS = new Set(['bb-brown-pi.vercel.app', 'backstube.bub-immo.de', 'bb.immo-stein.de', 'localhost:3000', 'localhost:5173']);
    const isPreview = /^bb-brown-pi-[a-z0-9-]+\.vercel\.app$/i.test(rawHost);
    const host = (ALLOWED_HOSTS.has(rawHost) || isPreview) ? rawHost : 'backstube.bub-immo.de';
    const url = `${protoHeader}://${host}/reservierung?token=${encodeURIComponent(token)}`;

    try {
      const stamp = new Date().toISOString().substring(0, 16).replace('T', ' ');
      await appendActivityZeile(kundeId, `[${stamp}] Reservierungs-Link (Extern) erzeugt — WE ${sa.reservierungExtern.doc.weNr || weId}, Kundenpreis ${e.kp.toLocaleString('de-DE')} €, gültig bis ${sa.reservierungExtern.reservBis} (${vertrieblerName})`);
    } catch (err) { /* Log-Fehler killt den Link nicht */ }

    return res.status(200).json({ ok: true, url, reservBis: sa.reservierungExtern.reservBis, kpGesamt: e.kp + stellplatzKp });
  } catch (e) {
    return sendError(res, e);
  }
};
