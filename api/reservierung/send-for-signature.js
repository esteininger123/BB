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

const { verifySession, requireSafeOrigin } = require('../_lib/auth');
const { airtable, listAll } = require('../_lib/airtable');
const { appendActivityZeile } = require('../_lib/notizen');
const { readBody, methodNotAllowed, sendError } = require('../_lib/http');
const {
  TABLES, KUNDEN_FIELDS, WE_FIELDS, SNAPSHOT_FIELDS,
  PROJEKT_FIELDS, VERTRIEBLER_FIELDS, STELLPLATZ_FIELDS
} = require('../_lib/tables');

const PANDADOC_API = 'https://api.pandadoc.com/public/v1';

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);

  // QA-Fix 2026-05-23 (Audit-DD-1): CSRF-Schutz. PandaDoc-Send kostet Quota
  // und sendet realen Vertrag — strikt schützen.
  if (!requireSafeOrigin(req, res)) return;

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

    // QA-Fix 2026-05-23 (Audit B-1 BLOCKER): Robuste Owner-Normalisierung wie in
    // canAccess (kunden/[id].js) und canAccessKunde (snapshots.js). Vorher
    // schlug includes() bei Owner als {id, name}-Object oder Display-Name fehl
    // → Vertriebler bekamen 403 auf EIGENE Kunden → keine Reservierung möglich.
    if (session.rolle !== 'Admin') {
      const ownersRaw = (kundeRec.fields && kundeRec.fields[KUNDEN_FIELDS.OWNER]) || [];
      const ownerIds = Array.isArray(ownersRaw)
        ? ownersRaw.map(o => (o && typeof o === 'object') ? o.id : (typeof o === 'string' && o.startsWith('rec') ? o : null)).filter(Boolean)
        : [];
      if (!ownerIds.includes(session.vertrieblerId)) {
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

    const wohnungsPreis = parseFloat(we[WE_FIELDS.KAUFPREIS]) || 0;
    const qm        = we[WE_FIELDS.QM]    || '';
    const weNr      = we[WE_FIELDS.WE_NR] || '';

    // --- 4b. Stellplätze (Garagen / Außenstellplätze) zur WE laden
    // Jede WE kann 0–N verlinkte Stellplätze haben (siehe SOP-E).
    // Wir laden alle Stellplätze (mit returnFieldsByFieldId=true) und filtern clientseitig
    // nach WE_LINK — filterByFormula mit Field-IDs greift nicht zuverlässig.
    let stellplaetze = [];
    try {
      // QA-Fix 2026-05-22 (Audit-B B5): Cap von 500 auf 5000 erhöht.
      // Spechtweg-Deal hat 114 WE × bis zu 2-3 Stellplätze + andere Projekte
      // → der 500er-Cap war im realistischen Lastraum eng. listAll iteriert
      // ohnehin clientseitig — kein Risiko ausser etwas mehr Speicher.
      const allStpl = await listAll(TABLES.STELLPLATZ, {}, 5000);
      stellplaetze = allStpl
        .filter(rec => {
          const links = (rec.fields && rec.fields[STELLPLATZ_FIELDS.WE_LINK]) || [];
          return Array.isArray(links) && links.includes(weId);
        })
        .map(rec => {
          const f = rec.fields || {};
          const titel = f[STELLPLATZ_FIELDS.TITEL] || '';
          const typ   = f[STELLPLATZ_FIELDS.TYP] || ''; // "Garage" / "Fläche"
          const preis = parseFloat(f[STELLPLATZ_FIELDS.KAUFPREIS]) || 0;
          return { id: rec.id, titel, typ, preis };
        });
    } catch (e) {
      // Stellplatz-Lade-Fehler ist nicht tödlich — Doc bekommt halt nur Wohnung
    }

    const stellplatzPreis = stellplaetze.reduce((sum, s) => sum + s.preis, 0);
    const hatStellplatz   = stellplaetze.length > 0 && stellplatzPreis > 0;

    // Snapshot-Kaufpreis hat Vorrang (eingefrorener Preis aus Kalkulation),
    // sonst Wohnung + Stellplatz aus Live-Daten
    const kaufpreis = (snapKalk && snapKalk.kaufpreis) || (wohnungsPreis + stellplatzPreis) || 0;

    // --- 4c. Mietsubvention aus Snapshot-Kalkulation (subventionPhasen / subventionMo+Monate)
    let mietsubventionTotal = 0;
    let mietsubventionBeschreibung = '';
    let mietsubventionBlock = '';
    if (snapKalk) {
      const rawPhasen = Array.isArray(snapKalk.subventionPhasen) ? snapKalk.subventionPhasen : [];
      const phasen = rawPhasen.length > 0
        ? rawPhasen
        : (parseFloat(snapKalk.subventionMo) > 0 && parseInt(snapKalk.subventionMonate) > 0
            ? [{ mo: parseFloat(snapKalk.subventionMo), monate: parseInt(snapKalk.subventionMonate), label: 'Mietsubvention' }]
            : []);
      // 2026-06-01: Subventionsregler-Faktor berücksichtigen — sonst zeigt das Reservierungs-Doc
      // die volle nominale Subvention, obwohl der Vertriebler sie per Regler reduziert hat (Haftung!).
      const _subvFaktor = (typeof snapKalk.subventionFaktor === 'number' && isFinite(snapKalk.subventionFaktor)) ? snapKalk.subventionFaktor : 1;
      // Total aus Vorberechnung oder neu berechnen — jeweils mit Regler-Faktor skaliert
      if (typeof snapKalk._subventionTotalEur === 'number' && snapKalk._subventionTotalEur > 0) {
        mietsubventionTotal = snapKalk._subventionTotalEur * _subvFaktor;
      } else if (phasen.length > 0) {
        mietsubventionTotal = phasen.reduce((sum, p) => sum + (parseFloat(p.mo) || 0) * (parseInt(p.monate) || 0), 0) * _subvFaktor;
      }
      if (phasen.length > 0 && mietsubventionTotal > 0) {
        // Beschreibung: "60,23 €/Monat × 12 Monate" (eine Phase) oder "X + Y" (mehrere)
        // Labels wie "Manuell (Override)" sind interne Kalkulator-Infos und
        // gehören NICHT ins Kunden-Doc — wir lassen sie hier weg.
        mietsubventionBeschreibung = phasen.map(p => {
          const mo = formatEUR((parseFloat(p.mo) || 0) * _subvFaktor);
          const monate = parseInt(p.monate) || 0;
          return `${mo}/Monat × ${monate} Monate`;
        }).join(' + ');
        // Vorgefertigter Satz für direktes Einfügen ins Template
        mietsubventionBlock = `Zusätzlich enthält diese Reservierung eine Mietsubvention von ${formatEUR(mietsubventionTotal)} (${mietsubventionBeschreibung}).`;
      }
    }

    // --- 5. Tokens — EXAKT die Custom-Variablen-Namen aus dem Template
    // FS-3b (Audit SA P2 25.05.2026): Frist + Heute-Datum explizit in Europe/Berlin
    // formatieren — sonst rechnete der Vercel-UTC-Server die Frist eine Nacht zu
    // früh, wenn der Vertriebler abends ab ~22:00 deutsche Zeit auf „Senden" klickt
    // (UTC ist schon der Folgetag). Der Käufer sah dann eine andere Frist als der
    // Vertriebler in seinem Kalender.
    const fristTage = parseInt(process.env.RESERV_FRIST_TAGE || '14', 10);
    const ablaufDate = new Date(Date.now() + fristTage * 24 * 3600 * 1000);
    const ablaufStr  = ablaufDate.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });

    // Vertriebler-Name (Verkäufer) für Custom-Variable im Doc-Body
    const verkaeuferDisplay = (vertriebler[VERTRIEBLER_FIELDS.NAME] || 'Edgar Steininger').trim();
    // Heute-Datum für Workflow.CreatedDate-Override (Pre-fill-Box-Felder)
    const heute = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' });
    // Vertriebler-Name auf First/Last splitten (für Standard-Recipient-Variables-Override)
    const vkParts = String(verkaeuferDisplay).trim().split(/\s+/);
    const verkaeuferFirst = vkParts[0] || 'Edgar';
    const verkaeuferLast  = vkParts.slice(1).join(' ') || 'Steininger';
    // Zentrale B&B-Mailbox als Verkäufer-Recipient-Mail (siehe Kommentar bei Recipients)
    const verkaeuferEmail = 'info@bub-immo.de';

    const tokens = [
      // --- Custom-Variables im Doc-Body (aus dem Template) ---
      { name: 'Ablauffrist.Reservierung',         value: ablaufStr },
      { name: 'Kaufpreis',                        value: composeKaufpreis(wohnungsPreis, stellplaetze, snapKalk && snapKalk.kaufpreis) },
      { name: 'QmAnzahl.Wohnungsnummer',          value: composeQmWeNr(qm, weNr, stellplaetze) },
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
      // 2026-06-16: StreetAddress/PostalCode sind in PandaDoc Empfänger-KONTAKT-Variablen
      //   (englische Standardnamen) und füllen sich NICHT aus den Inline-Recipient-Adressfeldern
      //   — anders als FirstName/LastName. Lösung: eigene Custom-Variablen wie Kaufinteressent.Ort
      //   (die funktioniert). Template nutzt jetzt [Kaufinteressent.Strasse] / [Kaufinteressent.PLZ].
      { name: 'Kaufinteressent.Strasse',          value: kundeStrasse || '' },
      { name: 'Kaufinteressent.PLZ',              value: kundePlz || '' },
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
      // Reservierungs-Datum als sauberer Custom-Token — falls Edgar im Template die Pre-fill-Boxen
      // durch normalen Text mit [Reservierung.Datum] ersetzt (siehe STAND_NACH_NACHTSESSION.md)
      { name: 'Reservierung.Datum',               value: heute },

      // --- Mietsubvention (aus Snapshot-kalkJson) ---
      // Drei Token-Varianten, je nach Template-Bedarf:
      // - Mietsubvention.Total:        nur die Summe, z.B. "722,76 €"
      // - Mietsubvention.Beschreibung: nur die Aufteilung, z.B. "60,23 €/Monat × 12 Monate"
      // - Mietsubvention.Block:        ganzer Satz, erscheint nur wenn Subvention existiert.
      //                                Edgar fügt einfach [Mietsubvention.Block] ins Template
      //                                ein — wenn keine Subvention da ist, bleibt der Platz leer.
      //
      // WICHTIG: Bei leerem Wert nutzen wir ein Zero-Width-Space (​). PandaDoc rendert
      // leere String-Tokens NICHT (zeigt stattdessen den Roh-Tag wie "[Mietsubvention.Block]"),
      // ein nicht-leerer String wird aber sauber ersetzt. Zero-Width-Space ist unsichtbar.
      { name: 'Mietsubvention.Total',             value: mietsubventionTotal > 0 ? formatEUR(mietsubventionTotal) : '​' },
      { name: 'Mietsubvention.Beschreibung',      value: mietsubventionBeschreibung || '​' },
      { name: 'Mietsubvention.Block',             value: mietsubventionBlock || '​' },
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

    // Iter-3 R3 (21.05.2026): EU-Tenant-Fallback. Default ist app.pandadoc.com (US),
    // bei EU-Tenant `app.eu.pandadoc.com`. Edgars Account ist aktuell US, aber wenn
    // Anthropic später auf EU-PandaDoc wechselt, reicht Env-Var PANDADOC_EDITOR_HOST.
    const editorHost = process.env.PANDADOC_EDITOR_HOST || 'app.pandadoc.com';
    const editorUrl = `https://${editorHost}/a/#/documents/${docId}`;

    // PandaDoc-DocId in Kunden-Notizen vermerken — via gemeinsamer Helper-Lib
    // (FS-1 24.05.: Re-Read + Block-aware Insert, fixt Race vs. parallele Frontend-Saves
    // während der PDF-Generation).
    try {
      const stempel = new Date().toISOString().substring(0, 16).replace('T', ' ');
      const zeile = `[${stempel}] Reservierung erstellt für ${email} — PandaDoc-Doc: ${docId} (wartet auf manuellen Send)`;
      await appendActivityZeile(kundeId, zeile);
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
  // QA-Fix 2026-05-23 (Audit-AA-1/AA-7): Ganzzahlig formatieren wie App + PDF
  // (kalkulator.js fmtEur). Vorher zeigte PandaDoc-Doc Cents (200.000,00 €),
  // App + PDF zeigten ohne (200.000 €) → Käufer sieht Drift im Side-by-Side.
  const num = parseFloat(n);
  if (!isFinite(num)) return '';
  return Math.round(num).toLocaleString('de-DE') + ' €';
}

function composeQmWeNr(qm, weNr, stellplaetze) {
  const parts = [];
  if (qm)   parts.push(`${qm} m²`);
  if (weNr) parts.push(`Wohnungs-Nr. ${weNr}`);
  // Stellplatz-Suffix anhängen, falls vorhanden — z.B. "+ Garage Nr. 5"
  if (Array.isArray(stellplaetze) && stellplaetze.length > 0) {
    for (const s of stellplaetze) {
      if (!s) continue;
      const typ = s.typ || 'Stellplatz';
      // Iter-2 (21.05.2026): Stellplatz-Nummer aus Titel extrahieren — robuster als vorher.
      // Erwartetes Hauptformat: "StPl: 207, 5, Garage" → "5".
      // Fallback 1: "StPl: 207, 5/A, Garage" oder ähnliches → alles vor dem nächsten Komma.
      // Fallback 2: Wenn kein "StPl:"-Prefix vorhanden ist, prüfe einfache Muster
      // wie "Garage 5", "Stellplatz 12B", "Nr. 7" — Nummer/Bezeichnung am Ende.
      // Wenn keiner greift, lassen wir die Nummer leer (besser kein Suffix als falsche Nummer).
      let nr = '';
      const titel = (s.titel || '').trim();
      const m1 = titel.match(/StPl:\s*\d+,\s*([^,]+?)\s*,/);
      if (m1) {
        nr = m1[1].trim();
      } else {
        const m2 = titel.match(/(?:Nr\.?|Garage|Stellplatz|Platz)\s*([\w\/-]+)/i);
        if (m2) nr = m2[1].trim();
      }
      parts.push(`+ ${typ}${nr ? ' Nr. ' + nr : ''}`);
    }
  }
  return parts.join(', ') || '';
}

function composeKaufpreis(wohnungsPreis, stellplaetze, snapKaufpreis) {
  // QA-Fix 2026-05-23 (Audit-X1): Snapshot-Kaufpreis ist NUR Wohnungspreis (ohne
  // Stellplatz). Vorher wurde der bevorzugt → KAV-Doc zeigte unvollständigen Preis.
  // Fix: auch bei Snapshot-Preis Stellplätze dazurechnen.
  const stellplatzPreis = (stellplaetze || []).reduce((sum, s) => sum + (s && s.preis ? s.preis : 0), 0);
  const whgPreis = (snapKaufpreis && snapKaufpreis > 0) ? snapKaufpreis : (wohnungsPreis || 0);
  const gesamt = whgPreis + stellplatzPreis;
  if (stellplatzPreis <= 0) {
    return formatEUR(whgPreis);
  }
  const stplLabel = stellplaetze.length === 1 ? (stellplaetze[0].typ || 'Stellplatz') : 'Stellplätze';
  return `${formatEUR(whgPreis)} (Wohnung) + ${formatEUR(stellplatzPreis)} (${stplLabel}) = ${formatEUR(gesamt)}`;
}
