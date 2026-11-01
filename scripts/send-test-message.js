const { QueueServiceClient } = require('@azure/storage-queue');
const crypto = require('crypto');

// Soporte para QUEUE_CONNECTION_STRING o AZURE_STORAGE_CONNECTION_STRING
const connectionString =
  process.env.QUEUE_CONNECTION_STRING || process.env.AZURE_STORAGE_CONNECTION_STRING;
const queueName = process.env.QUEUE_NAME || 'notificaciones';

if (!connectionString) {
  console.error('Error: Falta la variable de entorno QUEUE_CONNECTION_STRING.');
  console.error('Asegurese de ejecutar: npm run send:test (que carga .env automaticamente)');
  process.exit(1);
}

const args = process.argv.slice(2);
const isInvalid = args.includes('--invalid');
const isDuplicate = args.includes('--duplicate');

// Filtrar banderas para obtener argumentos posicionales
const positional = args.filter((arg) => !arg.startsWith('--'));
const typeArg = positional[0] || 'FEEDBACK_PUBLISHED';
const groupId = parseInt(positional[1], 10) || 1;
const count = parseInt(positional[2], 10) || 1;

async function run() {
  try {
    const queueServiceClient = QueueServiceClient.fromConnectionString(connectionString);
    const queueClient = queueServiceClient.getQueueClient(queueName);

    await queueClient.createIfNotExists();

    if (isInvalid) {
      // Envia mensaje mal formado o con esquema roto para probar descarte / poison queue
      const invalidPayload = '{"eventId": "malformed", "type": "TIPO_INVALIDO"}';
      await queueClient.sendMessage(invalidPayload);
      console.log('Mensaje INVALIDO de prueba enviado con exito a la cola:', queueName);
      return;
    }

    const baseEventId = crypto.randomUUID();

    for (let i = 0; i < count; i++) {
      const eventId = isDuplicate ? baseEventId : crypto.randomUUID();
      const isIssue = typeArg === 'ISSUE_DETECTED';

      const payload = {
        eventId,
        type: isIssue ? 'ISSUE_DETECTED' : 'FEEDBACK_PUBLISHED',
        courseId: 1,
        groupId,
        title: isIssue ? 'Inconveniente detectado' : 'Retroalimentacion publicada',
        message: isIssue
          ? `Se detecto un inconveniente de calidad en el Grupo ${groupId}`
          : `Se publico la retroalimentacion del Grupo ${groupId} para la entrega`,
        createdAt: Date.now(),
        source: 'ms-analysis',
      };

      // Texto plano UTF-8
      await queueClient.sendMessage(JSON.stringify(payload));
      console.log(`Mensaje enviado con exito [eventId: ${eventId}, type: ${payload.type}]`);

      if (isDuplicate && count === 1) {
        // Si especifico --duplicate pero sin count, enviamos el segundo mensaje con el mismo eventId
        await queueClient.sendMessage(JSON.stringify(payload));
        console.log(`Mensaje DUPLICADO enviado con exito [eventId: ${eventId}]`);
      }
    }
  } catch (error) {
    console.error('Error al enviar mensaje de prueba:', error.message);
    process.exit(1);
  }
}

run();
