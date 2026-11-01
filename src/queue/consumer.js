const { logger } = require('../utils/logger');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Consumidor de Azure Queue Storage con manejo de idempotencia,
 * reintentos y descarte seguro a cola poison.
 */
class QueueConsumer {
  constructor({
    mainQueueClient,
    poisonQueueClient,
    notificationsService,
    pollIntervalMs = 3000,
    visibilityTimeoutS = 30,
    maxDequeueCount = 5,
  }) {
    if (!mainQueueClient) throw new Error('mainQueueClient es requerido');
    if (!notificationsService) throw new Error('notificationsService es requerido');

    this.mainQueueClient = mainQueueClient;
    this.poisonQueueClient = poisonQueueClient;
    this.notificationsService = notificationsService;
    this.pollIntervalMs = pollIntervalMs;
    this.visibilityTimeoutS = visibilityTimeoutS;
    this.maxDequeueCount = maxDequeueCount;

    this.isRunning = false;
    this.isProcessingBatch = false;
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    logger.info('Consumidor de cola de notificaciones iniciado', {
      pollIntervalMs: this.pollIntervalMs,
      visibilityTimeoutS: this.visibilityTimeoutS,
      maxDequeueCount: this.maxDequeueCount,
    });
    this._pollLoop();
  }

  async stop() {
    this.isRunning = false;
    logger.info('Deteniendo consumidor de cola...');
    while (this.isProcessingBatch) {
      await sleep(100);
    }
    logger.info('Consumidor de cola detenido con éxito');
  }

  async _pollLoop() {
    let currentWait = this.pollIntervalMs;

    while (this.isRunning) {
      try {
        this.isProcessingBatch = true;
        const response = await this.mainQueueClient.receiveMessages({
          numberOfMessages: 10,
          visibilityTimeout: this.visibilityTimeoutS,
        });

        const messages = response.receivedMessageItems || [];

        if (messages.length === 0) {
          currentWait = Math.min(currentWait + 1000, 10000);
        } else {
          currentWait = this.pollIntervalMs;
          logger.info(`Recibidos ${messages.length} mensajes de la cola`);

          for (const message of messages) {
            await this._processSingleMessage(message);
          }
        }
      } catch (error) {
        logger.error('Error en ciclo del consumidor de cola', {
          errorMessage: error.message,
        });
      } finally {
        this.isProcessingBatch = false;
      }

      if (this.isRunning) {
        await sleep(currentWait);
      }
    }
  }

  async _processSingleMessage(message) {
    const { messageId, popReceipt, dequeueCount, messageText } = message;

    // Verificar si superó el umbral de reintentos
    if (dequeueCount > this.maxDequeueCount) {
      logger.error('Mensaje superó el límite de reintentos (maxDequeueCount), moviendo a poison', {
        messageId,
        dequeueCount,
        maxDequeueCount: this.maxDequeueCount,
      });

      await this._sendToPoisonQueue({
        reason: 'MAX_DEQUEUE_COUNT_EXCEEDED',
        description: 'Excedido el número máximo de reintentos',
        messageId,
        dequeueCount,
        originalMessage: messageText,
      });

      await this._deleteFromMainQueue(messageId, popReceipt);
      return;
    }

    try {
      const result = await this.notificationsService.processEvent(messageText);

      if (result.status === 'SUCCESS' || result.status === 'DUPLICATE') {
        await this._deleteFromMainQueue(messageId, popReceipt);
      } else if (result.status === 'INVALID') {
        await this._sendToPoisonQueue({
          reason: 'INVALID_SCHEMA',
          description: 'Esquema de mensaje inválido',
          messageId,
          errors: result.errors,
          originalMessage: messageText,
        });

        await this._deleteFromMainQueue(messageId, popReceipt);
      }
    } catch (processError) {
      // Error temporal: NO eliminamos de la cola principal para que reaparezca
      logger.error('Error temporal procesando mensaje, se mantendrá para reintento', {
        messageId,
        dequeueCount,
        errorMessage: processError.message,
      });
    }
  }

  async _deleteFromMainQueue(messageId, popReceipt) {
    try {
      await this.mainQueueClient.deleteMessage(messageId, popReceipt);
      logger.info('Mensaje eliminado de la cola principal', { messageId });
    } catch (error) {
      logger.error('Error al eliminar mensaje de la cola principal', {
        messageId,
        errorMessage: error.message,
      });
    }
  }

  async _sendToPoisonQueue(payload) {
    if (!this.poisonQueueClient) {
      logger.warn('Cola poison no configurada, descartando mensaje sin archivar en cola poison', {
        reason: payload.reason,
      });
      return;
    }

    try {
      const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload);
      await this.poisonQueueClient.sendMessage(serialized);
      logger.info('Mensaje descartado enviado a cola poison', {
        reason: payload.reason,
      });
    } catch (error) {
      logger.error('Error al enviar mensaje a cola poison', {
        errorMessage: error.message,
      });
    }
  }
}

module.exports = { QueueConsumer };
