const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');
const { InMemoryNotificationRepository } = require('../src/repositories/inMemoryNotification.repository');

describe('Servidor Express y Endpoints Base', () => {
  let server;
  let baseUrl;
  let repo;

  before(async () => {
    repo = new InMemoryNotificationRepository([
      {
        id: 'evt-1',
        type: 'FEEDBACK_PUBLISHED',
        title: 'Retroalimentación Hito 1',
        message: 'Revisión completada para Grupo 1',
        courseId: 1,
        groupId: 1,
        createdAt: 1729000000000,
        read: false,
        source: 'ms-analysis',
      },
      {
        id: 'evt-2',
        type: 'ISSUE_DETECTED',
        title: 'Inconveniente detectado',
        message: 'No hay actividad en el repositorio',
        courseId: 1,
        groupId: 2,
        createdAt: 1729100000000,
        read: false,
        source: 'ms-analysis',
      },
    ]);
    app.locals.notificationRepo = repo;

    return new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  after(async () => {
    return new Promise((resolve) => {
      server.close(resolve);
    });
  });

  it('GET /health devuelve status 200 con formato esperado', async () => {
    const res = await fetch(`${baseUrl}/health`);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'revisatec-ms-notifications');
    assert.equal(typeof data.timestamp, 'number');
    assert.ok(data.timestamp > 1700000000000);
  });

  it('GET /ruta-inexistente devuelve 404 con { error: "Ruta no encontrada" }', async () => {
    const res = await fetch(`${baseUrl}/ruta-inexistente`);
    assert.equal(res.status, 404);

    const data = await res.json();
    assert.equal(data.error, 'Ruta no encontrada');
  });

  it('POST con JSON mal formado devuelve 400 con mensaje en español', async () => {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ json invalido',
    });
    assert.equal(res.status, 400);

    const data = await res.json();
    assert.match(data.error, /JSON/);
  });

  it('GET /health/dependencies responde (503 si la cola no esta conectada o 200 si lo esta)', async () => {
    const res = await fetch(`${baseUrl}/health/dependencies`);
    const data = await res.json();
    assert.ok(['ok', 'error'].includes(data.queue));
  });

  describe('Endpoints REST de Notificaciones (/notifications)', () => {
    it('GET /notifications lista elementos paginados ordenados desc por fecha', async () => {
      const res = await fetch(`${baseUrl}/notifications?page=1&pageSize=10`);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.page, 1);
      assert.equal(json.pageSize, 10);
      assert.equal(json.totalRecords, 2);
      assert.equal(json.unreadCount, 2);
      assert.equal(json.data.length, 2);
      // evt-2 tiene fecha más reciente que evt-1
      assert.equal(json.data[0].id, 'evt-2');
    });

    it('GET /notifications rechaza parámetros inválidos con 400', async () => {
      const badPage = await fetch(`${baseUrl}/notifications?page=0`);
      assert.equal(badPage.status, 400);

      const badPageSize = await fetch(`${baseUrl}/notifications?pageSize=150`);
      assert.equal(badPageSize.status, 400);
    });

    it('GET /notifications con filtro de búsqueda busca coincidencias', async () => {
      const res = await fetch(`${baseUrl}/notifications?search=Retroalimentación`);
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.totalRecords, 1);
      assert.equal(json.data[0].id, 'evt-1');
    });

    it('PATCH /notifications/:id/read marca una notificación como leída (200)', async () => {
      const res = await fetch(`${baseUrl}/notifications/evt-1/read`, { method: 'PATCH' });
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.id, 'evt-1');
      assert.equal(json.read, true);

      // Verificar que el unreadCount disminuyó
      const listRes = await fetch(`${baseUrl}/notifications`);
      const listJson = await listRes.json();
      assert.equal(listJson.unreadCount, 1);
    });

    it('PATCH /notifications/:id/read devuelve 404 para ID inexistente', async () => {
      const res = await fetch(`${baseUrl}/notifications/id-inexistente/read`, { method: 'PATCH' });
      assert.equal(res.status, 404);

      const json = await res.json();
      assert.equal(json.error, 'Notificación no encontrada');
    });

    it('PATCH /notifications/read-all marca todas las pendientes como leídas', async () => {
      const res = await fetch(`${baseUrl}/notifications/read-all`, { method: 'PATCH' });
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.updatedCount, 1); // Solo evt-2 quedaba pendiente

      const listRes = await fetch(`${baseUrl}/notifications`);
      const listJson = await listRes.json();
      assert.equal(listJson.unreadCount, 0);
    });
  });
});
