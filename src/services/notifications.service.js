const { parseAndValidateMessage } = require('../queue/messageSchema');
const { NoopPublisher } = require('../realtime/noopPublisher');
const { logger } = require('../utils/logger');

/**
 * Servicio central de Notificaciones de MS3.
 */
class NotificationsService {
  constructor({ repository, publisher = new NoopPublisher() }) {
    if (!repository) {
      throw new Error('repository es obligatorio para NotificationsService');
    }
    this.repository = repository;
    this.publisher = publisher;
  }

  /**
   * Procesa un evento recibido de la cola:
   * Valida -> Guarda en historial (idempotente) -> Publica en tiempo real
   *
   * @param {string|object} rawInput
   * @returns {Promise<{ status: 'SUCCESS'|'DUPLICATE'|'INVALID', errors?: string[], notification?: object }>}
   */
  async processEvent(rawInput) {
    const validation = parseAndValidateMessage(rawInput);

    if (!validation.valid) {
      logger.warn('Mensaje de cola con esquema inválido', {
        errors: validation.errors,
      });
      return {
        status: 'INVALID',
        errors: validation.errors,
      };
    }

    const event = validation.data;
    const notification = {
      id: event.eventId,
      type: event.type,
      title: event.title,
      message: event.message,
      courseId: event.courseId,
      groupId: event.groupId,
      createdAt: event.createdAt,
      read: false,
      source: event.source,
    };

    const saveResult = await this.repository.create(notification);

    if (saveResult.isDuplicate) {
      logger.info('Mensaje ignorado por duplicado (idempotencia garantizada)', {
        eventId: event.eventId,
      });
      return {
        status: 'DUPLICATE',
        notification,
      };
    }

    logger.info('Notificación guardada en el historial correctamente', {
      id: notification.id,
      type: notification.type,
      groupId: notification.groupId,
    });

    // Punto de enganche de tiempo real: un fallo de emisión NUNCA rompe la persistencia
    try {
      if (this.publisher && typeof this.publisher.publish === 'function') {
        await this.publisher.publish(notification);
      }
    } catch (realtimeErr) {
      logger.error('Fallo no bloqueante al emitir notificación en tiempo real', {
        id: notification.id,
        errorMessage: realtimeErr.message,
      });
    }

    return {
      status: 'SUCCESS',
      notification,
    };
  }

  async listNotifications(params) {
    return this.repository.list(params);
  }

  async getNotificationById(id) {
    return this.repository.findById(id);
  }

  async markAsRead(id) {
    return this.repository.markAsRead(id);
  }

  async markAllAsRead() {
    return this.repository.markAllAsRead();
  }
}

module.exports = { NotificationsService };
