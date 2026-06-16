# Merge „Käufer" + „Kunden/Interessenten" — Umsetzungsplan (Kern-Merge)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Airtable-Tabellen „Käufer" (123) und „Kunden/Interessenten" (54) zu **einer** Tabelle „Kunden" verschmelzen — App, Snapshots, Finanzierungsfall laufen weiter, die operative Verkauft-WE-/Liqui-Kette bleibt unberührt.

**Architecture:** Ansatz **A** — die physische Käufer-Tabelle (`tblHIy1hmbpxspQGW`) überlebt und wird „Kunden". Die App zieht per Field-ID-Umstellung auf diese Tabelle um. Ein einmaliges, idempotentes Node-Migrationsskript kopiert die 54 K/I-Records rein (mit Dedup) und hängt deren Snapshots/Finanzierungsfälle auf die neuen Records um. Cutover läuft Branch → Preview → main im Schreib-Freeze.

**Tech Stack:** Vanilla-JS-SPA (kein Build), Vercel Serverless (Node 20), Airtable REST + Metadata API, `node --test`.

**Referenz-Spec:** `docs/2026-06-16_Merge-Kunden-Kaeufer-Spec.md`

**Scope:** Nur **Kern-Merge** (Spec §6 Schritte 0–5). Die Komfort-Automationen (SEV-Häkchen, WE-Status-Kopplung) sind ein **separater Folge-Plan** (Spec §6 Schritt 6), 1 Woche später.

---

## Konstanten (verifiziert 2026-06-16)

```
BASE                = appikHUetNyeonXBX
KÄUFER (→ "Kunden") = tblHIy1hmbpxspQGW
K/I (Quelle)        = tbld0j0Mo7rre1Vh3
SNAPSHOTS           = tbliqxbITCdSjK0ua
FINANZIERUNGSFALL   = tblM4e4tDae2o9mQz
VERTRIEBLER         = tblXG135L28XocpeY

# Käufer-Felder (vorhanden, werden wiederverwendet)
Käufer.Name          = fldUW2JYSMP5sOqM6   (Primary)
Käufer.E-Mail        = fldUkBbJTTEfeQB0J   → KUNDEN_FIELDS.EMAIL
Käufer.Telefon       = fldkiGXTdmbOwodXj   → KUNDEN_FIELDS.TELEFON
Käufer.Notizen       = fldXBVR7wFnxxd3d1   → KUNDEN_FIELDS.NOTIZEN
Käufer.Verkauft-WE   = fldiB6j8yF5pZaXgq   (Link, bleibt)
Käufer.WEG-Verwaltung= fldynq1lMAQC1QgT8   (LÖSCHEN, 0/123)

# K/I-Quellfelder (für die Migration)
KI.Name=fldEyLcNBa1Xe3ISs  KI.Vorname=fldkRrN0cjBc7z4sx  KI.Nachname=fldjsUvoh3caONyYa
KI.Email=fldNXcwpC75MuGGhd KI.Telefon=fldaOOiGNE2FVAQA9  KI.Geburtsdatum=fldtdW7rfAXqbIu4q
KI.Owner=fld7gmCGOLVsW5S1W KI.Phase=fldZIuFV6LcqodhEM     KI.Notizen=fldtpjO65JHIbUecZ
KI.SA-JSON=fldl94zd1Oeakj6pN KI.Steuersatz=fldQpGCMkF8LhgTZm KI.Archiviert=fldHIc3gclVok2ggj
KI.Letzte-Aktivität=fldRghZ5CtIBw2rWn
KI.→Snapshots(inv)=fldD8Aa51l0Ii4iAu   KI.→Finanzierungsfall(inv)=fldIZITOXmztZbyed

# Bestehende Links auf die ALTE K/I-Tabelle (werden ersetzt)
Snapshots.Kunde → K/I = fldk6jkQu6UEIFv6T
Finanzierungsfall.Kunde → K/I = fldE6949ttL6XNSqX

# Field-IDs der NEU anzulegenden Felder → entstehen in Task 1/2, landen in scripts/field-ids.json
```

**Token:** `~/.airtable-token-stein.txt` (read-only lesen, nie loggen/committen).

---

## Task 0: Backup & Base-Snapshot (Sicherheits-Gate)

**Files:** Create `backups/2026-06-16/` (lokal, **nicht** committen)

- [ ] **Step 1: Backup-Ordner anlegen + .gitignore**

```bash
cd /Users/edgarstein/Documents/Claude/02_BB_Immo/BB-Backstube/webapp-v2
mkdir -p backups/2026-06-16
grep -qxF 'backups/' .gitignore || echo 'backups/' >> .gitignore
```

- [ ] **Step 2: Rohdaten der 4 betroffenen Tabellen exportieren (JSON)**

```bash
TOKEN=$(cat ~/.airtable-token-stein.txt | tr -d '\n')
for T in tblHIy1hmbpxspQGW tbld0j0Mo7rre1Vh3 tbliqxbITCdSjK0ua tblM4e4tDae2o9mQz; do
  python3 - "$T" <<'PY'
import os,sys,json,urllib.request,urllib.parse
tok=os.environ["TOKEN"]; tid=sys.argv[1]; recs=[]; off=None
while True:
    q={"pageSize":"100"}; off and q.update(offset=off)
    u="https://api.airtable.com/v0/appikHUetNyeonXBX/%s?%s"%(tid,urllib.parse.urlencode(q))
    d=json.load(urllib.request.urlopen(urllib.request.Request(u,headers={"Authorization":"Bearer "+tok})))
    recs+=d["records"]; off=d.get("offset")
    if not off: break
json.dump(recs, open("backups/2026-06-16/%s.json"%tid,"w"), ensure_ascii=False, indent=1)
print("%s: %d Records gesichert"%(tid,len(recs)))
PY
done
```
Expected: `tblHIy...: 123`, `tbld0j...: 54`, `tbliqx...: ~N`, `tblM4e...: ~N`.

