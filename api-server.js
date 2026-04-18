require('dotenv').config();
const { createApp } = require('./server/app');
const scrapingWorker = require('./workers/scraping-worker');
const PORT = process.env.API_PORT || process.env.PORT || 3000;

// Cria app com basePath padrão '/api/scraping' para ambiente local
const app = createApp({ basePath: '/api/scraping' });

// Graceful shutdown
function beginShutdown(signal) {
  try {
    console.log(`🛑 Recebido ${signal}, iniciando shutdown gracioso...`);
    // Sinalizar para health que estamos encerrando
    if (app && app.locals) {
      app.locals.shuttingDown = true;
    }

    // Encerrar workers de scraping para evitar timeouts em execução
    try {
      scrapingWorker.shutdownAll?.();
    } catch (e) {
      console.log('⚠️ Falha ao encerrar workers:', e?.message || e);
    }

    // Parar de aceitar novas conexões e encerrar quando terminar
    server.close(() => {
      console.log('✅ Servidor encerrado graciosamente');
      process.exit(0);
    });

    // Fallback de segurança: forçar saída após 10s se algo travar
    setTimeout(() => {
      console.log('⏳ Shutdown forçado após 10s');
      process.exit(0);
    }, 10_000);
  } catch (err) {
    console.error('❌ Erro durante shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => beginShutdown('SIGTERM'));
process.on('SIGINT', () => beginShutdown('SIGINT'));

const server = app.listen(PORT, () => {
  console.log(`🚀 API Server rodando na porta ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
  // Sinalizar readiness para health
  if (app && app.locals) {
    app.locals.ready = true;
  }
});

module.exports = app;
