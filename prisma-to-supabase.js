const { chromium } = require('playwright');
const { insertBoxes, clearBoxes, getBoxesStats } = require('./supabase-client');

/**
 * Extrair dados dos boxes disponíveis do Prisma Box
 * @returns {Object} Dados extraídos dos boxes
 */
async function extractBoxesData() {
    const browser = await chromium.launch({ 
        headless: false,
        slowMo: 1000 
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        console.log('🚀 Iniciando extração de dados do Prisma Box...');
        
        // Navegar para a página de login
        await page.goto('https://app.prismabox.com.br/login');
        await page.waitForLoadState('networkidle');
        
        // Fazer login usando variáveis de ambiente
        console.log('🔐 Fazendo login...');
        
        // Aguardar o campo de usuário aparecer
        await page.waitForSelector('input[name="username"]', { timeout: 10000 });
        await page.fill('input[name="username"]', process.env.PRISMA_USERNAME);
        
        await page.waitForSelector('input[name="password"]', { timeout: 10000 });
        await page.fill('input[name="password"]', process.env.PRISMA_PASSWORD);
        
        await page.waitForSelector('button[type="submit"]:has-text("Entrar")', { timeout: 10000 });
        await page.click('button[type="submit"]:has-text("Entrar")');
        await page.waitForLoadState('networkidle');
        
        // Navegar para a página de boxes
        console.log('📦 Navegando para página de boxes...');
        await page.goto('https://app.prismabox.com.br/box');
        await page.waitForLoadState('networkidle');
        
        // Verificar se há modal de permissão e clicar em "NÃO" se aparecer
        try {
            await page.waitForSelector('button:has-text("NÃO")', { timeout: 3000 });
            console.log('📱 Modal de permissão detectado, clicando em "NÃO"...');
            await page.click('button:has-text("NÃO")');
            await page.waitForTimeout(1000);
        } catch (error) {
            console.log('📱 Nenhum modal de permissão detectado, continuando...');
        }
        
        // Abrir filtros
        console.log('🔍 Aplicando filtro para boxes disponíveis...');
        await page.click('a[href="#"]:has-text("Filtros")');
        await page.waitForTimeout(1000);
        
        // Selecionar filtro "Disponível" no dropdown
        await page.selectOption('select', 'Disponível');
        await page.waitForTimeout(500);
        
        // Aplicar filtro clicando no botão "Aplicar"
        await page.evaluate(() => {
            const applyButton = document.getElementById('btn-apply-filter');
            if (applyButton) {
                applyButton.click();
            }
        });
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(3000);
        
        // Verificar quantos registros estão sendo exibidos
        const recordsInfo = await page.evaluate(() => {
            // Procurar por texto que contenha "Mostrando registro"
            const elements = Array.from(document.querySelectorAll('*')).filter(el => 
                el.textContent && el.textContent.includes('Mostrando registro')
            );
            return elements.length > 0 ? elements[0].textContent.trim() : 'Informação não encontrada';
        });
        console.log(`📊 ${recordsInfo}`);
        
        // Extrair dados dos boxes
        console.log('📊 Extraindo dados dos boxes...');
        const boxesData = await page.evaluate(() => {
            const boxes = [];
            const rows = document.querySelectorAll('tbody tr');
            
            console.log(`Processando ${rows.length} linhas de dados...`);
            
            rows.forEach((row, index) => {
                try {
                    const cells = row.querySelectorAll('td');
                    if (cells.length >= 10) {
                        const statusCell = cells[1];
                        const boxCell = cells[2];
                        const locationCell = cells[3];
                        const typeCell = cells[4];
                        const m2Cell = cells[5];
                        const m3Cell = cells[6];
                        const priceMonthCell = cells[7];
                        const priceM3Cell = cells[8];
                        const priceDailyCell = cells[9];
                        const accessControlCell = cells[10];
                        
                        // Extrair status (incluindo tags adicionais como "Lockers")
                        const statusText = statusCell?.textContent?.trim() || '';
                        const statusParts = statusText.split('\\n').map(part => part.trim()).filter(part => part);
                        const status = statusParts[0] || '';
                        const statusTag = statusParts[1] || '';
                        
                        // Extrair número do box - tentar primeiro o link, depois o texto direto
                        let boxNumber = boxCell?.querySelector('a')?.textContent?.trim() || '';
                        if (!boxNumber) {
                            boxNumber = boxCell?.textContent?.trim() || '';
                        }
                        boxNumber = boxNumber.substring(0, 50);
                        
                        // Extrair informações de localização
                        const locationText = locationCell?.textContent?.trim() || '';
                        const locationParts = locationText.split('\\n').map(part => part.trim()).filter(part => part);
                        
                        // Extrair informações do tipo
                        const typeText = typeCell?.textContent?.trim() || '';
                        const typeLink = typeCell?.querySelector('a')?.textContent?.trim() || '';
                        const typeParts = typeText.split('\\n').map(part => part.trim()).filter(part => part);
                        
                        // Extrair dimensões (última parte do tipo)
                        const dimensions = typeParts[typeParts.length - 1] || '';
                        
                        // Extrair valores numéricos limpos
                        const m2Text = m2Cell?.textContent?.trim() || '0';
                        const m3Text = m3Cell?.textContent?.trim() || '0';
                        const m2 = parseFloat(m2Text.replace(',', '.')) || 0;
                        const m3 = parseFloat(m3Text.replace(',', '.')) || 0;
                        
                        // Extrair preços (manter como string para preservar formatação)
                        const priceMonthText = priceMonthCell?.textContent?.trim() || '';
                        const priceM3Text = priceM3Cell?.textContent?.trim() || '';
                        const priceDailyText = priceDailyCell?.textContent?.trim() || '';
                        
                        // Extrair controle de acesso
                        const accessControl = accessControlCell?.textContent?.trim() || '';
                        
                        const boxData = {
                            boxNumber: boxNumber,
                            status: (status + (statusTag ? ' ' + statusTag : '')).substring(0, 20),
                            location: {
                                full: locationText,
                                access: (locationParts[0] || '').substring(0, 100)
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
                            accessControl: accessControl
                        };
                        
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
        });
        
        console.log(`✅ Extração concluída! ${boxesData.totalBoxes} boxes encontrados`);
        return boxesData;
        
    } catch (error) {
        console.error('❌ Erro durante a extração:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

/**
 * Função principal que executa todo o processo
 */
async function main() {
    try {
        console.log('🎯 Iniciando processo completo: Prisma Box → Supabase');
        console.log('=' .repeat(50));
        
        // 1. Extrair dados do Prisma Box
        const extractedData = await extractBoxesData();
        
        if (!extractedData.boxes || extractedData.boxes.length === 0) {
            console.log('⚠️  Nenhum box encontrado para processar');
            return;
        }
        
        // 2. Limpar dados existentes (opcional)
        console.log('\\n🧹 Limpando dados existentes no Supabase...');
        const clearResult = await clearBoxes();
        
        if (!clearResult.success) {
            console.error('❌ Erro ao limpar dados existentes:', clearResult.error);
            // Continuar mesmo assim
        }
        
        // 3. Inserir novos dados no Supabase
        console.log('\\n💾 Inserindo dados no Supabase...');
        const insertResult = await insertBoxes(extractedData.boxes);
        
        if (insertResult.success) {
            console.log(`\\n🎉 Processo concluído com sucesso!`);
            console.log(`📊 Resumo:`);
            console.log(`   • Boxes extraídos: ${extractedData.totalBoxes}`);
            console.log(`   • Boxes inseridos: ${insertResult.count}`);
            console.log(`   • Data/hora: ${extractedData.extractedAt}`);
            
            // 4. Mostrar estatísticas
            console.log('\\n📈 Obtendo estatísticas...');
            const statsResult = await getBoxesStats();
            
            if (statsResult.success) {
                console.log('\\n📋 Estatísticas dos boxes:');
                console.log(`   • Total: ${statsResult.stats.total}`);
                console.log('   • Por status:');
                Object.entries(statsResult.stats.byStatus).forEach(([status, count]) => {
                    console.log(`     - ${status}: ${count}`);
                });
                console.log('   • Por tipo:');
                Object.entries(statsResult.stats.byType).forEach(([type, count]) => {
                    console.log(`     - ${type}: ${count}`);
                });
            }
            
        } else {
            console.error('❌ Erro ao inserir dados no Supabase:', insertResult.error);
        }
        
    } catch (error) {
        console.error('❌ Erro no processo principal:', error);
        process.exit(1);
    }
}

// Executar apenas se este arquivo for chamado diretamente
if (require.main === module) {
    main();
}

module.exports = {
    extractBoxesData,
    main
};