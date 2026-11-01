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
   * Asigna userId 'professor' y sin roles adicionales (solo lectura).
   *
   * @returns {Promise<{ url: string, expiresAt: number }>}
   */
  async getClientUrl() {
    const tokenResponse = await this.serviceClient.getClientAccessToken({
      userId: 'professor',
      expirationTimeInMinutes: this.ttlMinutes,
    });

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

  async getClientUrl() {
    return {
      url: this.url,
      expiresAt: Date.now() + this.ttlMinutes * 60 * 1000,
    };
  }
}

module.exports = {
  WebPubSubTokenProvider,
  FakeRealtimeTokenProvider,
};
