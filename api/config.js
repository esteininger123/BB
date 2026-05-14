/* /api/config — gibt öffentliche Frontend-Konfiguration zurück.
   Aktuell: nur Google Client ID (öffentlich, kein Secret). */

module.exports = (req, res) => {
  res.setHeader('content-type', 'application/json');
  res.status(200).end(JSON.stringify({
    googleClientId: process.env.GOOGLE_CLIENT_ID || null,
  }));
};
