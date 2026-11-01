const { TableClient } = require('@azure/data-tables');
const { logger } = require('../utils/logger');

const PARTITION_KEY = 'professor';

/**
 * Repositorio de Notificaciones persistido en Azure Table Storage.
 */
class TableNotificationRepository {
  constructor({ connectionString, tableName = 'notificaciones' }) {
    if (!connectionString) {
      throw new Error('connectionString es obligatoria para TableNotificationRepository');
    }
    this.tableName = tableName;
    this.tableClient = TableClient.fromConnectionString(connectionString, tableName);
  }

  /**
   * Crea la tabla en Azure Table Storage si no existe.
   */
  async init() {
    try {
      await this.tableClient.createTable();
      logger.info('Tabla de Azure Table Storage inicializada correctamente', {
        tableName: this.tableName,
      });
    } catch (error) {
      // Código 409 o TableAlreadyExists indica que la tabla ya existía
      if (error.statusCode === 409 || error.code === 'TableAlreadyExists') {
        logger.info('Tabla de Azure Table Storage ya existente, reutilizando', {
          tableName: this.tableName,
        });
      } else {
        logger.error('Error al inicializar la tabla de Azure Table Storage', {
          tableName: this.tableName,
          errorMessage: error.message,
        });
        throw error;
      }
    }
  }

  /**
   * Crea una notificación asegurando idempotencia.
   */
  async create(notification) {
    const entity = {
      partitionKey: PARTITION_KEY,
      rowKey: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      courseId: notification.courseId,
      groupId: notification.groupId,
      createdAt: Number(notification.createdAt),
      read: Boolean(notification.read),
      source: notification.source || 'ms-analysis',
    };

    try {
      await this.tableClient.createEntity(entity);
      return { isDuplicate: false, notification };
    } catch (error) {
      // 409 o EntityAlreadyExists significa que ya se procesó previamente
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
   * Lista notificaciones paginadas y filtradas.
   */
  async list({ page = 1, pageSize = 10, search = '' } = {}) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safePageSize = Math.max(1, parseInt(pageSize, 10) || 10);

    const entitiesIterator = this.tableClient.listEntities({
      queryOptions: {
        filter: `PartitionKey eq '${PARTITION_KEY}'`,
      },
    });

    const allItems = [];
    let unreadCount = 0;

    for await (const entity of entitiesIterator) {
      const item = this._mapEntity(entity);
      if (!item.read) unreadCount++;

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
    };
  }

  /**
   * Marca una notificación como leída.
   */
  async markAsRead(id) {
    const existing = await this.findById(id);
    if (!existing) return null;

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
   * Marca todas las notificaciones de la partición como leídas.
   */
  async markAllAsRead() {
    const entitiesIterator = this.tableClient.listEntities({
      queryOptions: {
        filter: `PartitionKey eq '${PARTITION_KEY}' and read eq false`,
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
