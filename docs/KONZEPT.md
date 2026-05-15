# B&B Kalkulator V2 — Konzept

Stand: 14.05.2026
Auftraggeber: Edgar Steininger, B&B Immo GmbH

## 1. Zweck

Multi-User-Web-App, die den Vertriebsprozess von Kapitalanlagen-Wohneinheiten (KAV) von der ersten Kalkulation bis zum Notar-Termin durchgängig unterstützt. Ersetzt das bisherige Google-Sheet-Provisorium und die Single-File-HTML-Variante.

**Drei Zielgruppen:**
- **Vertriebler (CC-Berater)** — kalkulieren mit dem Kunden, sammeln Selbstauskunft, generieren PDFs
- **Kunde (KAV)** — empfängt die PDFs als Beratungs-Ergebnis (E-Mail-Versand durch Vertriebler)
- **Admin (Edgar + Henry)** — verwaltet Wohneinheiten in Airtable, sieht alle Vertriebler + Kunden, pflegt Stammdaten

## 2. Vertriebs-Workflow (chronologisch, optional pro Schritt)

```
[1] Kunde anlegen
  ↓ (Vertriebler trägt Stammdaten + Quick-Bonität ein)
[2] Wohneinheit auswählen + kalkulieren
  ↓ (Live-Daten aus Airtable, Vertriebler passt Eingaben für Kunden an)
[3] PDF "Investitionsrechnung" → an Kunden mailen
  ↓ (Kunde entscheidet sich)
[4] Reservierung
  ↓ (PDF "Reservierungsformular" → an Kunden + intern)
[5] Vollständige Selbstauskunft erfassen
  ↓ (Antragsteller + ggf. Mitantragsteller, Hypovision-Format)
[6] PDF "Selbstauskunft" → an Bank schicken
  ↓ (Bank-Termin, Finanzierungs-Zusage)
[7] Notar-Termin vereinbaren
  ↓ (App zeigt Status "Beurkundet"-bereit, Vertriebler markiert manuell)
[Beurkundet] → WE verschwindet aus dem Tool (Status-Filter auf Airtable)
```

Vertriebler kann jeden Schritt einzeln aufrufen, App führt Daten chronologisch zusammen.

## 3. Architektur

### 3.1 Tech-Stack

| Komponente | Tech | Begründung |
|---|---|---|
| Frontend | Vanilla HTML/CSS/JS Single-Page-App | konsistent zur bestehenden Codebase, kein Build-Step nötig, jeder kann mitlesen |
| Hosting | Vercel | kostenlos, automatisches SSL, simple Domain-Anbindung |
| Auth | Google Identity Services (GSI) + JWT-Verify Server-Side | passwordless, alle Gesellschafter haben Google-Accounts, sehr schnelles Login |
| Backend | Vercel Serverless Functions (Node.js) | Airtable-API + Token-Validation, kein eigener Server |
| Datenbank | Airtable (Objektmanagement Base) | Edgar pflegt eh dort, kein Datenbank-Duplikat |
| PDF | Browser-`window.print()` mit @media print | bewährt aus V1, kein PDF-Library nötig |

### 3.2 Datenmodell (Airtable)

#### Neue Tabelle: `Kalk-Vertriebler`

| Feld | Typ | Beschreibung |
|---|---|---|
| Name | Single Line | Vollständiger Name |
| Email | Email, **unique** | Google-Login-Email |
| Telefon | Phone | Display im PDF-Footer |
| Foto-URL | URL | Optional Profilfoto |
| Rolle | Single Select | `Admin` / `Vertriebler` |
| Status | Single Select | `Aktiv` / `Inaktiv` |
| Created | Created Time | auto |

**Initial-Records:**
- Edgar Steininger, e.steininger@immo-stein.de, Admin
- Henry Wacker, henry@wackersolutions.de, Admin
- Laurin Zimmerer, [Mail-Platzhalter], Vertriebler
- Attilla Dizman, [Mail-Platzhalter], Vertriebler

#### Neue Tabelle: `Kalk-Kunden`

