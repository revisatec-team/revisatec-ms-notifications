/**
 * Logger estructurado en JSON de una línea.
 * No registra credenciales ni datos sensibles.
 */
function log(level, message, meta = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  console.log(JSON.stringify(logEntry));
}

const logger = {
  info: (message, meta) => log('INFO', message, meta),
  warn: (message, meta) => log('WARN', message, meta),
  error: (message, meta) => {
    const errorMeta = { ...meta };
    if (meta?.error instanceof Error) {
      errorMeta.errorMessage = meta.error.message;
      errorMeta.stack = meta.error.stack;
      delete errorMeta.error;
    }
    log('ERROR', message, errorMeta);
  },
};

module.exports = { logger };