- [ ] **Step 3: Base-Snapshot in Airtable-UI ziehen**

Manuell: Base „Objektmanagement" → oben rechts `…` → **Snapshots** → „Take snapshot now". Benennen: `vor-merge-kunden-2026-06-16`.
Verifikation: Snapshot erscheint in der Liste mit heutigem Datum.

- [ ] **Step 4: Commit (nur .gitignore)**

```bash
git add .gitignore && git commit -m "chore: backups/ ignorieren (Merge-Vorbereitung)"
```

---

## Task 1: Schema — neue Felder auf der Käufer-Tabelle anlegen

**Files:** Create `scripts/setup-schema.js`

- [ ] **Step 1: Setup-Skript schreiben**

```javascript
// scripts/setup-schema.js — legt die für den Merge nötigen Felder/Links an (idempotent).
// Aufruf: AIRTABLE_TOKEN=... node scripts/setup-schema.js [--commit]
// Ohne --commit: nur anzeigen, was angelegt würde (Dry-Run).
const https = require('https');
const TOKEN = process.env.AIRTABLE_TOKEN;
const BASE = 'appikHUetNyeonXBX';
const KUNDEN = 'tblHIy1hmbpxspQGW';
const SNAPSHOTS = 'tbliqxbITCdSjK0ua';
const FF = 'tblM4e4tDae2o9mQz';
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
      const j = b ? JSON.parse(b) : {};
      res.statusCode < 300 ? resolve(j) : reject(new Error(res.statusCode + ' ' + b));
    }); });
    req.on('error', reject); if (data) req.write(data); req.end();
  });
}

// Felder, die auf der Kunden(=Käufer)-Tabelle fehlen und neu müssen:
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

async function ensureFields(tableId, defs) {
  const meta = await api('GET', `/v0/meta/bases/${BASE}/tables`);
  const t = meta.tables.find(x => x.id === tableId);
  const have = new Map(t.fields.map(f => [f.name, f.id]));
  const out = {};
  for (const def of defs) {
    if (have.has(def.name)) { out[def.name] = have.get(def.name); console.log(`= ${t.name}.${def.name} existiert (${have.get(def.name)})`); continue; }
    if (!COMMIT) { console.log(`+ würde anlegen: ${t.name}.${def.name} (${def.type})`); out[def.name] = '<<NEW>>'; continue; }
    const created = await api('POST', `/v0/meta/bases/${BASE}/tables/${tableId}/fields`, def);
    out[def.name] = created.id; console.log(`+ angelegt: ${t.name}.${def.name} = ${created.id}`);
  }
  return out;
}

(async () => {
  const kundenFields = await ensureFields(KUNDEN, NEW_FIELDS);
  // Typ-Formel braucht das Phase-Feld → separat NACH Phase anlegen (Task 2).
  const fs = require('fs');
  fs.mkdirSync('scripts', { recursive: true });
  fs.writeFileSync('scripts/field-ids.json', JSON.stringify({ kunden: kundenFields }, null, 2));
  console.log('\n→ scripts/field-ids.json geschrieben.');
})().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Dry-Run (zeigt, was angelegt würde — kein Schreibzugriff)**

```bash
AIRTABLE_TOKEN=$(cat ~/.airtable-token-stein.txt | tr -d '\n') node scripts/setup-schema.js
```
Expected: 10 Zeilen `+ würde anlegen: Käufer.Vorname …` (oder `=` falls schon da).

- [ ] **Step 3: Live anlegen**

```bash
AIRTABLE_TOKEN=$(cat ~/.airtable-token-stein.txt | tr -d '\n') node scripts/setup-schema.js --commit
```
Expected: `+ angelegt: Käufer.Vorname = fld…` für alle 10; `scripts/field-ids.json` existiert.
> **Fallback:** Lehnt die API `createdTime` ab, in der Airtable-UI manuell ein „Created time"-Feld **„Erstellt-am"** anlegen und dessen ID in `scripts/field-ids.json` unter `"Erstellt-am"` eintragen.

- [ ] **Step 4: Verifizieren**

```bash
cat scripts/field-ids.json
```
Expected: JSON mit 10 echten `fld…`-IDs unter `kunden`.

- [ ] **Step 5: Commit**

```bash
git add scripts/setup-schema.js && git commit -m "feat: Schema-Setup-Skript für Kunden-Merge (Felder anlegen)"
```
*(field-ids.json wird in Task 3 mitcommittet.)*

---

## Task 2: Schema — Typ-Formel, neue Link-Felder, Tabelle umbenennen

**Files:** Modify `scripts/setup-schema.js` (zweiter Block) ODER manuell per UI

- [ ] **Step 1: Typ-Formelfeld auf Kunden anlegen**

```bash
TOKEN=$(cat ~/.airtable-token-stein.txt | tr -d '\n')
curl -s -X POST "https://api.airtable.com/v0/meta/bases/appikHUetNyeonXBX/tables/tblHIy1hmbpxspQGW/fields" \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -d '{"name":"Typ","type":"formula","options":{"formula":"IF({Phase}=\"Abgebrochen\",\"Abgebrochen\",IF({Phase}=\"Bestandskäufer\",\"Käufer\",\"Interessent\"))"}}' \
 | python3 -c 'import sys,json;d=json.load(sys.stdin);print("Typ =",d.get("id",d))'
