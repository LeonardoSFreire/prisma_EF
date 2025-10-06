# Prisma Box → Supabase Integration

Este projeto automatiza a extração de dados de boxes do Prisma Box e os armazena em uma base de dados Supabase.

## 📋 Pré-requisitos

- Node.js (versão 14 ou superior)
- Conta no Supabase
- Acesso ao Prisma Box

## 🚀 Configuração Inicial

### 1. Instalar Dependências

```bash
npm install
```

### 2. Configurar Variáveis de Ambiente

O arquivo `.env` já foi criado com suas credenciais do Supabase. Verifique se as informações estão corretas:

```env
SUPABASE_URL=https://uqzlilifrboerjqtuhky.supabase.co
SUPABASE_ANON_KEY=sua_anon_key
SUPABASE_SERVICE_KEY=sua_service_key
```

### 3. Criar Tabela no Supabase

1. Acesse o dashboard do Supabase: https://uqzlilifrboerjqtuhky.supabase.co
2. Vá para "SQL Editor"
3. Execute o script contido no arquivo `supabase-setup.sql`

## 📁 Estrutura do Projeto

```
prisma/
├── .env                    # Variáveis de ambiente
├── supabase-setup.sql      # Script para criar tabela no Supabase
├── supabase-client.js      # Cliente e funções do Supabase
├── prisma-to-supabase.js   # Script principal de integração
├── index.js               # Script original do Playwright
└── README.md              # Esta documentação
```

## 🎯 Como Usar

### Execução Completa (Recomendado)

Execute o processo completo de extração e inserção:

```bash
node prisma-to-supabase.js
```

Este comando irá:
1. Abrir o navegador e fazer login no Prisma Box
2. Aplicar filtro para boxes "DISPONÍVEL"
3. Extrair todos os dados dos boxes
4. Limpar dados existentes no Supabase
5. Inserir os novos dados
6. Mostrar estatísticas

### Uso Programático

Você também pode usar as funções individualmente:

```javascript
const { extractBoxesData } = require('./prisma-to-supabase');
const { insertBoxes, getBoxesStats } = require('./supabase-client');

// Extrair dados
const data = await extractBoxesData();

// Inserir no Supabase
const result = await insertBoxes(data.boxes);

// Obter estatísticas
const stats = await getBoxesStats();
```

## 📊 Estrutura dos Dados

Cada box contém as seguintes informações:

```javascript
{
  box_number: "D8",
  status: "DISPONÍVEL",
  location_full: "Acesso 01 Térreo Caixa Postal",
  location_access: "Acesso 01",
  location_floor: "Térreo",
  type_name: "Caixa Postal",
  dimensions: "0.31 x 0.31 x 0.31",
  area_m2: 0.10,
  volume_m3: 0.03,
  price_monthly: "R$ 99,00",
  price_per_m3: "R$ 3.323,15",
  price_daily: "R$ 3,30",
  extracted_at: "2025-01-06T15:40:54.727Z"
}
```

## 🔧 Funções Disponíveis

### supabase-client.js

- `insertBoxes(boxesData)` - Inserir array de boxes no Supabase
- `clearBoxes()` - Limpar todos os dados da tabela
- `getBoxesByStatus(status)` - Buscar boxes por status
- `getBoxesStats()` - Obter estatísticas dos boxes

### prisma-to-supabase.js

- `extractBoxesData()` - Extrair dados do Prisma Box
- `main()` - Executar processo completo

## ⚙️ Configurações Avançadas

### Personalizar Login

Edite o arquivo `prisma-to-supabase.js` e altere as credenciais de login:

```javascript
await page.fill('input[name="email"]', 'seu-email@exemplo.com');
await page.fill('input[name="password"]', 'sua-senha');
```

### Filtros Personalizados

Você pode modificar os filtros aplicados alterando esta seção:

```javascript
// Selecionar filtro "Disponível"
await page.selectOption('select[name="status"]', 'DISPONÍVEL');
```

### Modo Headless

Para executar sem interface gráfica, altere:

```javascript
const browser = await chromium.launch({ 
    headless: true,  // Alterar para true
    slowMo: 1000 
});
```

## 🚀 Deploy na VPS

### 1. Preparar Ambiente

```bash
# Instalar Node.js na VPS
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Instalar dependências do Playwright
npx playwright install-deps
```

### 2. Configurar Variáveis de Ambiente

Na VPS, crie o arquivo `.env` com suas credenciais ou use variáveis de ambiente do sistema:

```bash
export SUPABASE_URL="https://uqzlilifrboerjqtuhky.supabase.co"
export SUPABASE_SERVICE_KEY="sua_service_key"
```

### 3. Executar como Serviço

Crie um cron job para execução automática:

```bash
# Editar crontab
crontab -e

# Executar a cada hora
0 * * * * cd /caminho/para/projeto && node prisma-to-supabase.js >> /var/log/prisma-sync.log 2>&1
```

## 🐛 Troubleshooting

### Erro de Login
- Verifique se as credenciais estão corretas
- Certifique-se de que não há captcha ou 2FA ativo

### Erro de Conexão Supabase
- Verifique se as URLs e chaves estão corretas
- Confirme se a tabela foi criada corretamente

### Erro de Extração
- Verifique se a estrutura da página não mudou
- Ajuste os seletores CSS se necessário

## 📈 Monitoramento

O sistema gera logs detalhados durante a execução. Para monitorar:

```bash
# Ver logs em tempo real
tail -f /var/log/prisma-sync.log

# Ver estatísticas no Supabase
node -e "require('./supabase-client').getBoxesStats().then(console.log)"
```

## 🔒 Segurança

- Nunca commite o arquivo `.env` no Git
- Use variáveis de ambiente na produção
- Mantenha as chaves do Supabase seguras
- Configure RLS (Row Level Security) no Supabase se necessário

## 📞 Suporte

Para dúvidas ou problemas:
1. Verifique os logs de erro
2. Consulte a documentação do Supabase
3. Teste as funções individualmente para isolar problemas