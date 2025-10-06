const { chromium } = require('playwright');
const { insertBoxes, clearBoxesByLocalidade } = require('./supabase-client');
const config = require('./config/bases.json');

/**
 * Extrator Multi-Base para Prisma Box
 * Processa todas as bases configuradas sequencialmente
 */
class MultiBaseExtractor {
    constructor() {
        this.browser = null;
        this.page = null;
        this.activeBases = config.bases.filter(base => base.active);
    }

    /**
     * Inicializar browser e fazer login
     */
    async initialize() {
        console.log('🚀 Iniciando Multi-Base Extractor...');
        
        this.browser = await chromium.launch({
            headless: false,
            slowMo: 1000
        });

        this.page = await this.browser.newPage();
        await this.page.setViewportSize({ width: 1920, height: 1080 });
        
        // Fazer login uma vez
        await this.login();
    }

    /**
     * Fazer login no sistema
     */
    async login() {
        console.log('🔐 Fazendo login...');
        
        await this.page.goto('https://app.prismabox.com.br/login');
        await this.page.waitForLoadState('networkidle');

        // Aguardar o campo de usuário aparecer e preencher credenciais
        await this.page.waitForSelector('input[name="username"]', { timeout: 10000 });
        await this.page.fill('input[name="username"]', process.env.PRISMA_USERNAME);
        
        await this.page.waitForSelector('input[name="password"]', { timeout: 10000 });
        await this.page.fill('input[name="password"]', process.env.PRISMA_PASSWORD);
        
        // Fazer login
        await this.page.waitForSelector('button[type="submit"]:has-text("Entrar")', { timeout: 10000 });
        await this.page.click('button[type="submit"]:has-text("Entrar")');
        await this.page.waitForLoadState('networkidle');
        
        console.log('✅ Login realizado com sucesso');
    }

    /**
     * Processar todas as bases ativas
     */
    async extractAllBases() {
        console.log(`📊 Processando ${this.activeBases.length} base(s) ativa(s)...`);
        
        const results = [];
        
        for (const base of this.activeBases) {
            try {
                console.log(`\\n🏢 Processando base: ${base.displayName}`);
                
                const result = await this.processBase(base);
                results.push(result);
                
            } catch (error) {
                console.error(`❌ Erro na base ${base.displayName}:`, error);
                results.push({
                    baseId: base.id,
                    baseName: base.displayName,
                    success: false,
                    error: error.message,
                    count: 0
                });
            }
        }
        
        return results;
    }

    /**
     * Processar uma base específica
     */
    async processBase(base) {
        // 1. Navegar para a página de boxes
        await this.page.goto('https://app.prismabox.com.br/box');
        await this.page.waitForLoadState('networkidle');
        
        // 2. Verificar se há modal de permissão e clicar em "NÃO" se aparecer
        try {
            await this.page.waitForSelector('button:has-text("NÃO")', { timeout: 3000 });
            console.log('📱 Modal de permissão detectado, clicando em "NÃO"...');
            await this.page.click('button:has-text("NÃO")');
            await this.page.waitForTimeout(1000);
        } catch (error) {
            console.log('📱 Nenhum modal de permissão detectado, continuando...');
        }
        
        // 3. Abrir filtros
        console.log('🔍 Aplicando filtro para boxes disponíveis...');
        await this.page.click('a[href="#"]:has-text("Filtros")');
        await this.page.waitForTimeout(1000);
        
        // 4. Selecionar filtro "Disponível" no dropdown
        await this.page.selectOption('select', 'Disponível');
        await this.page.waitForTimeout(500);
        
        // 5. Aplicar filtro clicando no botão "Aplicar"
        await this.page.evaluate(() => {
            const applyButton = document.getElementById('btn-apply-filter');
            if (applyButton) {
                applyButton.click();
            }
        });
        await this.page.waitForLoadState('networkidle');
        await this.page.waitForTimeout(3000);
        
        // 6. Verificar quantos registros estão sendo exibidos
        const recordsInfo = await this.page.evaluate(() => {
            const elements = Array.from(document.querySelectorAll('*')).filter(el => 
                el.textContent && el.textContent.includes('Mostrando registro')
            );
            return elements.length > 0 ? elements[0].textContent.trim() : 'Informação não encontrada';
        });
        console.log(`📊 ${recordsInfo}`);
        
        // 7. Extrair dados
        const boxes = await this.extractBoxesData(base);
        
        // 8. Limpar dados antigos desta base
        await clearBoxesByLocalidade(base.displayName);
        
        // 9. Inserir novos dados
        const insertResult = await insertBoxes(boxes);
        
        console.log(`✅ Base ${base.displayName}: ${boxes.length} boxes processados`);
        
        return {
            baseId: base.id,
            baseName: base.displayName,
            success: true,
            count: boxes.length,
            data: insertResult
        };
    }

