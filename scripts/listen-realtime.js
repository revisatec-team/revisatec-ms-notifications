/**
 * Script de prueba para escuchar eventos en vivo desde Azure Web PubSub.
 * Requiere Node 22+ (utiliza la implementación nativa global de WebSocket).
 */
async function main() {
  const port = process.env.PORT || 3000;
  const tokenEndpoint = `http://localhost:${port}/notifications/realtime-token`;

  console.log(`[Inicio] Solicitando token de conexión a ${tokenEndpoint}...`);

  let res;
  try {
    res = await fetch(tokenEndpoint);
  } catch (err) {
    console.error(`[Error] No se pudo conectar a MS3 en el puerto ${port}. ¿Está el servidor corriendo con "npm run dev"?`);
    console.error(`Detalle: ${err.message}`);
    process.exit(1);
  }

  if (res.status === 503) {
    console.error('[Error HTTP 503] Tiempo real no disponible. Asegúrate de configurar REALTIME_CONNECTION_STRING en el archivo .env de MS3.');
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`[Error HTTP ${res.status}] No se pudo obtener el token de conexión.`);
    process.exit(1);
  }

  const data = await res.json();
  const { url, expiresAt } = data;

  if (!url) {
    console.error('[Error] La respuesta del servidor no incluyó una URL de WebSocket válida.');
    process.exit(1);
  }

  // Ocultar token por seguridad en la salida de consola
  const maskedUrl = url.replace(/access_token=[^&]+/, 'access_token=***OCULTO***');
  console.log(`[Token Obtenido] Conectando a Web PubSub...`);
  console.log(`Endpoint: ${maskedUrl}`);
  console.log(`Expira: ${new Date(expiresAt).toLocaleTimeString()}`);

  if (typeof WebSocket === 'undefined') {
    console.error('[Error] WebSocket global no disponible en este entorno de Node. Se requiere Node 22 o superior.');
    process.exit(1);
  }

  const ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    console.log('\n======================================================');
    console.log('  CONEXIÓN EN VIVO ESTABLECIDA CON AZURE WEB PUBSUB   ');
    console.log('  Esperando eventos emitidos por MS3...               ');
    console.log('  (Envía un mensaje con: npm run send:test)           ');
    console.log('  Presiona Ctrl + C para detener la escucha.          ');
    console.log('======================================================\n');
  });

  ws.addEventListener('message', (event) => {
    try {
      const parsed = JSON.parse(event.data);
      console.log('------------------------------------------------------');
      console.log(`[Evento Recibido] ${new Date().toLocaleTimeString()}`);
      console.log(`Tipo de Evento : ${parsed.event}`);
      if (parsed.data) {
        console.log(`ID Notificación: ${parsed.data.id}`);
        console.log(`Tipo           : ${parsed.data.type}`);
        console.log(`Título         : ${parsed.data.title}`);
        console.log(`Mensaje        : ${parsed.data.message}`);
        console.log(`Grupo ID       : ${parsed.data.groupId}`);
        console.log(`Creado (ms)    : ${parsed.data.createdAt}`);
      }
      console.log('------------------------------------------------------\n');
    } catch {
      console.log('[Mensaje Crudo]:', event.data);
    }
  });

  ws.addEventListener('error', (err) => {
    console.error('[WebSocket Error]:', err.message || err);
  });

  ws.addEventListener('close', (event) => {
    console.log(`[Desconectado] Código: ${event.code}, Razón: ${event.reason || 'Sin razón especificada'}`);
    process.exit(0);
  });

  process.on('SIGINT', () => {
    console.log('\n[Cerrando] Desconectando cliente WebSocket...');
    ws.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    ws.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[Error no controlado]:', err);
  process.exit(1);
});
