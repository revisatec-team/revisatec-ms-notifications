const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { parseAndValidateMessage } = require('../src/queue/messageSchema');
const { InMemoryNotificationRepository } = require('../src/repositories/inMemoryNotification.repository');
const { NotificationsService } = require('../src/services/notifications.service');
const { QueueConsumer } = require('../src/queue/consumer');

class FakeQueueClient {
  constructor(initialMessages = []) {
    this.messages = initialMessages.map((m, idx) => ({
      messageId: m.messageId || `msg-${idx}`,
      popReceipt: m.popReceipt || `receipt-${idx}`,
      messageText: typeof m.messageText === 'string' ? m.messageText : JSON.stringify(m.messageText),
      dequeueCount: m.dequeueCount || 1,
    }));
    this.deleted = [];
    this.sent = [];
  }

  async receiveMessages({ numberOfMessages = 10 } = {}) {
    const batch = this.messages.splice(0, numberOfMessages);
    return { receivedMessageItems: batch };
  }

  async deleteMessage(messageId, popReceipt) {
    this.deleted.push({ messageId, popReceipt });
  }

  async sendMessage(text) {
    this.sent.push(text);
  }
}

describe('Validación de Esquema de Mensajes (messageSchema)', () => {
  it('valida correctamente un mensaje completo y válido', () => {
    const raw = {
      eventId: crypto.randomUUID(),
      type: 'FEEDBACK_PUBLISHED',
      courseId: 1,
      groupId: 2,
      title: 'Retroalimentación publicada',
      message: 'Se publicó la retroalimentación del grupo 2',
      createdAt: Date.now(),
      source: 'ms-analysis',
    };

    const res = parseAndValidateMessage(raw);
    assert.equal(res.valid, true);
    assert.equal(res.errors.length, 0);
    assert.equal(res.data.eventId, raw.eventId);
    assert.equal(res.data.courseId, 1);
  });

  it('rechaza mensaje con createdAt en segundos', () => {
    const raw = {
      eventId: crypto.randomUUID(),
      type: 'FEEDBACK_PUBLISHED',
      courseId: 1,
      groupId: 2,
      title: 'Retroalimentación publicada',
      message: 'Mensaje de prueba',
      createdAt: Math.floor(Date.now() / 1000), // En segundos
    };

    const res = parseAndValidateMessage(raw);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('milisegundos')));
  });

  it('rechaza mensaje con tipo no permitido o campos faltantes', () => {
    const raw = {
      eventId: 'evt-1',
      type: 'TIPO_INEXISTENTE',
    };

    const res = parseAndValidateMessage(raw);
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('tipos permitidos')));
    assert.ok(res.errors.some((e) => e.includes('title')));
    assert.ok(res.errors.some((e) => e.includes('courseId')));
  });

  it('decodifica automáticamente si viene en Base64', () => {
    const original = {
      eventId: crypto.randomUUID(),
      type: 'ISSUE_DETECTED',
      courseId: 1,
      groupId: 3,
      title: 'Alerta',
      message: 'Problema con commits',
      createdAt: Date.now(),
    };

    const base64 = Buffer.from(JSON.stringify(original)).toString('base64');
    const res = parseAndValidateMessage(base64);

    assert.equal(res.valid, true);
    assert.equal(res.data.eventId, original.eventId);
    assert.equal(res.data.type, 'ISSUE_DETECTED');
  });
});

describe('Servicio de Notificaciones y Repositorio', () => {
  it('guarda un mensaje válido y evita duplicados en segundo intento', async () => {
    const repo = new InMemoryNotificationRepository();
    const service = new NotificationsService({ repository: repo });

    const raw = {
      eventId: 'evt-unique-123',
      type: 'FEEDBACK_PUBLISHED',
      courseId: 1,
      groupId: 1,
      title: 'Hito 1 calificado',
      message: 'Se han publicado los resultados',
      createdAt: Date.now(),
    };

    const first = await service.processEvent(raw);
    assert.equal(first.status, 'SUCCESS');
    assert.equal(first.notification.id, 'evt-unique-123');

    // Segundo intento con el mismo eventId
    const second = await service.processEvent(raw);
    assert.equal(second.status, 'DUPLICATE');

    const list = await repo.list();
    assert.equal(list.totalRecords, 1);
  });

  it('emite notificación en tiempo real tras guardar con éxito', async () => {
    const repo = new InMemoryNotificationRepository();
    const emitted = [];
    const mockPublisher = {
      async publish(notification) {
        emitted.push(notification);
      },
    };

    const service = new NotificationsService({
      repository: repo,
      publisher: mockPublisher,
    });

    const raw = {
      eventId: 'evt-rt-1',
      type: 'FEEDBACK_PUBLISHED',
      courseId: 1,
      groupId: 1,
      title: 'Hito 1',
      message: 'Mensaje de tiempo real',
      createdAt: Date.now(),
    };

    const res = await service.processEvent(raw);
    assert.equal(res.status, 'SUCCESS');
    assert.equal(emitted.length, 1);
    assert.equal(emitted[0].id, 'evt-rt-1');
  });

  it('un fallo en el publicador de tiempo real no rompe la persistencia ni falla el proceso', async () => {
    const repo = new InMemoryNotificationRepository();
    const faultyPublisher = {
      async publish() {
        throw new Error('Fallo de conexión simulado con Web PubSub');
      },
    };

    const service = new NotificationsService({
      repository: repo,
      publisher: faultyPublisher,
    });

    const raw = {
      eventId: 'evt-rt-2',
      type: 'ISSUE_DETECTED',
      courseId: 1,
      groupId: 2,
      title: 'Alerta',
      message: 'Inconveniente detectado',
      createdAt: Date.now(),
    };

    const res = await service.processEvent(raw);
    assert.equal(res.status, 'SUCCESS');

    // Comprobar que a pesar del error del publicador, la notificación sí quedó guardada
    const saved = await repo.findById('evt-rt-2');
    assert.ok(saved);
    assert.equal(saved.id, 'evt-rt-2');
  });
});