    /**
     * Extrair dados dos boxes da página atual
     */
    async extractBoxesData(base) {
        console.log('📦 Extraindo dados dos boxes...');
        
        const boxesData = await this.page.evaluate((localidade) => {
            const rows = document.querySelectorAll('table tbody tr');
            const boxes = [];
            
            console.log(`Processando ${rows.length} linhas de dados...`);
            
            rows.forEach((row, index) => {
                try {
                    const cells = row.querySelectorAll('td');
                    
                    // Log da estrutura da primeira linha para debug
                    if (index === 0) {
                        console.log(`DEBUG: Número de colunas encontradas: ${cells.length}`);
                        cells.forEach((cell, cellIndex) => {
                            console.log(`Coluna ${cellIndex}: "${cell.textContent.trim().substring(0, 50)}"`);
                        });
                    }
                    
                    // Verificar se temos pelo menos 6 colunas (estrutura multi-base)
                    if (cells.length >= 6) {
                        // Estrutura da tabela multi-base:
                        // cells[0] = status
                        // cells[1] = box number
                        // cells[2] = location
                        // cells[3] = type
                        // cells[4] = measurements (m2 / m3)
                        // cells[5] = prices (monthly, m3, daily)
                        // cells[6] = access control (opcional)
                        
                        const statusCell = cells[0];
                        const boxCell = cells[1];
                        const locationCell = cells[2];
                        const typeCell = cells[3];
                        const measurementCell = cells[4];
                        const priceCell = cells[5];
                        const accessControlCell = cells.length > 6 ? cells[6] : null;
                        
                        // Extrair status
                        const statusText = statusCell?.textContent?.trim() || '';
                        const statusParts = statusText.split('\n').map(part => part.trim()).filter(part => part);
                        const status = statusParts[0] || '';
                        
                        // Extrair número do box
                        let boxNumber = boxCell?.querySelector('a')?.textContent?.trim() || '';
                        if (!boxNumber) {
                            boxNumber = boxCell?.textContent?.trim() || '';
                        }
                        
                        // Extrair localização
                        const locationText = locationCell?.textContent?.trim() || '';
                        const locationParts = locationText.split('\n').map(part => part.trim()).filter(part => part);
                        const location = locationParts[0] || locationText;
                        
                        // Extrair tipo e dimensões
                        const typeText = typeCell?.textContent?.trim() || '';
                        const typeLink = typeCell?.querySelector('a')?.textContent?.trim() || '';
                        const typeParts = typeText.split(' - ');
                        
                        // Extrair dimensões do texto do tipo
                        const dimensionsMatch = typeText.match(/(\d+(?:,\d+)?)\s*x\s*(\d+(?:,\d+)?)\s*x\s*(\d+(?:,\d+)?)/);
                        const dimensions = dimensionsMatch ? `${dimensionsMatch[1]}x${dimensionsMatch[2]}x${dimensionsMatch[3]}` : '';
                        
                        // Extrair medidas (m² e m³)
                        const measurementText = measurementCell?.textContent?.trim() || '';
                        const measurementParts = measurementText.split(' / ');
                        const m2Text = measurementParts[0]?.replace('m²', '').trim() || '';
                        const m3Text = measurementParts[1]?.replace('m³', '').trim() || '';
                        
                        // Extrair preços
                        const priceText = priceCell?.textContent?.trim() || '';
                        const priceLines = priceText.split('\n').map(line => line.trim()).filter(line => line);
                        
                        let priceMonthText = '';
                        let priceM3Text = '';
                        let priceDailyText = '';
                        
                        priceLines.forEach(line => {
                            if (line.includes('/mês')) {
                                priceMonthText = line;
                            } else if (line.includes('/m³')) {
                                priceM3Text = line;
                            } else if (line.includes('/dia')) {
                                priceDailyText = line;
                            }
                        });
                        
                        // Extrair controle de acesso
                        const accessControl = accessControlCell?.textContent?.trim() || '';
                        
                        const boxData = {
                            boxNumber: boxNumber,
                            status: status.substring(0, 50),
                            location: {
                                full: location,
                                access: location.substring(0, 100)
                            },
                            type: {
                                name: (typeLink || typeParts[0] || '').substring(0, 100),
                                full: typeText,
                                dimensions: dimensions.substring(0, 50)
                            },
                            measurements: {
                                m2: m2Text,
                                m3: m3Text
                            },
                            pricing: {
                                monthly: priceMonthText,
                                perM3: priceM3Text,
                                daily: priceDailyText
                            },
                            accessControl: accessControl,
                            localidade: localidade
                        };
                        
                        // Log de debug para os primeiros 3 boxes
                        if (index < 3) {
                            console.log(`DEBUG Box ${index + 1}:`, {
                                boxNumber,
                                status,
                                location,
                                typeText,
                                dimensions,
                                m2Text,
                                m3Text,
                                priceMonthText,
                                priceM3Text,
                                priceDailyText,
                                accessControl
                            });
                        }
                        
                        boxes.push(boxData);
                        
                        // Log de progresso a cada 20 boxes
                        if ((index + 1) % 20 === 0) {
                            console.log(`Processados ${index + 1} boxes...`);
                        }
                    }
                } catch (error) {
                    console.error(`Erro ao processar linha ${index + 1}:`, error);
                }
            });
            
            return {
                totalBoxes: boxes.length,
                extractedAt: new Date().toISOString(),
                boxes: boxes
            };
        }, base.displayName);
        
        console.log(`✅ Extração concluída! ${boxesData.totalBoxes} boxes encontrados para ${base.displayName}`);
        return boxesData.boxes;
    }

    /**
     * Finalizar e fechar browser
     */
    async close() {
        if (this.browser) {
            await this.browser.close();
            console.log('🔒 Browser fechado');
        }
    }

    /**
     * Executar extração completa
     */
    async run() {
        try {
            await this.initialize();
            const results = await this.extractAllBases();
            
            // Relatório final
            console.log('\\n📈 RELATÓRIO FINAL:');
            console.log('==================================================');
            
            let totalBoxes = 0;
            results.forEach(result => {
                const status = result.success ? '✅' : '❌';
                console.log(`${status} ${result.baseName}: ${result.count} boxes`);
                if (result.success) totalBoxes += result.count;
            });
            
            console.log('==================================================');
            console.log(`🎯 TOTAL: ${totalBoxes} boxes processados`);
            
            return results;
            
        } catch (error) {
            console.error('❌ Erro geral:', error);
            throw error;
        } finally {
            await this.close();
        }
    }
}

// Executar se chamado diretamente
if (require.main === module) {
    const extractor = new MultiBaseExtractor();
    extractor.run()
        .then(results => {
            console.log('🎉 Extração multi-base concluída!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Falha na extração:', error);
            process.exit(1);
        });
}

module.exports = MultiBaseExtractor;