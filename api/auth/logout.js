// POST /api/auth/logout
// Löscht das Session-Cookie.

const { clearSessionCookie } = require('../_lib/auth');
const { methodNotAllowed } = require('../_lib/http');

module.exports = async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, ['POST']);
  clearSessionCookie(res);
  return res.status(200).json({ ok: true });
};
