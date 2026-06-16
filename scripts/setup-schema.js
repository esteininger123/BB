// scripts/setup-schema.js — legt die für den Kunden-Merge nötigen Felder an (idempotent).
// Aufruf: AIRTABLE_TOKEN=... node scripts/setup-schema.js [--commit]
// Ohne --commit: Dry-Run (zeigt nur, was angelegt würde).
const https = require('https');
const fs = require('fs');
const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = 'appikHUetNyeonXBX';
const KUNDEN = 'tblHIy1hmbpxspQGW';
const VERTRIEBLER = 'tblXG135L28XocpeY';
const COMMIT = process.argv.includes('--commit');

function api(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = https.request('https://api.airtable.com' + path, {
      method, headers: {
        Authorization: 'Bearer ' + TOKEN,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    }, res => { let b = ''; res.on('data', c => b += c); res.on('end', () => {
      let j = {}; try { j = b ? JSON.parse(b) : {}; } catch (_) { j = { raw: b }; }
      res.statusCode < 300 ? resolve(j) : reject(new Error(res.statusCode + ' ' + b));
    }); });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}

const NEW_FIELDS = [
  { name: 'Vorname', type: 'singleLineText' },
  { name: 'Nachname', type: 'singleLineText' },
  { name: 'Geburtsdatum', type: 'date', options: { dateFormat: { name: 'european' } } },
  { name: 'Owner', type: 'multipleRecordLinks', options: { linkedTableId: VERTRIEBLER, prefersSingleRecordLink: true } },
  { name: 'Phase', type: 'singleSelect', options: { choices: [
      { name: 'Lead' }, { name: 'Reservierung' }, { name: 'Bank-Einreichung' },
      { name: 'Notar-Termin' }, { name: 'Bestandskäufer' }, { name: 'Abgebrochen' }
  ] } },
  { name: 'Selbstauskunft-JSON', type: 'multilineText' },
  { name: 'Steuersatz', type: 'percent', options: { precision: 2 } },
  { name: 'Archiviert', type: 'checkbox', options: { icon: 'check', color: 'grayBright' } },
  { name: 'Letzte-Aktivität', type: 'dateTime', options: { dateFormat: { name: 'european' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Berlin' } },
  { name: 'Erstellt-am', type: 'createdTime', options: { result: { type: 'dateTime', options: { dateFormat: { name: 'european' }, timeFormat: { name: '24hour' }, timeZone: 'Europe/Berlin' } } } },
];

(async () => {
  const meta = await api('GET', `/v0/meta/bases/${BASE}/tables`);
  const t = meta.tables.find(x => x.id === KUNDEN);
  const have = new Map(t.fields.map(f => [f.name, f.id]));
  const out = {}; const failed = [];
  for (const def of NEW_FIELDS) {
    if (have.has(def.name)) { out[def.name] = have.get(def.name); console.log(`= existiert: ${def.name} (${have.get(def.name)})`); continue; }
    if (!COMMIT) { console.log(`+ würde anlegen: ${def.name} (${def.type})`); continue; }
    try {
      const created = await api('POST', `/v0/meta/bases/${BASE}/tables/${KUNDEN}/fields`, def);
      out[def.name] = created.id; console.log(`+ angelegt: ${def.name} = ${created.id}`);
    } catch (e) { failed.push(def.name); console.error(`! FEHLER bei ${def.name}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 250));
  }
  if (COMMIT) {
    const existing = fs.existsSync('scripts/field-ids.json') ? JSON.parse(fs.readFileSync('scripts/field-ids.json')) : {};
    existing.kunden = { ...(existing.kunden || {}), ...out };
    fs.writeFileSync('scripts/field-ids.json', JSON.stringify(existing, null, 2));
    console.log('\n→ scripts/field-ids.json aktualisiert.');
    if (failed.length) console.log('⚠ Manuell nachzuziehen (UI):', failed.join(', '));
  }
})().catch(e => { console.error(e); process.exit(1); });
