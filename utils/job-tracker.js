const fs = require('fs').promises;
const path = require('path');

class JobTracker {
  constructor() {
    this.jobsFile = path.join(__dirname, '../data/jobs.json');
    this.jobs = new Map();
    this.init();
  }

  async init() {
    try {
      // Criar diretório data se não existir
      const dataDir = path.dirname(this.jobsFile);
      await fs.mkdir(dataDir, { recursive: true });

      // Carregar jobs existentes
      try {
        const data = await fs.readFile(this.jobsFile, 'utf8');
        const jobsArray = JSON.parse(data);
        jobsArray.forEach(job => {
          this.jobs.set(job.jobId, job);
        });
        console.log(`📋 Carregados ${jobsArray.length} jobs do arquivo`);
      } catch (error) {
        // Arquivo não existe ainda, criar vazio
        await this.saveJobs();
        console.log('📋 Arquivo de jobs criado');
      }
    } catch (error) {
      console.error('❌ Erro ao inicializar JobTracker:', error);
    }
  }

  async saveJobs() {
    try {
      const jobsArray = Array.from(this.jobs.values());
      await fs.writeFile(this.jobsFile, JSON.stringify(jobsArray, null, 2));
    } catch (error) {
      console.error('❌ Erro ao salvar jobs:', error);
    }
  }

  async createJob(jobId, callbackUrl) {
    const job = {
      jobId,
      callbackUrl,
      status: 'started',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 'Iniciando scraping...',
      logs: [],
      result: null,
      error: null
    };

    this.jobs.set(jobId, job);
    await this.saveJobs(); // Aguardar salvamento
    
    console.log(`📝 Job criado: ${jobId}`);
    return job;
  }

  async updateJob(jobId, updates) {
    let job = this.jobs.get(jobId);
    if (!job) {
      console.log(`⚠️ Job não encontrado para atualização: ${jobId}`);
      // Criar job automaticamente se não existir
      job = await this.createJob(jobId, 'auto-created');
    }

    Object.assign(job, updates, {
      updatedAt: new Date().toISOString()
    });

    this.jobs.set(jobId, job);
    await this.saveJobs(); // Aguardar salvamento
    
    console.log(`📝 Job atualizado: ${jobId} - Status: ${job.status}`);
    return job;
  }

  async addLog(jobId, message, level = 'info') {
    let job = this.jobs.get(jobId);
    if (!job) {
      console.log(`⚠️ Job não encontrado para log: ${jobId}, criando automaticamente...`);
      job = await this.createJob(jobId, 'auto-created');
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      level,
      message
    };

    job.logs.push(logEntry);
    job.updatedAt = new Date().toISOString();
    
    this.jobs.set(jobId, job);
    await this.saveJobs();
    
    console.log(`📋 Log adicionado ao job ${jobId}: ${message}`);
  }

  getJob(jobId) {
    return this.jobs.get(jobId) || null;
  }

  getAllJobs() {
    return Array.from(this.jobs.values());
  }

  getJobsByStatus(status) {
    return Array.from(this.jobs.values()).filter(job => job.status === status);
  }

  async completeJob(jobId, result) {
    let job = this.jobs.get(jobId);
    if (!job) {
      console.log(`⚠️ Job não encontrado para completar: ${jobId}, criando automaticamente...`);
      job = await this.createJob(jobId, 'auto-created');
    }

    job.status = 'completed';
    job.result = result;
    job.progress = 'Scraping concluído com sucesso';
    job.updatedAt = new Date().toISOString();
    
    this.jobs.set(jobId, job);
    await this.saveJobs();
    
    console.log(`✅ Job concluído: ${jobId}`);
    return job;
  }

  async failJob(jobId, error) {
    let job = this.jobs.get(jobId);
    if (!job) {
      console.log(`⚠️ Job não encontrado para falhar: ${jobId}, criando automaticamente...`);
      job = await this.createJob(jobId, 'auto-created');
    }

    job.status = 'failed';
    job.error = error.message || error;
    job.progress = 'Erro durante execução';
    job.updatedAt = new Date().toISOString();
    
    this.jobs.set(jobId, job);
    await this.saveJobs();
    
    console.log(`❌ Job falhado: ${jobId} - Erro: ${job.error}`);
    return job;
  }

  // Limpar jobs antigos (mais de 7 dias)
  async cleanOldJobs() {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let removedCount = 0;
    for (const [jobId, job] of this.jobs.entries()) {
      const jobDate = new Date(job.createdAt);
      if (jobDate < sevenDaysAgo && (job.status === 'completed' || job.status === 'failed')) {
        this.jobs.delete(jobId);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      await this.saveJobs();
      console.log(`🧹 Removidos ${removedCount} jobs antigos`);
    }

    return removedCount;
  }
}

// Singleton instance
const jobTracker = new JobTracker();

module.exports = jobTracker;