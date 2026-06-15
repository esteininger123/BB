# Spec: Finanzierungs-Handover (Reservierung → Finanzierung)

**Datum:** 2026-06-15
**Auftraggeber:** Edgar Steininger
**Anlass:** Mitarbeiter aus der Finanzierung will den Prozess nach der Kunden-Reservierung verbessern. Heute läuft die Übergabe per WhatsApp-Zuruf, ohne sauberen Handover.
**Status:** Design abgestimmt, bereit für Implementierungsplanung

---

## 1. Problem

Wenn ein Kunde reserviert hat, muss die Finanzierung loslegen — bekommt die nötigen Infos aber heute nur per Zuruf (WhatsApp/E-Mail). Sie muss selbst zusammensuchen:

- Selbstauskunft (unterschrieben) als Dokument
- Kundenunterlagen (Gehaltsnachweise, Steuerbescheid, Ausweis, EK-Nachweis …)
- Welche Einheit, welche Kalkulation gerechnet wurde
- Hausbank/Berater vorhanden? 100 % vs. 107 %? EK-Wunsch? Was ist dem Kunden wichtig?

Der **größte Schmerz sind die Dokumente** (unterschriebene SA + Kundenunterlagen), nicht die Zahlen.

## 2. Ziel & Scope

**Phase 1 (dieses Spec):** Sauberer, weitgehend automatisierter Handover. Ergebnis: Die Finanzierung findet pro Fall in **einer Airtable-Liste** alle Infos, das Drive mit allen Dokumenten verlinkt, und einen klaren Status. Der Kunde lädt seine Unterlagen selbst hoch.

**Bewusste Strategie — Phasen-Hybrid:** Die App legt den Fall vorbefüllt an; die Finanzierung **arbeitet zunächst im Airtable-Interface** (kein eigenes Finanzierungs-Frontend). Ein vollwertiges Finanzierungs-Portal im Frontend ist **Phase 2**, erst wenn der Prozess in der Praxis steht. Begründung: kein Portal-UI auf einen ungetesteten Prozess bauen.

## 3. Nicht-Ziele (bewusst draußen)

- **Kein** Finanzierungs-Frontend / eigene Rolle in der App (Phase 2).
- **Kein** automatischer PandaDoc→Drive-Webhook. Die signierte SA wird vorerst **manuell** ins Drive gelegt (Download/Upload). Grund: PandaDoc kennt den Ziel-Kunden nicht von selbst, die Zuordnungs-Mechanik lohnt für „Download → Upload" nicht.
- **Keine** Quick-Bonität im Fall. Quick ist reines Vertriebs-Werkzeug; die Finanzierung bekommt die echte Selbstauskunft.
- **Kein** „an Bank senden" aus der App (Phase 2). Bank-Zuordnung + Kommunikation macht die Finanzierung im Airtable-Interface.

## 4. Leitentscheidungen (abgestimmt)

