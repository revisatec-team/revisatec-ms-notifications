const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { logger } = require('../utils/logger');

/**
 * Publicador de tiempo real conectado a Azure Web PubSub.
 * Emite eventos a todos los clientes suscritos al hub de notificaciones.
 */
class WebPubSubPublisher {
  constructor({ connectionString, hubName = 'notifications' }) {
    if (!connectionString) {
      throw new Error('connectionString es requerida para WebPubSubPublisher');
    }
    this.hubName = hubName;
    this.serviceClient = new WebPubSubServiceClient(connectionString, hubName);
  }

  /**
   * Emite la notificación a través del hub de Web PubSub.
   * Cualquier fallo al emitir se registra en logs pero NUNCA lanza excepción,
   * garantizando que el procesamiento del mensaje en la cola no se interrumpa.
   *
   * @param {object} notification
   */
  async publish(notification) {
    const payload = {
      event: 'notification.created',
      data: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        courseId: Number(notification.courseId),
        groupId: Number(notification.groupId),
        createdAt: Number(notification.createdAt),
        read: Boolean(notification.read),
        source: notification.source || 'ms-analysis',
      },
    };

    try {
      await this.serviceClient.sendToAll(payload, { contentType: 'application/json' });
      logger.info('[Tiempo Real] Notificación emitida a través de Web PubSub', {
        id: notification.id,
        type: notification.type,
        hub: this.hubName,
      });
    } catch (error) {
      logger.error('[Tiempo Real] Error al emitir notificación a Web PubSub', {
        id: notification.id,
        hub: this.hubName,
        errorMessage: error.message,
      });
    }
  }
}

module.exports = { WebPubSubPublisher };
