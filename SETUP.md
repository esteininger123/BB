# BB Kalkulator V2 — Setup-Anleitung

Stand: 14.05.2026

**Geschätzter Aufwand:** 30-45 Minuten

## Übersicht

Du bringst die App online. Reihenfolge:

1. **Google Cloud Console** — OAuth-Client-ID erstellen (10 Min)
2. **Airtable Personal Access Token** — Schreibzugriff für die App (3 Min)
3. **Repo auf GitHub pushen** (5 Min)
4. **Vercel-Account + Repo importieren** (5 Min)
5. **Env-Variablen in Vercel setzen** (3 Min)
6. **Erste Deploy + Test** (5 Min)
7. **DNS für `kalkulator.bub-immo.de`** (10 Min)
8. **Mails der anderen Vertriebler in Airtable korrigieren** (2 Min)
9. **Logo + Test-Walkthrough** (5 Min)

---

## Schritt 1: Google Cloud Console — OAuth-Client-ID

**Ziel:** Google-Login fürs Tool ermöglichen.

1. Gehe auf https://console.cloud.google.com
2. Oben links: **Projekt auswählen** → **Neues Projekt** → Name: `BB Kalkulator`
3. Im neuen Projekt: links Navigation → **APIs & Dienste** → **OAuth-Zustimmungsbildschirm**
4. Wähle: **Extern** (auch wenn nur intern — bei "Intern" brauchst du Google Workspace)
5. App-Informationen:
   - App-Name: `BB Kalkulator`
   - User-Support-Email: `e.steininger@immo-stein.de`
   - Entwicklerkontakt: `e.steininger@immo-stein.de`
6. Geltungsbereiche (Scopes): nur `email` + `profile` + `openid` (Default reicht)
7. Testnutzer: NICHT nötig wenn du es im nächsten Schritt veröffentlichst
8. Nach Anlage: gehe zur Seite **OAuth-Zustimmungsbildschirm** und klicke **App veröffentlichen** (sonst können nur Test-User sich einloggen). Es ist kein Google-Review nötig für nur Email-Scope.
9. Links Navigation → **Anmeldedaten** → **Anmeldedaten erstellen** → **OAuth-Client-ID**
10. Anwendungstyp: **Webanwendung**
11. Name: `BB Kalkulator Web Client`
12. **Autorisierte JavaScript-Quellen**:
    - `https://kalkulator.bub-immo.de` (Hauptdomain — fügst du nach DNS-Setup hinzu)
    - `https://*.vercel.app` (Test-URLs von Vercel — Wildcard nicht möglich, also nach erstem Deploy die echte Vercel-URL hinzufügen, z.B. `https://bb-kalkulator-xyz.vercel.app`)
    - `http://localhost:3000` (für lokales Testen, optional)
13. **Autorisierte Weiterleitungs-URIs**: leer lassen (nutzen wir nicht, GSI redirected nicht)
14. Erstellen → Du bekommst eine **Client-ID** wie `12345-abcdef.apps.googleusercontent.com`
15. **Kopiere die Client-ID** — brauchst du in Schritt 5

> **Anmerkung:** Die Client-ID ist öffentlich (steht im Frontend) — kein Geheimnis. Das Client-Secret wirst du NICHT brauchen, weil wir den ID-Token-Flow nutzen (kein Authorization-Code-Exchange).

---

## Schritt 2: Airtable Personal Access Token

**Ziel:** Backend kann Kunden in Airtable speichern.

1. Gehe auf https://airtable.com/create/tokens
2. **Create new token**
3. Name: `BB Kalkulator V2 Backend`
4. Scopes:
   - `data.records:read`
   - `data.records:write`
   - `schema.bases:read`
5. Access:
   - **Add a base** → `Objektmanagement` (appikHUetNyeonXBX)
6. **Create token** → kopiere den Token (beginnt mit `pat...`)
7. Bewahre den Token sicher auf — brauchst du in Schritt 5

---

## Schritt 3: Repo auf GitHub

Annahme: Du hast einen GitHub-Account. Wenn nicht: erstelle einen kostenlosen.

1. Auf GitHub: **+ → New Repository** → Name: `bb-kalkulator-v2`, Privat
2. **Lokal** in deinem Terminal:
   ```bash
   cd ~/Documents/Claude-Cowork/02_BB_Immo/Kalkulations-Vorlage/webapp-v2/
   git init
   git add .
   git commit -m "Initial commit — BB Kalkulator V2"
   git branch -M main
   git remote add origin https://github.com/DEIN-USERNAME/bb-kalkulator-v2.git
   git push -u origin main
   ```

   Falls `git` nicht funktioniert: GitHub Desktop installieren, Ordner als Repo öffnen, push.

