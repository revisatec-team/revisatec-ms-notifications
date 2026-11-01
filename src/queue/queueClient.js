const { QueueServiceClient } = require('@azure/storage-queue');
const { logger } = require('../utils/logger');

let queueServiceClient = null;
let mainQueueClient = null;
let poisonQueueClient = null;

/**
 * Inicializa el cliente y asegura la existencia de las colas principal y poison.
 */
async function initQueues(config) {
  if (!config?.queueConnectionString) {
    throw new Error('No se proporcionó QUEUE_CONNECTION_STRING para inicializar las colas');
  }

  queueServiceClient = QueueServiceClient.fromConnectionString(config.queueConnectionString);
  mainQueueClient = queueServiceClient.getQueueClient(config.queueName);
  poisonQueueClient = queueServiceClient.getQueueClient(config.poisonQueueName);

  try {
    await mainQueueClient.createIfNotExists();
    await poisonQueueClient.createIfNotExists();
    logger.info('Colas de Azure Storage inicializadas correctamente', {
      queueName: config.queueName,
      poisonQueueName: config.poisonQueueName,
    });
  } catch (error) {
    logger.error('Error al inicializar las colas en Azure Storage', {
      errorMessage: error.message,
    });
    throw error;
  }

  return {
    mainQueueClient,
    poisonQueueClient,
  };
}

function getMainQueueClient() {
  if (!mainQueueClient) {
    throw new Error('mainQueueClient no ha sido inicializado. Llame a initQueues primero.');
  }
  return mainQueueClient;
}

function getPoisonQueueClient() {
  if (!poisonQueueClient) {
    throw new Error('poisonQueueClient no ha sido inicializado. Llame a initQueues primero.');
  }
  return poisonQueueClient;
}

/**
 * Verifica el estado de salud de la conexión a la cola (para /health/dependencies).
 */
async function checkQueueHealth() {
  if (!mainQueueClient) {
    return { queue: 'error', reason: 'No inicializado' };
  }

  try {
    await mainQueueClient.getProperties();
    return { queue: 'ok' };
  } catch (error) {
    logger.warn('Fallo en verificación de salud de Azure Queue', {
      errorMessage: error.message,
    });
    return { queue: 'error' };
  }
}

module.exports = {
  initQueues,
  getMainQueueClient,
  getPoisonQueueClient,
  checkQueueHealth,
};