describe('Consumidor de Cola (QueueConsumer)', () => {
  it('elimina mensaje de la cola tras procesamiento exitoso', async () => {
    const repo = new InMemoryNotificationRepository();
    const service = new NotificationsService({ repository: repo });

    const validPayload = {
      eventId: crypto.randomUUID(),
      type: 'FEEDBACK_PUBLISHED',
      courseId: 1,
      groupId: 1,
      title: 'Prueba',
      message: 'Mensaje de prueba',
      createdAt: Date.now(),
    };

    const mainQueue = new FakeQueueClient([{ messageId: 'm1', messageText: validPayload, dequeueCount: 1 }]);
    const poisonQueue = new FakeQueueClient();

    const consumer = new QueueConsumer({
      mainQueueClient: mainQueue,
      poisonQueueClient: poisonQueue,
      notificationsService: service,
      pollIntervalMs: 50,
    });

    await consumer._processSingleMessage(mainQueue.messages[0]);

    assert.equal(mainQueue.deleted.length, 1);
    assert.equal(mainQueue.deleted[0].messageId, 'm1');
    assert.equal(poisonQueue.sent.length, 0);
  });

  it('mueve a cola poison y elimina de principal si el mensaje es inválido', async () => {
    const repo = new InMemoryNotificationRepository();
    const service = new NotificationsService({ repository: repo });

    const invalidMsg = { messageId: 'm-bad', messageText: '{"invalido": true}', dequeueCount: 1 };
    const mainQueue = new FakeQueueClient([invalidMsg]);
    const poisonQueue = new FakeQueueClient();

    const consumer = new QueueConsumer({
      mainQueueClient: mainQueue,
      poisonQueueClient: poisonQueue,
      notificationsService: service,
    });

    await consumer._processSingleMessage(mainQueue.messages[0]);

    assert.equal(mainQueue.deleted.length, 1);
    assert.equal(poisonQueue.sent.length, 1);
    const poisonPayload = JSON.parse(poisonQueue.sent[0]);
    assert.equal(poisonPayload.messageId, 'm-bad');
    assert.equal(poisonPayload.reason, 'INVALID_SCHEMA');
  });

  it('mueve a cola poison si supera MAX_DEQUEUE_COUNT', async () => {
    const repo = new InMemoryNotificationRepository();
    const service = new NotificationsService({ repository: repo });

    const poisonedMsg = { messageId: 'm-retry', messageText: '{}', dequeueCount: 6 };
    const mainQueue = new FakeQueueClient([poisonedMsg]);
    const poisonQueue = new FakeQueueClient();

    const consumer = new QueueConsumer({
      mainQueueClient: mainQueue,
      poisonQueueClient: poisonQueue,
      notificationsService: service,
      maxDequeueCount: 5,
    });

    await consumer._processSingleMessage(mainQueue.messages[0]);

    assert.equal(mainQueue.deleted.length, 1);
    assert.equal(poisonQueue.sent.length, 1);
    assert.match(poisonQueue.sent[0], /Excedido/);
  });

  it('no elimina el mensaje si ocurre un error temporal', async () => {
    const faultyRepo = {
      async create() {
        throw new Error('Base de datos no disponible');
      },
    };
    const service = new NotificationsService({ repository: faultyRepo });

    const validPayload = {
      eventId: crypto.randomUUID(),
      type: 'FEEDBACK_PUBLISHED',
      courseId: 1,
      groupId: 1,
      title: 'Prueba de fallo',
      message: 'Fallo simulado',
      createdAt: Date.now(),
    };

    const mainQueue = new FakeQueueClient([{ messageId: 'm-fail', messageText: validPayload, dequeueCount: 1 }]);
    const poisonQueue = new FakeQueueClient();

    const consumer = new QueueConsumer({
      mainQueueClient: mainQueue,
      poisonQueueClient: poisonQueue,
      notificationsService: service,
    });

    await consumer._processSingleMessage(mainQueue.messages[0]);

    assert.equal(mainQueue.deleted.length, 0);
    assert.equal(poisonQueue.sent.length, 0);
  });
});
