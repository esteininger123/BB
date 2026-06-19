# Design: Editierbare Finanzierungs-Konditionen (Admin)

**Datum:** 2026-06-19
**Status:** Genehmigt (Brainstorming), bereit für Umsetzungsplan
**Auslöser:** Zinssätze ändern sich häufig. Henry (Admin) soll sie selbst pflegen können — ohne Code-Deploy. Differenzierung nach Kaufpreis-Band (< 150k / ≥ 150k) × KNK-Variante.

---

## 1. Ziel & Scope

**Im Scope:**
- Admin-UI zum Pflegen einer **2×2-Konditionen-Matrix** (Kaufpreis-Band × KNK-Variante), je Zelle **Zins + Tilgung**, plus editierbare **Schwelle** (Default 150.000 €).
- Server-Persistenz der Werte (überlebt Deploys, gilt für alle User).
- Der Kalkulator zieht Zins+Tilgung aus dieser Matrix statt aus hartcodierten Konstanten.

**Nicht im Scope (bewusst, YAGNI):**
- Freie Regel-Listen / beliebig viele Bänder (verworfen zugunsten fester Matrix).
- Zins pro einzelner Wohneinheit in Airtable (falsches Werkzeug für häufige globale Änderungen).
- Tagesgeld-Vergleichszins (`sparZinsPa`) bleibt vorerst fix im Code.
- Änderungen an der Rechen-Engine, an PDFs oder an der Snapshot-Struktur.

---

## 2. Ist-Zustand (Code-Fakten)

- Zins ist **hartcodiert** in `public/kalkulator.js` (`PROFILES`): **4,5 %** (ohne KNK), **4,8 %** (mit KNK). Tilgung überall **1 %**.
- Die KNK-Kopplung steht fest in `public/app.js:3042-3045`: `state.kalk.zins = (v === true) ? 0.048 : 0.045;` — überschreibt dabei auch einen manuell gesetzten Zins.
- Es gibt einen **manuellen Zins-Slider** (`public/app.js:2538`, `slider('Zinssatz','zins',2,8,0.05)`) — Vertriebler kann überschreiben.
- Kaufpreis liegt in `state.kalk.kaufpreis`; in der WE-Liste pro WE als `w.kp`.
- Die **WE-Liste** rechnet pro WE mit `PROFILES[_weListeProfil]` (`public/app.js:8468`), inkl. dessen hartcodiertem Zins.
- **Kein** Server-Config-Store vorhanden. `/api/config` liefert nur die Google-Client-ID.
- Snapshot speichert den konkret verwendeten Zins (`SNAPSHOT_FIELDS.ZINS`) — bleibt so.

---

## 3. Datenmodell

### 3.1 Config-Struktur (JSON)

```json
{
  "version": 1,
  "schwelleKaufpreis": 150000,
  "baender": {
    "klein": {
      "ohneKnk": { "zins": 0.045, "tilgung": 0.01 },
      "mitKnk":  { "zins": 0.048, "tilgung": 0.01 }
    },
    "gross": {
      "ohneKnk": { "zins": 0.045, "tilgung": 0.01 },
      "mitKnk":  { "zins": 0.048, "tilgung": 0.01 }
    }
  }
}
```

- `klein` = Kaufpreis **< Schwelle**, `gross` = Kaufpreis **≥ Schwelle** (150.000 zählt zu `gross`).
- Zins/Tilgung als Dezimal (0.045 = 4,5 %). UI zeigt Prozent, rechnet intern um.
- **Defaults = heutige Werte.** Beide Bänder starten identisch → solange Henry nichts ändert, ist das Rechenergebnis bit-identisch zu heute.

### 3.2 Persistenz: Airtable

Neue Tabelle **„App-Konfiguration"** in der bestehenden Base `appikHUetNyeonXBX` (Objektmanagement). Genau **ein** relevanter Datensatz:

| Feld | Typ | Zweck |
|---|---|---|
| `Key` (Primary) | Single line | Config-Schlüssel, hier `"konditionen"` (erlaubt spätere weitere Config-Keys) |
| `JSON` | Long text | Der Config-Blob als JSON-String |
| `Aktualisiert` | Long text | ISO-Zeitstempel + Editor-E-Mail (Audit, vom PUT gesetzt) |

Field-IDs nach Anlage in `api/_lib/tables.js` als neue `TABLES.APP_KONFIG` + `APP_KONFIG_FIELDS` führen (Single Source of Truth, keine ID-Hardcodes außerhalb).

*Begründung Airtable statt Code/Env: einziger persistenter Store der App; Henry editiert in der App; kein Redeploy nötig. JSON-Blob statt 9 Number-Feldern = minimale Schema-Ceremony, leicht erweiterbar.*

---

## 4. Backend

### 4.1 `GET /api/konditionen`
- **Auth:** jeder eingeloggte User (der Rechner braucht die Werte).
- Liest den `konditionen`-Datensatz, parst `JSON`, **merged über die Code-Defaults** (fehlende Felder → Default).
- **Resilienz:** kein Datensatz / Parse-Fehler / Airtable-Timeout → liefert reine Defaults mit `200`. Der Rechner blockiert nie an der Config.

### 4.2 `PUT /api/konditionen`
- **Auth:** **nur `rolle === 'Admin'`** (sonst `403`).
- **Validierung** (sonst `400`, kein Schreibvorgang):
  - `schwelleKaufpreis`: Zahl > 0.
  - jede `zins`: Zahl, `0 ≤ zins ≤ 0.20`.
  - jede `tilgung`: Zahl, `0 ≤ tilgung ≤ 0.10`.
  - Struktur vollständig (beide Bänder, beide Varianten).
