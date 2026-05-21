// GET /api/_spike/html-to-pdf
//
// Setup-Spike (Iter 83): Prüft, ob Puppeteer + @sparticuz/chromium auf Vercel funktioniert.
// Generiert ein minimales Hello-PDF und gibt es als application/pdf zurück.
//
// Ziel: bestätigen dass der Chromium-Binary geladen werden kann, der Cold-Start
// in der maxDuration (60s) durchläuft, und die Function-Size unter Vercel-Limit bleibt.
//
// Nutzung: einfach im Browser GET https://bb-brown-pi.vercel.app/api/_spike/html-to-pdf
// → wenn ein PDF runtergeladen wird (1-2 Seiten "Hello PDF"), ist der Setup OK.
// → wenn 500/Timeout: Logs in Vercel-Dashboard prüfen.
//
// Sobald die echte SA-Endpoint läuft, kann diese Datei gelöscht werden.

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

module.exports = async (req, res) => {
  const startTs = Date.now();
  let browser = null;
  try {
    // Chromium binary + executable path aus @sparticuz/chromium
    const executablePath = await chromium.executablePath();
    console.log('[spike] chromium.executablePath OK', executablePath, '(' + (Date.now() - startTs) + 'ms)');

    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath,
      headless: chromium.headless,
    });
    console.log('[spike] browser launched (' + (Date.now() - startTs) + 'ms)');

    const page = await browser.newPage();
    const html = `<!doctype html>
      <html><head><meta charset="utf-8">
      <style>
        body { font-family: 'Helvetica', sans-serif; padding: 40px; }
        h1 { color: #5C4922; border-bottom: 2px solid #C9A961; padding-bottom: 8px; }
        p { color: #333; line-height: 1.5; }
        .tag-test { background: #FAF7F0; padding: 12px; margin-top: 20px; }
      </style></head>
      <body>
        <h1>Setup-Spike: HTML → PDF</h1>
        <p>Wenn dieses PDF korrekt erscheint, läuft Puppeteer + @sparticuz/chromium auf Vercel.</p>
        <p>Generiert am: ${new Date().toLocaleString('de-DE')}</p>
        <div class="tag-test">
          <strong>Field-Tag-Test:</strong> Wird PandaDoc den folgenden Tag erkennen?<br>
          [signature:Antragsteller___________]<br>
          [date:Antragsteller____]
        </div>
      </body></html>`;
    await page.setContent(html, { waitUntil: 'networkidle0' });
    console.log('[spike] setContent done (' + (Date.now() - startTs) + 'ms)');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '18mm', left: '12mm' },
    });
    console.log('[spike] pdf generated, size=' + pdfBuffer.length + ' bytes (' + (Date.now() - startTs) + 'ms)');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="spike-' + Date.now() + '.pdf"');
    res.setHeader('X-Spike-Duration-Ms', String(Date.now() - startTs));
    res.setHeader('X-Spike-Pdf-Bytes', String(pdfBuffer.length));
    return res.status(200).send(pdfBuffer);
  } catch (e) {
    console.error('[spike] FAILED', e);
    return res.status(500).json({
      error: 'Spike failed',
      message: e.message,
      stack: e.stack,
      durationMs: Date.now() - startTs,
    });
  } finally {
    if (browser) {
      try { await browser.close(); } catch {}
    }
  }
};
