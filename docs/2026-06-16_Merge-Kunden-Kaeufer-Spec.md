# Spec: Merge „Käufer" + „Kunden/Interessenten" → eine „Kunden"-Tabelle

**Stand:** 2026-06-16 · **Status:** ✅ Kern-Merge UMGESETZT & LIVE (2026-06-16) · **Base:** Objektmanagement `appikHUetNyeonXBX`

> **Umsetzung:** 168 Kunden migriert (123 Käufer + 45 Interessenten, 10 Dubletten zusammengeführt), 49 Snapshots + 11 Finanzierungsfälle umgehängt, App auf `main` deployt (Commit `0851cf0`, Production-Alias bestätigt). Offene manuelle Schritte: Airtable-Automation „Verkauf WE add Käufer" (Phase=Bestandskäufer), eingeloggter UI-Smoke-Test, deferred Cleanup (tote Felder + alte K/I-Tabelle nach 1–2 Wochen). Details: `2026-06-16_Merge-Kunden-Kaeufer-Plan.md` Task 14/15.

---

## 1. Ziel

Heute existieren **zwei** Personen-Listen nebeneinander:
- **Käufer** (`tblHIy1hmbpxspQGW`, 123 Records) — alte, manuell gepflegte Liste echter Käufer/Eigentümer. Entstand **vor** der Backstube.
- **Kunden/Interessenten** (`tbld0j0Mo7rre1Vh3`, 54 Records) — von der Backstube-App befüllter Vertriebs-Funnel.

Eine Person durchläuft heute den Funnel in „Kunden/Interessenten" und wird beim Kauf **ein zweites Mal** als „Käufer" angelegt (per Automation). Diese **Doppel-Erfassung** soll weg: **ein Datensatz pro Person**, der von „Lead" bis „gekauft + Wohneinheit verknüpft" durchläuft.

## 2. Kern-Entscheidungen (final abgestimmt)

