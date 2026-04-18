const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

if (isMainThread) {
  // Código principal - cria e gerencia workers
  class ScrapingWorkerManager {
    constructor() {
      this.activeWorkers = new Map();
    }

    async startScraping(jobId, callbackUrl) {
      return new Promise((resolve, reject) => {
        // Criar worker
        const worker = new Worker(__filename, {
          workerData: { jobId, callbackUrl }
        });

        this.activeWorkers.set(jobId, worker);

        // Escutar mensagens do worker
        worker.on('message', (message) => {
          console.log(`📨 Mensagem do worker ${jobId}:`, message);
          
          if (message.type === 'started') {
            resolve({ success: true, message: 'Scraping iniciado' });
          }
        });

        // Escutar erros do worker
        worker.on('error', (error) => {
          console.error(`❌ Erro no worker ${jobId}:`, error);
          this.activeWorkers.delete(jobId);
          reject(error);
        });

        // Escutar quando worker termina
        worker.on('exit', (code) => {
          console.log(`🏁 Worker ${jobId} terminou com código: ${code}`);
          this.activeWorkers.delete(jobId);
        });

        // Timeout de segurança (15 minutos - baseado no tempo real de execução)
        setTimeout(() => {
          if (this.activeWorkers.has(jobId)) {
            console.log(`⏰ Timeout do worker ${jobId}, terminando...`);
            worker.terminate();
            this.activeWorkers.delete(jobId);
          }
        }, 15 * 60 * 1000); // 15 minutos
      });
    }

    terminateWorker(jobId) {
      const worker = this.activeWorkers.get(jobId);
      if (worker) {
        worker.terminate();
        this.activeWorkers.delete(jobId);
        return true;
      }
      return false;
    }

    getActiveWorkers() {
      return Array.from(this.activeWorkers.keys());
    }

    // Encerrar todos os workers ativos (usado durante shutdown)
    shutdownAll() {
      for (const [jobId, worker] of this.activeWorkers.entries()) {
        try {
          console.log(`🛑 Encerrando worker ativo: ${jobId}`);
          worker.terminate();
        } catch (e) {
          console.log(`⚠️ Falha ao encerrar worker ${jobId}:`, e?.message || e);
        }
        this.activeWorkers.delete(jobId);
      }
    }
  }

  module.exports = new ScrapingWorkerManager();

} else {
  // Código do worker - executa o scraping
  const jobTracker = require('../utils/job-tracker');
  const callbackService = require('../utils/callback');

  async function runScraping() {
    const { jobId, callbackUrl } = workerData;
    
    try {
      console.log(`🚀 Worker iniciado para job: ${jobId}`);
      
      // Notificar que o worker foi iniciado
      parentPort.postMessage({ type: 'started', jobId });
      
      console.log(`📝 DEBUG: Tentando atualizar job ${jobId} para status 'running'`);
      
      // Atualizar status do job
      await jobTracker.updateJob(jobId, { 
        status: 'running',
        progress: 'Worker iniciado, carregando script de scraping...'
      });
      
      console.log(`✅ DEBUG: Job ${jobId} atualizado para 'running' com sucesso`);

      console.log(`📦 DEBUG: Tentando importar script '../prisma-to-supabase'`);
      
      // Importar e executar o script principal de scraping
      const scrapingScript = require('../prisma-to-supabase');
      
      console.log(`✅ DEBUG: Script importado com sucesso`);
      console.log(`📝 DEBUG: Adicionando log ao job ${jobId}`);
      
      await jobTracker.addLog(jobId, 'Iniciando processo de scraping');
      
      console.log(`📝 DEBUG: Atualizando progresso do job ${jobId}`);
      
      await jobTracker.updateJob(jobId, { 
        progress: 'Executando scraping das unidades...'
      });
      
      console.log(`🚀 DEBUG: Iniciando execução do script principal`);
      console.log(`📋 DEBUG: Verificando se scrapingScript.main existe:`, typeof scrapingScript.main);

      // Executar o scraping
      const startTime = Date.now();
      const result = await scrapingScript.main();
      const endTime = Date.now();
      
      const processingTime = Math.round((endTime - startTime) / 1000); // em segundos
      
      // Preparar resultado baseado no que o script retorna
      const scrapingResult = {
        summary: 'Scraping concluído com sucesso',
        totalBoxes: result?.totalBoxes || 0,
        unitsProcessed: result?.unitsProcessed || 0,
        successfulUnits: result?.successfulUnits || 0,
        failedUnits: result?.failedUnits || [],
        // Detalhes individuais das unidades para callback/observabilidade
        units: Array.isArray(result?.unitDetails) ? result.unitDetails.map(u => ({
          code: u.code,
          city: u.city,
          boxesCount: u.boxesCount,
          pagesProcessed: u.pagesProcessed,
          processingTime: u.processingTime,
          supabaseStatus: u.supabaseStatus,
          status: u.status,
          error: u.error || null
        })) : [],
        processingTime: processingTime,
        logs: result?.logs || [],
        extractedAt: new Date().toISOString()
      };

      // Atualizar job como concluído
      await jobTracker.completeJob(jobId, scrapingResult);
      await jobTracker.addLog(jobId, `Scraping concluído em ${processingTime} segundos`);

      // Enviar callback de sucesso
      await callbackService.sendSuccessCallback(callbackUrl, jobId, scrapingResult);
      
      console.log(`✅ Scraping concluído para job: ${jobId}`);
      
    } catch (error) {
      console.error(`❌ Erro no scraping do job ${jobId}:`, error);
      
      // Atualizar job como falhado
      await jobTracker.failJob(jobId, error);
      await jobTracker.addLog(jobId, `Erro: ${error.message}`, 'error');

      // Enviar callback de erro
      const job = jobTracker.getJob(jobId);
      await callbackService.sendErrorCallback(callbackUrl, jobId, error, job?.logs || []);
    }
  }

  // Executar o scraping
  runScraping().catch(error => {
    console.error('❌ Erro fatal no worker:', error);
    process.exit(1);
  });
}
