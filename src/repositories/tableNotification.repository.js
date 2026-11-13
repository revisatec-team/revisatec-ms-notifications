const { TableClient } = require('@azure/data-tables');
const { logger } = require('../utils/logger');

const PARTITION_KEY = 'professor';
const READS_TABLE_NAME = 'notificacionesleidas';

/**
 * Normaliza claves de partición para Table Storage (evita caracteres ilegales).
 */
function sanitizePartitionKey(key) {
  return String(key || '')
    .trim()
    .toLowerCase()
    .replace(/[/\\#?]/g, '_');
}

/**
 * Repositorio de Notificaciones persistido en Azure Table Storage.
 * Soporta filtrado por cursos, grupos y almacenamiento individual de lecturas por usuario.
 */
class TableNotificationRepository {
  constructor({ connectionString, tableName = 'notificaciones', readsTableName = READS_TABLE_NAME }) {
    if (!connectionString) {
      throw new Error('connectionString es obligatoria para TableNotificationRepository');
    }
    this.tableName = tableName;
    this.readsTableName = readsTableName;
    this.tableClient = TableClient.fromConnectionString(connectionString, tableName);
    this.readsTableClient = TableClient.fromConnectionString(connectionString, readsTableName);
  }

  /**
   * Crea las tablas en Azure Table Storage si no existen.
   */
  async init() {
    try {
      await this.tableClient.createTable();
      logger.info('Tabla principal de notificaciones inicializada correctamente', {
        tableName: this.tableName,
      });
    } catch (error) {
      if (error.statusCode === 409 || error.code === 'TableAlreadyExists') {
        logger.info('Tabla principal ya existente, reutilizando', {
          tableName: this.tableName,
        });
      } else {
        logger.error('Error al inicializar la tabla principal de Table Storage', {
          tableName: this.tableName,
          errorMessage: error.message,
        });
        throw error;
      }
    }

    try {
      await this.readsTableClient.createTable();
      logger.info('Tabla de lecturas por usuario inicializada correctamente', {
        readsTableName: this.readsTableName,
      });
    } catch (error) {
      if (error.statusCode === 409 || error.code === 'TableAlreadyExists') {
        logger.info('Tabla de lecturas por usuario ya existente, reutilizando', {
          readsTableName: this.readsTableName,
        });
      } else {
        logger.warn('Error no bloqueante al inicializar tabla de lecturas', {
          readsTableName: this.readsTableName,
          errorMessage: error.message,
        });
      }
    }
  }

  /**
   * Crea una notificación asegurando idempotencia por su ID único.
   */
  async create(notification) {
    const entity = {
      partitionKey: PARTITION_KEY,
      rowKey: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      courseId: Number(notification.courseId),
      groupId: Number(notification.groupId),
      createdAt: Number(notification.createdAt),
      read: Boolean(notification.read),
      source: notification.source || 'ms-analysis',
    };

    try {
      await this.tableClient.createEntity(entity);
      return { isDuplicate: false, notification };
    } catch (error) {
      if (error.statusCode === 409 || error.code === 'EntityAlreadyExists') {
        logger.warn('Evento duplicado detectado en Table Storage, no se sobrescribe', {
          eventId: notification.id,
        });
        return { isDuplicate: true };
      }
      throw error;
    }
  }

  /**
   * Busca una notificación por su ID.
   */
  async findById(id) {
    try {
      const entity = await this.tableClient.getEntity(PARTITION_KEY, id);
      return this._mapEntity(entity);
    } catch (error) {
      if (error.statusCode === 404 || error.code === 'ResourceNotFound') {
        return null;
      }
      throw error;
    }
  }

  /**
   * Lista notificaciones paginadas y filtradas por curso, grupo y usuario.
   */
  async list({
    page = 1,
    pageSize = 10,
    search = '',
    courseIds = [],
    groupIds = [],
    userEmail = null,
  } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safePageSize = Math.max(1, parseInt(pageSize, 10) || 10);

    const parsedCourseIds = Array.isArray(courseIds)
      ? courseIds.map(Number).filter((n) => !isNaN(n))
      : String(courseIds || '')
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

    const parsedGroupIds = Array.isArray(groupIds)
      ? groupIds.map(Number).filter((n) => !isNaN(n))
      : String(groupIds || '')
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

    // Consultar lecturas registradas para este usuario específico
    const normalizedEmail = userEmail ? sanitizePartitionKey(userEmail) : null;
    const userReadSet = new Set();

    if (normalizedEmail) {
      try {
        const readsIterator = this.readsTableClient.listEntities({
          queryOptions: {
            filter: "PartitionKey eq '" + normalizedEmail + "'",
          },
        });
        for await (const readEntity of readsIterator) {
          userReadSet.add(readEntity.rowKey);
        }
      } catch (err) {
        logger.warn('No se pudieron leer registros de notificacionesleidas', {
          userEmail: normalizedEmail,
          errorMessage: err.message,
        });
      }
    }

    const entitiesIterator = this.tableClient.listEntities({
      queryOptions: {
        filter: "PartitionKey eq '" + PARTITION_KEY + "'",
      },
    });

    const allItems = [];
    let unreadCount = 0;

    for await (const entity of entitiesIterator) {
      const item = this._mapEntity(entity);

      // Filtro por curso
      if (parsedCourseIds.length > 0 && !parsedCourseIds.includes(Number(item.courseId))) {
        continue;
      }

      // Filtro por grupo
      if (parsedGroupIds.length > 0 && !parsedGroupIds.includes(Number(item.groupId))) {
        continue;
      }

      // Filtro por texto de búsqueda
      if (search && search.trim() !== '') {
        const q = search.trim().toLowerCase();
        if (
          !item.title.toLowerCase().includes(q) &&
          !item.message.toLowerCase().includes(q) &&
          !item.type.toLowerCase().includes(q)
        ) {
          continue;
        }
      }

      // Estado de lectura personalizado
      const isRead = normalizedEmail
        ? userReadSet.has(item.id) || item.read
        : item.read;

      item.read = isRead;
      if (!isRead) {
        unreadCount++;
      }

      allItems.push(item);
    }

    // Ordenar descendente por createdAt (más recientes primero)
    allItems.sort((a, b) => b.createdAt - a.createdAt);

    const totalRecords = allItems.length;
    const startIndex = (safePage - 1) * safePageSize;
    const pagedItems = allItems.slice(startIndex, startIndex + safePageSize);

    return {
      totalRecords,
      page: safePage,
      pageSize: safePageSize,
      unreadCount,
      items: pagedItems,
      data: pagedItems, // Compatibilidad hacia atrás
    };
  }

  /**
   * Marca una notificación como leída (registrada por usuario si se provee email).
   */
  async markAsRead(id, userEmail = null) {
    const existing = await this.findById(id);
    if (!existing) return null;

    if (userEmail) {
      const partitionKey = sanitizePartitionKey(userEmail);
      try {
        await this.readsTableClient.upsertEntity(
          {
            partitionKey,
            rowKey: id,
            readAt: Date.now(),
          },
          'Replace'
        );
      } catch (err) {
        logger.error('Error al guardar lectura por usuario en Table Storage', {
          userEmail,
          id,
          errorMessage: err.message,
        });
      }
      return { ...existing, read: true };
    }

    if (existing.read) {
      return existing;
    }

    const updateEntity = {
      partitionKey: PARTITION_KEY,
      rowKey: id,
      read: true,
    };

    await this.tableClient.updateEntity(updateEntity, 'Merge');
    return { ...existing, read: true };
  }

  /**
   * Marca todas las notificaciones visibles para un usuario como leídas.
   */
  async markAllAsRead(userEmail = null, { courseIds = [], groupIds = [] } = {}) {
    if (userEmail) {
      const { items } = await this.list({
        page: 1,
        pageSize: 1000,
        courseIds,
        groupIds,
        userEmail,
      });

      const unreadItems = items.filter((item) => !item.read);
      const partitionKey = sanitizePartitionKey(userEmail);

      let updatedCount = 0;
      for (const item of unreadItems) {
        try {
          await this.readsTableClient.upsertEntity(
            {
              partitionKey,
              rowKey: item.id,
              readAt: Date.now(),
            },
            'Replace'
          );
          updatedCount++;
        } catch (err) {
          logger.warn('Error al marcar lectura masiva en tabla de lecturas', {
            id: item.id,
            errorMessage: err.message,
          });
        }
      }
      return { updatedCount };
    }

    const entitiesIterator = this.tableClient.listEntities({
      queryOptions: {
        filter: "PartitionKey eq '" + PARTITION_KEY + "' and read eq false",
      },
    });

    let updatedCount = 0;
    for await (const entity of entitiesIterator) {
      await this.tableClient.updateEntity(
        {
          partitionKey: PARTITION_KEY,
          rowKey: entity.rowKey,
          read: true,
        },
        'Merge'
      );
      updatedCount++;
    }

    return { updatedCount };
  }

  _mapEntity(entity) {
    return {
      id: entity.rowKey,
      type: entity.type,
      title: entity.title,
      message: entity.message,
      courseId: Number(entity.courseId),
      groupId: Number(entity.groupId),
      createdAt: Number(entity.createdAt),
      read: Boolean(entity.read),
      source: entity.source || 'ms-analysis',
    };
  }
}

module.exports = { TableNotificationRepository };
