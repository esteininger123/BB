// scripts/migrate-kunden.js — kopiert die K/I-Records in die Kunden-Tabelle (mit Dedup),
// hängt deren Snapshots/Finanzierungsfälle auf die neuen Link-Felder um, setzt
// Phase=Bestandskäufer auf Alt-Käufer ohne Phase.
// Aufruf:  AIRTABLE_TOKEN=... node scripts/migrate-kunden.js          (Dry-Run)
//          AIRTABLE_TOKEN=... node scripts/migrate-kunden.js --commit (Live)
const https = require('https');
const { findDuplicate } = require('./migrate-lib');
const F = require('./field-ids.json');
const TOKEN = process.env.AIRTABLE_TOKEN, BASE = 'appikHUetNyeonXBX', COMMIT = process.argv.includes('--commit');
const T = { KUNDEN: 'tblHIy1hmbpxspQGW', KI: 'tbld0j0Mo7rre1Vh3', SNAP: 'tbliqxbITCdSjK0ua', FF: 'tblM4e4tDae2o9mQz' };
const N = F.kunden;
const KU = {
  NAME: 'fldUW2JYSMP5sOqM6', EMAIL: 'fldUkBbJTTEfeQB0J', TELEFON: 'fldkiGXTdmbOwodXj', NOTIZEN: 'fldXBVR7wFnxxd3d1',
  VORNAME: N['Vorname'], NACHNAME: N['Nachname'], GEBURTSDATUM: N['Geburtsdatum'], OWNER: N['Owner'], PHASE: N['Phase'],
  SA_JSON: N['Selbstauskunft-JSON'], STEUERSATZ: N['Steuersatz'], ARCHIVIERT: N['Archiviert'], LAST_ACTIVITY: N['Letzte-Aktivität'],
};
const KIF = {
  name: 'fldEyLcNBa1Xe3ISs', vorname: 'fldkRrN0cjBc7z4sx', nachname: 'fldjsUvoh3caONyYa', email: 'fldNXcwpC75MuGGhd',
  telefon: 'fldaOOiGNE2FVAQA9', gebdat: 'fldtdW7rfAXqbIu4q', owner: 'fld7gmCGOLVsW5S1W', phase: 'fldZIuFV6LcqodhEM',
  notizen: 'fldtpjO65JHIbUecZ', sajson: 'fldl94zd1Oeakj6pN', steuersatz: 'fldQpGCMkF8LhgTZm', archiv: 'fldHIc3gclVok2ggj',
  lastact: 'fldRghZ5CtIBw2rWn', snaps: 'fldD8Aa51l0Ii4iAu', ffs: 'fldIZITOXmztZbyed',
};
const PHASE_MAP = { // alte K/I-Phasen, die wir entfernen, → neue Welt
  'Kalkulation läuft': 'Lead', 'Selbstauskunft': 'Bank-Einreichung', 'Beurkundet': 'Bestandskäufer',
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const RATE = 250; // ms zwischen Schreib-Calls (≤ 5 req/s Airtable-Limit)

function api(method, path, body) {
  return new Promise((res, rej) => { const d = body ? JSON.stringify(body) : null;
    const r = https.request('https://api.airtable.com' + path, { method, headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json', ...(d ? { 'Content-Length': Buffer.byteLength(d) } : {}) } },
      x => { let b = ''; x.on('data', c => b += c); x.on('end', () => { let j = {}; try { j = b ? JSON.parse(b) : {}; } catch (_) {} x.statusCode < 300 ? res(j) : rej(new Error(x.statusCode + ' ' + b)); }); });
    r.on('error', rej); if (d) r.write(d); r.end(); });
}
async function listAll(tid) { let recs = [], off; do { const base = '?pageSize=100&returnFieldsByFieldId=true'; const q = off ? `${base}&offset=${off}` : base; const d = await api('GET', `/v0/${BASE}/${tid}${q}`); recs = recs.concat(d.records); off = d.offset; } while (off); return recs; }
function mapPhase(p) { return PHASE_MAP[p] || p || 'Lead'; }

(async () => {
  const kaeufer = await listAll(T.KUNDEN);
  const ki = await listAll(T.KI);
  console.log(`Kunden(Basis): ${kaeufer.length} · K/I: ${ki.length} · Modus: ${COMMIT ? 'LIVE' : 'DRY-RUN'}\n`);

  // 1) Alt-Käufer ohne Phase → Bestandskäufer
  let backfill = 0;
  for (const k of kaeufer) {
    if (!k.fields[KU.PHASE]) { backfill++;
      if (COMMIT) { await api('PATCH', `/v0/${BASE}/${T.KUNDEN}/${k.id}`, { fields: { [KU.PHASE]: 'Bestandskäufer' } }); await sleep(RATE); }
    }
  }
  console.log(`Phase=Bestandskäufer auf ${backfill} Alt-Käufer ${COMMIT ? 'gesetzt' : '(würde gesetzt)'}.\n`);

  // 2) K/I migrieren (Dedup → merge | sonst neu)
  const map = {}; let created = 0, merged = 0; const mergeReport = [];
  for (const r of ki) {
    const f = r.fields, dupId = findDuplicate(r, kaeufer);
    const appFields = {
      [KU.VORNAME]: f[KIF.vorname] || '', [KU.NACHNAME]: f[KIF.nachname] || '',
      [KU.EMAIL]: f[KIF.email] || '', [KU.TELEFON]: f[KIF.telefon] || '',
      [KU.GEBURTSDATUM]: f[KIF.gebdat] || null,
      [KU.SA_JSON]: f[KIF.sajson] || '', [KU.STEUERSATZ]: (typeof f[KIF.steuersatz] === 'number') ? f[KIF.steuersatz] : null,
      [KU.ARCHIVIERT]: !!f[KIF.archiv], [KU.LAST_ACTIVITY]: f[KIF.lastact] || null,
      [KU.OWNER]: Array.isArray(f[KIF.owner]) ? f[KIF.owner] : [],
    };
    if (dupId) {
      merged++; map[r.id] = dupId;
      const existing = kaeufer.find(k => k.id === dupId);
      const oldNote = existing.fields[KU.NOTIZEN] || '', kiNote = f[KIF.notizen] || '';
      const mergedNote = [oldNote, kiNote].filter(Boolean).join('\n---\n');
      const patch = { ...appFields, [KU.NOTIZEN]: mergedNote, [KU.PHASE]: 'Bestandskäufer' };
      mergeReport.push(`MERGE  "${f[KIF.name]}" → ${dupId} ("${existing.fields[KU.NAME]}")`);
      if (COMMIT) { await api('PATCH', `/v0/${BASE}/${T.KUNDEN}/${dupId}`, { fields: patch }); await sleep(RATE); }
    } else {
      created++;
      const fields = { ...appFields,
        [KU.NAME]: f[KIF.name] || ((f[KIF.vorname] || '') + ' ' + (f[KIF.nachname] || '')).trim(),
        [KU.NOTIZEN]: f[KIF.notizen] || '', [KU.PHASE]: mapPhase(f[KIF.phase]) };
      if (COMMIT) { const c = await api('POST', `/v0/${BASE}/${T.KUNDEN}`, { fields, typecast: true }); map[r.id] = c.id; await sleep(RATE); }
      else map[r.id] = '<<NEW>>';
    }
  }
  console.log(`Migration: ${created} neu, ${merged} zusammengeführt.`);
  mergeReport.forEach(l => console.log('  ' + l));

  // 3) Snapshots + Finanzierungsfälle umhängen
  let relSnap = 0, relFF = 0;
  for (const r of ki) {
    const target = map[r.id]; if (!target) continue;
    const writable = COMMIT && target !== '<<NEW>>'; // im Dry-Run nur zählen
    for (const sid of (r.fields[KIF.snaps] || [])) { relSnap++;
      if (writable) { await api('PATCH', `/v0/${BASE}/${T.SNAP}/${sid}`, { fields: { [F.snapshotsKundeNeu]: [target] } }); await sleep(RATE); } }
    for (const fid of (r.fields[KIF.ffs] || [])) { relFF++;
      if (writable) { await api('PATCH', `/v0/${BASE}/${T.FF}/${fid}`, { fields: { [F.ffKundeNeu]: [target] } }); await sleep(RATE); } }
  }
  console.log(`\nRe-Link: ${relSnap} Snapshots, ${relFF} Finanzierungsfälle ${COMMIT ? 'umgehängt' : '(würden umgehängt)'}.`);

  // 4) Validierung
  const expSnap = ki.reduce((a, r) => a + (r.fields[KIF.snaps] || []).length, 0);
  const expFF = ki.reduce((a, r) => a + (r.fields[KIF.ffs] || []).length, 0);
  console.log(`Erwartet laut K/I: ${expSnap} Snapshots, ${expFF} FF. ${(relSnap === expSnap && relFF === expFF) ? '✓ stimmig' : '✗ ABWEICHUNG'}`);
})().catch(e => { console.error(e); process.exit(1); });
