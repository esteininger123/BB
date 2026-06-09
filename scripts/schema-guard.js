#!/usr/bin/env node
// Schema-Guard (BB Kalkulator V2)
// ---------------------------------------------------------------------------
// Prüft, ob JEDE Field-ID in api/_lib/tables.js noch in der echten Airtable-Base
// existiert. Verwaiste IDs (Feld in Airtable gelöscht, Konstante blieb stehen)
// sind die #1-Falle: ein listAll-Call auf so eine Tabelle scheitert mit 422 und
// das Frontend zeigt „Backend-Fehler" / „läuft mit Defaults" für ALLE Records.
//
// Nutzung:
//   AIRTABLE_TOKEN=pat... node scripts/schema-guard.js
//   (Token-Fallback: .env.local / .env-secrets.txt / ~/.airtable-token-bb.txt)
//
// Exit 0 = sauber, Exit 1 = verwaiste IDs gefunden (Push abbrechen).
// Token braucht den Scope `schema.bases:read`.
// ---------------------------------------------------------------------------

const fs = require('fs');
const os = require('os');
const path = require('path');
const t = require('../api/_lib/tables');

const BASE_ID = process.env.AIRTABLE_BASE_ID || 'appikHUetNyeonXBX';

// FIELDS-Objekt → Tabellen-ID (welche Konstanten gehören zu welcher Tabelle)
const FIELD_SETS = [
  ['VERTRIEBLER_FIELDS', t.VERTRIEBLER_FIELDS, t.TABLES.VERTRIEBLER],
  ['KUNDEN_FIELDS', t.KUNDEN_FIELDS, t.TABLES.KUNDEN],
  ['SNAPSHOT_FIELDS', t.SNAPSHOT_FIELDS, t.TABLES.SNAPSHOTS],
  ['WE_FIELDS', t.WE_FIELDS, t.TABLES.WOHNEINHEIT],
  ['PROJEKT_FIELDS', t.PROJEKT_FIELDS, t.TABLES.PROJEKT],
  ['PROJEKT_HEAD_FIELDS', t.PROJEKT_HEAD_FIELDS, t.TABLES.PROJEKT_HEAD],
  ['STELLPLATZ_FIELDS', t.STELLPLATZ_FIELDS, t.TABLES.STELLPLATZ],
  ['MIETVERTRAG_FIELDS', t.MIETVERTRAG_FIELDS, t.TABLES.MIETVERTRAG],
  ['MIETER_FIELDS', t.MIETER_FIELDS, t.TABLES.MIETER],
  ['KALK_STAMMDATEN_FIELDS', t.KALK_STAMMDATEN_FIELDS, t.TABLES.KALK_STAMMDATEN],
];

function resolveToken() {
  if (process.env.AIRTABLE_TOKEN) return process.env.AIRTABLE_TOKEN.trim();
  const candidates = [
    path.join(__dirname, '..', '.env.local'),
    path.join(__dirname, '..', '.env-secrets.txt'),
    path.join(os.homedir(), '.airtable-token-bb.txt'),
  ];
  for (const file of candidates) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const m = raw.match(/AIRTABLE_TOKEN\s*=\s*(\S+)/) || raw.match(/(pat[A-Za-z0-9._]+)/);
      if (m) return m[1].trim();
    } catch { /* weiter */ }
  }
  return null;
}

async function fetchLiveSchema(token) {
  const res = await fetch(`https://api.airtable.com/v0/meta/bases/${BASE_ID}/tables`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 403) {
    throw new Error('403 — Token braucht den Scope `schema.bases:read` (im Airtable-Token aktivieren).');
  }
  if (!res.ok) throw new Error(`Airtable Meta-API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const byTableId = {};
  for (const tbl of data.tables) {
    byTableId[tbl.id] = new Map(tbl.fields.map((f) => [f.id, f.name]));
  }
  return byTableId;
}

(async () => {
  const token = resolveToken();
  if (!token) {
    console.error('✖ Kein Airtable-Token gefunden. AIRTABLE_TOKEN setzen oder .env.local anlegen.');
    process.exit(2);
  }
  let live;
  try {
    live = await fetchLiveSchema(token);
  } catch (e) {
    console.error('✖ ' + e.message);
    process.exit(2);
  }

  const orphans = [];
  for (const [setName, fields, tableId] of FIELD_SETS) {
    const liveFields = live[tableId];
    if (!liveFields) {
      orphans.push(`${setName}: Tabelle ${tableId} existiert nicht (mehr) in der Base`);
      continue;
    }
    for (const [key, id] of Object.entries(fields)) {
      if (typeof id !== 'string' || !id.startsWith('fld')) continue;
      if (!liveFields.has(id)) {
        orphans.push(`${setName}.${key} = ${id}  → nicht in Airtable (verwaist)`);
      }
    }
  }

  if (orphans.length === 0) {
    console.log('✓ Schema-Guard: alle Field-IDs existieren in der Base. Sauber.');
    process.exit(0);
  }
  console.error(`✖ Schema-Guard: ${orphans.length} verwaiste Field-ID(s) — vor Push fixen:`);
  for (const o of orphans) console.error('   ' + o);
  console.error('\n→ Konstante aus tables.js entfernen (NICHT nur das Airtable-Feld), sonst 422 für die ganze Tabelle.');
  process.exit(1);
})();
