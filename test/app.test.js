const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const app = require('../src/app');

describe('Servidor Express y Endpoints Base', () => {
  let server;
  let baseUrl;

  before(async () => {
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
    assert.ok(data.timestamp > 1700000000000); // Epoch en milisegundos reciente
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
});
