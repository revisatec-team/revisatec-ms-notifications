const { TableClient } = require('@azure/data-tables');
const { QueueServiceClient } = require('@azure/storage-queue');

// Variables de entorno cargadas con --env-file=.env
const connectionString =
  process.env.QUEUE_CONNECTION_STRING || process.env.AZURE_STORAGE_CONNECTION_STRING;
const tableName = process.env.TABLE_NAME || 'notificaciones';
const queueName = process.env.QUEUE_NAME || 'notificaciones';

if (!connectionString) {
  console.error('Error: Falta QUEUE_CONNECTION_STRING en el archivo .env');
  console.error('Uso: node --env-file=.env scripts/seed-realistic-data.js');
  process.exit(1);
}

/**
 * 4 Datos Realistas para MS3 Notifications
 * Diseñados según la rúbrica y flujo de RevisaTEC:
 * - 2 eventos de retroalimentación publicada (FEEDBACK_PUBLISHED)
 * - 2 eventos de inconvenientes detectados en repositorio (ISSUE_DETECTED)
 */
const realisticNotifications = [
  {
    id: 'b4e287a1-5d9c-4f12-a89e-7c1a0e8d5f31',
    type: 'FEEDBACK_PUBLISHED',
    title: 'Retroalimentación publicada: Entrega 2 - Arquitectura y Prototipo',
    message: 'El profesor ha publicado la evaluación y observaciones para el Grupo 2 (revisatec/g2-web) con una nota de 85/100.',
    courseId: 1,
    groupId: 2,
    createdAt: 1792681200000,
    read: false,
    source: 'ms-analysis',
  },
  {
    id: 'c9a14f32-8e2b-47d5-91fa-2d6e4b8a1c90',
    type: 'ISSUE_DETECTED',
    title: 'Inconveniente detectado: Commits de prueba en rama principal',
    message: 'Se detectaron 3 commits de prueba (test fix, wip) sin revisión por pares en la rama main del Grupo 1.',
    courseId: 1,
    groupId: 1,
    createdAt: 1792670400000,
    read: false,
    source: 'ms-analysis',
  },
  {
    id: 'd1f5e824-3a7c-40b9-8e4d-5c2a9f1b7e63',
    type: 'FEEDBACK_PUBLISHED',
    title: 'Retroalimentación publicada: Entrega 1 - Especificación de Requerimientos',
    message: 'Se ha publicado la retroalimentación y cumplimiento de criterios de la rúbrica para el Grupo 3.',
    courseId: 1,
    groupId: 3,
    createdAt: 1792584000000,
    read: true,
    source: 'ms-analysis',
  },
  {
    id: 'e7b39a45-6c1d-48f0-b2e3-8a4d7f5c9e12',
    type: 'ISSUE_DETECTED',
    title: 'Inconveniente detectado: Fusión sin revisores mínimos requeridos',
    message: 'El PR #14 del Grupo 4 fue fusionado sin cumplir el requisito de 2 revisores mínimos establecido en la configuración.',
    courseId: 1,
    groupId: 4,
    createdAt: 1792497600000,
    read: true,
    source: 'ms-analysis',
  },
];

async function seed() {
  console.log('--- Iniciando siembra de 4 datos realistas para MS3 ---');
  console.log(`Tabla destino: ${tableName}`);

  try {
    const tableClient = TableClient.fromConnectionString(connectionString, tableName);
    await tableClient.createTable();
    console.log(`Tabla "${tableName}" lista.`);

    for (const notif of realisticNotifications) {
      // Azure Table Storage requiere partitionKey y rowKey
      const entity = {
        partitionKey: 'professor',
        rowKey: notif.id,
        id: notif.id,
        type: notif.type,
        title: notif.title,
        message: notif.message,
        courseId: notif.courseId,
        groupId: notif.groupId,
        createdAt: notif.createdAt,
        read: notif.read,
        source: notif.source,
      };

      await tableClient.upsertEntity(entity, 'Replace');
      console.log(`✓ Insertada en Table Storage: [${notif.type}] ${notif.title} (ID: ${notif.id})`);
    }

    console.log('\n--- Siembra completada con éxito en Azure Table Storage ---');
    console.log('Las 4 notificaciones realistas están disponibles para GET /notifications y PATCH /notifications/:id/read.');
  } catch (error) {
    console.error('Error sembrando datos en Azure Table Storage:', error.message);
  }
}

seed();
