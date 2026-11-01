const { logger } = require('../utils/logger');

/**
 * Publicador simulado (punto de enganche para Web PubSub / SignalR).
 * Permite que el servicio emita notificaciones sin fallar si el canal de tiempo real aún no está activo.
 */
class NoopPublisher {
  async publish(notification) {
    logger.info('[Tiempo Real] Notificación emitida a través de NoopPublisher', {
      id: notification.id,
      type: notification.type,
      groupId: notification.groupId,
    });
    return Promise.resolve();
  }
}

module.exports = { NoopPublisher };