3. Kontrolle: auf `github.com/DEIN-USERNAME/bb-kalkulator-v2` sollten alle Dateien sein.

> Alternativ ohne GitHub: Vercel CLI lokal nutzen (`npm i -g vercel`, dann `vercel` im Ordner). Aber GitHub ist einfacher für spätere Updates.

---

## Schritt 4: Vercel-Account + Import

1. Gehe auf https://vercel.com — **Sign Up** → "Continue with GitHub" (verknüpft direkt)
2. Nach Login: **Add New... → Project**
3. **Import Git Repository**: wähle `bb-kalkulator-v2`
4. **Configure Project**:
   - Framework Preset: **Other** (kein React/Next, Vanilla)
   - Root Directory: `.` (Standard)
   - Build Command: leer lassen
   - Output Directory: `public`
5. **Environment Variables**: hier kommen die Werte aus Schritt 5 rein — siehe nächster Punkt
6. Erst nach Env-Variablen-Setup: **Deploy**

---

## Schritt 5: Env-Variablen in Vercel

Bevor du auf Deploy klickst, im Project-Setup unter "Environment Variables":

| Name | Wert | Anmerkung |
|---|---|---|
| `GOOGLE_CLIENT_ID` | Die Client-ID aus Schritt 1 | z.B. `12345-abcdef.apps.googleusercontent.com` |
| `AIRTABLE_TOKEN` | Der PAT aus Schritt 2 | beginnt mit `pat...` |
| `AIRTABLE_BASE_ID` | `appikHUetNyeonXBX` | Hardcoded — kopiere |
| `JWT_SECRET` | 128 zufällige Hex-Zeichen | siehe unten, generieren |
| `ADMIN_EMAILS` | `e.steininger@immo-stein.de,henry@wackersolutions.de` | Fallback wenn Airtable down — kommagetrennt |

### JWT_SECRET generieren

In Terminal:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Oder mit OpenSSL:
```bash
openssl rand -hex 64
```

Kopiere den Output — sieht aus wie `a3f5d8c2b...` (128 Zeichen).

> Wichtig: Setze für **alle 3 Umgebungen** (Production / Preview / Development) den **gleichen** JWT_SECRET, sonst werden Logins ungültig beim Wechsel.

### Speichern + Deploy

Nach allen 5 Env-Variablen: **Deploy** klicken. Vercel baut und deployed. Dauert ca. 1 Minute.

---

## Schritt 6: Erster Test

Nach erfolgreichem Deploy gibt Vercel dir eine URL wie `bb-kalkulator-v2-xyz.vercel.app`.

1. Öffne die URL im Browser
2. Du siehst den Login-Bildschirm
3. **Wichtig:** Bevor du dich einloggen kannst, musst du die Vercel-URL in der Google Cloud Console eintragen!
   - Gehe zurück zur **Anmeldedaten**-Seite der Google Cloud Console
   - Klicke auf deinen Web-Client → **Autorisierte JavaScript-Quellen** ergänzen um die Vercel-URL: `https://bb-kalkulator-v2-xyz.vercel.app`
   - Speichern
   - Warte 1-2 Min, dann zurück zur App
4. Klicke "Mit Google anmelden" → wähle dein `e.steininger@immo-stein.de`-Konto
5. Du solltest auf dem Dashboard landen mit "Hallo Edgar Steininger"
6. **Falls "Kein Zugriff"-Fehler**: Airtable-Tabelle `Kalk-Vertriebler` checken — ist deine Email dort als `Aktiv` eingetragen?

---

## Schritt 7: DNS für `kalkulator.bub-immo.de`

**Ziel:** App unter dauerhafter Subdomain erreichbar.

1. In Vercel: Projekt → **Settings** → **Domains** → **Add**
2. Eingabe: `kalkulator.bub-immo.de` → Continue
3. Vercel zeigt DNS-Konfigurations-Anweisung an. Üblicherweise:
   - **CNAME** Record: `kalkulator` → `cname.vercel-dns.com`
4. Bei deinem Domain-Provider (wo bub-immo.de gehostet ist — vermutlich Wackersolutions oder ein Standard-Provider wie IONOS/Strato):
   - DNS-Settings öffnen
   - CNAME für `kalkulator.bub-immo.de` auf `cname.vercel-dns.com` setzen
   - Speichern
