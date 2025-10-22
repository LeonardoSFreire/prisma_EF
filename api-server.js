const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

const scrapingRoutes = require('./routes/scraping');

const app = express();
const PORT = process.env.API_PORT || 3000;

// Middleware de segurança
app.use(helmet());

// CORS - permitir requisições de qualquer origem
app.use(cors());

// Logging de requisições
app.use(morgan('combined'));

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

// Parse URL-encoded bodies
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Rotas da API
app.use('/api/scraping', scrapingRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint não encontrado',
    path: req.originalUrl,
    method: req.method
  });
});

// Error handler global
app.use((err, req, res, next) => {
  console.error('Erro na API:', err);
  
  res.status(err.status || 500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Algo deu errado',
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Recebido SIGTERM, encerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor encerrado graciosamente');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Recebido SIGINT, encerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor encerrado graciosamente');
    process.exit(0);
  });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 API Server rodando na porta ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;