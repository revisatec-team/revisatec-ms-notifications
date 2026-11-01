/**
 * Middleware de CORS para desarrollo local (sin dependencias externas).
 * Activo únicamente cuando se define CORS_ALLOWED_ORIGINS.
 */
function createCorsMiddleware(allowedOriginsStr = '') {
  if (!allowedOriginsStr || allowedOriginsStr.trim() === '') {
    return (req, res, next) => next();
  }

  const allowedOrigins = allowedOriginsStr
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  return (req, res, next) => {
    const origin = req.headers.origin;

    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Ocp-Apim-Subscription-Key');
    }

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  };
}

module.exports = { createCorsMiddleware };
