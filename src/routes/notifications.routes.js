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
 * GET /notifications/realtime-token
 * Obtiene la URL con token temporal de conexión directa para Azure Web PubSub.
 */
router.get('/realtime-token', async (req, res, next) => {
  try {
    const tokenProvider = req.app.locals.realtimeTokenProvider;

    if (!tokenProvider) {
      return res.status(503).json({
        error: 'Tiempo real no disponible',
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    const tokenData = await tokenProvider.getClientUrl();

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
 * Lista notificaciones con soporte para paginación y búsqueda.
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
    const repo = getRepo(req);

    const result = await repo.list({ page, pageSize, search });
    const totalPages = result.totalRecords === 0 ? 1 : Math.ceil(result.totalRecords / pageSize);

    res.json({
      page,
      pageSize,
      totalRecords: result.totalRecords,
      totalPages,
      unreadCount: result.unreadCount,
      data: result.items,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /notifications/read-all
 * Marca todas las notificaciones pendientes como leídas.
 */
router.patch('/read-all', async (req, res, next) => {
  try {
    const repo = getRepo(req);
    const result = await repo.markAllAsRead();
    res.json({
      updatedCount: result.updatedCount,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /notifications/:id/read
 * Marca una notificación específica como leída.
 */
router.patch('/:id/read', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!id || id.trim() === '') {
      return res.status(400).json({ error: 'El ID de notificación es obligatorio' });
    }

    const repo = getRepo(req);
    const updated = await repo.markAsRead(id);

    if (!updated) {
      return res.status(404).json({ error: 'Notificación no encontrada' });
    }

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