```
Expected: `Typ = fld…`

- [ ] **Step 2: Neues Link-Feld „Kunde" auf der Snapshots-Tabelle → Kunden**

```bash
curl -s -X POST "https://api.airtable.com/v0/meta/bases/appikHUetNyeonXBX/tables/tbliqxbITCdSjK0ua/fields" \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -d '{"name":"Kunde (neu)","type":"multipleRecordLinks","options":{"linkedTableId":"tblHIy1hmbpxspQGW","prefersSingleRecordLink":true}}' \
 | python3 -c 'import sys,json;d=json.load(sys.stdin);print("Snapshots.Kunde(neu) =",d.get("id",d))'
```
Expected: `Snapshots.Kunde(neu) = fld…`

- [ ] **Step 3: Neues Link-Feld „Kunde" auf der Finanzierungsfall-Tabelle → Kunden**

```bash
curl -s -X POST "https://api.airtable.com/v0/meta/bases/appikHUetNyeonXBX/tables/tblM4e4tDae2o9mQz/fields" \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -d '{"name":"Kunde (neu)","type":"multipleRecordLinks","options":{"linkedTableId":"tblHIy1hmbpxspQGW","prefersSingleRecordLink":true}}' \
 | python3 -c 'import sys,json;d=json.load(sys.stdin);print("FF.Kunde(neu) =",d.get("id",d))'
```
Expected: `FF.Kunde(neu) = fld…`

- [ ] **Step 4: Tabelle „Käufer" → „Kunden" umbenennen**

```bash
curl -s -X PATCH "https://api.airtable.com/v0/meta/bases/appikHUetNyeonXBX/tables/tblHIy1hmbpxspQGW" \
 -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
 -d '{"name":"Kunden"}' \
 | python3 -c 'import sys,json;d=json.load(sys.stdin);print("Tabelle umbenannt:",d.get("name",d))'
```
Expected: `Tabelle umbenannt: Kunden`

---

## Task 3: Field-ID-Manifest vervollständigen + tables.js-Block generieren

**Files:** Modify `scripts/field-ids.json`; Create `scripts/print-tables-block.js`

- [ ] **Step 1: Die 3 neuen Link-/Formel-IDs aus Task 2 in field-ids.json eintragen**

Trage die in Task 2 ausgegebenen IDs manuell ein:
```json
{
  "kunden": { "...": "aus Task 1" , "Typ": "fld… (Task 2/1)" },
  "snapshotsKundeNeu": "fld… (Task 2/2)",
  "ffKundeNeu": "fld… (Task 2/3)"
}
```

- [ ] **Step 2: Skript schreiben, das den fertigen tables.js-Block druckt**

```javascript
// scripts/print-tables-block.js — druckt die KUNDEN_FIELDS + Link-IDs zum Einfügen in tables.js
const ids = require('./field-ids.json').kunden;
const g = n => ids[n] || '<<FEHLT:' + n + '>>';
console.log(`  KUNDEN:      'tblHIy1hmbpxspQGW',   // war tbld0j0Mo7rre1Vh3 (alte K/I-Tabelle)`);
console.log(`
const KUNDEN_FIELDS = {
  NAME:           'fldUW2JYSMP5sOqM6',   // Käufer.Name (Primary)
  VORNAME:        '${g('Vorname')}',
  NACHNAME:       '${g('Nachname')}',
  EMAIL:          'fldUkBbJTTEfeQB0J',   // Käufer.E-Mail
  TELEFON:        'fldkiGXTdmbOwodXj',   // Käufer.Telefon
  GEBURTSDATUM:   '${g('Geburtsdatum')}',
  OWNER:          '${g('Owner')}',
  PHASE:          '${g('Phase')}',
  NOTIZEN:        'fldXBVR7wFnxxd3d1',   // Käufer.Notizen
  SA_JSON:        '${g('Selbstauskunft-JSON')}',
  CREATED:        '${g('Erstellt-am')}',
  LAST_ACTIVITY:  '${g('Letzte-Aktivität')}',
  ARCHIVIERT:     '${g('Archiviert')}',
  STEUERSATZ:     '${g('Steuersatz')}',
};`);
const lid = require('./field-ids.json');
console.log(`\n// SNAPSHOT_FIELDS.KUNDE: '${lid.snapshotsKundeNeu}'`);
console.log(`// FINANZIERUNGSFALL_FIELDS.KUNDE: '${lid.ffKundeNeu}'`);
```

- [ ] **Step 3: Block erzeugen + sichten**

```bash
node scripts/print-tables-block.js
```
Expected: vollständiger `KUNDEN_FIELDS`-Block mit echten IDs, keine `<<FEHLT:…>>`.

- [ ] **Step 4: Commit**

```bash
git add scripts/field-ids.json scripts/print-tables-block.js
git commit -m "chore: Field-ID-Manifest + tables.js-Block-Generator"
```

---

## Task 4: Migrationsskript — reine Funktionen (TDD)

**Files:** Create `scripts/migrate-lib.js`; Test `tests/migrate-lib.test.js`

- [ ] **Step 1: Failing-Test schreiben**

```javascript
// tests/migrate-lib.test.js
const test = require('node:test');
const assert = require('node:assert');
const { normEmail, sameName, findDuplicate } = require('../scripts/migrate-lib');

