const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const scrapingRoutes = require('../routes/scraping');

function createApp({ basePath = '/api/scraping' } = {}) {
  const app = express();

  // Estados de readiness e shutdown para health checks estáveis
  // - app.locals.ready: API pronta para receber tráfego
  // - app.locals.shuttingDown: processo entrando em encerramento
  app.locals.ready = false;
  app.locals.shuttingDown = false;

  // Segurança
  app.use(helmet());

  // CORS amplo (ajuste conforme necessário em produção)
  app.use(cors());

  // Logs
  app.use(morgan('combined'));

  // Body parsers
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health (liveness/readiness)
  app.get('/health', (req, res) => {
    const shuttingDown = Boolean(app.locals.shuttingDown);
    const ready = Boolean(app.locals.ready);

    // Quando em shutdown, responder 503 para permitir drenagem pelo orquestrador
    const statusCode = shuttingDown ? 503 : 200;

    res.status(statusCode).json({
      status: shuttingDown ? 'SHUTTING_DOWN' : 'OK',
      ready,
      shuttingDown,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development'
    });
  });

  // Rotas de scraping com base configurável
  app.use(basePath, scrapingRoutes);

  // 404
  app.use((req, res) => {
    res.status(404).json({
      error: 'Endpoint não encontrado',
      path: req.originalUrl,
      method: req.method
    });
  });

  // Error handler
  app.use((err, req, res, next) => {
    console.error('Erro na API:', err);
    res.status(err.status || 500).json({
      error: 'Erro interno do servidor',
      message: process.env.NODE_ENV === 'development' ? err.message : 'Algo deu errado',
      timestamp: new Date().toISOString()
    });
  });

  return app;
}

module.exports = { createApp };
