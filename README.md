# RevisaTEC — MS3: Notifications

Microservicio de notificaciones asíncronas y eventos para la plataforma **RevisaTEC**.

Consume eventos publicados por los microservicios de análisis (`ms-analysis`), asegura idempotencia, persiste el historial en **Azure Table Storage** y ofrece una API REST para consulta y marcado de lectura de notificaciones por parte del profesor.

---

## 🏗 Arquitectura

1. **Ingesta de Eventos:** Los eventos (`FEEDBACK_PUBLISHED`, `ISSUE_DETECTED`) llegan a la cola principal `notificaciones` en **Azure Queue Storage**.
2. **Consumo e Idempotencia:** El worker (`QueueConsumer`) procesa los mensajes por lotes, valida el esquema (`messageSchema.js`) y almacena el evento en Azure Table Storage usando el `eventId` como clave única (RowKey) bajo la partición `professor`. Si el evento ya existía, se detecta el conflicto 409 y se descarta de forma segura sin duplicar registros.
3. **Manejo de Mensajes Inválidos y Poison:** Los mensajes corruptos o que superan `MAX_DEQUEUE_COUNT` reintentos son archivados en la cola `notificaciones-poison` con el detalle del error y eliminados de la cola principal.
4. **Punto de Enganche Tiempo Real:** Diseñado con el patrón inyector `NoopPublisher`, preparado para conectarse a **Azure Web PubSub / SignalR** sin refactorizar el servicio central.
5. **API REST:** Endpoints en Express para que el frontend consulte el historial paginado y gestione el estado de lectura.

---

## ⚙ Variables de Entorno

Configura un archivo `.env` en la raíz (puedes basarte en `.env.example`):

| Variable | Descripción | Valor por Defecto |
|---|---|---|
| `PORT` | Puerto HTTP donde escucha Express | `3000` |
| `QUEUE_CONNECTION_STRING` | Cadena de conexión de Azure Storage *(requerida para iniciar en vivo)* | — |
| `QUEUE_NAME` | Nombre de la cola de eventos entrantes | `notificaciones` |
| `POISON_QUEUE_NAME` | Nombre de la cola de descarte para mensajes inválidos | `notificaciones-poison` |
| `TABLE_NAME` | Nombre de la tabla en Azure Table Storage para el historial | `notificaciones` |
| `POLL_INTERVAL_MS` | Intervalo base de sondeo de la cola en milisegundos | `3000` |
| `VISIBILITY_TIMEOUT_S` | Tiempo de visibilidad del mensaje en segundos | `30` |
| `MAX_DEQUEUE_COUNT` | Número máximo de reintentos antes de mover a poison | `5` |

> 🔒 **Seguridad:** El archivo `.env` está en `.gitignore` y **nunca** debe subirse al repositorio ni incluir credenciales en logs o commits.

---

## 🚀 Comandos de Ejecución

```bash
# Instalar dependencias
npm install

# Ejecutar pruebas automáticas nativas (no requiere conexión a Azure)
npm test

# Iniciar en modo desarrollo con recarga automática
npm run dev

# Iniciar en modo producción
npm start

# Enviar mensaje de prueba a la cola de Azure
npm run send:test

# Enviar mensaje con tipo personalizado y grupo
npm run send:test -- ISSUE_DETECTED 2

# Enviar mensaje de prueba con estructura inválida (para probar cola poison)
npm run send:test -- --invalid
```

---

## 📡 Endpoints REST

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/health` | Diagnóstico de salud base (inmutable para APIM y balanceadores) |
| `GET` | `/health/dependencies` | Estado de conectividad con la cola de Azure Storage |
| `GET` | `/notifications` | Lista de notificaciones con paginación (`page`, `pageSize`) y filtro (`search`) |
| `PATCH` | `/notifications/:id/read` | Marca una notificación específica como leída (`read: true`) |
| `PATCH` | `/notifications/read-all` | Marca todas las notificaciones pendientes como leídas |

Para consultar la especificación completa de contratos, esquemas y respuestas, revisa el archivo [openapi.yaml](openapi.yaml).
