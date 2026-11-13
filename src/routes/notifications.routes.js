const express = require('express');
const router = express.Router();

/**
 * Helper para obtener el repositorio configurado en app.locals.
 */
function getRepo(req) {
  const repo = req.app.locals.notificationRepo;
  if (!repo) {
    throw new Error('Repositorio de notificaciones no disponible');
  }
  return repo;
}

/**
 * Extrae el email del usuario autenticado desde el encabezado de APIM (X-User-Email)
 * o desde los parámetros de la solicitud.
 */
function extractUserEmail(req) {
  const fromHeader = req.headers['x-user-email'];
  const fromQuery = req.query.userEmail || req.query.email;
  const fromBody = req.body && (req.body.userEmail || req.body.email);
  const email = fromHeader || fromQuery || fromBody;
  return email ? String(email).trim().toLowerCase() : null;
}

/**
 * Convierte un parámetro (string separado por comas o array) en lista de enteros válidos.
 */
function parseIdList(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(Number).filter((n) => !isNaN(n));
  return String(val)
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !isNaN(n));
}

/**
 * GET /notifications/realtime-token
 * Obtiene la URL con token temporal de conexión directa para Azure Web PubSub,
 * suscribiendo la conexión a los grupos específicos de curso y grupo del usuario.
 */
router.get('/realtime-token', async (req, res, next) => {
  try {
    const tokenProvider = req.app.locals.realtimeTokenProvider;

    if (!tokenProvider) {
      return res.status(503).json({
        error: 'Tiempo real no disponible',
      });
    }

    const userEmail = extractUserEmail(req);
    const courseIds = parseIdList(req.query.courseIds);
    const groupIds = parseIdList(req.query.groupIds);

    const explicitGroups = req.query.groups
      ? String(req.query.groups)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : [];

    const targetGroups = new Set(explicitGroups);
    courseIds.forEach((cid) => targetGroups.add('course-' + cid));
    groupIds.forEach((gid) => targetGroups.add('group-' + gid));

    res.setHeader('Cache-Control', 'no-store');
    const tokenData = await tokenProvider.getClientUrl({
      userId: userEmail || 'anonymous',
      groups: Array.from(targetGroups),
    });

    res.json({
      url: tokenData.url,
      expiresAt: tokenData.expiresAt,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /notifications
 * Lista notificaciones con soporte para paginación, búsqueda y filtros por curso/grupo/usuario.
 */
router.get('/', async (req, res, next) => {
  try {
    let page = 1;
    let pageSize = 20;

    if (req.query.page !== undefined) {
      const parsedPage = parseInt(req.query.page, 10);
      if (isNaN(parsedPage) || parsedPage < 1) {
        return res.status(400).json({
          error: 'El parámetro "page" debe ser un número entero mayor o igual a 1',
        });
      }
      page = parsedPage;
    }

    if (req.query.pageSize !== undefined) {
      const parsedPageSize = parseInt(req.query.pageSize, 10);
      if (isNaN(parsedPageSize) || parsedPageSize < 1 || parsedPageSize > 100) {
        return res.status(400).json({
          error: 'El parámetro "pageSize" debe ser un número entero entre 1 y 100',
        });
      }
      pageSize = parsedPageSize;
    }

    const search = req.query.search ? String(req.query.search) : '';
    const courseIds = parseIdList(req.query.courseIds);
    const groupIds = parseIdList(req.query.groupIds);
    const userEmail = extractUserEmail(req);

    const repo = getRepo(req);

    const result = await repo.list({
      page,
      pageSize,
      search,
      courseIds,
      groupIds,
      userEmail,
    });

    const totalPages = result.totalRecords === 0 ? 1 : Math.ceil(result.totalRecords / pageSize);

    // Contrato oficial con { totalRecords, page, pageSize, items }
    // y data para máxima retrocompatibilidad con el frontend actual
    res.json({
      totalRecords: result.totalRecords,
      page,
      pageSize,
      totalPages,
      unreadCount: result.unreadCount,
      items: result.items,
      data: result.items,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /notifications/read-all
 * Marca todas las notificaciones visibles para el usuario como leídas.
 */
router.patch('/read-all', async (req, res, next) => {
  try {
    const userEmail = extractUserEmail(req);
    const courseIds = parseIdList(req.query.courseIds || req.body?.courseIds);
    const groupIds = parseIdList(req.query.groupIds || req.body?.groupIds);

    const repo = getRepo(req);
    const result = await repo.markAllAsRead(userEmail, { courseIds, groupIds });

    res.json({
      updatedCount: result.updatedCount,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /notifications/:id/read
 * Marca una notificación específica como leída para el usuario solicitante.
 */
router.patch('/:id/read', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || id.trim() === '') {
      return res.status(400).json({ error: 'El ID de notificación es obligatorio' });
    }

    const userEmail = extractUserEmail(req);
    const repo = getRepo(req);
    const updated = await repo.markAsRead(id, userEmail);

    if (!updated) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