- Schreibt `JSON` + `Aktualisiert` (ISO + E-Mail des Editors). Upsert: Datensatz anlegen, falls noch keiner existiert.

---

## 5. Frontend

### 5.1 Laden
- Beim App-Start (in der Init-Sequenz neben `/api/me`) einmal `GET /api/konditionen` → `state.konditionen`.
- Fallback bei Fehler = im Code gebackene `KONDITIONEN_DEFAULTS` → Rechner läuft immer.

### 5.2 Single Source of Truth: `Kalk.resolveKondition(kaufpreis, knkMitfinanziert)`
Reine Funktion in `public/kalkulator.js`, exportiert auf `window.Kalk` (und für Tests via `module.exports`):

```
band    = (kaufpreis >= cfg.schwelleKaufpreis) ? cfg.baender.gross : cfg.baender.klein
variant = knkMitfinanziert ? band.mitKnk : band.ohneKnk
return { zins: variant.zins, tilgung: variant.tilgung }
```

Liest die aktive Config (`state.konditionen`) mit Default-Fallback. Robust gegen `kaufpreis` = 0/NaN (→ `klein`).

### 5.3 Integrationspunkte (genau die heutigen Zins-Setz-Stellen, jetzt band-aware)
1. **KNK-Toggle** (`public/app.js:3042`): statt `0.048/0.045` →
   `const k = Kalk.resolveKondition(state.kalk.kaufpreis, v); state.kalk.zins = k.zins; state.kalk.tilgung = k.tilgung;`
   (Zieht **Zins UND Tilgung** als Zelle mit — bewusste Vereinheitlichung; heute zog der Toggle nur den Zins.)
2. **WE laden / Profil anwenden** (`applyProfil`, WE-Load): nach dem Profil-Apply Zins+Tilgung aus `resolveKondition(kaufpreis, knkMitfinanziert)` überschreiben. Profil bleibt Quelle für Steuersatz/Bonität/KNK-Kopplung; **Zins+Tilgung gehören ab jetzt der Matrix.**
3. **WE-Liste** (`public/app.js:8468`): pro WE `resolveKondition(w.kp, profile.knkMitfinanziert)` statt `profile.zins/tilgung`. Hier wirkt die Band-Differenzierung am stärksten (Übersicht zeigt automatisch den richtigen Zins je Preisklasse). Profil-Label (`public/app.js:8714`) entsprechend anpassen (Zins „lt. Konditionen" / repräsentativ).

Der **manuelle Zins-Slider bleibt Override** — wie heute, bis zum nächsten Trigger (Toggle / Profilwechsel / WE-Reload).

### 5.4 Admin-UI
Neue Karte **„Finanzierungs-Konditionen"** in `renderAdmin()` (`public/app.js`, Modul `views/admin`):
- Ein Eingabefeld **Schwelle** (€).
- 2×2-Raster, je Zelle zwei Felder: **Zins (%)** und **Tilgung (%)**.
- Vorbelegt aus `state.konditionen`.
- **Speichern** → `PUT /api/konditionen` → bei Erfolg `state.konditionen` aktualisieren + Bestätigung; bei `400`/`403` klare Fehlermeldung.
- Anzeige „zuletzt geändert" aus `Aktualisiert`.

---

## 6. Tests (`tests/`, `node --test`)

- **`resolveKondition`:**
  - `kaufpreis = 149999` → `klein`; `= 150000` → `gross`; `= 150001` → `gross`.
  - `knkMitfinanziert` true/false wählt korrekte Variante.
  - Teilweise/fehlende Config → Merge mit Defaults liefert valide Werte.
  - `kaufpreis` = 0/NaN → `klein`, kein Crash.
- **Endpoint:**
  - `PUT` mit ungültigen Werten (Zins > 20 %, fehlende Zelle, Schwelle ≤ 0) → `400`, kein Schreibvorgang.
  - `PUT` als Nicht-Admin → `403`.
  - `GET` ohne Datensatz → Defaults, `200`.

---

## 7. Risiken & Entscheidungen

- **Manuell gesetzte Tilgung wird beim KNK-Toggle künftig überschrieben** (heute nicht). Bewusst — die Zelle (Zins+Tilgung) greift als Einheit. Minimal, konsistent mit der Zins-Logik.
- **Snapshot/Engine:** unverändert. `resolveKondition` ändert keine Formel, nur die Quelle der Inputs. Beim Umsetzen `kalk-integritaet`-Skill durchziehen (ENGINE_VERSION-Bump prüfen, Snapshot-Werte bewusst entscheiden).
- **Schema-Änderung Airtable:** neue Tabelle in der Produktiv-Base — von Edgar freigegeben (2026-06-19). SPEC.md nach Anlage nachziehen.
- **Backward-Compat:** `PROFILES` behält seine `zins`-Felder (für Legacy-Label-Anzeige), aber sie steuern die Rechnung nicht mehr — Matrix ist maßgeblich.

---

## 8. Betroffene Dateien

| Datei | Änderung |
|---|---|
| Airtable Base `appikHUetNyeonXBX` | neue Tabelle „App-Konfiguration" (1 Record) |
| `api/_lib/tables.js` | `TABLES.APP_KONFIG` + `APP_KONFIG_FIELDS` |
| `api/konditionen.js` (neu) | GET (alle) / PUT (Admin) |
| `public/kalkulator.js` | `KONDITIONEN_DEFAULTS` + `resolveKondition` (+ Export) |
| `public/app.js` | Init-Load, KNK-Toggle, `applyProfil`/WE-Load, WE-Liste, Admin-Karte |
| `tests/` | neue Tests resolveKondition + Endpoint |
| `docs/SPEC.md` | Tabelle + Route dokumentieren |
