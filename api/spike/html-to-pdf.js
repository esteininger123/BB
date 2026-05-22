// GET /api/spike/html-to-pdf
//
// Setup-Spike (Iter 83 v3): Prüft Puppeteer + @sparticuz/chromium-min auf Vercel.
//
// Setup-History:
// v1: @sparticuz/chromium@131 → libnss3.so-Fehler (Function-Bundle entpackt nicht korrekt)
// v2: @sparticuz/chromium-min@131 + puppeteer-core@23.10.4 → gleicher libnss3.so-Fehler
// v3: @sparticuz/chromium-min@133.0.0 + puppeteer-core@24.5.0 → bestätigt funktionierende Kombi
//     (Vercel-Community Apr/Aug 2025: miguelcabs, alexang-5495), Pack-URL via Env-Var
//     überschreibbar (Fallback auf Vercel Blob falls GitHub zickt).
//
// Wenn dieser v3 immer noch failed, ist Plan B: Option D (Static-PDF-Upload mit manuellen
// Signaturfeldern im PandaDoc-Editor) statt Puppeteer.

const chromium = require('@sparticuz/chromium-min');
const puppeteer = require('puppeteer-core');
const { requireAdminVerified } = require('../_lib/auth');

// Pack-URL muss zur installierten chromium-min-Version matchen (v133.0.0).
// Per Env-Var überschreibbar — falls GitHub-Release zickt, kann Edgar das Tar auf
// Vercel Blob hosten und CHROMIUM_PACK_URL setzen.
const DEFAULT_PACK_URL = 'https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar';

module.exports = async (req, res) => {
  // QA-Fix 2026-05-22 (Audit-D B5): Auth-Gate. Endpoint hatte 3 GB RAM + 60s Timeout
  // ohne Auth — Resource-Exhaustion-/Kosten-DDoS-Risiko. Da Edgar unklar ist, ob noch
  // gebraucht, sicherheitshalber auf Admin-only beschränkt. Wenn produktiv nicht mehr
  // genutzt, kann der Endpoint später ganz weg.
  const session = await requireAdminVerified(req, res);
  if (!session) return;

  const startTs = Date.now();
  const logs = [];
  const log = (msg) => {
    const t = Date.now() - startTs;
    const line = `[${t}ms] ${msg}`;
    logs.push(line);
    console.log('[spike]', line);
  };

  let browser = null;
  try {
    log('start: node=' + process.version + ' arch=' + process.arch + ' platform=' + process.platform);
    log('mem-total=' + (process.memoryUsage().rss / 1024 / 1024).toFixed(1) + 'MB');

    // Env-Var-Override für die Pack-URL — Vercel Blob als Fallback wenn GitHub zickt
    const packUrl = process.env.CHROMIUM_PACK_URL || DEFAULT_PACK_URL;
    log('pack-url=' + packUrl);

    // Wichtig: chromium-min lädt das Tar beim ersten executablePath()-Call nach /tmp
    // und cached es für Folgeaufrufe innerhalb derselben Lambda-Instanz.
    log('calling chromium.executablePath()...');
    const executablePath = await chromium.executablePath(packUrl);
    log('executablePath OK: ' + executablePath);

    // Best-Practice aus Sparticuz-Issues: explizit setzen
    chromium.setHeadlessMode = true;
    chromium.setGraphicsMode = false;
    log('chromium flags: headless=true, graphics=false');
    log('chromium.args length=' + chromium.args.length);

    log('puppeteer.launch()...');
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });
    log('browser launched, version=' + await browser.version());

    const page = await browser.newPage();
    const html = `<!doctype html>
      <html><head><meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica', sans-serif; padding: 40px; }
        h1 { color: #5C4922; border-bottom: 2px solid #C9A961; padding-bottom: 8px; }
        p { color: #333; line-height: 1.5; }
        .tag-test { background: #FAF7F0; padding: 12px; margin-top: 20px; }
        .ok { color: #1B5E20; font-weight: bold; }
      </style></head>
      <body>
        <h1>Setup-Spike v3: HTML → PDF</h1>
        <p class="ok">✓ Puppeteer + @sparticuz/chromium-min läuft auf Vercel</p>
        <p>Generiert am: ${new Date().toLocaleString('de-DE')}</p>
        <div class="tag-test">
          <strong>Field-Tag-Test (PandaDoc-Erkennung):</strong><br>
          [signature:Antragsteller___________]<br>
          [date:Antragsteller____]
        </div>
        <p style="margin-top:30px;font-size:11px;color:#888;">
          Diagnose-Header: X-Spike-Duration-Ms, X-Spike-Pdf-Bytes
        </p>
      </body></html>`;
    await page.setContent(html, { waitUntil: 'networkidle0' });
    log('setContent done');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '18mm', left: '12mm' },
    });
    log('pdf generated, size=' + pdfBuffer.length + ' bytes');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="spike-v3-' + Date.now() + '.pdf"');
    res.setHeader('X-Spike-Duration-Ms', String(Date.now() - startTs));
    res.setHeader('X-Spike-Pdf-Bytes', String(pdfBuffer.length));
    res.setHeader('X-Spike-Logs', encodeURIComponent(logs.join(' | ')));
    return res.status(200).send(pdfBuffer);
  } catch (e) {
    log('FAILED: ' + (e && e.message));
    console.error('[spike] FULL ERROR', e);
    return res.status(500).json({
      error: 'Spike failed',
      message: e && e.message,
      stack: e && e.stack,
      durationMs: Date.now() - startTs,
      logs,
      env: {
        node: process.version,
        arch: process.arch,
        platform: process.platform,
        memoryMB: (process.memoryUsage().rss / 1024 / 1024).toFixed(1),
        packUrl: process.env.CHROMIUM_PACK_URL || DEFAULT_PACK_URL,
      },
    });
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
};