5. Vercel verifiziert (kann 5-30 Min dauern). Nach Verifizierung: SSL-Zertifikat automatisch erstellt.
6. **Wichtig:** Diese Domain auch in Google Cloud Console als autorisierte Origin eintragen (Schritt 6.3)
7. App ist erreichbar unter `https://kalkulator.bub-immo.de` 🎉

---

## Schritt 8: Mails der anderen Vertriebler korrigieren

Ich habe Platzhalter-Mails für Laurin und Attilla eingetragen:
- Laurin: `laurin@bub-immo.de`
- Attilla: `attilla@bub-immo.de`

**Aufgabe:** Geh in Airtable → `Kalk-Vertriebler` → editiere die zwei Records mit den echten Google-Account-Mails (die sie für den Login nutzen werden). Sonst können sie sich nicht einloggen.

Auch: Wenn du selbst dich mit einer anderen Google-Adresse einloggen willst (z.B. wackersolutions-Account) — ergänze deine Email im eigenen Record.

---

## Schritt 9: Logo + Test-Walkthrough

### Logo einbetten

Falls B&B-Logo eingebaut werden soll (aktuell zeigt das Tool nur Text):

1. Logo-Datei (PNG/SVG) bereitstellen unter z.B. `https://bub-immo.de/logo.png` oder hochladen ins Repo
2. In `public/index.html` und `public/pdf.js` den Logo-Pfad eintragen (suche nach `<!-- LOGO -->`-Marker)
3. Commit + Push → Vercel deployed automatisch

### Test-Walkthrough (5 Min)

1. Login als `e.steininger@immo-stein.de`
2. Auf Dashboard: **+ Neuer Kunde** → erstelle Test-Kunden „Max Mustermann"
3. Klick auf den Kunden → Tab **Kalkulator** → wähle WE 12 Bruchsal
4. Checke: KPIs erscheinen, Charts rendern, Eingaben sind editierbar
5. Klick **Snapshot speichern** → checke in Airtable: ist der Snapshot da?
6. Klick **PDF Investitionsrechnung** → Browser-Druckdialog → speichere als PDF
7. Tab **Selbstauskunft** → fülle Detail-Modus mit ein paar Daten → PDF generieren
8. Zurück zum Dashboard → checke: ist „Max Mustermann" da?
9. Logge dich aus → erneut ein → bist du noch Edgar?
10. **Optional:** Lade Henry oder Laurin/Attilla zum Test ein (mit deren echten Mails in Airtable)

---

## Troubleshooting

| Problem | Lösung |
|---|---|
| Login-Button öffnet kein Popup | Pop-up-Blocker prüfen, oder Domain in Google Cloud noch nicht autorisiert |
| "Kein Zugriff" nach Google-Login | Email nicht in Airtable Kalk-Vertriebler / Status nicht "Aktiv" |
| Kunde-Speichern fängt 500 ab | Airtable-Token-Scopes prüfen (data.records:write nötig) |
| Wohneinheiten leer im Dropdown | Status-Filter checken — nur WEs mit Status="Vermarktung / Im Verkauf" und Maklerfirma="B&B Immo GmbH" erscheinen |
| Charts laden nicht | Internet-Verbindung — Chart.js wird per CDN nachgeladen |
| Logo wird nicht gezeigt | Logo-URL in index.html + pdf.js anpassen (siehe Schritt 9) |

---

## Tipps für die ersten Tage

- **Erstmal nur du als User**: bevor du Laurin/Attilla einlädst, probiere alles selbst durch. Fang mit Test-Kunden an, lösche sie wieder. Spiele alle PDFs durch.
- **Henry parallel testen lassen**: er hat Admin-Rechte und sieht alle Kunden. Stress-Test der Multi-User-Sicht.
- **Statt PandaDoc nutzen**: das aktuelle PDF-Reservierungsformular ist Phase 1 (statisch). Phase 2 (E-Signatur) baue ich dir später, wenn du Bedarf hast.
- **Airtable-Daten pflegen**: Damit eine WE im Tool sichtbar wird, MUSS sie in Airtable Status = "Vermarktung / Im Verkauf" haben. Sobald sie auf "Beurkundet" springt, verschwindet sie.

## Backups

- **Code**: GitHub-Repo (alle Versionen historisiert)
- **Daten**: Airtable hat eingebautes Auto-Backup. Du kannst auch manuell exportieren über Airtable → Settings → Export
- **Sessions**: 30 Tage gültig, danach Re-Login. Bei Bedarf kannst du das im Code anpassen (`api/_lib/auth.js` → `expiresIn`)

---

Bei Problemen: melde dich, ich helfe.

— Stand 14.05.2026
