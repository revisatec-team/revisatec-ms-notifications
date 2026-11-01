const express = require('express');
const { checkQueueHealth } = require('./queue/queueClient');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(express.json());

// Endpoint de salud base: inmutable para validación de APIM y certificados
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'revisatec-ms-notifications',
    timestamp: Date.now(), // Epoch en milisegundos
  });
});

// Endpoint de diagnóstico de dependencias externas
app.get('/health/dependencies', async (req, res) => {
  const result = await checkQueueHealth();
  const statusCode = result.queue === 'ok' ? 200 : 503;
  res.status(statusCode).json(result);
});

// Espacio para rutas de la API (se conectan en Miércoles)
// app.use('/notifications', notificationsRouter);

// Manejo de 404 y errores
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