test('normEmail trimmt + lowercased', () => {
  assert.equal(normEmail('  Foo@Bar.DE '), 'foo@bar.de');
  assert.equal(normEmail(null), '');
});

test('sameName: exakter Vor+Nachname (case-insensitiv)', () => {
  assert.equal(sameName('andreas','walther','Andreas','Walther'), true);
  assert.equal(sameName('ken','müller','Ken','Schmidt'), false);
});

test('findDuplicate matcht zuerst per E-Mail', () => {
  const kaeufer = [
    { id: 'recA', fields: { 'fldUkBbJTTEfeQB0J': 'akim.ziegert@gmail.com', 'fldUW2JYSMP5sOqM6': 'Akim Ziegert' } },
  ];
  const ki = { fields: { 'fldNXcwpC75MuGGhd': 'AKIM.ziegert@gmail.com', 'fldkRrN0cjBc7z4sx': 'Akim', 'fldjsUvoh3caONyYa': 'Ziegert' } };
  assert.equal(findDuplicate(ki, kaeufer), 'recA');
});

test('findDuplicate ohne Treffer → null', () => {
  const ki = { fields: { 'fldNXcwpC75MuGGhd': 'neu@x.de', 'fldkRrN0cjBc7z4sx': 'Neu', 'fldjsUvoh3caONyYa': 'Person' } };
  assert.equal(findDuplicate(ki, []), null);
});
```

- [ ] **Step 2: Test laufen lassen → muss scheitern**

Run: `node --test tests/migrate-lib.test.js`
Expected: FAIL („Cannot find module '../scripts/migrate-lib'").

- [ ] **Step 3: Minimal-Implementierung**

```javascript
// scripts/migrate-lib.js — reine Funktionen für die Migration (testbar, kein Netz).
const KI = { email: 'fldNXcwpC75MuGGhd', vorname: 'fldkRrN0cjBc7z4sx', nachname: 'fldjsUvoh3caONyYa' };
const KU = { email: 'fldUkBbJTTEfeQB0J', name: 'fldUW2JYSMP5sOqM6' };

const normEmail = e => (e || '').trim().toLowerCase();
const lc = s => (s || '').trim().toLowerCase();
const sameName = (v1, n1, v2, n2) => lc(v1) === lc(v2) && lc(n1) === lc(n2) && (lc(v1) + lc(n1)) !== '';

function findDuplicate(ki, kaeuferRecords) {
  const e = normEmail(ki.fields[KI.email]);
  if (e) {
    const hit = kaeuferRecords.find(k => normEmail(k.fields[KU.email]) === e);
    if (hit) return hit.id;
  }
  const v = ki.fields[KI.vorname], n = ki.fields[KI.nachname];
  const hit = kaeuferRecords.find(k => {
    const parts = (k.fields[KU.name] || '').split(/\s+/);
    return sameName(v, n, parts.slice(0, -1).join(' '), parts.slice(-1)[0]);
  });
  return hit ? hit.id : null;
}

module.exports = { normEmail, sameName, findDuplicate, KI, KU };
```

- [ ] **Step 4: Test laufen lassen → muss bestehen**

Run: `node --test tests/migrate-lib.test.js`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add scripts/migrate-lib.js tests/migrate-lib.test.js
git commit -m "feat: Dedup-/Match-Funktionen für Kunden-Migration (TDD)"
```

---

## Task 5: Migrationsskript — Airtable-I/O + Dry-Run

**Files:** Create `scripts/migrate-kunden.js`

- [ ] **Step 1: Skript schreiben**

