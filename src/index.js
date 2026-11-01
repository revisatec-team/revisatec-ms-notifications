const app = require('./app');
const { getConfig } = require('./config');
const { initQueues, getMainQueueClient, getPoisonQueueClient } = require('./queue/queueClient');
const { TableNotificationRepository } = require('./repositories/tableNotification.repository');
const { NotificationsService } = require('./services/notifications.service');
const { QueueConsumer } = require('./queue/consumer');
const { WebPubSubPublisher } = require('./realtime/webPubSubPublisher');
const { NoopPublisher } = require('./realtime/noopPublisher');
const { WebPubSubTokenProvider } = require('./realtime/tokenProvider');
const { logger } = require('./utils/logger');

async function start() {
  try {
    const config = getConfig();

    // 1. Inicialización de colas de Azure Storage
    await initQueues(config);

    // 2. Inicialización del repositorio persistente en Azure Table Storage
    const notificationRepo = new TableNotificationRepository({
      connectionString: config.queueConnectionString,
      tableName: config.tableName,
    });
    await notificationRepo.init();

    // Compartir el repositorio con las rutas de Express
    app.locals.notificationRepo = notificationRepo;
    app.locals.corsAllowedOrigins = config.corsAllowedOrigins;

    // 3. Inicialización del canal de tiempo real (Azure Web PubSub)
    let publisher;
    if (config.realtimeConnectionString) {
      publisher = new WebPubSubPublisher({
        connectionString: config.realtimeConnectionString,
        hubName: config.realtimeHub,
      });

      const tokenProvider = new WebPubSubTokenProvider({
        connectionString: config.realtimeConnectionString,
        hubName: config.realtimeHub,
        ttlMinutes: config.realtimeTokenTtlMinutes,
      });

      app.locals.realtimeTokenProvider = tokenProvider;
      logger.info('Tiempo real habilitado con Azure Web PubSub', {
        hub: config.realtimeHub,
        tokenTtlMinutes: config.realtimeTokenTtlMinutes,
      });
    } else {
      publisher = new NoopPublisher();
      app.locals.realtimeTokenProvider = null;
      logger.warn('Tiempo real no configurado (falta REALTIME_CONNECTION_STRING), usando NoopPublisher');
    }

    // 4. Inicialización del servicio de notificaciones y consumidor de colas
    const notificationsService = new NotificationsService({
      repository: notificationRepo,
      publisher,
    });

    const consumer = new QueueConsumer({
      mainQueueClient: getMainQueueClient(),
      poisonQueueClient: getPoisonQueueClient(),
      notificationsService,
      pollIntervalMs: config.pollIntervalMs,
      visibilityTimeoutS: config.visibilityTimeoutS,
      maxDequeueCount: config.maxDequeueCount,
    });

    // Iniciar bucle de consumo en segundo plano
    consumer.start();

    // 5. Iniciar servidor HTTP
    const server = app.listen(config.port, () => {
      logger.info('Servidor MS3 Notifications iniciado con éxito', {
        port: config.port,
        queueName: config.queueName,
        poisonQueueName: config.poisonQueueName,
        tableName: config.tableName,
        realtimeEnabled: Boolean(config.realtimeConnectionString),
      });
    });

    // 6. Cierre ordenado (Graceful Shutdown)
    const shutdown = async (signal) => {
      logger.info(`Señal ${signal} recibida, cerrando servicio ordenadamente...`);
      await consumer.stop();

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
