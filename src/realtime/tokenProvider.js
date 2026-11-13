const { WebPubSubServiceClient } = require('@azure/web-pubsub');

/**
 * Proveedor de tokens de acceso para conexión cliente WebSocket a Azure Web PubSub.
 */
class WebPubSubTokenProvider {
  constructor({ connectionString, hubName = 'notifications', ttlMinutes = 60 }) {
    if (!connectionString) {
      throw new Error('connectionString es requerida para WebPubSubTokenProvider');
    }
    this.hubName = hubName;
    this.ttlMinutes = ttlMinutes;
    this.serviceClient = new WebPubSubServiceClient(connectionString, hubName);
  }

  /**
   * Genera una URL con token temporal de acceso para el cliente (WebSocket).
   * Permite asociar la identidad (userId/email) y grupos autorizados (curso o grupo).
   *
   * @param {{ userId?: string, groups?: string[] }} [options]
   * @returns {Promise<{ url: string, expiresAt: number }>}
   */
  async getClientUrl({ userId = 'professor', groups = [] } = {}) {
    const tokenOptions = {
      userId: userId || 'professor',
      expirationTimeInMinutes: this.ttlMinutes,
    };

    if (Array.isArray(groups) && groups.length > 0) {
      tokenOptions.groups = groups;
    }

    const tokenResponse = await this.serviceClient.getClientAccessToken(tokenOptions);
    const expiresAt = Date.now() + this.ttlMinutes * 60 * 1000;

    return {
      url: tokenResponse.url,
      expiresAt,
    };
  }
}

/**
 * Proveedor simulado para pruebas unitarias y de integración sin Azure.
 */
class FakeRealtimeTokenProvider {
  constructor({
    url = 'wss://fake-service.webpubsub.azure.com/client/hubs/notifications?access_token=mock-token',
    ttlMinutes = 60,
  } = {}) {
    this.url = url;
    this.ttlMinutes = ttlMinutes;
  }

  async getClientUrl({ userId = 'professor', groups = [] } = {}) {
    const groupParam = Array.isArray(groups) && groups.length > 0 ? '&groups=' + groups.join(',') : '';
    return {
      url: this.url + '&userId=' + encodeURIComponent(userId) + groupParam,
      expiresAt: Date.now() + this.ttlMinutes * 60 * 1000,
    };
  }
}

module.exports = {
  WebPubSubTokenProvider,
  FakeRealtimeTokenProvider,
};
