// POST /api/reservierung/send-for-signature
//
// Schickt die Reservierungsvereinbarung an PandaDoc zur digitalen Signatur.
// Sequenziell: erst Käufer, dann Verkäufer (Vertriebler).
//
// Body: { kundeId, weId, snapshotId? }
//
// Env-Vars: PANDADOC_API_KEY, PANDADOC_TEMPLATE_ID_RESERVIERUNG, RESERV_FRIST_TAGE
//
// PandaDoc-Template: u2E5Tczfe9kkePzbv42MSC ("Kaufabsichtserklärung & Reservierungsvereinbarung")
// Rollen im Template: "Kaufinteressent" (Signer 1), "Verkäufer" (Signer 2)
// Custom-Variablen im Template (alle befüllt durch diesen Endpoint):
//   Ablauffrist.Reservierung, Kaufpreis, QmAnzahl.Wohnungsnummer,
//   Straße.Hausnummer.PLZ.Ort, Kaufinteressent.Vorname.Nachname
// Standard Recipient-Variablen (Kaufinteressent.FirstName/LastName/Email/...) werden
// automatisch aus dem recipients-Array ausgefüllt — kein extra Mapping nötig.

const { verifySession } = require('../_lib/auth');
const { airtable } = require('../_lib/airtable');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const {
  TABLES, KUNDEN_FIELDS, WE_FIELDS, SNAPSHOT_FIELDS,
  PROJEKT_FIELDS, VERTRIEBLER_FIELDS
} = require('../_lib/tables');