| Feld | Typ | Beschreibung |
|---|---|---|
| Vorname | Single Line | |
| Nachname | Single Line | |
| Email | Email | |
| Telefon | Phone | |
| Geburtsdatum | Date | |
| Owner | Link → Kalk-Vertriebler | Wer hat angelegt — nur dieser kann editieren/löschen |
| Phase | Single Select | `Lead` / `Kalkulation läuft` / `Reservierung` / `Selbstauskunft` / `Bank-Einreichung` / `Notar-Termin` / `Beurkundet` / `Abgebrochen` |
| Letzte-Aktivität | Last Modified | auto |
| Notizen | Long Text | Freitext |
| Selbstauskunft-JSON | Long Text | Komplette SA als JSON (Antragsteller + Mitantragsteller) |
| Quick-Bonität-JSON | Long Text | Quick-Modus-Werte (Netto, Ausgaben, EK, Steuersatz) |
| Created | Created Time | auto |

**Sichtbarkeit:** Vertriebler sieht nur Kunden mit `Owner = self`. Admin sieht alle.

#### Neue Tabelle: `Kalk-Snapshots`

| Feld | Typ | Beschreibung |
|---|---|---|
| Bezeichnung | Single Line | z.B. "Hr. Müller — WE 12 Bruchsal" |
| Kunde | Link → Kalk-Kunden | |
| Wohneinheit | Link → Wohneinheit | Aus bestehender WE-Tabelle |
| Kalkulations-JSON | Long Text | komplette Eingaben + Ergebnisse als JSON |
| Erstellt-von | Link → Kalk-Vertriebler | |
| PDF-Typ | Single Select | `Investitionsrechnung` / `Reservierung` / `Selbstauskunft` |
| Created | Created Time | auto |

#### Erweiterung der bestehenden Tabelle `Wohneinheit`

Neue Felder (Admin pflegt, Tool liest):

| Feld | Typ | Beschreibung |
|---|---|---|
| Kalk-AfA-Satz | Number (%) | z.B. 2 %, 3,7 %, 4,5 % |
| Kalk-Gebäude-Anteil | Number (%) | Default 80 % |
| Kalk-Subvention-Mo | Currency | €/Mo, default 0 |
| Kalk-Subvention-Monate | Number | Default 0 |
| Kalk-Mietsteigerung-Modus | Single Select | `Sprung 3J` / `Index jährlich` |
| Kalk-Mietsteigerung-% | Number (%) | z.B. 15, 20, 2 |
| Kalk-Hausgeld | Currency | €/Mo |
| Kalk-Hausverwaltung | Currency | €/Mo (WEG) |
| Kalk-Inflation | Number (%) | Default 3 % |

→ Sobald Edgar diese Felder pro WE pflegt, taucht die WE im Tool auf (mit den Werten). Vorher nur mit Pauschal-Defaults aus dem Tool.

**Filter im Tool:** `Status = "Vermarktung / Im Verkauf"` UND `Maklerfirma = "B&B Immo GmbH"` UND `Kalk-AfA-Satz` nicht leer (= Kalkulation hinterlegt).

### 3.3 Auth-Flow

```
1. User öffnet kalkulator.bub-immo.de
2. Login-Screen: "Mit Google anmelden"
3. Google OAuth Pop-up → User authentifiziert sich mit Gesellschafter-Mail
4. Google liefert ID-Token (JWT) zurück an Frontend
5. Frontend schickt Token an /api/auth/verify
6. Server-Side: validiert Token (Google-Public-Keys), liest Email
7. Server-Side: prüft Airtable Kalk-Vertriebler: ist Email gelistet + Status = Aktiv?
   → Nein: 403, "Du hast keinen Zugriff"
   → Ja: Server setzt httpOnly Session-Cookie (signed JWT 30 Tage gültig)
8. Frontend ruft /api/me → bekommt Vertriebler-Profile (Name, Rolle)
9. Browser ist eingeloggt — alle weiteren API-Calls validieren Session-Cookie
```

### 3.4 Permissions

