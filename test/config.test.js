const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateConfig } = require('../src/config');

describe('Configurador de MS3', () => {
  it('lanza error si falta QUEUE_CONNECTION_STRING', () => {
    assert.throws(
      () => validateConfig({}),
      (err) => {
        assert.match(err.message, /QUEUE_CONNECTION_STRING/);
        return true;
      }
    );
  });

  it('asigna valores por defecto correctos cuando solo se pasa la cadena requerida', () => {
    const config = validateConfig({
      QUEUE_CONNECTION_STRING: 'Endpoint=sb://example.queue.core.windows.net;',
    });

    assert.equal(config.port, 3000);
    assert.equal(config.queueName, 'notificaciones');
    assert.equal(config.poisonQueueName, 'notificaciones-poison');
    assert.equal(config.tableName, 'notificaciones');
    assert.equal(config.pollIntervalMs, 3000);
    assert.equal(config.visibilityTimeoutS, 30);
    assert.equal(config.maxDequeueCount, 5);
    assert.equal(config.realtimeConnectionString, '');
    assert.equal(config.realtimeHub, 'notifications');
    assert.equal(config.realtimeTokenTtlMinutes, 60);
    assert.equal(config.corsAllowedOrigins, '');
  });

  it('respeta variables personalizadas si se proporcionan', () => {
    const config = validateConfig({
      QUEUE_CONNECTION_STRING: 'Endpoint=sb://example.queue.core.windows.net;',
      PORT: '4000',
      QUEUE_NAME: 'custom-queue',
      POISON_QUEUE_NAME: 'custom-poison',
      TABLE_NAME: 'custom-table',
      POLL_INTERVAL_MS: '5000',
      VISIBILITY_TIMEOUT_S: '60',
      MAX_DEQUEUE_COUNT: '3',
      REALTIME_CONNECTION_STRING: 'Endpoint=https://custom.webpubsub.azure.com;',
      REALTIME_HUB: 'custom-hub',
      REALTIME_TOKEN_TTL_MINUTES: '120',
      CORS_ALLOWED_ORIGINS: 'http://localhost:5173,http://localhost:5174',
    });

    assert.equal(config.port, 4000);
    assert.equal(config.queueName, 'custom-queue');
    assert.equal(config.poisonQueueName, 'custom-poison');
    assert.equal(config.tableName, 'custom-table');
    assert.equal(config.pollIntervalMs, 5000);
    assert.equal(config.visibilityTimeoutS, 60);
    assert.equal(config.maxDequeueCount, 3);
    assert.equal(config.realtimeConnectionString, 'Endpoint=https://custom.webpubsub.azure.com;');
    assert.equal(config.realtimeHub, 'custom-hub');
    assert.equal(config.realtimeTokenTtlMinutes, 120);
    assert.equal(config.corsAllowedOrigins, 'http://localhost:5173,http://localhost:5174');
  });
});
