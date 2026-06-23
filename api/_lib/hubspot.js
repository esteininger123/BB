// api/_lib/hubspot.js
// Liest Kontakte aus HubSpot (CRM v3 Search) für "Import on demand" beim Kunden-Anlegen.
// Nur lesend. Token via process.env.HUBSPOT_TOKEN — funktioniert mit Service-Key (BETA)
// ODER Legacy-Private-App-pat-Token, beide sind ein Bearer-Token gegen api.hubapi.com.

const HUBSPOT_API = process.env.HUBSPOT_API_BASE || 'https://api.hubapi.com';

// HubSpot-Kontakte haben oft den vollen Namen im firstname-Feld und lastname leer
// (Stichprobe 2026-06-23: 25 von 30 so). Aufteilung mit Default-Annahme
// "Vorname Nachname" — der Vertriebler sieht im Modal den Original-Namen und
// korrigiert die seltenen Ausreißer ("Nachname Vorname") vor dem Speichern.
function splitName(firstname, lastname) {
  const fn = String(firstname == null ? '' : firstname).trim().replace(/\s+/g, ' ');
  const ln = String(lastname == null ? '' : lastname).trim().replace(/\s+/g, ' ');
  if (ln) return { vorname: fn, nachname: ln };
  const parts = fn ? fn.split(' ') : [];
  if (parts.length >= 2) return { vorname: parts[0], nachname: parts.slice(1).join(' ') };
  return { vorname: fn, nachname: '' };
}

// Ein HubSpot-Record → flaches App-Objekt. rawName = HubSpot-Originalname zur Anzeige
// im Modal, damit der Vertriebler die Auto-Aufteilung gegenprüfen kann.
function mapContact(rec) {
  const p = (rec && rec.properties) || {};
  const fn = String(p.firstname == null ? '' : p.firstname).trim().replace(/\s+/g, ' ');
  const ln = String(p.lastname == null ? '' : p.lastname).trim().replace(/\s+/g, ' ');
  const { vorname, nachname } = splitName(fn, ln);
  const rawName = [fn, ln].filter(Boolean).join(' ').trim();
  return {
    id: rec && rec.id ? String(rec.id) : '',
    vorname,
    nachname,
    email: String(p.email == null ? '' : p.email).trim(),
    telefon: String(p.phone == null ? '' : p.phone).trim(),
    rawName,
  };
}

// Sucht Kontakte per CRM-Search-API. q leer → neueste Kontakte. Wirft bei
// HTTP-Fehler einen Error mit .status (502 = Upstream-Problem, z. B. Token/Scope).
async function searchContacts(token, query, limit) {
  const q = String(query == null ? '' : query).trim();
  const lim = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 20);
  const body = { properties: ['firstname', 'lastname', 'email', 'phone'], limit: lim };
  if (q) body.query = q;
  else body.sorts = [{ propertyName: 'lastmodifieddate', direction: 'DESCENDING' }];

  const resp = await fetch(HUBSPOT_API + '/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: { 'authorization': 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    let detail = '';
    try { const j = await resp.json(); detail = (j && (j.message || j.error)) || ''; } catch (_) {}
    const hint = (resp.status === 401 || resp.status === 403)
      ? ' — Token ungültig oder Scope crm.objects.contacts.read fehlt' : '';
    const err = new Error('HubSpot-Suche fehlgeschlagen (HTTP ' + resp.status + ')' + (detail ? ': ' + detail : '') + hint);
    err.status = 502;
    throw err;
  }
  const data = await resp.json();
  const results = (data && data.results) || [];
  return results.map(mapContact);
}

module.exports = { splitName, mapContact, searchContacts };
