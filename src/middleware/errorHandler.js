const { logger } = require('../utils/logger');

/**
 * Middleware para rutas no encontradas (404)
 */
function notFoundHandler(req, res, next) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

/**
 * Middleware para manejo global de errores (400, 500)
 */
function errorHandler(err, req, res, next) {
  // Manejo de error de sintaxis en JSON entrante (400)
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    logger.warn('JSON inválido en cuerpo de solicitud', { path: req.path });
    return res.status(400).json({ error: 'JSON inválido en el cuerpo de la solicitud' });
  }

  // Error controlado con status explícito
  if (err.statusCode || err.status) {
    const status = err.statusCode || err.status;
    const message = err.message || 'Error en la solicitud';
    logger.warn('Error en la solicitud', { status, path: req.path, message });
    return res.status(status).json({ error: message });
  }

  // Error inesperado del servidor (500)
  logger.error('Error interno no controlado', {
    path: req.path,
    method: req.method,
    error: err,
  });

  return res.status(500).json({ error: 'Error interno del servidor' });
}

module.exports = {
  notFoundHandler,
  errorHandler,
};
