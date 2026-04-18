const express = require('express');
const { v4: uuidv4 } = require('uuid');
const jobTracker = require('../utils/job-tracker');
const callbackService = require('../utils/callback');
const scrapingWorker = require('../workers/scraping-worker');

const router = express.Router();

// POST /api/scraping/start - Iniciar scraping
router.post('/start', async (req, res) => {
  try {
    const { callbackUrl } = req.body;

    // Validar callback URL
    if (!callbackUrl) {
      return res.status(400).json({
        success: false,
        error: 'callbackUrl é obrigatório'
      });
    }

    const urlValidation = callbackService.validateCallbackUrl(callbackUrl);
    if (!urlValidation.valid) {
      return res.status(400).json({
        success: false,
        error: urlValidation.error
      });
    }

    // Gerar ID único para o job
    const jobId = uuidv4();

    // Criar job no tracker (apenas URL; status/progresso são gerenciados pelo tracker/worker)
    await jobTracker.createJob(jobId, callbackUrl);

    // Responder imediatamente com 200 OK
    res.status(200).json({
      success: true,
      jobId,
      message: 'Scraping iniciado com sucesso',
      status: 'pending',
      timestamp: new Date().toISOString()
    });

    // Iniciar execução de forma assíncrona com pequeno delay para garantir que o job foi criado
    setTimeout(async () => {
      const host = (req.headers && req.headers.host) ? String(req.headers.host) : '';
      const isLocalHost = host.includes('localhost') || host.startsWith('127.0.0.1');
      const mode = (req.query && req.query.mode) ? String(req.query.mode).toLowerCase() : '';
      const forceWorker = mode === 'worker';
      const useDirectExec = !forceWorker && (process.env.SCRAPING_DIRECT_EXECUTION === 'true' || isLocalHost || (process.env.NODE_ENV && process.env.NODE_ENV !== 'production'));

      if (useDirectExec) {
        // Execução direta (sem worker) para ambiente de desenvolvimento
        try {
          console.log(`🚀 Execução direta iniciada para job: ${jobId}`);
          await jobTracker.updateJob(jobId, {
            status: 'running',
            progress: 'Execução direta iniciada...'
          });

          await jobTracker.addLog(jobId, 'Executando sem worker (dev)');

          const { main } = require('../prisma-to-supabase');
          const { getBoxesStats } = require('../supabase-client');

          const startTime = Date.now();
          await main();
          const endTime = Date.now();
          const processingTime = Math.round((endTime - startTime) / 1000);

          const statsResult = await getBoxesStats();
          const totalBoxes = statsResult?.success ? (statsResult.stats?.total || 0) : 0;

          const scrapingResult = {
            summary: 'Scraping concluído com sucesso (execução direta)',
            totalBoxes,
            unitsProcessed: 0,
            successfulUnits: 0,
            failedUnits: [],
            processingTime,
            logs: [],
            extractedAt: new Date().toISOString()
          };

          await jobTracker.completeJob(jobId, scrapingResult);
          await jobTracker.addLog(jobId, `Scraping concluído em ${processingTime} segundos (execução direta)`);

          try {
            await callbackService.sendSuccessCallback(callbackUrl, jobId, scrapingResult);
          } catch (callbackError) {
            console.error('⚠️ Erro ao enviar callback de sucesso (execução direta):', callbackError);
          }

          console.log(`✅ Execução direta concluída para job: ${jobId}`);

        } catch (error) {
          console.error(`❌ Erro na execução direta para job ${jobId}:`, error);
          await jobTracker.failJob(jobId, error);
          await jobTracker.addLog(jobId, `Erro: ${error.message}`, 'error');
          try {
            await callbackService.sendErrorCallback(callbackUrl, jobId, error);
          } catch (callbackError) {
            console.error(`❌ Erro ao enviar callback de erro (execução direta):`, callbackError);
          }
        }
      } else {
        // Execução via worker (produção)
        try {
          console.log(`🚀 Iniciando worker para job: ${jobId}`);
          await scrapingWorker.startScraping(jobId, callbackUrl);
          console.log(`✅ Worker iniciado para job: ${jobId}`);
        } catch (error) {
          console.error(`❌ Erro ao iniciar worker para job ${jobId}:`, error);
          await jobTracker.failJob(jobId, error);
          try {
            await callbackService.sendErrorCallback(callbackUrl, jobId, error);
          } catch (callbackError) {
            console.error(`❌ Erro ao enviar callback de erro:`, callbackError);
          }
        }
      }
    }, 100); // 100ms de delay para garantir que o job foi salvo

  } catch (error) {
    console.error('❌ Erro ao processar requisição de start:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/scraping/status/:jobId - Verificar status do job
router.get('/status/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'jobId é obrigatório'
      });
    }

    const job = jobTracker.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job não encontrado'
      });
    }

    // Remover informações sensíveis
    const { callbackUrl, ...safeJob } = job;

    res.json({
      success: true,
      job: safeJob
    });

  } catch (error) {
    console.error('❌ Erro ao verificar status:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/scraping/jobs - Listar todos os jobs (para debug/admin)
router.get('/jobs', (req, res) => {
  try {
    const jobs = jobTracker.getAllJobs();
    
    // Remover informações sensíveis
    const safeJobs = jobs.map(job => {
      const { callbackUrl, ...safeJob } = job;
      return safeJob;
    });

    res.json({
      success: true,
      jobs: safeJobs,
      total: safeJobs.length
    });

  } catch (error) {
    console.error('❌ Erro ao listar jobs:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// DELETE /api/scraping/job/:jobId - Cancelar job (se ainda estiver rodando)
router.delete('/job/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        error: 'jobId é obrigatório'
      });
    }

    const job = jobTracker.getJob(jobId);

    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job não encontrado'
      });
    }

    if (job.status === 'completed' || job.status === 'failed') {
      return res.status(400).json({
        success: false,
        error: 'Job já foi finalizado'
      });
    }

    // Tentar terminar o worker
    const terminated = scrapingWorker.terminateWorker(jobId);
    
    if (terminated) {
      jobTracker.failJob(jobId, new Error('Job cancelado pelo usuário'));
      jobTracker.addLog(jobId, 'Job cancelado pelo usuário', 'info');
    }

    res.json({
      success: true,
      message: terminated ? 'Job cancelado com sucesso' : 'Job não estava rodando',
      jobId
    });

  } catch (error) {
    console.error('❌ Erro ao cancelar job:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/scraping/active - Listar workers ativos
router.get('/active', (req, res) => {
  try {
    const activeWorkers = scrapingWorker.getActiveWorkers();
    
    res.json({
      success: true,
      activeWorkers,
      count: activeWorkers.length
    });

  } catch (error) {
    console.error('❌ Erro ao listar workers ativos:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

module.exports = router;