```javascript
// scripts/migrate-kunden.js — kopiert die 54 K/I-Records in die Kunden-Tabelle (Dedup),
// hängt deren Snapshots/Finanzierungsfälle um und setzt Phase=Bestandskäufer auf Alt-Käufer.
// Aufruf:  AIRTABLE_TOKEN=... node scripts/migrate-kunden.js          (Dry-Run)
//          AIRTABLE_TOKEN=... node scripts/migrate-kunden.js --commit (Live)
const https = require('https');
const { findDuplicate } = require('./migrate-lib');
const F = require('./field-ids.json');
const TOKEN = process.env.AIRTABLE_TOKEN, BASE = 'appikHUetNyeonXBX', COMMIT = process.argv.includes('--commit');
const T = { KUNDEN: 'tblHIy1hmbpxspQGW', KI: 'tbld0j0Mo7rre1Vh3', SNAP: 'tbliqxbITCdSjK0ua', FF: 'tblM4e4tDae2o9mQz' };
const N = F.kunden; // NEU angelegte Felder per Anzeigename → ID (aus setup-schema)
const KU = { // logischer Name → Field-ID (gemischt: vorhandene Käufer-Felder + neue)
  NAME:'fldUW2JYSMP5sOqM6', EMAIL:'fldUkBbJTTEfeQB0J', TELEFON:'fldkiGXTdmbOwodXj', NOTIZEN:'fldXBVR7wFnxxd3d1',
  VORNAME:N['Vorname'], NACHNAME:N['Nachname'], GEBURTSDATUM:N['Geburtsdatum'], OWNER:N['Owner'], PHASE:N['Phase'],
  SA_JSON:N['Selbstauskunft-JSON'], STEUERSATZ:N['Steuersatz'], ARCHIVIERT:N['Archiviert'], LAST_ACTIVITY:N['Letzte-Aktivität'],
};
const KIF = {
  name:'fldEyLcNBa1Xe3ISs',vorname:'fldkRrN0cjBc7z4sx',nachname:'fldjsUvoh3caONyYa',email:'fldNXcwpC75MuGGhd',
  telefon:'fldaOOiGNE2FVAQA9',gebdat:'fldtdW7rfAXqbIu4q',owner:'fld7gmCGOLVsW5S1W',phase:'fldZIuFV6LcqodhEM',
  notizen:'fldtpjO65JHIbUecZ',sajson:'fldl94zd1Oeakj6pN',steuersatz:'fldQpGCMkF8LhgTZm',archiv:'fldHIc3gclVok2ggj',
  lastact:'fldRghZ5CtIBw2rWn',snaps:'fldD8Aa51l0Ii4iAu',ffs:'fldIZITOXmztZbyed'
};

function api(method, path, body){return new Promise((res,rej)=>{const d=body?JSON.stringify(body):null;
  const r=https.request('https://api.airtable.com'+path,{method,headers:{Authorization:'Bearer '+TOKEN,'Content-Type':'application/json',...(d?{'Content-Length':Buffer.byteLength(d)}:{})}},
  x=>{let b='';x.on('data',c=>b+=c);x.on('end',()=>{const j=b?JSON.parse(b):{};x.statusCode<300?res(j):rej(new Error(x.statusCode+' '+b));});});
  r.on('error',rej);if(d)r.write(d);r.end();});}
async function listAll(tid){let recs=[],off;do{const q=off?`?pageSize=100&offset=${off}`:'?pageSize=100';
  const d=await api('GET',`/v0/${BASE}/${tid}${q}`);recs=recs.concat(d.records);off=d.offset;}while(off);return recs;}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

(async()=>{
  const kaeufer = await listAll(T.KUNDEN);
  const ki = await listAll(T.KI);
  console.log(`Käufer(=Kunden): ${kaeufer.length} · K/I: ${ki.length} · Modus: ${COMMIT?'LIVE':'DRY-RUN'}\n`);

  // 1) Alt-Käufer ohne Phase → Bestandskäufer
  let backfill=0;
  for (const k of kaeufer) {
    if (!k.fields[KU.PHASE]) { backfill++;
      if (COMMIT) { await api('PATCH',`/v0/${BASE}/${T.KUNDEN}/${k.id}`,{fields:{[KU.PHASE]:'Bestandskäufer'}}); await sleep(60); }
    }
  }
  console.log(`Phase=Bestandskäufer auf ${backfill} Alt-Käufer ${COMMIT?'gesetzt':'(würde gesetzt)'}.\n`);

  // 2) K/I migrieren
  const map = {}; let created=0, merged=0; const mergeReport=[];
  for (const r of ki) {
    const f = r.fields, dupId = findDuplicate(r, kaeufer);
    const appFields = {
      [KU.Vorname]: f[KIF.vorname]||'', [KU.Nachname]: f[KIF.nachname]||'',
      [KU.EMAIL]: f[KIF.email]||'', [KU.TELEFON]: f[KIF.telefon]||'',
      [KU.GEBURTSDATUM]: f[KIF.gebdat]||null,
      [KU.SA_JSON]: f[KIF.sajson]||'', [KU.STEUERSATZ]: (typeof f[KIF.steuersatz]==='number')?f[KIF.steuersatz]:null,
      [KU.ARCHIVIERT]: !!f[KIF.archiv], [KU.LAST_ACTIVITY]: f[KIF.lastact]||null,
      [KU.OWNER]: Array.isArray(f[KIF.owner])?f[KIF.owner]:[],
    };
    if (dupId) {
      merged++; map[r.id]=dupId;
      const existing = kaeufer.find(k=>k.id===dupId);
      const oldNote=existing.fields[KU.NOTIZEN]||'', kiNote=f[KIF.notizen]||'';
      const mergedNote=[oldNote,kiNote].filter(Boolean).join('\n---\n');
      const patch={...appFields,[KU.NOTIZEN]:mergedNote,[KU.PHASE]:'Bestandskäufer'};
      mergeReport.push(`MERGE  K/I "${f[KIF.name]}" → Käufer ${dupId} ("${existing.fields['fldUW2JYSMP5sOqM6']}")`);
      if (COMMIT){ await api('PATCH',`/v0/${BASE}/${T.KUNDEN}/${dupId}`,{fields:patch}); await sleep(60); }
    } else {
      created++;
      const phase = f[KIF.phase]||'Lead';
      const fields={...appFields,[KU.NAME]:f[KIF.name]||((f[KIF.vorname]||'')+' '+(f[KIF.nachname]||'')).trim(),
        [KU.NOTIZEN]:f[KIF.notizen]||'',[KU.PHASE]:phase};
      if (COMMIT){ const c=await api('POST',`/v0/${BASE}/${T.KUNDEN}`,{fields,typecast:true}); map[r.id]=c.id; await sleep(60); }
      else map[r.id]='<<NEW>>';
    }
  }
  console.log(`Migration: ${created} neu, ${merged} zusammengeführt.`);
  mergeReport.forEach(l=>console.log('  '+l));

  // 3) Snapshots + Finanzierungsfälle umhängen
  let relSnap=0, relFF=0;
  for (const r of ki) {
    const target = map[r.id]; if (!target || target==='<<NEW>>') continue;
    for (const sid of (r.fields[KIF.snaps]||[])) { relSnap++;
      if (COMMIT){ await api('PATCH',`/v0/${BASE}/${T.SNAP}/${sid}`,{fields:{[F.snapshotsKundeNeu]:[target]}}); await sleep(60);} }
    for (const fid of (r.fields[KIF.ffs]||[])) { relFF++;
      if (COMMIT){ await api('PATCH',`/v0/${BASE}/${T.FF}/${fid}`,{fields:{[F.ffKundeNeu]:[target]}}); await sleep(60);} }
  }
  console.log(`\nRe-Link: ${relSnap} Snapshots, ${relFF} Finanzierungsfälle ${COMMIT?'umgehängt':'(würden umgehängt)'}.`);

  // 4) Validierung (Soll == Ist der zu erwartenden Re-Links)
  const expSnap = ki.reduce((a,r)=>a+(r.fields[KIF.snaps]||[]).length,0);
  const expFF = ki.reduce((a,r)=>a+(r.fields[KIF.ffs]||[]).length,0);
  console.log(`Erwartet laut K/I: ${expSnap} Snapshots, ${expFF} FF. ${(relSnap===expSnap&&relFF===expFF)?'✓ stimmig':'✗ ABWEICHUNG'}`);
})().catch(e=>{console.error(e);process.exit(1);});
```

