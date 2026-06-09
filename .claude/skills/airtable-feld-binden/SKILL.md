---
name: airtable-feld-binden
description: Use when ein neues Airtable-Feld in die BB-Kalkulator-App eingebunden, gelesen oder geschrieben werden soll — oder wenn ein Feld im Frontend "undefined" zeigt, der Wert nicht gespeichert wird, oder ein listAll-Call plötzlich "Backend-Fehler"/422 wirft. Trigger: "neues Feld", "Feld anbinden", "FIELDS erweitern", "Feld speichern", "record.fields['Name']", "Snapshot-Spalte".
---

# Airtable-Feld binden (BB Kalkulator V2)

## Kernprinzip

Ein Feld ist erst dann sauber gebunden, wenn es durch **alle** Schichten gezogen ist: ID-Konstante → Mapper (beide Richtungen) → ggf. Snapshot-Klartext → API-Route → Frontend → Test. Wird eine Schicht vergessen, bricht es **still** (Wert kommt nie an, statt einen Fehler zu werfen). Stack ist CommonJS (`require`/`module.exports`).

## Die zwei eisernen Regeln

1. **Immer Field-ID, nie Field-Name.** Alle IDs leben ausschließlich in `api/_lib/tables.js`. Niemals `record.fields['Phase']` — immer `record.fields[KUNDEN_FIELDS.PHASE]`. Namen ändern sich in Airtable, IDs nicht.
2. **Gelöschtes Feld → ID-Konstante MUSS raus.** Steht eine Field-ID in einer `XXX_FIELDS`-Liste, deren Feld in Airtable gelöscht wurde, scheitert **jeder** `listAll`-Call auf die ganze Tabelle mit Airtable-422 (Folge: „Backend-Fehler"/„läuft mit Defaults" für ALLE Records). Siehe `HG_INFLATION`-Falle in `tables.js`. Beim Entfernen also zuerst Konstante löschen, dann Feld in Airtable.

## Schritte (Feld hinzufügen)

1. **Field-ID holen** aus Airtable (Feld-Details → Field-ID `fld...`). Nicht den Namen.
2. **`api/_lib/tables.js`** — Konstante ins richtige `XXX_FIELDS`-Objekt (`KUNDEN_FIELDS`, `SNAPSHOT_FIELDS`, `WE_FIELDS`, `KALK_STAMMDATEN_FIELDS` …). Kommentar mit Datum + Zweck wie bestehende Einträge.
3. **`api/_lib/mappers.js` — Lese-Richtung** (Record → API). Ins passende `…RecordToBasic/Full`/`…RecordToApi`-Objekt aufnehmen:
   - Zahl: `toNumber(f[FIELDS.X])` · Text: `f[FIELDS.X] || ''` · JSON: `parseJsonField(f[FIELDS.X])` · Checkbox: `!!f[FIELDS.X]` · Link: über das `flattenLinks`-Muster (kommt als `['rec..']` ODER `[{id,name}]`).
4. **`api/_lib/mappers.js` — Schreib-Richtung** (Body → Fields). Im `…BodyToFields` mit der Guard `if (body.x !== undefined) out[FIELDS.X] = …`. JSON via `stringifyJson`. Nur gesetzte Werte schreiben.
5. **Falls Kalk-Wert für Snapshots:** zusätzlich `SNAPSHOT_FIELDS.X` in `tables.js` **und** den `setIf(SNAPSHOT_FIELDS.X, num(k.x))`-Block in `snapshotBodyToFields` (Klartext-Basis-Werte, 28.05.-Muster) — sonst sieht das Backoffice die Basis nicht in der Grid-Ansicht.
6. **API-Route** (`api/kunden.js`, `api/snapshots.js` …): nichts nötig, wenn nur über Mapper. Wird das Feld neu im Body erwartet, prüfen ob die Route es durchreicht.
7. **Frontend** (`public/app.js`, ggf. `pdf.js`): UI-Binding nur falls sichtbar/eingebbar.
8. **Test** in `tests/` (`edge-cases.test.js` o.ä.) wenn Logik dranhängt.
9. **`npm test`** grün → `git add . && git commit && git push` (Vercel Auto-Deploy).

## Sonderfälle

- **Feld umbenannt in Airtable:** ID bleibt gleich → nichts zu tun. JS-Key behält man (siehe `INDEXMIETE` → „Staffelmiete %": Key blieb für Backward-Compat).
- **Formel-/Lookup-Feld:** nur lesen, nie in `…BodyToFields` schreiben (Airtable lehnt ab).
- **Link-Feld schreiben:** als Array von Record-IDs (`out[FIELDS.X] = id ? [id] : []`).

## Häufige Fehler

| Fehler | Folge | Fix |
|---|---|---|
| Field-Name statt ID | bricht bei Umbenennung | nur `tables.js`-Konstante nutzen |
| Lese-Mapper vergessen | Frontend zeigt `undefined` | ins `…RecordTo…` aufnehmen |
| Schreib-Mapper vergessen | Wert wird nie gespeichert | `…BodyToFields` + Guard |
| Snapshot-Klartext vergessen | Backoffice sieht Basis nicht | `SNAPSHOT_FIELDS` + `setIf` |
| Gelöschtes Feld in FIELDS-Liste | 422 für GANZE Tabelle | Konstante zuerst entfernen |

## Red Flags — STOP

- `record.fields['IrgendeinName']` irgendwo außerhalb `tables.js` → falsch.
- Wert „kommt nicht an", aber kein Fehler im Log → eine Mapper-Richtung fehlt.
- listAll auf eine Tabelle wirft 422 nach Airtable-Aufräumen → verwaiste Field-ID in der Liste.
