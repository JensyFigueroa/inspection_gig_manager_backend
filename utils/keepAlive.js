const https = require('https');
const http = require('http');

const keepAlive = (backendUrl) => {
  if (!backendUrl) {
    console.log('[KeepAlive] No BACKEND_URL configured, skipping...');
    return;
  }

  const isHttps = backendUrl.startsWith('https');
  const client = isHttps ? https : http;

  const ping = () => {
    client.get(`${backendUrl}/api/health`, (res) => {
      console.log(`[KeepAlive] ${new Date().toISOString()} - Ping OK, Status: ${res.statusCode}`);
    }).on('error', (err) => {
      console.log(`[KeepAlive] ${new Date().toISOString()} - Error: ${err.message}`);
    });
  };

  // Ping cada 14 minutos (Render duerme a los 15 min)
  setInterval(ping, 14 * 60 * 1000);
  
  // Primer ping después de 1 minuto
  setTimeout(ping, 60 * 1000);
  
  console.log('[KeepAlive] Started - Pinging every 14 minutes');
};

module.exports = keepAlive;
