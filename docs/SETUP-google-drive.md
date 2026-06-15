# Setup: Google Drive Service-Account (für Baustein D — Auto-Ordner + Upload-Portal)

> **Zweck:** Die App soll automatisiert pro Kunde einen Drive-Ordner anlegen, Kunden-Uploads dort ablegen und die Verkaufsunterlagen der Objekte read-only einblenden. Dafür braucht sie einen **Service-Account** (ein technischer Google-Nutzer) mit Drive-Zugriff.
>
> **Wichtig:** Das hier ist **nur für Baustein D/U** nötig — Baustein A (Übergabe-Button + Fall) läuft ohne. Du kannst das parallel machen.
>
> **Aufwand:** ~30 Min. Du brauchst Google-Workspace-Admin-Rechte (oder jemanden, der sie hat).

---

## Teil 1 — Google Cloud: Projekt + Drive-API + Service-Account (~20 Min)

1. **Projekt anlegen:** [console.cloud.google.com](https://console.cloud.google.com) → oben Projektauswahl → **Neues Projekt** → Name z.B. `bb-backstube-drive` → Erstellen.
2. **Drive-API aktivieren:** Menü → **APIs & Dienste → Bibliothek** → nach „Google Drive API" suchen → **Aktivieren**.
3. **Service-Account erstellen:** Menü → **IAM & Verwaltung → Dienstkonten** → **Dienstkonto erstellen**.
   - Name: `bb-backstube-drive-sa`
   - Rollen: **keine nötig** (der Drive-Zugriff läuft über Freigaben, nicht über Cloud-Rollen) → einfach **Fertig**.
4. **Schlüssel (JSON) erzeugen:** Auf das Dienstkonto klicken → Reiter **Schlüssel** → **Schlüssel hinzufügen → Neuen Schlüssel erstellen → JSON** → es lädt eine `.json`-Datei herunter.
   - ⚠️ **Das ist ein Geheimnis.** Nicht per Mail/WhatsApp rumschicken, nicht ins Repo legen. Wie wir den sicher zu Vercel bekommen → Teil 4.
5. **Service-Account-E-Mail kopieren:** Steht im Dienstkonto, Form `bb-backstube-drive-sa@bb-backstube-drive.iam.gserviceaccount.com`. Die brauchst du in Teil 2 + 3.

---

## Teil 2 — Geteilte Ablage für die Kundenordner (~5 Min)

Service-Accounts haben keinen eigenen „Meine Ablage"-Speicher. Lösung (sauber, Workspace-Standard): eine **geteilte Ablage**.

1. [Google Drive](https://drive.google.com) → linke Leiste **Geteilte Ablagen** → **Neue geteilte Ablage** → Name: `Kundenfinanzierung`.
2. Rechtsklick auf die Ablage → **Mitglieder verwalten** → die **Service-Account-E-Mail** hinzufügen, Rolle **Inhaltsmanager** (darf Ordner + Dateien anlegen).
3. Ablage öffnen → die **Ordner-ID aus der URL** kopieren: `drive.google.com/drive/folders/`**`<DIESE-ID>`**. Brauchst du in Teil 4 (`DRIVE_ROOT_FOLDER_ID`).

---

## Teil 3 — Verkaufsunterlagen-Ordner freigeben (pro Objekt, läuft sowieso)

Damit das Portal die Verkaufsunterlagen **lesen** kann, braucht der Service-Account **Leserecht** auf die jeweiligen Objekt-Ordner.

- **Pro Objekt-Ordner:** Rechtsklick → **Freigeben** → die **Service-Account-E-Mail** als **Betrachter** hinzufügen.
- **Einfacher (empfohlen):** Wenn die Objekt-/Verkaufsunterlagen-Ordner ohnehin in einer geteilten Ablage liegen, den Service-Account einmal als **Betrachter** dieser Ablage hinzufügen — dann gilt es für alle Objekte automatisch.
- Der Link, den ihr ins Airtable-Feld **`Verkaufsunterlagen`** (am Objekt) eintragt, muss auf genau diese freigegebenen Ordner zeigen.

> Das ist der Teil, den du gerade für **Bruchsal / Wesseling / Baden-Baden** anstößt — perfekt zum Testen.

---

## Teil 4 — Zugangsdaten zu Vercel (~5 Min)

Drei Werte müssen als Environment-Variablen ins Vercel-Projekt (Settings → Environment Variables):

| Variable | Wert | Wie |
|---|---|---|
| `GOOGLE_SA_KEY_B64` | Der JSON-Key, base64-kodiert | Terminal: `base64 -i ~/Downloads/<dein-key>.json \| pbcopy` → einfügen |
| `DRIVE_ROOT_FOLDER_ID` | Ordner-ID der Ablage „Kundenfinanzierung" (Teil 2.3) | direkt einfügen |
| `UPLOAD_TOKEN_SECRET` | Zufalls-Secret für die Kunden-Upload-Links | Terminal: `openssl rand -hex 32` → einfügen |

> **Den JSON-Key gibst du am besten selbst in Vercel ein** (oder über den sicheren `read -rs`-Weg an mich, falls ich es für dich eintragen soll) — er soll nicht im Klartext durch den Chat.

---

## Was ich (Claude) übernehme, sobald das steht

- `api/_lib/drive.js` (Service-Account-Anbindung: Ordner anlegen, Datei hochladen, Dateien listen)
- Auto-Ordner-Anlage beim Übergeben (Baustein D)
- Kunden-Upload-Portal + Verkaufsunterlagen-Einblendung (Baustein U)

**Du brauchst mir am Ende nur sagen:** „Service-Account steht, Env-Vars sind in Vercel" — plus die Service-Account-E-Mail (die ist kein Geheimnis), damit ich die Freigaben verifizieren kann.
