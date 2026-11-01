/**
 * Repositorio en memoria para pruebas unitarias y de integración (sin Azure).
 */
class InMemoryNotificationRepository {
  constructor(initialItems = []) {
    this.notifications = new Map();
    initialItems.forEach((item) => {
      this.notifications.set(item.id, { ...item });
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
      courseId: notification.courseId,
      groupId: notification.groupId,
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

  async list({ page = 1, pageSize = 10, search = '' } = {}) {
    let items = Array.from(this.notifications.values());

    if (search && search.trim() !== '') {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (n) =>
          n.title.toLowerCase().includes(q) ||
          n.message.toLowerCase().includes(q) ||
          n.type.toLowerCase().includes(q)
      );
    }

    // Ordenar descendente por createdAt
    items.sort((a, b) => b.createdAt - a.createdAt);

    const totalRecords = items.length;
    const unreadCount = Array.from(this.notifications.values()).filter((n) => !n.read).length;

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
    };
  }

  async markAsRead(id) {
    const item = this.notifications.get(id);
    if (!item) return null;

    item.read = true;
    this.notifications.set(id, item);
    return { ...item };
  }

  async markAllAsRead() {
    let count = 0;
    for (const [id, item] of this.notifications.entries()) {
      if (!item.read) {
        item.read = true;
        this.notifications.set(id, item);
        count++;
      }
    }
    return { updatedCount: count };
  }
}

module.exports = { InMemoryNotificationRepository };
