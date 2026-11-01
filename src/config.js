/**
 * Configuración centralizada y validada para MS3 Notifications.
 */
function validateConfig(env = process.env) {
  const missing = [];

  if (!env.QUEUE_CONNECTION_STRING || env.QUEUE_CONNECTION_STRING.trim() === '') {
    missing.push('QUEUE_CONNECTION_STRING');
  }

  if (missing.length > 0) {
    const errorMsg = `Error de configuración: Variable(s) de entorno obligatoria(s) faltante(s): ${missing.join(', ')}. Configure estas variables antes de iniciar el servicio.`;
    throw new Error(errorMsg);
  }

  return {
    port: parseInt(env.PORT, 10) || 3000,
    queueConnectionString: env.QUEUE_CONNECTION_STRING.trim(),
    queueName: env.QUEUE_NAME ? env.QUEUE_NAME.trim() : 'notificaciones',
    poisonQueueName: env.POISON_QUEUE_NAME ? env.POISON_QUEUE_NAME.trim() : 'notificaciones-poison',
    tableName: env.TABLE_NAME ? env.TABLE_NAME.trim() : 'notificaciones',
    pollIntervalMs: parseInt(env.POLL_INTERVAL_MS, 10) || 3000,
    visibilityTimeoutS: parseInt(env.VISIBILITY_TIMEOUT_S, 10) || 30,
    maxDequeueCount: parseInt(env.MAX_DEQUEUE_COUNT, 10) || 5,
    // Variables de tiempo real (Azure Web PubSub)
    realtimeConnectionString: env.REALTIME_CONNECTION_STRING ? env.REALTIME_CONNECTION_STRING.trim() : '',
    realtimeHub: env.REALTIME_HUB ? env.REALTIME_HUB.trim() : 'notifications',
    realtimeTokenTtlMinutes: Math.max(1, parseInt(env.REALTIME_TOKEN_TTL_MINUTES, 10) || 60),
    // Orígenes CORS permitidos (solo para desarrollo local)
    corsAllowedOrigins: env.CORS_ALLOWED_ORIGINS ? env.CORS_ALLOWED_ORIGINS.trim() : '',
  };
}

let cachedConfig = null;

function getConfig() {
  if (!cachedConfig) {
    cachedConfig = validateConfig(process.env);
  }
  return cachedConfig;
}

module.exports = {
  validateConfig,
  getConfig,
};
