/**
 * Repositorio en memoria para pruebas unitarias y de integración (sin Azure).
 * Soporta filtrado por courseIds, groupIds, búsqueda y lectura segmentada por usuario (email).
 */
class InMemoryNotificationRepository {
  constructor(initialItems = []) {
    this.notifications = new Map();
    // Mapa de lecturas por usuario: Map<userEmail, Set<notificationId>>
    this.userReads = new Map();

    initialItems.forEach((item) => {
      this.notifications.set(item.id, {
        ...item,
        courseId: Number(item.courseId),
        groupId: Number(item.groupId),
        createdAt: Number(item.createdAt),
        read: Boolean(item.read),
      });
    });
  }

  async init() {
    return Promise.resolve();
  }

  async create(notification) {
    if (this.notifications.has(notification.id)) {
      return { isDuplicate: true };
    }

    const item = {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      courseId: Number(notification.courseId),
      groupId: Number(notification.groupId),
      createdAt: Number(notification.createdAt),
      read: Boolean(notification.read),
      source: notification.source || 'ms-analysis',
    };

    this.notifications.set(item.id, item);
    return { isDuplicate: false, notification: item };
  }

  async findById(id) {
    const item = this.notifications.get(id);
    return item ? { ...item } : null;
  }

  /**
   * Lista notificaciones filtradas y paginadas.
   * Si se especifica userEmail, el estado `read` se calcula específicamente para ese usuario.
   */
  async list({
    page = 1,
    pageSize = 10,
    search = '',
    courseIds = [],
    groupIds = [],
    userEmail = null,
  } = {}) {
    let items = Array.from(this.notifications.values());

    // 1. Filtrado por courseIds
    const parsedCourseIds = Array.isArray(courseIds)
      ? courseIds.map(Number).filter((n) => !isNaN(n))
      : String(courseIds || '')
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

    if (parsedCourseIds.length > 0) {
      items = items.filter((n) => parsedCourseIds.includes(Number(n.courseId)));
    }

    // 2. Filtrado por groupIds
    const parsedGroupIds = Array.isArray(groupIds)
      ? groupIds.map(Number).filter((n) => !isNaN(n))
      : String(groupIds || '')
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n));

    if (parsedGroupIds.length > 0) {
      items = items.filter((n) => parsedGroupIds.includes(Number(n.groupId)));
    }

    // 3. Filtrado por término de búsqueda
    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.message.toLowerCase().includes(q) ||
          n.type.toLowerCase().includes(q)
      );
    }

    // 4. Personalización del estado de lectura por usuario
    const normalizedEmail = userEmail ? String(userEmail).trim().toLowerCase() : null;
    const userReadSet = normalizedEmail ? this.userReads.get(normalizedEmail) : null;

    items = items.map((item) => {
      const isRead = userReadSet ? userReadSet.has(item.id) : Boolean(item.read);
      return {
        ...item,
        read: isRead,
      };
    });

    // 5. Ordenar descendente por fecha de creación (más recientes primero)
    items.sort((a, b) => b.createdAt - a.createdAt);

    const totalRecords = items.length;
    const unreadCount = items.filter((n) => !n.read).length;

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safePageSize = Math.max(1, parseInt(pageSize, 10) || 10);
    const startIndex = (safePage - 1) * safePageSize;
    const pagedItems = items.slice(startIndex, startIndex + safePageSize);

    return {
      totalRecords,
      page: safePage,
      pageSize: safePageSize,
      unreadCount,
      items: pagedItems,
      data: pagedItems, // Alias para retrocompatibilidad
    };
  }

  /**
   * Marca una notificación como leída para un usuario (o globalmente si no se provee usuario).
   */
  async markAsRead(id, userEmail = null) {
    const item = this.notifications.get(id);
    if (!item) return null;

    if (userEmail) {
      const normalizedEmail = String(userEmail).trim().toLowerCase();
      if (!this.userReads.has(normalizedEmail)) {
        this.userReads.set(normalizedEmail, new Set());
      }
      this.userReads.get(normalizedEmail).add(id);
      return { ...item, read: true };
    }

    item.read = true;
    this.notifications.set(id, item);
    return { ...item };
  }

  /**
   * Marca todas las notificaciones visibles para un usuario como leídas.
   */
  async markAllAsRead(userEmail = null, { courseIds = [], groupIds = [] } = {}) {
    const { items } = await this.list({
      page: 1,
      pageSize: 1000,
      courseIds,
      groupIds,
      userEmail,
    });

    let count = 0;
    if (userEmail) {
      const normalizedEmail = String(userEmail).trim().toLowerCase();
      if (!this.userReads.has(normalizedEmail)) {
        this.userReads.set(normalizedEmail, new Set());
      }
      const readSet = this.userReads.get(normalizedEmail);
      for (const item of items) {
        if (!readSet.has(item.id)) {
          readSet.add(item.id);
          count++;
        }
      }
    } else {
      for (const item of items) {
        if (!item.read) {
          const stored = this.notifications.get(item.id);
          if (stored) {
            stored.read = true;
            this.notifications.set(item.id, stored);
            count++;
          }
        }
      }
    }

    return { updatedCount: count };
  }
}

module.exports = { InMemoryNotificationRepository };