| Action | Vertriebler | Admin |
|---|---|---|
| Wohneinheiten lesen | ✓ | ✓ |
| Wohneinheiten ändern | ✗ (nur via Airtable-Pflege) | ✗ (nur via Airtable-Pflege) |
| Eigene Kunden lesen/editieren/löschen | ✓ | ✓ |
| Fremde Kunden lesen/editieren | ✗ | ✓ (lesen + editieren, aber **nicht löschen** — sonst chaotisch) |
| Snapshots speichern | ✓ | ✓ |
| Vertriebler-Liste pflegen | ✗ | ✓ (über Airtable, nicht im Tool) |
| Statistik global sehen | ✗ | ✓ |

## 4. UX-Konzept

### 4.1 Vertriebler-Workflow nach Login

**Dashboard:**
```
┌─────────────────────────────────────────────────────────────┐
│ B&B Kalkulator         Edgar Steininger ▼     [Logout]      │
├─────────────────────────────────────────────────────────────┤
│ MEINE KUNDEN                                  + Neuer Kunde │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Hr. Müller              Reservierung   vor 2h    ▶     │ │
│ │ Fr. Schmidt             Kalkulation    vor 1d    ▶     │ │
│ │ Hr. Karcher             Lead           vor 3d    ▶     │ │
│ │ ...                                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                              │
│ STATISTIK (mein Bereich)                                    │
│ • 12 aktive Kunden · 3 in Reservierung · 1 in Notar         │
└─────────────────────────────────────────────────────────────┘
```

**Klick auf einen Kunden → Kunden-Detail mit drei Tabs:**

```
┌───────────────────────────────────────────────────────────┐
│ Hr. Müller — Kalkulation läuft        [PDF] [Phase ▼]    │
├───────────────────────────────────────────────────────────┤
│ [Übersicht]  [Kalkulator]  [Selbstauskunft]              │
├───────────────────────────────────────────────────────────┤
│ - Stammdaten, Notizen, Letzte Aktivität, Phasen-History  │
│ - Liste der gespeicherten Snapshots/Berechnungen          │
│ - Liste der generierten PDFs (Download + Re-Send)         │
└───────────────────────────────────────────────────────────┘
```

**Kalkulator-Tab:**
- WE-Auswahl: Dropdown / Liste der verfügbaren WEs (live aus Airtable)
- Bei WE-Auswahl: alle Felder mit Airtable-Stammdaten vorbefüllt
- **Reset-Button:** „Auf aktuelle Stammdaten zurücksetzen" — holt Airtable neu
- Eingaben können editiert werden (lokale Session)
- Live-Charts (wie V1)
- **„Snapshot speichern"-Button:** schreibt Kalkulation in Airtable Kalk-Snapshots
- **„PDF Investitionsrechnung"-Button:** generiert PDF mit Vertriebler-Branding

**Selbstauskunft-Tab:**
- Quick-Modus + Detail-Modus (wie V1)
- Bei Detail-Modus: Full-Width-Layout (wie nach Iter 13)
- **„PDF Selbstauskunft"-Button:** generiert Bank-Selbstauskunft

### 4.2 Admin-Workflow

Zusätzliche Tabs nach Login:
- **Vertriebler-Übersicht:** Liste aller Vertriebler, Anzahl Kunden pro Vertriebler, Statistik
- **Globale Kunden-Liste:** alle Kunden aller Vertriebler, gefiltert/sortierbar
- **Globale Statistik:** Wieviele Kunden je Phase, je Vertriebler, je Wohneinheit
- **Wohneinheiten-Übersicht:** alle WEs mit Status (= Airtable-Spiegel), Klick → springt zur Airtable-Ansicht

### 4.3 PDF-Layout

**Investitionsrechnung (Kunde):**
- Cover: B&B-Logo + Kunde-Name + WE-Bezeichnung + Datum
- Seite 2-3: Übersicht (5 KPIs + 3 Charts)
- Seite 4-5: Detail (Cashflow 30 J., Vermögensaufbau 10 J., Annahmen)
- Footer auf jeder Seite: Vertriebler-Name, E-Mail, Telefon
- Datenschutz-Hinweis: „Diese Berechnung ist unverbindlich..."

**Reservierungsformular:**
- Cover: B&B-Logo + Titel
- Seite 1: Kundendaten (Antragsteller), WE-Daten (KP, Lage), Reservierungs-Bedingungen
- Unterschriften-Bereich
- Footer: Vertriebler-Daten

