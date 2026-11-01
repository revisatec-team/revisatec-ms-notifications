const app = require('./app');
const { getConfig } = require('./config');
const { initQueues } = require('./queue/queueClient');
const { logger } = require('./utils/logger');

async function start() {
  try {
    const config = getConfig();

    // Inicialización de colas de Azure Storage
    await initQueues(config);

    const server = app.listen(config.port, () => {
      logger.info('Servidor MS3 Notifications iniciado', {
        port: config.port,
        queueName: config.queueName,
        poisonQueueName: config.poisonQueueName,
      });
    });

    // Cierre ordenado
    const shutdown = async (signal) => {
      logger.info(`Señal ${signal} recibida, cerrando servidor ordenadamente...`);
      server.close(() => {
        logger.info('Servidor HTTP cerrado.');
        process.exit(0);
      });

      // Forzar salida si tarda más de 10 segundos
      setTimeout(() => {
        logger.error('Forzando cierre por tiempo de espera excedido');
        process.exit(1);
      }, 10000).unref();
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.error('Error fatal al iniciar MS3 Notifications', {
      errorMessage: error.message,
    });
    process.exit(1);
  }
}

start();
