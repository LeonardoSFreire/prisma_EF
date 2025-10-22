# API de Scraping Prisma Box

Esta API permite executar o scraping do Prisma Box de forma assíncrona, fornecendo uma resposta imediata e notificando o resultado via callback.

## 🚀 Como Usar

### 1. Iniciar Scraping

**Endpoint:** `POST /api/scraping/start`

**Body:**
```json
{
  "callbackUrl": "https://seu-servidor.com/webhook/scraping-result"
}
```

**Resposta Imediata (200 OK):**
```json
{
  "success": true,
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "Scraping iniciado com sucesso",
  "status": "pending",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### 2. Verificar Status

**Endpoint:** `GET /api/scraping/status/:jobId`

**Resposta:**
```json
{
  "success": true,
  "job": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "running",
    "progress": "Processando unidade 5 de 20...",
    "createdAt": "2024-01-15T10:30:00.000Z",
    "updatedAt": "2024-01-15T10:35:00.000Z",
    "logs": [
      {
        "timestamp": "2024-01-15T10:30:00.000Z",
        "message": "Scraping iniciado",
        "level": "info"
      }
    ]
  }
}
```

### 3. Callback de Resultado

Quando o scraping terminar, a API enviará um POST para a `callbackUrl` fornecida:

**Callback de Sucesso:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "success",
  "timestamp": "2024-01-15T10:45:00.000Z",
  "data": {
    "summary": "Scraping concluído com sucesso",
    "totalBoxes": 1250,
    "unitsProcessed": 20,
    "successfulUnits": 18,
    "failedUnits": ["UNIT001", "UNIT002"],
    "processingTime": 900,
    "logs": [...]
  }
}
```

**Callback de Erro:**
```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "error",
  "timestamp": "2024-01-15T10:35:00.000Z",
  "error": {
    "message": "Erro de autenticação no Prisma Box",
    "type": "AuthenticationError",
    "logs": [...]
  }
}
```

## 📋 Outros Endpoints

### Listar Jobs
`GET /api/scraping/jobs` - Lista todos os jobs

### Cancelar Job
`DELETE /api/scraping/job/:jobId` - Cancela um job em execução

### Workers Ativos
`GET /api/scraping/active` - Lista workers ativos

### Health Check
`GET /health` - Verifica se a API está funcionando

## 🔧 Configuração

1. Copie `.env.example` para `.env`
2. Configure as variáveis de ambiente:
   - `PRISMA_USERNAME` e `PRISMA_PASSWORD`
   - `SUPABASE_URL` e `SUPABASE_ANON_KEY`
   - `PORT` (opcional, padrão: 3000)

## 🚀 Executar

```bash
# Instalar dependências
npm install

# Executar em desenvolvimento
npm run dev

# Executar em produção
npm start
```

## 📝 Status dos Jobs

- `pending`: Job criado, aguardando início
- `running`: Scraping em execução
- `completed`: Scraping concluído com sucesso
- `failed`: Scraping falhou

## 🔄 Sistema de Retry

O sistema de callback possui retry automático:
- Máximo de 3 tentativas
- Intervalo de 5 segundos entre tentativas
- Timeout de 30 segundos por tentativa

## 🛡️ Validações

- URL do callback deve ser HTTP/HTTPS válida
- URLs localhost não são permitidas em produção
- Jobs têm timeout de 2 horas
- Limpeza automática de jobs antigos

## 📊 Monitoramento

A API gera logs detalhados para monitoramento:
- Início e fim de jobs
- Progresso do scraping
- Erros e tentativas de callback
- Performance e timing