- [ ] **Step 2: Skript-Syntax prüfen**

Run: `node --check scripts/migrate-kunden.js`
Expected: kein Output (Syntax ok).

- [ ] **Step 3: Commit**

```bash
git add scripts/migrate-kunden.js
git commit -m "feat: Kunden-Migrationsskript (Dry-Run + Live, Re-Link Snapshots/FF)"
```

---

## Task 6: Dry-Run ausführen + Edgar-Freigabe (Gate)

- [ ] **Step 1: Dry-Run**

```bash
AIRTABLE_TOKEN=$(cat ~/.airtable-token-stein.txt | tr -d '\n') node scripts/migrate-kunden.js | tee backups/2026-06-16/dry-run.txt
```
Expected: `~46 neu, ~8 zusammengeführt`, eine `MERGE`-Liste, `Re-Link … (würden umgehängt)`, `✓ stimmig`.

- [ ] **Step 2: Merge-Liste mit Edgar abgleichen**

Edgar bestätigt die `MERGE`-Zeilen (erwartet: Akim Ziegert, Alexander Theilmann, Ken Müller, Maurice Clever, Andreas Walther, Omar Al Kadi, Klaus-Michael Marx, Berat Alti). **Nur bei OK weiter.**

---

## Task 7: Live-Migration ausführen + Validierung

- [ ] **Step 1: Schreib-Freeze ansagen** — Kurze Nachricht an die 4 Nutzer: „Bitte 30 Min keine Kunden anlegen/bearbeiten."

- [ ] **Step 2: Live-Lauf**

```bash
AIRTABLE_TOKEN=$(cat ~/.airtable-token-stein.txt | tr -d '\n') node scripts/migrate-kunden.js --commit | tee backups/2026-06-16/live-run.txt
```
Expected: `✓ stimmig`, gleiche Zahlen wie Dry-Run.

- [ ] **Step 3: Stichproben-Validierung**

```bash
TOKEN=$(cat ~/.airtable-token-stein.txt | tr -d '\n')
# Kunden-Tabelle: jetzt ~169 Records (123 + ~46 neu)
python3 - <<'PY'
import os,json,urllib.request,urllib.parse
tok=os.environ.get("TOKEN") or open(os.path.expanduser("~/.airtable-token-stein.txt")).read().strip()
def cnt(t):
    n=0;off=None
    while True:
        q={"pageSize":"100"}; off and q.update(offset=off)
        u="https://api.airtable.com/v0/appikHUetNyeonXBX/%s?%s"%(t,urllib.parse.urlencode(q))
        d=json.load(urllib.request.urlopen(urllib.request.Request(u,headers={"Authorization":"Bearer "+tok})))
        n+=len(d["records"]);off=d.get("offset")
        if not off:break
    return n
print("Kunden:",cnt("tblHIy1hmbpxspQGW"),"(erwartet ~169)")
PY
```
Expected: ~169 (Abweichung = Anzahl Merges, ok).

- [ ] **Step 4: In Airtable visuell prüfen** — Kunden-Tabelle: ein gemergter Record (z.B. Akim Ziegert) hat sowohl Verkauft-WE-Link **als auch** Vorname/Phase/Owner. Ein Snapshot eines migrierten Interessenten zeigt im neuen „Kunde (neu)"-Feld den richtigen Kunden.

---

## Task 8: Code — tables.js auf die Kunden-Tabelle umstellen

**Files:** Modify `api/_lib/tables.js`

- [ ] **Step 1: Branch anlegen**

```bash
git checkout -b feature/merge-kunden-cutover
```

- [ ] **Step 2: `TABLES.KUNDEN` ändern** — `api/_lib/tables.js:6`

```javascript
  KUNDEN:      'tblHIy1hmbpxspQGW',   // Merge 2026-06-16: war tbld0j0Mo7rre1Vh3 (alte K/I)
```

- [ ] **Step 3: `KUNDEN_FIELDS` ersetzen** — `api/_lib/tables.js:57-76`

Den von `node scripts/print-tables-block.js` erzeugten Block einsetzen. Ergebnis (mit echten IDs aus field-ids.json):
```javascript
const KUNDEN_FIELDS = {
  NAME:           'fldUW2JYSMP5sOqM6',
  VORNAME:        '<Vorname>',
  NACHNAME:       '<Nachname>',
  EMAIL:          'fldUkBbJTTEfeQB0J',
  TELEFON:        'fldkiGXTdmbOwodXj',
  GEBURTSDATUM:   '<Geburtsdatum>',
  OWNER:          '<Owner>',
  PHASE:          '<Phase>',
  NOTIZEN:        'fldXBVR7wFnxxd3d1',
  SA_JSON:        '<Selbstauskunft-JSON>',
  CREATED:        '<Erstellt-am>',
  LAST_ACTIVITY:  '<Letzte-Aktivität>',
  ARCHIVIERT:     '<Archiviert>',
  STEUERSATZ:     '<Steuersatz>',
};
```
*(`QUICK_BON_JSON` entfällt — keine Zeile mehr.)*

