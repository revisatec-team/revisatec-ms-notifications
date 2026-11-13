const { WebPubSubServiceClient } = require('@azure/web-pubsub');
const { logger } = require('../utils/logger');

/**
 * Publicador de tiempo real conectado a Azure Web PubSub.
 * Emite eventos segmentados a los grupos de curso y grupo específico.
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
   * Emite la notificación a través de los grupos específicos en Web PubSub:
   * - course-{courseId} (para profesores asignados a dicho curso)
   * - group-{groupId} (para estudiantes miembros del equipo de dicho grupo)
   *
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

    const courseGroup = 'course-' + notification.courseId;
    const studentGroup = 'group-' + notification.groupId;

    try {
      await Promise.allSettled([
        this.serviceClient.group(courseGroup).send(payload, { contentType: 'application/json' }),
        this.serviceClient.group(studentGroup).send(payload, { contentType: 'application/json' }),
        this.serviceClient.sendToAll(payload, { contentType: 'application/json' }),
      ]);

      logger.info('[Tiempo Real] Notificación emitida a través de Web PubSub', {
        id: notification.id,
        type: notification.type,
        courseGroup,
        studentGroup,
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