| Thema | Entscheidung |
|---|---|
| Auslöser | Bewusster Vertriebler-Button „An Finanzierung übergeben" + Mini-Formular |
| Maßgebliche Kalkulation | Vertriebler **wählt** beim Übergeben einen Snapshot (neuester vorgewählt) |
| Bank-Zuordnung | Macht die **Finanzierung** (sie hat den Banken-Pool + Region-Logik), nicht der Vertrieb |
| Dokumenten-Speicher | **Google Drive**, ein Ordner pro Kunde, **automatisch angelegt** |
| Selbstauskunft | Als **Dokument** im Drive (datiert, unterschrieben), **nicht** als App-Felder → löst das Aktualitätsproblem |
| Objektzahlen | Aus gewähltem Snapshot, eingefroren + sichtbar datiert („Stand vom …") |
| Kunden-Upload | Schlankes **eigenes Token-Portal** → Drive (kein roher Drive-Freigabelink) |
| Kunden-Einsicht | Über **dasselbe Token-Portal**: Kunde liest Objektunterlagen (read-only) + sieht seine eigenen Uploads. Kein öffentlicher Drive-Link |
| SA-Signatur | PandaDoc bleibt wie heute (vorerst manuell ins Drive) |

## 5. Architektur

### 5.1 Was schon existiert (nutzen)

- **Tabelle `Endkunden-Finanzierungsfall`** (`tblM4e4tDae2o9mQz`) inkl. fertigem Status-Workflow (s. 6.3).
- **Tabelle `Ansprechpartner - Endkundenfinanzierung`** (`tbl7lKV8DVZasu0d4`) = Banken-/Vermittler-Pool (Finanzierung pflegt).
- **`Kalk-Snapshots`** mit Klartext-Kennzahlen (Kaufpreis, EK-Bedarf, Zins, Tilgung, IRR …).
- **PandaDoc** SA-Signatur (produktiv).
- **Google Workspace** (jeder Mitarbeiter hat Zugang) → Basis für Drive-Service-Account.

### 5.2 Was wir bauen (Bausteine)

| Kürzel | Baustein | Größe |
|---|---|---|
| **A** | Vertriebler-Button + Übergabe-Dialog (Snapshot wählen + Mini-Formular) → Fall anlegen, Kennzahlen schreiben, Status „Unterlagen noch anfordern" | klein |
| **D** | Google-Drive-Service-Account: beim Übergeben Kunden-Ordner automatisch erzeugen, Share-Link in Fall-Feld `Kunden-Drive` | mittel (Fundament) |
| **U** | Kunden-Portal (bidirektional): Token-Link ohne Login. Kunde **lädt hoch** (Checkliste), **liest** die Objektunterlagen der WE, **sieht** seine eigenen Uploads. Bei Vollständigkeit Status hochsetzen | mittel |
| **C** | Airtable aufräumen (3 Chaos-Felder) + Finanzierungs-Interface spezifizieren | klein |

**Lieferreihenfolge:** **A+D → U → C** (jeder Schritt liefert eigenständigen Wert; D ist Fundament für U).

### 5.3 Datenfluss

```
VERTRIEBLER (App)            BACKEND                         GOOGLE DRIVE          AIRTABLE (Cockpit)        FINANZIERUNG
────────────────            ───────                         ────────────          ──────────────────        ────────────
Klick "An Finanzierung  ──▶ POST /api/finanzierung/uebergeben
übergeben"                   │
Dialog:                      ├─ liest gewählten Snapshot
 ① Snapshot wählen           ├─ + Mini-Formular
 ② Mini-Formular             ├─ legt Kunden-Ordner an  ──────▶  /Kundenfinanzierung/
Absenden                     │                                    <Nachname>, <Vorname>/
                             ├─ schreibt Fall:        ──────────────────────────────▶ Fall-Record:
                             │   • Links (Kunde/WE/Snapshot)                            • Kennzahlen (Klartext)
                             │   • Kennzahlen + Formular                                • Formular-Felder
                             │   • Kunden-Drive-Link                                    • Status "Unterlagen
                             │   • Status "Unterlagen noch anfordern"                     noch anfordern"
                             └─ erzeugt Upload-Token
                                                                                                            ┌─ arbeitet im
Vertriebler schickt Upload-Link an Kunden (Mail/WhatsApp)                                                   │  Airtable-Interface:
                                                                                                            │  • Bank zuordnen
KUNDE                        POST /api/finanzierung/upload/<token>                                           │  • Status pflegen
─────                         │                                                                             │  • nachfassen
öffnet Link, Checkliste  ──▶ ├─ validiert Token (Ablauf)                                                    │
lädt Dokumente +             ├─ Datei → Kunden-Ordner   ─────▶  …/<Nachname>/<datei>                        │
unterschriebene SA hoch      └─ bei vollständig: Status "Unterlagen vollständig" ──────────────────────────┘
```

### 5.4 Drive-Struktur & Kunden-Portal

**Drive-Ordnerstruktur:**
```
/Kundenfinanzierung/
  Mustermann, Max — F-1042/        ← Kunden-Ordner (auto-angelegt bei Übergabe)
    (Kunden-Uploads …)            ← nur was der Kunde hochlädt

/Objektunterlagen (zentral, je Objekt) ← EIGENER Drive-Ordner pro Objekt,
                                          NICHT im Kundenordner, einmal gepflegt
```

**Objektunterlagen — zentral einblenden, nicht kopieren** (Entscheidung 2026-06-15):
- An der **Objekt-Tabelle** (`tblbBSh0fyPelFLvz`) das Feld **`Verkaufsunterlagen`** (`fldKFHZROEU4sASDy`, url, angelegt 2026-06-15) — Link auf den zentralen Drive-Ordner mit allen Objektunterlagen. B&B pflegt das einmal pro Objekt. **Pflege läuft parallel, ist Voraussetzung für Baustein U.**
- Auflösung der Kette: Fall → Wohneinheit (`WE_FIELDS.WOHNEINHEIT`) → Objekt (`WE_FIELDS.PROJEKT` = Link auf Objekt-Tabelle) → `Verkaufsunterlagen`.
- Das Portal **listet die Dateien dieses Ordners read-only** (Drive-API `files.list` in dem Ordner) — es wird **nichts physisch kopiert**. Vorteile: keine Duplikate, immer aktuell, kein rekursives Kopieren / Timeout.

**Kunden-Portal** (hinter Token-Link, ohne Login, mobil-tauglich):
```
┌─ Kunden-Portal ──────────────────────────────────────────┐
│  📂 Objektunterlagen (lesen/runterladen)                 │  ← read-only aus zentralem Objekt-Ordner
│  ⬆️  Unterlagen hochladen (Checkliste + "Sonstiges")     │  ← Upload → Kunden-Ordner
│  ✅ Meine hochgeladenen Dokumente                         │  ← Kontrolle, was schon da ist
└──────────────────────────────────────────────────────────┘
```

- **Ein Link für alles** — derselbe Token deckt Lesen (Objektunterlagen + eigene Uploads) und Hochladen ab.
- **Kein roher Drive-Freigabelink.** Das Backend listet/streamt; der Kunde bekommt nie einen direkten Drive-Link. Objektunterlagen kommen read-only aus dem zentralen Objekt-Ordner, Kunden-Uploads aus dem Kunden-Ordner.

## 6. Datenmodell-Änderungen (Airtable)

Base: `appikHUetNyeonXBX`.

### 6.1 Neue Felder in `Endkunden-Finanzierungsfall` (`tblM4e4tDae2o9mQz`)

Vorhandene Felder bleiben. Neu anzulegen (Field-IDs entstehen beim Anlegen):

| Feld | Typ | Quelle | Zweck |
|---|---|---|---|
| Snapshot | Link → `Kalk-Snapshots` (`tbliqxbITCdSjK0ua`) | App | Herkunft / Drill-down zur Kalkulation |
| Stand vom | Date | App (Snapshot-Datum) | Aktualität der Objektzahlen sichtbar |
| Kaufpreis | Currency | Snapshot | Klartext fürs Cockpit |
| EK-Bedarf (gerechnet) | Currency | Snapshot | Klartext |
| Zins % | Number/Percent | Snapshot | Klartext |
| Tilgung % | Number/Percent | Snapshot | Klartext |
| Finanzierungsform „andere" | Single Line | Formular | Ergänzung zu den vorhandenen 100 %/107 %-Checkboxen |
| Max. Eigenkapital | Currency | Formular | EK-Obergrenze, die der Kunde einbringen will |
| Hausbank vorhanden | Checkbox | Formular | |
| Hausbank — Name | Single Line | Formular | |
| Hausbank — Berater | Single Line | Formular | Berater-Kontakt bei der Hausbank |
| Eigener Finanzberater | Checkbox | Formular | |
| Finanzberater — Kontakt | Single Line | Formular | |
| Was ist dem Kunden wichtig | Long Text | Formular | Niedrige Rate / schnelle Zusage / Sondertilgung … |
| Notartermin-Ziel | Date | Formular | Priorität für die Finanzierung |
| SA-Status | Single Select (`fehlt` / `liegt vor`) | App/manuell | Gate: Einreichung erst wenn SA da |
| Upload-Token | Single Line (intern) | App | Bindung des Kunden-Links an den Fall |
| Upload-Link gültig bis | Date | App | Token-Ablauf |

> **Hinweis Finanzierungsform:** Die Tabelle hat bereits Checkboxen `100 %` (`fldwBkuOlUEhqmi1I`) und `107 %` (`fldJKQwW8w5S7lNzk`). Diese nutzen wir; nur „andere" braucht ein zusätzliches Textfeld.

### 6.2 Cleanup in `Kunden/Interessenten` (`tbld0j0Mo7rre1Vh3`)

Drei verwaiste Reste aus manuellen Verlink-Versuchen — **Vorschlag, vor Löschung mit Edgar/Finanzierung bestätigen** (Feld-Löschung ist unumkehrbar):

| Feld-ID | Name | Typ | Aktion |
|---|---|---|---|
| `flduTXJGY0WEpiuVG` | Bank-Ansprechpartner | singleLineText | löschen (Müll) |
| `fldRuNod7dyJeVOlw` | Endkunden-Finanzierungsfall | singleLineText | löschen (Müll) |
| `flduY009HJpIVYTdm` | Endkunden-Finanzierungsfall 2 | singleLineText | löschen (Müll) |
| `fldIZITOXmztZbyed` | Endkunden-Finanzierungsfall 3 | multipleRecordLinks | **behalten** (echter Link), auf „Endkunden-Finanzierungsfall" umbenennen |

### 6.3 Status-Workflow (existiert, andocken)

Bestehende Choices in `Status Kundenfinanzierung` (`fldgEgmxmVEMhFOdz`):
`Unterlagen noch anfordern → angefordert → unvollständig → vollständig → in Prüfung → Nachforderung der Bank → Angebot erhalten/Kunden besprechen → Finanzierung zugesagt → Abgeschlossen` (+ `Finanziert selbst`, `Abgebrochen`).

- **Übergabe-Akt** setzt Status `Unterlagen noch anfordern`.
- Sobald der Upload-Link versendet wird (optional): `Unterlagen angefordert`.
- **Upload vollständig** (alle Pflicht-Checklistenpunkte) → `Unterlagen vollständig`.
- Ab `in Prüfung` arbeitet ausschließlich die Finanzierung.

## 7. Code-Artefakte (Vanilla JS / Vercel Functions)

| Datei | Neu/Ändern | Inhalt |
|---|---|---|
| `api/finanzierung/uebergeben.js` | neu | POST: Auth-Check, Snapshot lesen, Drive-Ordner anlegen, Fall anlegen, Token erzeugen |
| `api/finanzierung/portal/[token].js` | neu | GET: Token validieren → Objektunterlagen-Liste + bisherige Kunden-Uploads + Checklisten-Status; POST: Datei in Kunden-Ordner schreiben, ggf. Status setzen |
| `api/_lib/drive.js` | neu | Google-Drive-Service-Account-Wrapper (Ordner anlegen, Datei hochladen, Share-Link) |
| `api/_lib/tables.js` | ändern | `FINANZIERUNGSFALL_FIELDS` + Field-IDs ergänzen |
| `api/_lib/mappers.js` | ändern | Fall-Mapper (App-JSON ↔ Airtable) |
| `public/app.js` | ändern | Button „An Finanzierung übergeben" im Kunden-Detail + Übergabe-Dialog (Snapshot-Auswahl + Formular) |
| `public/upload.html` + JS | neu | Kunden-Upload-Portal (Token-Route, Checkliste, Upload, mobil-tauglich) |
| `public/styles.css` | ändern | Dialog + Portal-Styles (B&B-Branding) |
| `vercel.json` | ggf. | Route-Mapping fürs Portal |

**Neue Env-Vars (Vercel):**
- `GOOGLE_SA_KEY_B64` — Service-Account-JSON, base64-kodiert
- `DRIVE_ROOT_FOLDER_ID` — Wurzel (geteilte Ablage „Kundenfinanzierung")
- `UPLOAD_TOKEN_SECRET` — HMAC-Secret für die Upload-Token

## 8. Sicherheit & DSGVO

- **Upload-Token:** signiert (HMAC) **und** an den Fall gebunden, mit Ablaufdatum (Default 30 Tage). Unrate-bar. Kein Listing fremder Dateien.
- **Drive-Ordner:** liegen in einer **geteilten Ablage**, Zugriff intern (Finanzierung/Vertrieb), **nicht** öffentlich/„jeder mit Link". Service-Account ist Eigentümer der Ablage.
- **Sensible Daten** (Ausweis, Gehaltsnachweis): nur über das Token-Portal, kein öffentlicher Index, Transport per HTTPS.
- **Kunden-Einsicht** (Objektunterlagen + eigene Uploads) läuft **ausschließlich** über das Token-Portal — das Backend listet/streamt die Dateien, der Kunde bekommt **nie** einen direkten Drive-Freigabelink. Damit ist kein sensibles Dokument „für jeden mit Link" erreichbar.
- **Vercel-Body-Limit ~4,5 MB/Request:** pro Datei akzeptieren; größere Dateien mit klarem Hinweis ablehnen. Resumable/Direct-to-Drive-Upload ist eine spätere Optimierung, falls nötig.

## 9. Setup-Aufwand (Edgar, einmalig)

1. **Google Cloud:** Projekt + Service-Account, Drive-API aktivieren, Service-Account-Key erzeugen. Geteilte Ablage „Kundenfinanzierung" anlegen, Service-Account als Mitglied. (~30 Min)
2. **Vercel:** `GOOGLE_SA_KEY_B64`, `DRIVE_ROOT_FOLDER_ID`, `UPLOAD_TOKEN_SECRET` setzen. (~5 Min)
3. **Airtable:** neue Felder anlegen lassen (oder per Skill `airtable-feld-binden` ziehen), Cleanup bestätigen.

## 10. Offene Punkte (vor/während Implementierung klären)

- **Unterlagen-Checkliste:** vorerst mit Vorschlag bauen, später leicht überarbeitbar (im Code als Liste pflegbar). Vorschlag: letzte 3 Gehaltsabrechnungen, letzter Steuerbescheid/EkSt, Ausweis (Vorder-/Rückseite), Eigenkapitalnachweis (Kontoauszug/Depot), unterschriebene Selbstauskunft; bei Selbstständigen zusätzlich BWA/Bilanzen. **Plus offener Sammelpunkt „Sonstige Unterlagen"** (freie Uploads).
- **Objektunterlagen:** entschieden 2026-06-15 — zentral pro **Objekt** gepflegt, vom Portal read-only eingeblendet (nicht kopiert). Feld `Verkaufsunterlagen` (`fldKFHZROEU4sASDy`) ist an `tblbBSh0fyPelFLvz` **angelegt** ✅. **TODO Team:** pro Objekt den Drive-Link eintragen (Voraussetzung für Baustein U). Offen für D/U: Drive-Leserecht des Service-Accounts auf die zentralen Objekt-Ordner.
- **Drive-Ordner-Naming:** Vorschlag `<Nachname>, <Vorname> — <Fall-ID>`. Edgar bestätigt.
- **Feld-Löschung 6.2:** Bestätigung, dass die drei Felder wirklich Müll sind (keine Airtable-Automation/Interface hängt dran).
- **Versand des Upload-Links:** Phase 1 = Vertriebler kopiert Link aus der App und schickt ihn selbst (Mail/WhatsApp). Automatischer Versand = später.

## 11. Erfolgskriterien

- Vertriebler übergibt einen reservierten Kunden in < 2 Min an die Finanzierung.
- Pro Fall entsteht automatisch: Airtable-Record (Zahlen + Formular + Status) **und** ein Drive-Ordner mit Link.
- Der Kunde lädt seine Unterlagen über einen Link selbst hoch; sie landen im richtigen Drive-Ordner.
- Der Kunde sieht über denselben Link die Objektunterlagen und kontrolliert seine eigenen Uploads — ohne Login, ohne öffentlichen Drive-Link.
- Die Finanzierung arbeitet ausschließlich in der Airtable-Liste, ohne per WhatsApp nachzujagen.

## 12. Umsetzungs-Stand & nächste Schritte (Stand 2026-06-15)

**Live & getestet:**
- ✅ **Baustein A** — Übergabe-Button + Fall (Kennzahlen, Mini-Formular mit Progressive Disclosure, Vertriebs-Notiz, SA-Hinweis). Zins/Tilgung im Fall als `percent` (Airtable-Feldtyp). Phase springt auf „Bank-Einreichung".
- ✅ **Baustein D** — Auto-Drive-Ordner beim Übergeben, Link ins Fall-Feld `Kunden-Drive`. Läuft über **OAuth** (`info@bub-immo.de`-Refresh-Token, kein Service-Account — Org blockt SA-Keys). Siehe Memory `bb-drive-oauth-setup`. Drive-Fehler sind nicht-kritisch (Fall entsteht trotzdem).
- ✅ Verkaufsunterlagen-Links pro Objekt: **hinterlegt** (Feld `Verkaufsunterlagen` `fldKFHZROEU4sASDy` an `tblbBSh0fyPelFLvz`).

**Offene Nachbesserungen an Baustein A (zuerst angehen):**
1. **Aktivitäts-Historie:** Beim Übergeben einen Eintrag in die Aktivitäten-Historie des Kunden schreiben (z.B. „An Finanzierung übergeben am …"). Mechanik existiert im Frontend (`parseKavTracker`/`addActivityEntry`, Notizen-Feld). Sauberster Weg: Frontend-Handler `uebergebeAnFinanzierung` schreibt nach Erfolg einen Aktivitätseintrag, oder Backend ergänzt die Kunden-Notizen.
2. **Warn-Dialog bei erneuter Übergabe:** Wenn der Kunde **schon einen Finanzierungsfall** hat, vor dem Modal warnen + bewusste Bestätigung verlangen („Es existiert bereits ein Fall — wirklich einen weiteren anlegen?"). Fall-Existenz prüfen: Kunde ist mit Fall verlinkt (Kunden-Feld `Endkunden-Finanzierungsfall`, Link `fldIZITOXmztZbyed`) — beim Kunden-Laden mitliefern oder per kleinem GET prüfen.

**Nächster großer Baustein: U (Kunden-Portal)** — Voraussetzung (Verkaufsunterlagen-Links) erfüllt, kann starten. Token-Portal: Upload → Kunden-Drive-Ordner, Objektunterlagen read-only einblenden (aus Objekt-`Verkaufsunterlagen` über Kette Fall→WE→Objekt), eigene Uploads anzeigen. Danach **C** (Cleanup der 3 Müll-Felder in der Kunden-Tabelle + Finanzierungs-Interface in Airtable).