- [ ] **Step 4: Snapshot- + FF-Kunde-Link-IDs umstellen**

`api/_lib/tables.js` — `SNAPSHOT_FIELDS.KUNDE` auf `field-ids.json.snapshotsKundeNeu`; `FINANZIERUNGSFALL_FIELDS.KUNDE` auf `field-ids.json.ffKundeNeu`.

- [ ] **Step 5: Schema-Guard laufen lassen**

Run: `npm run guard`
Expected: keine 422/Field-Fehler (alle IDs existieren auf der Kunden-Tabelle).

- [ ] **Step 6: Commit**

```bash
git add api/_lib/tables.js
git commit -m "feat(merge): TABLES.KUNDEN + KUNDEN_FIELDS auf Kunden-Tabelle, Snapshot/FF-Links neu"
```

---

## Task 9: Code — Quick-Bonität aus dem Mapper entfernen

**Files:** Modify `api/_lib/mappers.js:59,77`

- [ ] **Step 1: Lese-Zeile entfernen** — `api/_lib/mappers.js:59`

Zeile löschen:
```javascript
    quickBonJson:  parseJsonField(f[KUNDEN_FIELDS.QUICK_BON_JSON]),
```

- [ ] **Step 2: Schreib-Zeile entfernen** — `api/_lib/mappers.js:77`

Zeile löschen:
```javascript
  if (body.quickBonJson !== undefined) out[KUNDEN_FIELDS.QUICK_BON_JSON] = stringifyJson(body.quickBonJson);
```

- [ ] **Step 3: Tests laufen lassen**

Run: `npm test`
Expected: alle grün (kein Test referenziert quickBonJson).

- [ ] **Step 4: Commit**

```bash
git add api/_lib/mappers.js
git commit -m "refactor(merge): Quick-Bonität-Feld entfernt (war 0/54, ungenutzt)"
```

---

## Task 10: Code — Status-Werte auf die 6 neuen umstellen

**Files:** Modify `public/app.js:58,124-136,7928`; `api/admin/stats.js:9-18,82-107`; `public/styles.css:508-515`

- [ ] **Step 1: PHASEN-Dropdown** — `public/app.js:58`

```javascript
const PHASEN = ['Lead','Reservierung','Bank-Einreichung','Notar-Termin','Bestandskäufer','Abgebrochen'];
```

- [ ] **Step 2: Badge-Klasse für Bestandskäufer** — `public/app.js:124-136`

In `phaseBadgeClass`, vor der `return ''`-Zeile ergänzen:
```javascript
  if (p.startsWith('bestand')) return 'bestandskaeufer';
```

- [ ] **Step 3: Admin-KPI-Label** — `public/app.js:7928`

```javascript
            <div class="kpi positive"><div class="label">Käufer</div><div class="value">${(s.byPhase && s.byPhase['Bestandskäufer']) || 0}</div></div>
```

- [ ] **Step 4: stats.js PHASEN-Liste** — `api/admin/stats.js:9-18`

```javascript
const PHASEN = [
  'Lead',
  'Reservierung',
  'Bank-Einreichung',
  'Notar-Termin',
  'Bestandskäufer',
  'Abgebrochen'
];
```

- [ ] **Step 5: stats.js Aggregat-Felder** — `api/admin/stats.js:82-92`

```javascript
      kundenGesamt: v.total,
      beurkundet:   (v.phasen && v.phasen['Bestandskäufer']) || 0,
      reserviert:   (v.phasen && v.phasen['Reservierung']) || 0,
      notarTermin:  (v.phasen && v.phasen['Notar-Termin']) || 0,
      kaufKomplett: ((v.phasen && v.phasen['Bestandskäufer']) || 0) + ((v.phasen && v.phasen['Notar-Termin']) || 0),
      inBearbeitung:
        ((v.phasen && v.phasen['Reservierung']) || 0) +
        ((v.phasen && v.phasen['Bank-Einreichung']) || 0) +
        ((v.phasen && v.phasen['Notar-Termin']) || 0),
```

- [ ] **Step 6: stats.js total.inBearbeitung** — `api/admin/stats.js:102-107`

```javascript
    const inBearbeitung =
      (total.phasen['Reservierung'] || 0) +
      (total.phasen['Bank-Einreichung'] || 0) +
      (total.phasen['Notar-Termin'] || 0);
```

- [ ] **Step 7: CSS-Badge ergänzen** — `public/styles.css` nach Zeile 514

```css
.badge.bestandskaeufer { background: var(--positive-bg); color: var(--positive); }
```

- [ ] **Step 8: JS-Syntax-Check (Frontend)**

Run (JSC aus Allow-Liste): `npm run check:js` *(bzw. der in settings.local.json hinterlegte JSC-Befehl)*
Expected: app.js parst fehlerfrei.

- [ ] **Step 9: Backend-Tests**

Run: `npm test`
Expected: grün.

- [ ] **Step 10: Commit**

```bash
git add public/app.js api/admin/stats.js public/styles.css
git commit -m "feat(merge): Status auf 6 Werte (Bestandskäufer statt Beurkundet/ungenutzte)"
```

---

## Task 11: Lokal verifizieren (Gesamt-Gate)