const PANDADOC_API = 'https://api.pandadoc.com/public/v1';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  try {
    const session = verifySession(req);
    if (!session) return res.status(401).json({ error: 'Nicht eingeloggt' });

    const apiKey = process.env.PANDADOC_API_KEY;
    const templateId = process.env.PANDADOC_TEMPLATE_ID_RESERVIERUNG;
    if (!apiKey || !templateId) {
      return res.status(503).json({
        error: 'PandaDoc nicht konfiguriert',
        hint: 'Env-Vars PANDADOC_API_KEY und PANDADOC_TEMPLATE_ID_RESERVIERUNG fehlen.'
      });
    }

    const body = await readBody(req);
    const { kundeId, weId, snapshotId } = body;
    if (!kundeId) return res.status(400).json({ error: 'kundeId erforderlich' });
    if (!weId)    return res.status(400).json({ error: 'weId erforderlich' });

    // --- 1. Daten parallel laden (Kunde, WE, eingeloggter Vertriebler)
    const [kundeRec, weRec, vertrieblerRec] = await Promise.all([
      airtable('get', TABLES.KUNDEN,      { recordId: kundeId }),
      airtable('get', TABLES.WOHNEINHEIT, { recordId: weId }),
      airtable('get', TABLES.VERTRIEBLER, { recordId: session.vertrieblerId }),
    ]);

    // Owner-Check: Nicht-Admins dürfen nur eigene Kunden bedienen
    if (session.rolle !== 'Admin') {
      const owners = (kundeRec.fields && kundeRec.fields[KUNDEN_FIELDS.OWNER]) || [];
      if (!Array.isArray(owners) || !owners.includes(session.vertrieblerId)) {
        return res.status(403).json({ error: 'Kein Zugriff auf diesen Kunden' });
      }
    }

    // --- 2. Snapshot (optional, für eingefrorenen Kaufpreis)
    let snapKalk = null;
    if (snapshotId) {
      try {
        const snapRec = await airtable('get', TABLES.SNAPSHOTS, { recordId: snapshotId });
        const raw = snapRec.fields && snapRec.fields[SNAPSHOT_FIELDS.KALK_JSON];
        if (raw) snapKalk = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch (e) {
        // Snapshot-Fehler nicht tödlich, wir fallen auf WE-Live-Preis zurück
      }
    }

    // --- 3. Objekt-Adresse aus verlinktem Projekt holen
    let objektAdresse = '';
    const projektLink = weRec.fields && weRec.fields[WE_FIELDS.PROJEKT];
    if (Array.isArray(projektLink) && projektLink.length > 0) {
      try {
        const projRec = await airtable('get', TABLES.PROJEKT, { recordId: projektLink[0] });
        objektAdresse = (projRec.fields && projRec.fields[PROJEKT_FIELDS.ADRESSE]) || '';
      } catch (e) {
        // Adresse-Fallback wird unten gesetzt
      }
    }

    // --- 4. Feld-Extraktion
    const kunde       = kundeRec.fields       || {};
    const we          = weRec.fields          || {};
    const vertriebler = vertrieblerRec.fields || {};

    const vorname  = kunde[KUNDEN_FIELDS.VORNAME]  || '';
    const nachname = kunde[KUNDEN_FIELDS.NACHNAME] || '';
    const email    = kunde[KUNDEN_FIELDS.EMAIL];
    if (!email) return res.status(400).json({ error: 'Kunde hat keine E-Mail in Airtable' });

    // Kunde-Adresse aus Selbstauskunft-JSON (für Recipient-Daten + Custom-Tokens)
    let kundeAdresse = '';
    let kundeStrasse = '';
    let kundePlz = '';
    let kundeOrt = '';
    try {
      const sa = kunde[KUNDEN_FIELDS.SA_JSON];
      const saObj = typeof sa === 'string' ? JSON.parse(sa) : sa;
      const a = saObj && saObj.antragsteller;
      if (a) {
        kundeStrasse = a.strasse || '';
        kundePlz     = a.plz || '';
        kundeOrt     = a.ort || '';
        const plzort = [kundePlz, kundeOrt].filter(Boolean).join(' ');
        kundeAdresse = [kundeStrasse, plzort].filter(Boolean).join(', ');
      }
    } catch (e) {}

    const kaufpreis = (snapKalk && snapKalk.kaufpreis) || we[WE_FIELDS.KAUFPREIS] || 0;
    const qm        = we[WE_FIELDS.QM]    || '';
    const weNr      = we[WE_FIELDS.WE_NR] || '';

    // --- 5. Tokens — EXAKT die Custom-Variablen-Namen aus dem Template
    const fristTage = parseInt(process.env.RESERV_FRIST_TAGE || '14', 10);
    const ablaufDate = new Date(Date.now() + fristTage * 24 * 3600 * 1000);
    const ablaufStr  = ablaufDate.toLocaleDateString('de-DE');

    // Vertriebler-Name (Verkäufer) für Custom-Variable im Doc-Body
    const verkaeuferDisplay = (vertriebler[VERTRIEBLER_FIELDS.NAME] || 'Edgar Steininger').trim();
    // Heute-Datum für Workflow.CreatedDate-Override (Pre-fill-Box-Felder)
    const heute = new Date().toLocaleDateString('de-DE');
    // Vertriebler-Name auf First/Last splitten (für Standard-Recipient-Variables-Override)
    const vkParts = String(verkaeuferDisplay).trim().split(/\s+/);
    const verkaeuferFirst = vkParts[0] || 'Edgar';
    const verkaeuferLast  = vkParts.slice(1).join(' ') || 'Steininger';
    // Zentrale B&B-Mailbox als Verkäufer-Recipient-Mail (siehe Kommentar bei Recipients)
    const verkaeuferEmail = 'info@bub-immo.de';

    const tokens = [
      // --- Custom-Variables im Doc-Body (aus dem Template) ---
      { name: 'Ablauffrist.Reservierung',         value: ablaufStr },
      { name: 'Kaufpreis',                        value: formatEUR(kaufpreis) },
      { name: 'QmAnzahl.Wohnungsnummer',          value: composeQmWeNr(qm, weNr) },
      { name: 'Straße.Hausnummer.PLZ.Ort',        value: objektAdresse || 'Adresse beim Notar nachzutragen' },
      { name: 'Kaufinteressent.Vorname.Nachname', value: `${vorname} ${nachname}`.trim() },
      { name: 'Kaufinteressent.Ort',              value: kundeOrt || '' },
      { name: 'Verkäufer.Vorname.Nachname',       value: verkaeuferDisplay },

      // --- Standard-PandaDoc-Recipient-Variables manuell überschreiben ---
      // Diese werden in Pre-fill-Feldern (Signatur-Boxen) als „Default-Inhalt" angezeigt
      // und sind sonst nicht durch Recipient-Daten gefüllt. Wir setzen sie explizit als
      // Tokens, damit das Doc beim manuellen Send komplett ausgefüllt aussieht.
      { name: 'Kaufinteressent.FirstName',        value: vorname || '' },
      { name: 'Kaufinteressent.LastName',         value: nachname || '' },
      { name: 'Kaufinteressent.Email',            value: email || '' },
      { name: 'Kaufinteressent.StreetAddress',    value: kundeStrasse || '' },
      { name: 'Kaufinteressent.PostalCode',       value: kundePlz || '' },
      { name: 'Kaufinteressent.State',            value: kundeOrt || '' },
      { name: 'Kaufinteressent.City',             value: kundeOrt || '' },
      { name: 'Verkäufer.FirstName',              value: verkaeuferFirst },
      { name: 'Verkäufer.LastName',               value: verkaeuferLast },
      { name: 'Verkäufer.Name',                   value: verkaeuferDisplay },
      { name: 'Verkäufer.Nachname',               value: verkaeuferLast },
      { name: 'Verkäufer.Email',                  value: verkaeuferEmail },
      { name: 'Verkäufer.Company',                value: 'B&B Immo GmbH' },
      { name: 'Verkäufer.StreetAddress',          value: 'Burdastraße 23' },
      { name: 'Verkäufer.City',                   value: 'Schutterwald' },
      { name: 'Verkäufer.PostalCode',             value: '77746' },
      { name: 'Verkäufer.Country',                value: 'Deutschland' },

      // Workflow-Datum-Tokens (Pre-fill-Felder zeigen "Schutterwald, den [Workflow.CreatedDate]")
      { name: 'Workflow.CreatedDate',             value: heute },
      { name: 'Workflow.CreateDate',              value: heute }, // alternative Schreibweise im Template
    ];

    // --- 6. Recipients (sequenziell: Käufer zuerst, Vertriebler danach)
    // Adressfelder in den Recipient-Daten füllen automatisch die [Kaufinteressent.StreetAddress],
    // [Kaufinteressent.PostalCode], [Kaufinteressent.State]-Tokens im Template.
    //
    // Verkäufer-Mail ist BEWUSST hartkodiert: alle Reservierungen laufen über die zentrale
    // B&B-Mailbox info@bub-immo.de. Der ANZEIGENAME im Doc bleibt dynamisch aus dem
    // Airtable-Vertrieblerprofil (z.B. "Edgar Steininger" oder "Laurin Zimmerer") — so
    // sieht der Käufer wer der konkrete Ansprechpartner ist, aber alle Verkäufer-Mails
    // landen zentral. Spart pro-Vertriebler-PandaDoc-Accounts.

    const recipients = [
      {
        email: email,
        first_name: vorname,
        last_name:  nachname,
        role:       'Kaufinteressent',
        signing_order: 1,
        // PandaDoc-Standard-Adressfelder (Recipient-Variables im Template):
        street_address: kundeStrasse || undefined,
        city:           kundeOrt || undefined,
        postal_code:    kundePlz || undefined,
        state:          kundeOrt || undefined, // PandaDoc 'State' = Bundesland; mangels Feld nutzen wir Ort als Fallback
        country:        'Deutschland'
      },
      {
        email: verkaeuferEmail,
        first_name: verkaeuferFirst,
        last_name:  verkaeuferLast,
        role:       'Verkäufer',
        signing_order: 2,
        company:    'B&B Immo GmbH',
        street_address: 'Burdastraße 23',
        city:           'Schutterwald',
        postal_code:    '77746',
        country:        'Deutschland'
      }
    ];

    // --- 7. Document erstellen (Status wird async = "document.uploaded" → "document.draft")
    let document;
    try {
      const createResp = await fetch(`${PANDADOC_API}/documents`, {
        method: 'POST',
        headers: {
          'Authorization': `API-Key ${apiKey}`,
          'Content-Type':  'application/json'
        },
        body: JSON.stringify({
          name: `Reservierung – ${vorname} ${nachname} – WE ${weNr}`.trim(),
          template_uuid: templateId,
          recipients,
          tokens
        })
      });
      if (!createResp.ok) {
        const errText = await createResp.text();
        return res.status(502).json({ error: 'PandaDoc-Create fehlgeschlagen', detail: errText });
      }
      document = await createResp.json();
    } catch (e) {
      return res.status(502).json({ error: 'PandaDoc nicht erreichbar', detail: e.message });
    }

    // --- 8. Auf document.draft warten (1-5s typisch, max 10s)
    const docId = document.id;
    let ready = false;
    for (let i = 0; i < 10 && !ready; i++) {
      await new Promise(r => setTimeout(r, 1000));
      try {
        const statusResp = await fetch(`${PANDADOC_API}/documents/${docId}`, {
          headers: { 'Authorization': `API-Key ${apiKey}` }
        });
        const statusData = await statusResp.json();
        if (statusData.status === 'document.draft') ready = true;
      } catch (e) {}
    }
    // HYBRID-WORKFLOW: Wir senden das Doc NICHT automatisch via API — stattdessen
    // gibt das Backend die PandaDoc-Editor-URL zurück. Das Frontend öffnet den Tab
    // direkt am vorausgefüllten Doc, der Vertriebler prüft kurz und klickt im
    // PandaDoc-UI auf "Dokument senden". Vorteile:
    // - Umgeht Sandbox-„outside org"-Block (UI-Send hat diese Restriktion nicht)
    // - Vertriebler hat Sanity-Check vor Versand
    // - Sobald Production-Key da ist, können wir auf Auto-Send umstellen
    //
    // Polling auf document.draft ist nicht zwingend für den Editor — der Editor
    // wartet selbst. Wenn ready=false, weisen wir trotzdem auf den Editor hin.

    const editorUrl = `https://app.pandadoc.com/a/#/documents/${docId}`;

    // PandaDoc-DocId in Kunden-Notizen vermerken (Status: erstellt, manueller Send pendant)
    try {
      const oldNotizen = kunde[KUNDEN_FIELDS.NOTIZEN] || '';
      const stempel = new Date().toISOString().substring(0, 16).replace('T', ' ');
      const neueZeile = `[${stempel}] Reservierung erstellt für ${email} — PandaDoc-Doc: ${docId} (wartet auf manuellen Send)`;
      const neueNotizen = oldNotizen ? `${oldNotizen}\n${neueZeile}` : neueZeile;
      await airtable('update', TABLES.KUNDEN, {
        recordId: kundeId,
        fields: { [KUNDEN_FIELDS.NOTIZEN]: neueNotizen }
      });
    } catch (e) {
      // Notiz-Schreib-Fehler ist nicht tödlich; Doc ist im PandaDoc erstellt
    }

    return res.status(200).json({
      ok: true,
      message: ready
        ? 'Reservierungsdokument erstellt — öffne PandaDoc und klick „Dokument senden"'
        : 'Dokument wird im Hintergrund vorbereitet — öffne PandaDoc, dort steht es gleich versandbereit',
      pandadocDocumentId: docId,
      editorUrl,
      recipients: recipients.map(r => r.email),
      ablauffrist: ablaufStr
    });
  } catch (e) {
    return sendError(res, e);
  }
};

function formatEUR(n) {
  const num = parseFloat(n);
  if (!isFinite(num)) return '';
  return num.toLocaleString('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function composeQmWeNr(qm, weNr) {
  const parts = [];
  if (qm)   parts.push(`${qm} m²`);
  if (weNr) parts.push(`Wohnungs-Nr. ${weNr}`);
  return parts.join(', ') || '';
}