**Selbstauskunft (Bank):**
- Wie V1, aber mit Vertriebler-Footer (zusätzlich zu B&B-Branding)

## 5. Lokale Offline-Variante

Bleibt eine **separate** Datei (`BB_Kalkulator_Offline.html`), basierend auf der aktuellen V1.11.

**Unterschiede zur Online-Version:**
- Kein Login, keine Kundenverwaltung
- Wohneinheiten = hartkodierte Presets (Wesseling 5 + Bruchsal 17)
- Selbstauskunft + PDF-Export weiterhin verfügbar
- Hinweis-Banner oben: „Offline-Modus — Kunden-Speicherung nicht verfügbar. Für CRM-Funktionen → kalkulator.bub-immo.de"

Vertriebler nimmt die Offline-Datei mit zum Kundentermin ohne Internet, kann kalkulieren + PDF generieren — aber Snapshot wird nicht in Airtable gespeichert.

## 6. Setup-Aufwand für Edgar (morgen)

1. **Google Cloud Console** (10 Min): OAuth-Client-ID erstellen, Domain `bub-immo.de` als autorisierte Origin eintragen → Client-ID kopieren
2. **Airtable Personal Access Token** (3 Min): Token mit Scope auf Objektmanagement-Base erstellen → kopieren
3. **Vercel-Account** (3 Min): Bei Vercel mit Google einloggen, neues Projekt erstellen
4. **Repo importieren** (5 Min): GitHub-Repo aus dem `webapp-v2/`-Ordner erstellen, in Vercel verknüpfen
5. **Env-Variablen setzen** (3 Min): in Vercel: `GOOGLE_CLIENT_ID`, `AIRTABLE_TOKEN`, `JWT_SECRET`, `AIRTABLE_BASE_ID`
6. **DNS** (10 Min): Subdomain `kalkulator.bub-immo.de` auf Vercel-IP routen (CNAME zu vercel-dns)

Gesamt ca. 30-40 Minuten Setup.

## 7. Phase 1 vs. Phase 2

**Phase 1 (jetzt) — MVP-bereit:**
- Login mit Google + Whitelist
- Dashboard (eigener Bereich)
- Kunden CRUD (eigene Owner-Logik)
- Kalkulator mit Live-Airtable-WE-Daten + Reset
- PDF-Export: Investitionsrechnung, Reservierungsformular, Selbstauskunft
- Admin-Panel: alle Kunden + Statistik
- Lokale Offline-Datei weiterhin verfügbar

**Phase 2 (später) — Komfort + Skalierung:**
- **PandaDoc-Integration für E-Signatur** (siehe Abschnitt 9 unten — Endpoint-Stub schon vorhanden)
- Wiedervorlage-Erinnerungen per Email
- Erweiterte Statistik (Funnel-Analyse, Vertriebler-Performance)
- Multi-Vertriebler-Zuweisung (Co-Beratung)
- Notar-Workflow (Datenblatt-Generator)
- Mobile-App-View (PWA)
- HubSpot-Sync (Lead-Daten aus HubSpot übernehmen, Phase nach HubSpot zurückschreiben)

## 8. Erfolgs-Kriterien

- Jeder der 4 Gesellschafter kann sich morgen einloggen
- Edgar kann einen Test-Kunden anlegen, eine WE kalkulieren, ein PDF generieren — alles in < 5 Min
- Daten landen sauber in Airtable
- Edgar als Admin sieht alle Test-Kunden
- Offline-Datei läuft weiterhin per Doppelklick

## 9. PandaDoc-Integration für die Selbstauskunft (Phase 2, vorbereitet)

Ziel: Wenn der Kunde im Kalkulator-Tab "Selbstauskunft als PDF" klickt, wird das Dokument
nicht (nur) lokal gespeichert, sondern automatisch an PandaDoc übergeben — von dort
gehen die Empfänger-Mails raus, der Kunde unterzeichnet digital, signierte PDFs werden
automatisch zurück in Airtable abgelegt.

### Architektur

