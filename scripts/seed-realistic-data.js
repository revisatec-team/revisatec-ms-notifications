const { TableClient } = require('@azure/data-tables');

// Variables de entorno cargadas con --env-file=.env
const connectionString =
  process.env.QUEUE_CONNECTION_STRING || process.env.AZURE_STORAGE_CONNECTION_STRING;
const tableName = process.env.TABLE_NAME || 'notificaciones';

if (!connectionString) {
  console.error('Error: Falta QUEUE_CONNECTION_STRING en el archivo .env');
  console.error('Uso: node --env-file=.env scripts/seed-realistic-data.js');
  process.exit(1);
}

/**
 * 4 Datos Realistas para MS3 Notifications
 * Coincidentes con la estructura real de cursos y grupos en MS1:
 * - Curso 1 (Bases de Datos): Grupos 1 y 5
 * - Curso 4 (Lenguajes de Programación): Grupos 4 y 6
 * - Curso 5 (Diseño de Software): Grupos 7 y 8
 * - Curso 6 (Administración de Proyectos): Grupos 9 y 10
 */
const realisticNotifications = [
  {
    id: 'b4e287a1-5d9c-4f12-a89e-7c1a0e8d5f31',
    type: 'FEEDBACK_PUBLISHED',
    title: 'Retroalimentación publicada: Entrega 2 - Modelo Relacional y Normalización',
    message: 'El profesor ha publicado la evaluación y observaciones para el Grupo 5 (Bases de Datos) con una nota de 88/100.',
    courseId: 1,
    groupId: 5,
    createdAt: 1792681200000,
    read: false,
    source: 'ms-analysis',
  },
  {
    id: 'c9a14f32-8e2b-47d5-91fa-2d6e4b8a1c90',
    type: 'ISSUE_DETECTED',
    title: 'Inconveniente detectado: Commits directos en rama principal',
    message: 'Se detectaron 3 commits de prueba en la rama main del Grupo 1 (Bases de Datos) sin pasar por pull request ni revisión.',
    courseId: 1,
    groupId: 1,
    createdAt: 1792670400000,
    read: false,
    source: 'ms-analysis',
  },
  {
    id: 'd1f5e824-3a7c-40b9-8e4d-5c2a9f1b7e63',
    type: 'FEEDBACK_PUBLISHED',
    title: 'Retroalimentación publicada: Iteración 1 - Arquitectura de Microservicios',
    message: 'Se ha publicado la retroalimentación y cumplimiento de criterios de rúbrica para el Grupo 7 (Diseño de Software).',
    courseId: 5,
    groupId: 7,
    createdAt: 1792584000000,
    read: false,
    source: 'ms-analysis',
  },
  {
    id: 'e7b39a45-6c1d-48f0-b2e3-8a4d7f5c9e12',
    type: 'ISSUE_DETECTED',
    title: 'Inconveniente detectado: Fusión sin revisores mínimos requeridos',
    message: 'El PR #12 del Grupo 8 (Diseño de Software) fue fusionado sin cumplir el requisito de 2 revisores mínimos establecido en la configuración.',
    courseId: 5,
    groupId: 8,
    createdAt: 1792497600000,
    read: false,
    source: 'ms-analysis',
  },
];

async function seed() {
  console.log('--- Iniciando siembra de datos realistas para MS3 (coincidentes con MS1) ---');
  console.log('Tabla destino: ' + tableName);

  try {
    const tableClient = TableClient.fromConnectionString(connectionString, tableName);
    await tableClient.createTable().catch(() => {});
    console.log('Tabla "' + tableName + '" lista.');

    // 1. Limpieza de entidades anteriores con partitionKey professor
    console.log('Limpiando notificaciones anteriores...');
    const existingEntities = tableClient.listEntities({
      queryOptions: { filter: "PartitionKey eq 'professor'" },
    });
    let deletedCount = 0;
    for await (const entity of existingEntities) {
      await tableClient.deleteEntity(entity.partitionKey, entity.rowKey);
      deletedCount++;
    }
    console.log('Se eliminaron ' + deletedCount + ' registros antiguos de la tabla.');

    // 2. Inserción de los datos realistas
    for (const notif of realisticNotifications) {
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
      console.log('✓ Insertada en Table Storage: [' + notif.type + '] ' + notif.title + ' (Curso: ' + notif.courseId + ', Grupo: ' + notif.groupId + ')');
    }

    console.log('\n--- Siembra completada con éxito en Azure Table Storage ---');
    console.log('Grupos sembrados:');
    console.log('  - Grupo 5 (Bases de Datos, Curso 1) -> visible para estudiantes del grupo 5');
    console.log('  - Grupo 1 (Bases de Datos, Curso 1) -> visible para estudiantes del grupo 1');
    console.log('  - Grupo 7 (Diseño de Software, Curso 5) -> visible para estudiantes del grupo 7');
    console.log('  - Grupo 8 (Diseño de Software, Curso 5) -> visible para estudiantes del grupo 8');
  } catch (error) {
    console.error('Error sembrando datos en Azure Table Storage:', error.message);
  }
}

seed();
