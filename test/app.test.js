const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');
const { InMemoryNotificationRepository } = require('../src/repositories/inMemoryNotification.repository');
const { FakeRealtimeTokenProvider } = require('../src/realtime/tokenProvider');

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
      {
        id: 'evt-3',
        type: 'FEEDBACK_PUBLISHED',
        title: 'Retroalimentación Grupo 5',
        message: 'Evaluación disponible para Grupo 5',
        courseId: 5,
        groupId: 5,
        createdAt: 1729200000000,
        read: false,
        source: 'ms-analysis',
      },
    ]);
    app.locals.notificationRepo = repo;
    app.locals.realtimeTokenProvider = null; // Inicialmente sin tiempo real para probar el 503

    return new Promise((resolve) => {
      server = http.createServer(app);
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        baseUrl = 'http://127.0.0.1:' + port;
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
    const res = await fetch(baseUrl + '/health');
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.service, 'revisatec-ms-notifications');
    assert.equal(typeof data.timestamp, 'number');
    assert.ok(data.timestamp > 1700000000000);
  });

  it('GET /ruta-inexistente devuelve 404 con { error: "Ruta no encontrada" }', async () => {
    const res = await fetch(baseUrl + '/ruta-inexistente');
    assert.equal(res.status, 404);

    const data = await res.json();
    assert.equal(data.error, 'Ruta no encontrada');
  });

  it('POST con JSON mal formado devuelve 400 con mensaje en español', async () => {
    const res = await fetch(baseUrl + '/health', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ json invalido',
    });
    assert.equal(res.status, 400);

    const data = await res.json();
    assert.match(data.error, /JSON/);
  });

  it('GET /health/dependencies responde (503 si la cola no esta conectada o 200 si lo esta)', async () => {
    const res = await fetch(baseUrl + '/health/dependencies');
    const data = await res.json();
    assert.ok(['ok', 'error'].includes(data.queue));
  });

  describe('Endpoints REST de Notificaciones (/notifications)', () => {
    it('GET /notifications lista elementos paginados ordenados desc por fecha (incluye items y data)', async () => {
      const res = await fetch(baseUrl + '/notifications?page=1&pageSize=10');
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.page, 1);
      assert.equal(json.pageSize, 10);
      assert.equal(json.totalRecords, 3);
      assert.equal(json.unreadCount, 3);
      assert.equal(json.items.length, 3);
      assert.equal(json.data.length, 3);
      assert.equal(json.items[0].id, 'evt-3');
    });

    it('GET /notifications rechaza parámetros inválidos con 400', async () => {
      const badPage = await fetch(baseUrl + '/notifications?page=0');
      assert.equal(badPage.status, 400);

      const badPageSize = await fetch(baseUrl + '/notifications?pageSize=150');
      assert.equal(badPageSize.status, 400);
    });

    it('GET /notifications con filtro de búsqueda busca coincidencias', async () => {
      const res = await fetch(baseUrl + '/notifications?search=Retroalimentación');
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.totalRecords, 2);
      assert.ok(json.items.some((i) => i.id === 'evt-1'));
    });

    it('GET /notifications con filtro por groupIds solo devuelve los del grupo solicitado', async () => {
      const res = await fetch(baseUrl + '/notifications?groupIds=1');
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.totalRecords, 1);
      assert.equal(json.items[0].groupId, 1);
      assert.equal(json.items[0].id, 'evt-1');
    });

    it('GET /notifications con filtro por courseIds solo devuelve los del curso solicitado', async () => {
      const res = await fetch(baseUrl + '/notifications?courseIds=5');
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.totalRecords, 1);
      assert.equal(json.items[0].courseId, 5);
      assert.equal(json.items[0].id, 'evt-3');
    });

    it('Lecturas independientes por usuario (P0.2): marcar leída para usuario A no altera usuario B', async () => {
      const userA = 'valeria.jimenez@estudiantec.cr';
      const userB = 'natalia.araya@estudiantec.cr';

      // Marcar evt-1 como leída para userA
      const patchRes = await fetch(baseUrl + '/notifications/evt-1/read', {
        method: 'PATCH',
        headers: { 'X-User-Email': userA },
      });
      assert.equal(patchRes.status, 200);

      // userA consulta: evt-1 está leída
      const resA = await fetch(baseUrl + '/notifications?userEmail=' + userA);
      const jsonA = await resA.json();
      const itemA = jsonA.items.find((i) => i.id === 'evt-1');
      assert.equal(itemA.read, true);

      // userB consulta: evt-1 SIGUE sin leer
      const resB = await fetch(baseUrl + '/notifications?userEmail=' + userB);
      const jsonB = await resB.json();
      const itemB = jsonB.items.find((i) => i.id === 'evt-1');
      assert.equal(itemB.read, false);
    });

    it('PATCH /notifications/:id/read marca una notificación como leída (200)', async () => {
      const res = await fetch(baseUrl + '/notifications/evt-2/read', { method: 'PATCH' });
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.equal(json.id, 'evt-2');
      assert.equal(json.read, true);
    });

    it('PATCH /notifications/:id/read devuelve 404 para ID inexistente', async () => {
      const res = await fetch(baseUrl + '/notifications/id-inexistente/read', { method: 'PATCH' });
      assert.equal(res.status, 404);

      const json = await res.json();
      assert.equal(json.error, 'Notificación no encontrada');
    });

    it('PATCH /notifications/read-all marca todas las pendientes como leídas', async () => {
      const user = 'profesor.prueba@itcr.ac.cr';
      const res = await fetch(baseUrl + '/notifications/read-all', {
        method: 'PATCH',
        headers: { 'X-User-Email': user },
      });
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.ok(json.updatedCount >= 1);

      const listRes = await fetch(baseUrl + '/notifications?userEmail=' + user);
      const listJson = await listRes.json();
      assert.equal(listJson.unreadCount, 0);
    });

    it('GET /notifications/realtime-token devuelve 503 cuando el tiempo real no está configurado', async () => {
      app.locals.realtimeTokenProvider = null;
      const res = await fetch(baseUrl + '/notifications/realtime-token');
      assert.equal(res.status, 503);

      const json = await res.json();
      assert.equal(json.error, 'Tiempo real no disponible');
    });

    it('GET /notifications/realtime-token devuelve 200 con url, userId y grupos segmentados', async () => {
      app.locals.realtimeTokenProvider = new FakeRealtimeTokenProvider();
      const res = await fetch(
        baseUrl + '/notifications/realtime-token?userEmail=valeria@estudiantec.cr&groupIds=5&courseIds=1'
      );
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('cache-control'), 'no-store');

      const json = await res.json();
      assert.ok(json.url.startsWith('wss://'));
      assert.ok(json.url.includes('valeria%40estudiantec.cr'));
      assert.ok(json.url.includes('group-5'));
      assert.ok(json.url.includes('course-1'));
      assert.equal(typeof json.expiresAt, 'number');
      assert.ok(json.expiresAt > Date.now());
    });
  });

  describe('Middleware de CORS para desarrollo local', () => {
    it('aplica encabezados CORS cuando el origen está permitido', async () => {
      app.locals.corsAllowedOrigins = 'http://localhost:5173,http://localhost:5174';

      const res = await fetch(baseUrl + '/health', {
        headers: { Origin: 'http://localhost:5173' },
      });
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
      assert.equal(res.headers.get('access-control-allow-methods'), 'GET, PATCH, OPTIONS');
    });

    it('ignora orígenes no permitidos sin enviar encabezados CORS', async () => {
      app.locals.corsAllowedOrigins = 'http://localhost:5173';

      const res = await fetch(baseUrl + '/health', {
        headers: { Origin: 'http://origen-no-autorizado.com' },
      });
      assert.equal(res.headers.get('access-control-allow-origin'), null);
    });

    it('responde 204 ante solicitudes OPTIONS preflight de orígenes permitidos', async () => {
      app.locals.corsAllowedOrigins = 'http://localhost:5173';

      const res = await fetch(baseUrl + '/notifications', {
        method: 'OPTIONS',
        headers: { Origin: 'http://localhost:5173' },
      });
      assert.equal(res.status, 204);
      assert.equal(res.headers.get('access-control-allow-origin'), 'http://localhost:5173');
    });
  });
});