- [ ] **Step 1: Guard + Tests zusammen**

Run: `npm run guard && npm test`
Expected: Schema-Guard grün (alle Field-IDs existieren), alle Tests grün.

---

## Task 12: Preview-Deploy + Klick-Checkliste (Gate)

- [ ] **Step 1: Branch pushen → Vercel-Preview**

```bash
git push -u origin feature/merge-kunden-cutover
```
Expected: Vercel baut eine Preview-URL für den Branch.

> **Hinweis Login:** Preview-Logins gehen ggf. nicht (Google-OAuth-Origins nur Production — siehe Memory `bb-vercel-slug-preview-login`). Falls Login auf der Preview scheitert: Origin in Google Console eintragen **oder** Funktionstest direkt nach dem main-Deploy (Task 13) mit sofortiger Rückroll-Bereitschaft.

- [ ] **Step 2: Klick-Checkliste auf der Preview (bzw. Prod nach Task 13)**

- [ ] Login als Vertriebler → eigene Kundenliste zeigt nur eigene (keine 123 Alt-Käufer).
- [ ] Neuen Kunden anlegen → erscheint, Phase „Lead", landet in Kunden-Tabelle.
- [ ] Bestehenden migrierten Kunden öffnen → Stammdaten, Snapshots-Liste, Steuersatz da.
- [ ] Snapshot speichern → hängt am richtigen Kunden.
- [ ] Finanzierung-Handover (`/api/finanzierung/uebergeben`) → Finanzierungsfall verknüpft mit Kunde.
- [ ] Admin-Login → Gesamtsicht zeigt auch Käufer; „Typ"/Phase-Filter funktioniert; Stats-Zahlen plausibel.
- [ ] Phase-Dropdown zeigt 6 Werte inkl. „Bestandskäufer".

---

## Task 13: Live-Cutover (main)

- [ ] **Step 1: Merge auf main**

```bash
git checkout main && git merge feature/merge-kunden-cutover && git push
```
Expected: Vercel deployt automatisch auf Production.

- [ ] **Step 2: Smoke-Test auf Production** — Klick-Checkliste (Task 12 Step 2) auf der Live-Domain.

- [ ] **Step 3: Schreib-Freeze aufheben** — Nachricht an die 4: „Kunden-Anlegen wieder frei."

---

## Task 14: Automation „Verkauf WE add Käufer" anpassen

**Files:** Airtable-UI (Automations)

- [ ] **Step 1:** Automation öffnen → Action „Datensatz erstellen In Käufer" → Tabelle ist jetzt „Kunden" (durch Umbenennung automatisch). Feld-Mapping prüfen: ergänze **`Phase = Bestandskäufer`** für neu erstellte Records.
- [ ] **Step 2:** Team-Regel dokumentieren: Wenn die Person schon als Interessent existiert → `Käufer-Typ = „Käufer aus Liste auswählen"` (verknüpfen statt neu anlegen).
- [ ] **Step 3:** Test: Test-Datensatz in „Verkauft-WE" mit `Käufer-Typ = Neuer Käufer` anlegen → neuer Kunde mit Phase „Bestandskäufer" entsteht. Test-Record danach löschen.

---

## Task 15: Aufräumen

**Files:** Airtable-UI / API

- [ ] **Step 1: Tote Felder löschen** (nach 24 h stabilem Betrieb)

In „Kunden": `WEG-Verwaltung` (fldynq1lMAQC1QgT8).
In „Kunden/Interessenten" (alt): die werden mit der Tabelle archiviert — kein Einzel-Löschen nötig.

- [ ] **Step 2: Alte Snapshot-/FF-Link-Felder zur alten K/I-Tabelle entfernen** (erst nach erfolgreicher Validierung)

Snapshots: altes `Kunde` (fldk6jkQu6UEIFv6T). Finanzierungsfall: altes `Kunden/Interessenten` (fldE6949ttL6XNSqX). Optional „Kunde (neu)" → „Kunde" umbenennen.

- [ ] **Step 3: Alte Tabelle „Kunden/Interessenten" archivieren** (nach 1–2 Wochen)

Tabelle `tbld0j0Mo7rre1Vh3` löschen/archivieren. Backup (Task 0) + Base-Snapshot bleiben als Rückfall.

- [ ] **Step 4: Spec-Status aktualisieren** — In `docs/2026-06-16_Merge-Kunden-Kaeufer-Spec.md` Status auf „Umgesetzt YYYY-MM-DD" setzen.

---

## Rollback (jederzeit)

- **Vor Task 13 (Live):** main ist unverändert — einfach Branch verwerfen. Daten-Rückroll via Base-Snapshot `vor-merge-kunden-2026-06-16`.
- **Nach Task 13:** `git revert` des Merge-Commits + push (App zeigt wieder auf alte Tabelle — solange Task 15 noch nicht gelaufen ist, existiert die alte K/I-Tabelle + alte Links noch). Daten-Rückroll via Base-Snapshot.
- **Die operative Verkauft-WE-/Liqui-Kette** wird in keinem Schritt verändert → kein Rückroll dort nötig.

---

## Self-Review-Notiz

Spec-Abdeckung: §4 Feldplan → Task 1/2/8 · §5 Status → Task 1/10 · §6 Migration → Task 0–7 · §6.1 Betrieb → Task 7/12/13 · §7 Code → Task 8–10 · §8 Rollback → Rollback-Abschnitt · §9 Dubletten → Task 4/6. Komfort-Automationen (§6 Schritt 6) bewusst ausgelagert (Folge-Plan).