```
Webapp-Frontend                Vercel-Backend                  PandaDoc
─────────────────              ──────────────                  ─────────
Klick "An Kunde senden"  ─▶   POST /api/sa/send-for-signature ─▶  Document erstellen
                                  (Stub: api/sa/send-for-signature.js) (aus Template)
                                                                       │
                                                                       ▼
                                                                  Document senden
                                                                       │
                                                                       ▼
Kunde bekommt Mail        ◀──────────────────────────────────  Mail-Versand
Kunde unterzeichnet        ─▶   POST /api/sa/signature-webhook ◀── Webhook
                                  (noch zu bauen)
                                  ↓
                              signiertes PDF in Airtable speichern
                              Kundenphase auf "SA unterschrieben" setzen
```

### Was bereits umgesetzt ist

- **PDF-Layout** in `public/pdf.js` enthält bereits PandaDoc-Token-Tags:
  `{{Signature1}}`, `{{Date1}}` für Antragsteller, plus `{{Signature2}}`, `{{Date2}}` für
  Mitantragsteller. Tags sind im PDF sichtbar (Courier 8px, dezent), werden von PandaDoc
  beim Template-Upload automatisch als Signaturfelder erkannt.
- **API-Endpoint-Stub** `api/sa/send-for-signature.js` ist funktionsfähig vorbereitet,
  inkl. Auth-Check, Body-Validierung, PandaDoc-API-Calls (Template-basiert), Empfänger-
  und Token-Mapping aus saJson, Polling auf draft-Status, automatischer Versand.
- **Env-Vars-Slot:** `PANDADOC_API_KEY`, `PANDADOC_TEMPLATE_ID_SA`, `PANDADOC_WEBHOOK_SECRET`
  werden ausgewertet, mit klarer 503-Fehlermeldung wenn nicht gesetzt.

### Was noch zu tun ist (Phase-2-Setup, ca. 60 Min Edgar-Aufwand + 90 Min Code)

1. **PandaDoc-Account anlegen** (ggf. 14 Tage Free-Trial, danach Business-Plan ab €49/Monat
   für 500 Documents/Monat). Workspace einrichten, "Text Tags" in Settings aktivieren.
2. **Template hochladen:** Aktuelles SA-PDF einmal per Drucken→PDF-Datei exportieren, in
   PandaDoc als Template hochladen. Die `{{Signature1}}`/`{{Date1}}`-Markierungen werden
   automatisch zu Feldern. Roles "Antragsteller" und "Mitantragsteller" definieren.
   Variable-Tokens für die Daten-Felder hinzufügen (`{{Antragsteller.Name}}`, `{{Antragsteller.Adresse}}` etc.).
3. **Env-Vars in Vercel setzen:** API-Key + Template-UUID + Webhook-Secret.
4. **Frontend-Button:** In `app.js` → `renderTabSelbstauskunft()` zweiten Button neben "PDF
   Selbstauskunft": "An Kunde zur Unterschrift senden". Bestätigungs-Dialog ("an
   {email} versenden?"), dann `await api.post('/api/sa/send-for-signature', { kundeId })`.
5. **Webhook-Endpoint** `api/sa/signature-webhook.js` bauen (PandaDoc → Backend). Empfängt
   Status-Updates (`document.completed`, `document.viewed` etc.), prüft Webhook-Secret,
   lädt signiertes PDF aus PandaDoc (`GET /documents/{id}/download`), speichert in
   Airtable-Attachment-Feld, setzt Kundenphase auf "Selbstauskunft unterschrieben".
6. **Airtable-Schema-Erweiterung:** Neues Feld `SA_SIGNED_PDF` (Attachment) und
   `PANDADOC_DOC_ID` (Text) in Kunden-Tabelle. tables.js + mappers.js anpassen.

### Alternative: PDF direkt hochladen (statt Template)

Wenn das PDF-Layout häufig geändert wird, kann man PandaDoc-Templates umgehen und das
PDF aus dem Browser direkt an die API streamen. Trade-offs siehe Kommentar-Block am Ende
von `api/sa/send-for-signature.js` (Variante B). Empfehlung: erstmal Template-Weg,
weil rechtsicherer und stabiler.

---

Stand: 15.05.2026, Konzept v1.1 (+ PandaDoc-Vorbereitung)
