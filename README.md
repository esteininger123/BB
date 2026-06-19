# BB Kalkulator V2

Multi-User-Web-App für den Vertrieb von Kapitalanlagen-Wohneinheiten bei B&B Immo GmbH.

## Was die App kann

- **Vertriebler-Login** via Google (OAuth, Whitelist gegen Airtable)
- **Kunden-CRM** — eigene Kunden anlegen, bearbeiten, mit Notizen versehen
- **Kalkulator** mit Live-Daten aus Airtable (Wohneinheiten in Vermarktung)
- **PDF-Export** mit Vertriebler-Branding: Investitionsrechnung, Reservierungsformular, Selbstauskunft (Bank)
- **Admin-Panel** für Edgar + Henry: alle Kunden + Vertriebler + Statistik
- **Finanzierungs-Konditionen** im Admin pflegbar: Zins + Tilgung je Kaufpreis-Band (< / ≥ 150.000 €) × KNK-Variante; gilt sofort für alle Vertriebler (Default = bisherige Werte)

## Tech-Stack

- Frontend: Vanilla JS Single-Page-App (kein Build-Step)
- Hosting: Vercel
- Auth: Google Identity Services + Server-Side JWT-Session
- Backend: Vercel Serverless Functions (Node.js)
- Datenbank: Airtable (Objektmanagement-Base)
- PDF: Browser-Print mit @media print

## Setup

Siehe `SETUP.md` — ca. 30-45 Min Aufwand für einmaliges Deployment.

## Datei-Struktur

```
webapp-v2/
├── package.json           — npm-Deps (google-auth-library, jsonwebtoken, cookie)
├── vercel.json            — Vercel-Config
├── SETUP.md               — Setup-Anleitung
├── README.md              — Dieses Dokument
├── docs/
│   ├── KONZEPT.md         — Architektur, Datenmodell, User-Flows
│   └── SPEC.md            — Technische Spec mit Airtable-IDs
├── api/                   — Serverless Functions
│   ├── _lib/
│   │   ├── airtable.js    — Airtable-API-Wrapper
│   │   ├── auth.js        — Google-Token-Verify + Session-JWT
│   │   ├── tables.js      — Airtable-IDs (Tabellen + Felder)
│   │   ├── http.js        — Helper
│   │   └── mappers.js     — Airtable ↔ JSON
│   ├── auth/
│   │   ├── google.js      — POST: Login mit Google-Token
│   │   └── logout.js      — POST: Cookie löschen
│   ├── admin/
│   │   └── stats.js       — GET: Statistik (nur Admin)
│   ├── kunden/
│   │   └── [id].js        — GET/PUT/DELETE Kunde
│   ├── kunden.js          — GET (list) / POST (create)
│   ├── snapshots.js       — Snapshots GET/POST
│   ├── wohneinheiten.js   — WE-Liste aus Airtable mit Filter
│   ├── config.js          — Google Client ID liefern
│   └── me.js              — Eigenes Profil
└── public/                — Frontend
    ├── index.html         — SPA-Skeleton
    ├── styles.css         — B&B-Branding
    ├── app.js             — State + Routing + Views
    ├── api.js             — Fetch-Wrapper
    ├── kalkulator.js      — Berechnungslogik (1:1 aus V1)
    └── pdf.js             — PDF-Templates (3 Typen)
```

## Updates / Weiterentwicklung

1. Lokal: Code editieren, `git commit && git push` → Vercel deployed automatisch
2. Airtable-Pflege: Edgar pflegt WEs und Vertriebler-Liste direkt im Airtable-UI
3. Kalkulationslogik: in `public/kalkulator.js` — alle Formeln dokumentiert

## Phase 2 (später)

- E-Signatur für Reservierungen (statt PDF + manuell)
- Wiedervorlage-Erinnerungen per E-Mail
- HubSpot-Sync (Lead-Daten aus HubSpot importieren)
- Notar-Datenblatt-Generator
- Mobile-App (PWA)
- Statistik-Dashboard erweitert

## Lizenz / Vertraulichkeit

Internes Tool der B&B Immo GmbH. Nicht öffentlich.

— Stand 14.05.2026 / v2.0 (Iter 14)