| # | Entscheidung | Begründung |
|---|---|---|
| A | **Physische Basis = Käufer-Tabelle**, umbenannt zu **„Kunden"**. Die 54 App-Kunden werden reinmigriert. | Käufers operativer Fußabdruck (Verkauft-WE-Link, 4 Lookups, Liqui-/Darlehen-Kette, 1 Automation) ist **live & geldkritisch & unkontrolliert** → bleibt unangetastet. Der Umbau wandert in die **kontrollierte, testbare** App-/Code-Welt. |
| B | **Keine Doppel-Felder**: E-Mail / Telefon / Notizen werden zu je *einem* Feld konsolidiert. | Edgars Vorgabe „keine doppelten Daten". |
| C | **Ein Status-Feld** („Phase") als Single Source of Truth + abgeleitetes Formel-Feld **„Typ"** fürs Backoffice-Filter. | Status ist zentraler Filter; Typ read-only → keine Doppelpflege. |
| D | **Tabellenname** = „Kunden". | — |
| E | Aufräumen toter/kaputter Felder im selben Zug. | — |

**Zwei Folge-Automationen** (nach dem Kern-Merge, weil sie die fusionierte Struktur voraussetzen):
- **SEV-Auto-Häkchen**: Im Kalkulator `Mietverwaltung > 0 €` → Kunden-Feld `SEV = true`; `= 0 €` → `false`.
- **WE-Status-Kopplung**: Wenn eine WE über „Verkauft-WE" mit dem Kunden verknüpft ist und die WE im Status weiterwandert, zieht der Kundenstatus automatisch nach (späte Phasen).

---

## 3. Ist-Zustand (verifiziert 2026-06-16)

### 3.1 Verknüpfungen
```
Käufer ──(Käufer-Link)── Verkauft-WE ──── Wohneinheit ──── Liqui-Einnahmen / Darlehen
   │                         │
   │                     (4 Lookups ziehen aus Käufer: Adresse, Telefon, E-Mail, Name)
   │
   └─ base-weit von GENAU EINEM Link berührt: Verkauft-WE.Käufer (fldwnwSXM8EInSOFJ)

Kunden/Interessenten ──┬── Owner ───────────────► Kalk-Vertriebler
                       ├── Kalk-Snapshots ──────► Kalk-Snapshots (fldk6jkQu6UEIFv6T, inverse)
                       └── Endkunden-Finanzierungsfall 3 ─► Endkunden-Finanzierungsfall (fldE6949ttL6XNSqX, inverse)
```

### 3.2 Automation (Airtable)
**„Verkauf WE add Käufer"** (aktiv): Trigger = neuer Datensatz in *Verkauft-WE*. Bedingung = Feld **`Käufer-Typ`** (auf Verkauft-WE, `fldoShOefwfvEJ8KN`, Werte „Neuer Käufer" / „Käufer aus Liste auswählen"). Bei „Neuer Käufer" → **legt neuen Datensatz in `Käufer` an** + aktualisiert. → **Das ist die Quelle der Doppel-Erfassung.**

### 3.3 App-Code (Backstube)
- Berührt **ausschließlich** `Kunden/Interessenten` über `TABLES.KUNDEN` + `KUNDEN_FIELDS`. Die Käufer-Tabellen-ID kommt im Repo **nirgends** vor.
- Routen: `api/kunden.js`, `api/kunden/[id].js`, `api/snapshots.js`, `api/finanzierung/uebergeben.js`, `api/admin/stats.js`, `api/sa-portal/generate.js`.
- Status-Werte **hartverdrahtet**: `public/app.js:58` (`PHASEN`), `api/admin/stats.js`, Badges in `styles.css`.

### 3.4 Keine Interfaces/Formulare auf den Kundentabellen. (Nur 1 natives Form base-weit, auf „Projekt".)

---

## 4. Soll-Zustand: die „Kunden"-Tabelle

Basis bleibt die physische Käufer-Tabelle (`tblHIy1hmbpxspQGW`), umbenannt „Kunden". Feldplan:

### 4.1 Bleibt (bereits auf Käufer)
| Feld | Field-ID | Typ | Anmerkung |
|---|---|---|---|
| Name (Primary) | `fldUW2JYSMP5sOqM6` | singleLineText | Anzeigename (Alt-Käufer oft Paar „X/Y") |
| Adresse | `fld9NnehE1q93bwKS` | singleLineText | |
| **E-Mail** (kanonisch) | `fldUkBbJTTEfeQB0J` | singleLineText | App schreibt hierauf (→ KUNDEN_FIELDS.EMAIL). Optional Typ→email heben. |
| **Telefon** (kanonisch) | `fldkiGXTdmbOwodXj` | singleLineText | App schreibt hierauf |
| **Notizen** (kanonisch) | `fldXBVR7wFnxxd3d1` | multilineText | bei Dubletten werden beide Notizen zusammengeführt |
| SEV | `fldoacXpTd41HbKju` | checkbox | bleibt (Edgar). Wird künftig per Kalkulator-Automation gesetzt. |
| IBAN | `fld8UNwVDVBGmKMzQ` | singleLineText | bleibt (Edgar) |
| Anzahl Käufer | `fldRpPIB2dR1ZPPDv` | number | bleibt |
| Verkauft-WE (Link) | `fldiB6j8yF5pZaXgq` | link → Verkauft-WE | **bleibt — Liqui-Kette unberührt** |

### 4.2 Neu anzulegen (App-Felder, kommen aus K/I) — Field-IDs werden bei Anlage vergeben
| Feld | Typ | Quelle K/I |
|---|---|---|
| Vorname | singleLineText | `fldkRrN0cjBc7z4sx` |
| Nachname | singleLineText | `fldjsUvoh3caONyYa` |
| Geburtsdatum | date | `fldtdW7rfAXqbIu4q` |
| Owner | link → Kalk-Vertriebler | `fld7gmCGOLVsW5S1W` |
| Phase | singleSelect (6 Werte, s. §5) | `fldZIuFV6LcqodhEM` |
| Selbstauskunft-JSON | multilineText | `fldl94zd1Oeakj6pN` |
| Steuersatz | percent | `fldQpGCMkF8LhgTZm` |
| Archiviert | checkbox | `fldHIc3gclVok2ggj` |
| Letzte-Aktivität | dateTime | `fldRghZ5CtIBw2rWn` |
| Erstellt-am | **createdTime (auto)** | ersetzt das leere K/I-„Created" |
| Typ | **formula** (abgeleitet, s. §5) | — |

### 4.3 Neue Link-Felder auf *anderen* Tabellen → „Kunden"
> Airtable kann Link-Felder **nicht** umzielen. Die bestehenden Links zeigen auf die *alte* K/I-Tabelle und müssen neu aufgebaut werden:

| Tabelle | Neues Link-Feld | Ersetzt (alt → K/I) |
|---|---|---|
| Kalk-Snapshots | „Kunde" → Kunden | `fldk6jkQu6UEIFv6T` (Kunde → K/I) |
| Endkunden-Finanzierungsfall | „Kunde" → Kunden | `fldE6949ttL6XNSqX` (Kunden/Interessenten → K/I) |

*(Verkauft-WE.Käufer bleibt unverändert — zeigt schon auf diese Tabelle.)*

### 4.4 Wird gelöscht / nicht migriert (toter & kaputter Bestand)
| Tabelle | Feld | Füllgrad | Grund |
|---|---|---|---|
| Käufer | WEG-Verwaltung (`fldynq1lMAQC1QgT8`) | 0/123 | leer |
| K/I | Bank-Ansprechpartner (`flduTXJGY0WEpiuVG`) | 0/54 | leer (echte Bankkontakte am Finanzierungsfall) |
| K/I | Endkunden-Finanzierungsfall *(Text)* (`fldRuNod7dyJeVOlw`) | 12/54 Müll | nur Namens-Echo eines kaputten Links |
| K/I | Endkunden-Finanzierungsfall 2 *(Text)* (`flduY009HJpIVYTdm`) | 1/54 Müll | dito |
| K/I | Quick-Bonität-JSON (`fldwL7VkWLQwz1at8`) | 0/54 | leer → Feature raus (auch im Code) |
| K/I | Created (`fld9s7XunLXCfx6pa`) | 0/54 | leer → ersetzt durch echtes „Erstellt-am" |
| K/I | Name (`fldEyLcNBa1Xe3ISs`) | — | redundant → geht in Vorname/Nachname auf |

*(Die alte K/I-Tabelle wird nach erfolgreicher Migration als Ganzes archiviert/gelöscht — siehe §6.)*

---

## 5. Status-Modell

**Ein** singleSelect-Feld „Phase" (Single Source of Truth):

```
FUNNEL (App, manuell)        KÄUFER                    RAUS
─────────────────────        ──────                    ────
Lead                         Bestandskäufer            Abgebrochen
Reservierung                 (123 Importe +
Bank-Einreichung              künftige Abschlüsse)
Notar-Termin
```

- **Entfernt** (je 0 Records): „Kalkulation läuft", „Selbstauskunft", „Beurkundet" → ersetzt durch **„Bestandskäufer"** als *den* Gekauft-Status.
- Die **123 Alt-Käufer** bekommen beim Import `Phase = Bestandskäufer`. Die **2 K/I-Records ohne Phase** bekommen `Lead`.

**Abgeleitetes Feld „Typ"** (formula, read-only — Backoffice-Filter):
```
IF(Phase = "Abgebrochen", "Abgebrochen",
   IF(Phase = "Bestandskäufer", "Käufer", "Interessent"))
```

**Sichtbarkeit im Alltag:** Vertriebler sehen über den Owner-Filter nur ihre eigenen Interessenten. Die 123 Alt-Käufer haben **keinen Owner** → tauchen bei Vertrieblern nicht auf, nur bei Admin/Backoffice (filterbar per Typ/Phase).

---

## 6. Migrations-Plan (mit Sicherheits-Gates)

> **Grundprinzip:** Backup zuerst · Dry-Run vor jedem Schreibschritt · Preview-Deploy vor Live · Rollback-Pfad bereit. Während der Migration **Schreib-Freeze** (die 4 Nutzer legen ~30 Min keine Kunden an).

### Schritt 0 — Backup (Pflicht)
- Vollständiger **Export** (CSV/JSON) von `Käufer`, `Kunden/Interessenten`, `Kalk-Snapshots`, `Endkunden-Finanzierungsfall` **vor jedem Schreibzugriff**.
- Airtable-**Snapshot** der Base (Base → … → Snapshots) als 1-Klick-Rückfallpunkt.

### Schritt 1 — Schema-Erweiterung (additiv, kein Risiko)
- Auf „Käufer": die Felder aus §4.2 anlegen (Vorname, Nachname, Geburtsdatum, Owner, Phase[6 Werte], Selbstauskunft-JSON, Steuersatz, Archiviert, Letzte-Aktivität, Erstellt-am, Typ-Formel).
- Neue Link-Felder §4.3 auf Kalk-Snapshots + Endkunden-Finanzierungsfall.
- Tabelle „Käufer" → „Kunden" umbenennen.
- **Field-IDs der neuen Felder notieren** (für tables.js).

### Schritt 2 — Daten-Migration (Skript, gegen Airtable-API)
Ein **idempotentes Node-Skript** (`scripts/migrate-kunden.js`, Dry-Run-Flag):
1. Alle 54 K/I-Records + Felder lesen.
2. Pro Record: **Dubletten-Match** gegen bestehende Käufer (1. exakte E-Mail, 2. exakter Vor+Nachname) — siehe §9.
   - **Treffer** → bestehenden Käufer-Record *ergänzen* (App-Felder dazuschreiben, Notizen zusammenführen). Phase: falls Käufer schon „Bestandskäufer", die K/I-Phase nicht überschreiben.
   - **Kein Treffer** → neuen Record in „Kunden" anlegen mit App-Feldern.
3. **Mapping** `alteKiRecordId → neueKundenRecordId` aufbauen.
4. **Re-Linking**: jeden Snapshot mit altem Kunde-Link auf das neue „Kunde"-Feld umhängen; ebenso jeden Finanzierungsfall.
5. **Validierung**: Anzahl Snapshots/FFs vorher == nachher; kein verwaister Link; Stichproben-Diff.
- **Erst Dry-Run** (nur Report, kein Write) → Edgar prüft das Mapping → dann Live-Lauf.

### Schritt 3 — Code-Cutover (Branch → Preview → main)
- `api/_lib/tables.js`: `TABLES.KUNDEN` → `tblHIy1hmbpxspQGW`; `KUNDEN_FIELDS` auf die neuen/bestehenden Käufer-Field-IDs; `SNAPSHOT_FIELDS.KUNDE` + `FINANZIERUNGSFALL_FIELDS.KUNDE` → neue Link-Field-IDs.
- `public/app.js:58` `PHASEN` auf die 6 Werte; Dashboard-Chips/Badges; `api/admin/stats.js` Phasen-Liste; `styles.css` Badges. Quick-Bonität-Feature-Reste entfernen.
- `npm run guard && npm test` grün, dann Branch pushen → **Preview-URL am Handy testen** (Kunde anlegen, Snapshot, Finanzierungsfall-Handover, Admin-Stats) → erst dann `main`.
- *(Vor-Deploy: Skill `vor-deploy-check`. Field-Bindung: Skill `airtable-feld-binden`.)*

### Schritt 4 — Automation „Verkauf WE add Käufer" anpassen
- Ziel-Tabelle bleibt (jetzt „Kunden"). Neu angelegte Records: **`Phase = Bestandskäufer`** setzen.
- Team-Regel: Wenn die Person schon als Interessent existiert → Käufer-Typ **„Käufer aus Liste auswählen"** (verknüpfen statt doppeln).

### Schritt 5 — Aufräumen
- Tote Felder §4.4 löschen.
- Nach 1–2 Wochen stabilem Betrieb: alte Tabelle `Kunden/Interessenten` archivieren/löschen (Backup bleibt).

### Schritt 6 (Folge) — Komfort-Automationen
- **SEV-Häkchen** (App): bei Snapshot-Save `kunde.SEV = (kalkJson.mietverwaltung > 0)`.
- **WE-Status-Kopplung** (Airtable-Automation): WE-Status ändert sich → über Verkauft-WE verknüpften Kunden finden → Phase nachziehen. Mapping: `Reserviert→Reservierung`, `Notartermin→Notar-Termin`, `Beurkundet/Kaufpreis gezahlt→Bestandskäufer`.

---

### 6.1 Betriebskontinuität der Backstube
- **Während der Migration:** App bleibt online (Login/Rechnen/PDF), nur **Schreib-Freeze** für Kunden-Anlegen/-Bearbeiten (~30 Min, Low-Traffic-Fenster, kurze Ansage an die 4 Nutzer).
- **Live bleibt alt bis zuletzt:** Neuer Stand wird auf **Preview-URL** validiert; `main`/Live läuft unverändert weiter, bis Preview grün ist. Erst dann Umschalten.
- **Nach Cutover:** App identisch. Sichtbare Änderungen nur: Phasen-Dropdown 6 statt 8 Werte; Quick-Bonität-UI entfällt.
- **Admin-/Gesamtsicht** zeigt künftig zusätzlich die 123 Käufer (filterbar per „Typ"). **Vertriebler-Sicht unverändert** (Alt-Käufer ohne Owner → ausgeblendet).

## 7. Code-Änderungen (Überblick)

| Datei | Änderung |
|---|---|
| `api/_lib/tables.js` | `TABLES.KUNDEN`, `KUNDEN_FIELDS`, `SNAPSHOT_FIELDS.KUNDE`, `FINANZIERUNGSFALL_FIELDS.KUNDE` |
| `api/_lib/mappers.js` | ggf. Quick-Bonität-Mapping raus; sonst unverändert (arbeitet über Field-Konstanten) |
| `public/app.js` | `PHASEN`-Array (6 Werte), Phasen-Chips/Badges, Quick-Bonität-UI raus |
| `api/admin/stats.js` | Phasen-Liste auf 6 Werte |
| `public/styles.css` | Badge-Klassen für neue/entfernte Phasen |
| `scripts/migrate-kunden.js` | **neu** — einmaliges Migrations-/Re-Link-Skript (Dry-Run + Live) |

---

## 8. Risiken & Rollback

| Risiko | Gegenmaßnahme |
|---|---|
| Liqui-/Darlehen-Kette wird gestört | **Wird nicht angefasst** (Käufer-Link + Lookups bleiben). Kern-Schutz durch Ansatz A. |
| Snapshot/FF-Links verwaisen | Re-Link-Skript + Vorher/Nachher-Count-Validierung; Dry-Run zuerst. |
| Falsche Dubletten-Zusammenführung | Dry-Run-Report → Edgar gibt Merge-Liste manuell frei. |
| App schreibt während Migration ins alte Table | **Schreib-Freeze** + zeitnaher Code-Cutover. |
| Status-Werte im Code ↔ Airtable inkonsistent | Cutover-Commit ändert Airtable-Werte **und** Code gemeinsam; Preview-Test vor Live. |
| Automation dupliziert weiter | Schritt 4: „Käufer aus Liste auswählen" + Phase=Bestandskäufer. |
| **Rollback** | Base-Snapshot zurückspielen **oder** `TABLES.KUNDEN` im Code zurück auf K/I (alte Tabelle bleibt bis Schritt 5 unangetastet) + Code-Revert auf main. |

---

## 9. Dubletten (Person in beiden Listen) — Stand 2026-06-16

**Matching-Regel:** (1) exakte E-Mail, (2) exakter Vor- + Nachname. Kandidaten zur manuellen Freigabe im Dry-Run:

| Sicherheit | Person | Quelle |
|---|---|---|
| Hoch (E-Mail) | Akim Ziegert · Alexander Theilmann · Ken (Klaus) Müller · Maurice Clever | beide Listen |
| Hoch (Vor+Nachname) | Andreas Walther · Omar Al Kadi · Klaus-Michael Marx · Berat Alti | beide Listen |
| Ignorieren | Edgar Steininger (Test/Eigen-Records) | — |

→ ~8 echte Zusammenführungen, Rest (~46 Interessenten) = reines Anhängen. Müller-Namensvetter sind **kein** Match (nur identischer Nachname).

---

## 10. Offene Punkte / Reihenfolge

1. **Zuerst Kern-Merge** (Schritte 0–5), dann Komfort-Automationen (Schritt 6).
2. E-Mail-Feld-Typ auf „Käufer" von Text → email heben? (kosmetisch, optional)
3. Genaue Field-Mappings der Automation „Verkauf WE add Käufer" beim Anpassen verifizieren (welche Felder sie heute setzt).
4. Termin für den Schreib-Freeze (Low-Traffic-Fenster) festlegen.

---

*Erstellt im Brainstorming 2026-06-16. Nächster Schritt nach Freigabe: detaillierter Umsetzungsplan (writing-plans).*
