const axios = require('axios');

class CallbackService {
  constructor() {
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 segundos
  }

  async sendCallback(callbackUrl, payload, retryCount = 0) {
    try {
      console.log(`📞 Enviando callback para: ${callbackUrl}`);
      console.log(`📦 Payload:`, JSON.stringify(payload, null, 2));

      const response = await axios.post(callbackUrl, payload, {
        timeout: 30000, // 30 segundos
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'PrismaBox-Scraper-API/1.0'
        }
      });

      console.log(`✅ Callback enviado com sucesso - Status: ${response.status}`);
      return {
        success: true,
        status: response.status,
        data: response.data
      };

    } catch (error) {
      console.error(`❌ Erro ao enviar callback (tentativa ${retryCount + 1}/${this.maxRetries + 1}):`, error.message);

      // Se ainda temos tentativas restantes, tentar novamente
      if (retryCount < this.maxRetries) {
        console.log(`🔄 Tentando novamente em ${this.retryDelay / 1000} segundos...`);
        
        await this.delay(this.retryDelay);
        return this.sendCallback(callbackUrl, payload, retryCount + 1);
      }

      // Todas as tentativas falharam
      console.error(`💥 Falha definitiva no callback após ${this.maxRetries + 1} tentativas`);
      return {
        success: false,
        error: error.message,
        attempts: retryCount + 1
      };
    }
  }

  async sendSuccessCallback(callbackUrl, jobId, result) {
    const payload = {
      jobId,
      status: 'success',
      timestamp: new Date().toISOString(),
      data: {
        summary: result.summary,
        totalBoxes: result.totalBoxes,
        unitsProcessed: result.unitsProcessed,
        processingTime: result.processingTime,
        logs: result.logs
      }
    };

    return this.sendCallback(callbackUrl, payload);
  }

  async sendErrorCallback(callbackUrl, jobId, error, logs = []) {
    const payload = {
      jobId,
      status: 'error',
      timestamp: new Date().toISOString(),
      error: {
        message: error.message || error,
        type: error.name || 'ScrapingError',
        logs: logs
      }
    };

    return this.sendCallback(callbackUrl, payload);
  }

  async sendProgressCallback(callbackUrl, jobId, progress) {
    const payload = {
      jobId,
      status: 'progress',
      timestamp: new Date().toISOString(),
      progress: {
        message: progress.message,
        percentage: progress.percentage,
        currentUnit: progress.currentUnit,
        totalUnits: progress.totalUnits
      }
    };

    return this.sendCallback(callbackUrl, payload);
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Validar se a URL do callback é válida
  validateCallbackUrl(url) {
    try {
      const parsedUrl = new URL(url);
      
      // Verificar se é HTTP ou HTTPS
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return {
          valid: false,
          error: 'URL deve usar protocolo HTTP ou HTTPS'
        };
      }

      // Verificar se não é localhost em produção
      if (process.env.NODE_ENV === 'production' && 
          (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1')) {
        return {
          valid: false,
          error: 'URLs localhost não são permitidas em produção'
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: 'URL inválida: ' + error.message
      };
    }
  }
}

module.exports = new CallbackService();