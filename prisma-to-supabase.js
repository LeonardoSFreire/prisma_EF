const { chromium } = require('playwright');
const { insertBoxes, clearBoxes, getBoxesStats } = require('./supabase-client');
const fs = require('fs');

// Carregar configuração das unidades
const unitsConfig = JSON.parse(fs.readFileSync('./config/final-units-config.json', 'utf8'));

/**
 * Verificar se o usuário ainda está logado
 * @param {Object} page - Página do Playwright
 * @returns {boolean} True se ainda estiver logado
 */
async function isLoggedIn(page) {
    try {
        // Verificar se estamos na página de login (indicativo de logout)
        const currentUrl = page.url();
        if (currentUrl.includes('/login')) {
            return false;
        }
        
        // Verificar se existe elemento que só aparece quando logado
        const loggedInElement = await page.$('a[href="/logout"], .user-menu, .navbar-nav');
        return loggedInElement !== null;
    } catch (error) {
        console.log('⚠️ Erro ao verificar login:', error.message);
        return false;
    }
}

/**
 * Fazer login no sistema
 * @param {Object} page - Página do Playwright
 */
async function performLogin(page) {
    console.log('🔐 Fazendo login...');
    
    // Navegar para a página de login se não estivermos lá
    if (!page.url().includes('/login')) {
        await page.goto('https://app.prismabox.com.br/login');
        await page.waitForLoadState('networkidle');
    }
    
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
        // Modal não apareceu, continuar
    }
}

/**
 * Verificar sessão e fazer re-login se necessário
 * @param {Object} page - Página do Playwright
 */
async function ensureLoggedIn(page) {
    const loggedIn = await isLoggedIn(page);
    if (!loggedIn) {
        console.log('🔄 Sessão expirada! Fazendo re-login...');
        await performLogin(page);
        console.log('✅ Re-login realizado com sucesso!');
        return true; // Indica que houve re-login
    }
    return false; // Não houve re-login
}

/**
 * Sistema de keep-alive para manter sessão ativa
 * @param {Object} page - Página do Playwright
 */
async function keepAlive(page) {
    try {
        // Fazer uma ação simples para manter a sessão ativa
        await page.evaluate(() => {
            // Simular movimento do mouse
            document.dispatchEvent(new MouseEvent('mousemove', {
                view: window,
                bubbles: true,
                cancelable: true,
                clientX: Math.random() * window.innerWidth,
                clientY: Math.random() * window.innerHeight
            }));
        });
    } catch (error) {
        // Ignorar erros do keep-alive
    }
}

/**
 * Extrair dados dos boxes disponíveis do Prisma Box para todas as unidades
 * @returns {Object} Dados extraídos dos boxes de todas as unidades
 */
async function extractBoxesData() {
    const browser = await chromium.launch({ 
        headless: false,
        slowMo: 100
    });
    
    const context = await browser.newContext();
    const page = await context.newPage();
    
    try {
        console.log('🚀 Iniciando extração de dados do Prisma Box...');
        console.log(`📊 Total de unidades a processar: ${unitsConfig.totalUnits}`);
        
        // Fazer login inicial
        await performLogin(page);

        // Array para armazenar todos os boxes de todas as unidades
        const allBoxes = [];
        const unitDetails = []; // Array para armazenar detalhes de cada unidade
        const failedUnits = []; // Array para armazenar unidades que falharam
        let totalBoxesExtracted = 0;
        
        // Controle de estado dos filtros
        let filtersApplied = false;

        // Função para processar uma unidade com retry
        async function processUnitWithRetry(unit, attempt = 1, maxAttempts = 2) {
            const startTime = Date.now();
            console.log(`\n🏢 Processando unidade ${unit.code} - ${unit.city} (Tentativa ${attempt}/${maxAttempts})`);
            
            try {
                // Verificar se ainda estamos logados antes de processar
                const wasRelogged = await ensureLoggedIn(page);
                if (wasRelogged) {
                    console.log(`🔄 Re-login realizado para unidade ${unit.code}`);
                    // Resetar estado dos filtros após re-login
                    filtersApplied = false;
                }
                
                // Keep-alive para manter sessão ativa
                await keepAlive(page);
                
                // Selecionar a unidade específica
                console.log(`🔄 Selecionando unidade ${unit.code}...`);
                
                // Clicar no seletor de unidade com timeout reduzido para detectar falhas mais rápido
                await page.click('a:has-text("ESPAÇO FÁCIL")', { timeout: 15000 });
                await page.waitForTimeout(1000);
                
                // Selecionar a unidade específica com timeout reduzido
                const unitSelector = `a:has-text("${unit.fullName}")`;
                await page.click(unitSelector, { timeout: 15000 });
                await page.waitForLoadState('networkidle', { timeout: 20000 });
                await page.waitForTimeout(2000);
                
                console.log(`✅ Unidade ${unit.code} selecionada`);
                
                // Verificar e tratar modais que podem aparecer após trocar de unidade
                await handleModalsAfterUnitChange(page, unit.code);
                
                // Extrair dados da unidade atual
                const unitBoxes = await extractUnitBoxes(page, unit, filtersApplied);
                
                // Marcar filtros como aplicados após primeira execução bem-sucedida
                if (!filtersApplied) {
                    filtersApplied = true;
                    console.log('✅ Filtros aplicados! Próximas unidades pularão esta etapa.');
                }
                
                // Fazer insert no Supabase separadamente para cada unidade
                if (unitBoxes.length > 0) {
                    console.log(`💾 Salvando ${unitBoxes.length} boxes da unidade ${unit.code} no Supabase...`);
                    await insertBoxes(unitBoxes);
                    console.log(`✅ Dados da unidade ${unit.code} salvos no Supabase com sucesso!`);
                } else {
                    console.log(`⚠️ Nenhum box encontrado para a unidade ${unit.code}`);
                }
                
                // Calcular tempo de processamento
                const endTime = Date.now();
                const processingTime = `${((endTime - startTime) / 1000).toFixed(2)}s`;
                
                // Armazenar detalhes da unidade (sucesso)
                const unitDetail = {
                    code: unit.code,
                    city: unit.city,
                    fullName: unit.fullName,
                    boxesCount: unitBoxes.length,
                    pagesProcessed: unitBoxes.length > 0 ? Math.ceil(unitBoxes.length / 50) : 0,
                    processingTime: processingTime,
                    supabaseStatus: unitBoxes.length > 0 ? 'Salvo com sucesso' : 'Nenhum dado para salvar',
                    attempts: attempt,
                    status: 'success'
                };
                
                console.log(`📊 Unidade ${unit.code}: ${unitBoxes.length} boxes extraídos e salvos`);
                
                return { success: true, unitBoxes, unitDetail };
                
            } catch (error) {
                console.log(`❌ Erro ao processar unidade ${unit.code} (Tentativa ${attempt}/${maxAttempts}): ${error.message}`);
                
                if (attempt < maxAttempts) {
                    console.log(`🔄 Tentando novamente unidade ${unit.code} em 3 segundos...`);
                    await page.waitForTimeout(3000);
                    
                    // Tentar voltar para a página inicial antes de retry
                    try {
                        await page.goto('https://prismabox.com.br/boxes');
                        await page.waitForLoadState('networkidle', { timeout: 10000 });
                        console.log(`🔄 Página recarregada para retry da unidade ${unit.code}`);
                    } catch (reloadError) {
                        console.log(`⚠️ Erro ao recarregar página: ${reloadError.message}`);
                    }
                    
                    return await processUnitWithRetry(unit, attempt + 1, maxAttempts);
                } else {
                    // Falha definitiva após todas as tentativas
                    const endTime = Date.now();
                    const processingTime = `${((endTime - startTime) / 1000).toFixed(2)}s`;
                    
                    const unitDetail = {
                        code: unit.code,
                        city: unit.city,
                        fullName: unit.fullName,
                        boxesCount: 0,
                        pagesProcessed: 0,
                        processingTime: processingTime,
                        supabaseStatus: 'Falha no processamento',
                        attempts: attempt,
                        status: 'failed',
                        error: error.message
                    };
                    
                    return { success: false, unitBoxes: [], unitDetail };
                }
            }
        }

        // Processar cada unidade sequencialmente com sistema de retry
        for (let i = 0; i < unitsConfig.units.length; i++) {
            const unit = unitsConfig.units[i];
            console.log(`\n📋 Iniciando processamento da unidade ${i + 1}/${unitsConfig.units.length}: ${unit.code} - ${unit.city}`);
            
            const result = await processUnitWithRetry(unit);
            
            if (result.success) {
                // Adicionar boxes da unidade ao array total para estatísticas
                allBoxes.push(...result.unitBoxes);
                totalBoxesExtracted += result.unitBoxes.length;
                unitDetails.push(result.unitDetail);
            } else {
                // Unidade falhou após todas as tentativas
                failedUnits.push(result.unitDetail);
                unitDetails.push(result.unitDetail);
                console.log(`💥 Unidade ${unit.code} falhou definitivamente após ${result.unitDetail.attempts} tentativas`);
            }
            
            // Pequena pausa entre unidades com keep-alive
            await keepAlive(page);
            await page.waitForTimeout(1000);
        }

        // Mostrar resumo de unidades que falharam
        if (failedUnits.length > 0) {
            console.log(`\n⚠️ ATENÇÃO: ${failedUnits.length} unidade(s) falharam:`);
            failedUnits.forEach(unit => {
                console.log(`   • ${unit.code} - ${unit.city}: ${unit.error}`);
            });
        }

        console.log(`\n🎉 Extração concluída!`);
        console.log(`📊 Total de boxes extraídos: ${totalBoxesExtracted}`);
        console.log(`🏢 Unidades processadas: ${unitsConfig.units.length}`);

        return {
            boxes: allBoxes,
            totalBoxes: totalBoxesExtracted,
            unitsProcessed: unitsConfig.units.length,
            unitDetails: unitDetails, // Adicionar detalhes das unidades
            failedUnits: failedUnits, // Adicionar unidades que falharam
            successfulUnits: unitsConfig.units.length - failedUnits.length,
            extractedAt: new Date().toISOString(),
            source: 'prisma-box-all-units',
            browser: browser // Adicionar referência do browser para fechamento
        };

    } catch (error) {
        console.error('❌ Erro durante extração:', error);
        throw error;
    } finally {
        // Não fechar o browser para manter aberto
        console.log('🌐 Mantendo navegador aberto para próximas instruções...');
        // await browser.close();
    }
}

/**
 * Tratar modais que podem aparecer após trocar de unidade
 * @param {Object} page - Página do Playwright
 * @param {string} unitCode - Código da unidade atual
 */
async function handleModalsAfterUnitChange(page, unitCode) {
    console.log(`🔍 Verificando modais após selecionar unidade ${unitCode}...`);
    
    // Lista de possíveis modais que podem aparecer
    const modalSelectors = [
        'button:has-text("NÃO")',
        'button:has-text("Não")',
        'button:has-text("CANCELAR")',
        'button:has-text("Cancelar")',
        'button:has-text("FECHAR")',
        'button:has-text("Fechar")',
        'button:has-text("OK")',
        'button:has-text("×")',
        '.modal-close',
        '.close-modal'
    ];
    
    // Aguardar brevemente para dar tempo do modal aparecer (se houver)
    await page.waitForTimeout(500);
    
    // Verificar se algum modal está visível ANTES de tentar clicar
    let modalFound = false;
    for (const selector of modalSelectors) {
        try {
            // Verificação rápida (300ms) se o elemento está visível
            const element = await page.waitForSelector(selector, { timeout: 300, state: 'visible' });
            if (element) {
                console.log(`📱 Modal detectado (${selector}), clicando para fechar...`);
                await page.click(selector);
                await page.waitForTimeout(500); // Reduzido de 1000ms para 500ms
                console.log(`✅ Modal fechado com sucesso`);
                modalFound = true;
                break; // Sair do loop se conseguiu fechar um modal
            }
        } catch (error) {
            // Modal não encontrado, continuar para o próximo (sem delay)
            continue;
        }
    }
    
    if (!modalFound) {
        console.log(`ℹ️ Nenhum modal detectado para unidade ${unitCode}`);
    }
    
    // Aguardar brevemente para garantir que a página estabilizou (reduzido)
    await page.waitForTimeout(300);
    console.log(`✅ Verificação de modais concluída para unidade ${unitCode}`);
}

/**
 * Extrair boxes de uma unidade específica
 * @param {Object} page - Página do Playwright
 * @param {Object} unit - Configuração da unidade
 * @param {boolean} filtersAlreadyApplied - Se os filtros já foram aplicados anteriormente
 * @returns {Array} Array de boxes da unidade
 */
async function extractUnitBoxes(page, unit, filtersAlreadyApplied = false) {
    try {
        // Aplicar filtros apenas se ainda não foram aplicados
        if (!filtersAlreadyApplied) {
            console.log('🔍 Aplicando filtros pela primeira vez...');
            
            // ETAPA 1: Clicar em FILTROS
            console.log('🔍 ETAPA 1: Clicando em FILTROS...');
            await page.click('a[href="#"]:has-text("Filtros")');
            await page.waitForTimeout(2000);
            console.log('✅ Painel de filtros aberto');
            
            // ETAPA 2: Marcar DISPONÍVEL no STATUS
            console.log('🔍 ETAPA 2: Selecionando DISPONÍVEL no STATUS...');
            try {
                // Aguardar o painel de filtros estar visível
                await page.waitForTimeout(2000);
                
                // USAR OS SELETORES CORRETOS IDENTIFICADOS NA INVESTIGAÇÃO
                console.log('🎯 Usando seletor correto identificado: #boxStatusId');
                
                // Selecionar "Disponível" (value="1") no select múltiplo boxStatusId
                await page.selectOption('#boxStatusId', '1');
                console.log('✅ Status DISPONÍVEL selecionado com sucesso! (ID: boxStatusId, Value: 1)');
                
            } catch (error) {
                console.log('⚠️ Erro ao selecionar status DISPONÍVEL:', error.message);
                console.log('🔄 Continuando sem filtro de status...');
            }
            
            // ETAPA 3: Clicar no botão APLICAR
            console.log('🔍 ETAPA 3: Clicando no botão APLICAR...');
            try {
                // USAR O SELETOR CORRETO IDENTIFICADO NA INVESTIGAÇÃO
                console.log('🎯 Usando seletor correto identificado: #btn-apply-filter');
                
                // Clicar no botão Aplicar usando o ID correto
                await page.click('#btn-apply-filter');
                console.log('✅ Botão APLICAR clicado com sucesso! (ID: btn-apply-filter)');
                
                // Aguardar o carregamento da página após aplicar o filtro
                await page.waitForLoadState('networkidle');
                console.log('✅ Filtro aplicado e página carregada!');
                
            } catch (error) {
                console.log('⚠️ Erro ao clicar no botão APLICAR:', error.message);
                console.log('🔄 Continuando sem aplicar filtro...');
            }
            
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(3000);
        } else {
            console.log('⚡ Pulando aplicação de filtros (já aplicados anteriormente)');
            // Aguardar um pouco para garantir que a página está carregada
            await page.waitForTimeout(1000);
        }

        // Capturar a localidade da interface
        console.log('🏢 Capturando informações da localidade...');
        const localidade = await page.evaluate(() => {
            // Procurar pelo elemento que contém a localidade (geralmente no cabeçalho ou título)
            // Baseado na imagem, parece estar no topo da página
            const possibleSelectors = [
                // Seletor mais específico baseado na estrutura comum do PrismaBox
                '.navbar-text',
                '.current-base',
                '.base-info',
                '.unit-info',
                // Seletores mais genéricos
                'h1', 'h2', 'h3',
                '.title',
                '.header-title',
                '.page-title'
            ];
            
            for (const selector of possibleSelectors) {
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    const text = element.textContent?.trim();
                    if (text && (text.includes('ESPAÇO FÁCIL') || text.includes('EF-'))) {
                        return text;
                    }
                }
            }
            
            // Fallback: procurar em todos os elementos por texto que contenha informações da unidade
            const allElements = document.querySelectorAll('*');
            for (const element of allElements) {
                const text = element.textContent?.trim();
                if (text && text.length < 100 && (text.includes('ESPAÇO FÁCIL') || text.includes('EF-'))) {
                    return text;
                }
            }
            
            return 'Localidade não identificada';
        });

        console.log(`🏢 Localidade identificada: ${localidade}`);

        // Inicializar dados de extração
        let allBoxesData = {
            boxes: [],
            totalBoxes: 0,
            localidade: localidade,
            page: 1
        };

        let currentPage = 1;
        let hasMorePages = true;

        // Loop de paginação
        while (hasMorePages) {
            console.log(`\n📄 Extraindo dados da página ${currentPage}...`);
            
            try {
                // Aguardar a página carregar completamente
                await page.waitForLoadState('networkidle');
                await page.waitForTimeout(2000);

                // Extrair dados da página atual
                const boxesData = await page.evaluate((params) => {
                    const { localidade, currentPage } = params;
                    const boxes = [];
                    
                    // Primeiro, tentar encontrar a tabela de dados (estrutura original do PrismaBox)
                    const tableRows = document.querySelectorAll('tbody tr');
                    
                    console.log(`Encontradas ${tableRows.length} linhas na tabela`);
                    
                    if (tableRows.length > 0) {
                        // Processar dados da tabela (estrutura original)
                        tableRows.forEach((row, index) => {
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
                                    
                                    // Extrair número do box
                                    let boxNumber = boxCell?.querySelector('a')?.textContent?.trim() || '';
                                    if (!boxNumber) {
                                        boxNumber = boxCell?.textContent?.trim() || '';
                                    }
                                    
                                    // Extrair status
                                    const statusText = statusCell?.textContent?.trim() || '';
                                    
                                    // Extrair localização
                                    const locationText = locationCell?.textContent?.trim() || '';
                                    
                                    // Extrair tipo e dimensões
                                    const typeText = typeCell?.textContent?.trim() || '';
                                    
                                    // Extrair medidas
                                    const m2Text = m2Cell?.textContent?.trim() || '';
                                    const m3Text = m3Cell?.textContent?.trim() || '';
                                    
                                    // Extrair preços
                                    const priceMonthText = priceMonthCell?.textContent?.trim() || '';
                                    const priceM3Text = priceM3Cell?.textContent?.trim() || '';
                                    const priceDailyText = priceDailyCell?.textContent?.trim() || '';
                                    
                                    // Extrair controle de acesso
                                    const accessControl = accessControlCell?.textContent?.trim() || '';
                                    
                                    // Estrutura de dados compatível com supabase-client.js
                                    const boxData = {
                                        boxNumber: boxNumber,
                                        status: statusText.substring(0, 50),
                                        location: {
                                            full: locationText,
                                            access: locationText.substring(0, 100)
                                        },
                                        type: {
                                            name: typeText.substring(0, 100),
                                            full: typeText,
                                            dimensions: `${m2Text} / ${m3Text}`.substring(0, 50)
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
                                    
                                    boxes.push(boxData);
                                }
                            } catch (error) {
                                console.error(`Erro ao processar linha ${index}:`, error);
                            }
                        });
                    } else {
                        // Fallback: tentar seletores de cards se não encontrar tabela
                        const boxCards = document.querySelectorAll('.box-card, .card, .box-item, [class*="box"], [class*="card"]');
                        
                        console.log(`Encontrados ${boxCards.length} elementos de box na página`);
                        
                        boxCards.forEach((card, index) => {
                            try {
                                // Extrair informações do box usando estrutura compatível
                                const boxData = {
                                    boxNumber: null,
                                    status: null,
                                    location: {
                                        full: null,
                                        access: null
                                    },
                                    type: {
                                        name: null,
                                        full: null,
                                        dimensions: null
                                    },
                                    measurements: {
                                        m2: null,
                                        m3: null
                                    },
                                    pricing: {
                                        monthly: null,
                                        perM3: null,
                                        daily: null
                                    },
                                    accessControl: null,
                                    localidade: localidade
                                };
                                
                                // Tentar extrair número do box
                                const numeroElement = card.querySelector('.box-number, .numero, [class*="number"], [class*="num"]') || 
                                                    card.querySelector('h3, h4, h5, .title, .name');
                                if (numeroElement) {
                                    boxData.boxNumber = numeroElement.textContent?.trim();
                                }
                                
                                // Tentar extrair status
                                const statusElement = card.querySelector('.status, .box-status, [class*="status"], .badge, .label');
                                if (statusElement) {
                                    boxData.status = statusElement.textContent?.trim();
                                }
                                
                                // Tentar extrair tipo/tamanho
                                const tipoElement = card.querySelector('.type, .box-type, [class*="type"], .size, .tamanho');
                                if (tipoElement) {
                                    boxData.type.name = tipoElement.textContent?.trim();
                                    boxData.type.full = tipoElement.textContent?.trim();
                                }
                                
                                // Tentar extrair preço
                                const precoElement = card.querySelector('.price, .preco, [class*="price"], [class*="valor"]');
                                if (precoElement) {
                                    boxData.pricing.monthly = precoElement.textContent?.trim();
                                }
                                
                                // Se não encontrou dados específicos, tentar extrair do texto geral
                                if (!boxData.boxNumber && !boxData.status) {
                                    const allText = card.textContent?.trim();
                                    if (allText) {
                                        // Tentar identificar padrões no texto
                                        const numeroMatch = allText.match(/(?:Box|BOX|#)\s*(\d+)/i);
                                        if (numeroMatch) {
                                            boxData.boxNumber = numeroMatch[1];
                                        }
                                        
                                        // Identificar status comum
                                        if (allText.toLowerCase().includes('disponível') || allText.toLowerCase().includes('disponivel')) {
                                            boxData.status = 'Disponível';
                                        } else if (allText.toLowerCase().includes('ocupado')) {
                                            boxData.status = 'Ocupado';
                                        }
                                        
                                        boxData.accessControl = allText;
                                    }
                                }
                                
                                // Só adicionar se tiver pelo menos alguma informação útil
                                if (boxData.boxNumber || boxData.status || boxData.accessControl) {
                                    boxes.push(boxData);
                                }
                                
                            } catch (error) {
                                console.error(`Erro ao processar box ${index}:`, error);
                            }
                        });
                    }
                    
                    return {
                        boxes: boxes,
                        totalBoxes: boxes.length,
                        localidade: localidade,
                        page: currentPage
                    };
                }, { localidade, currentPage });
                
                console.log(`✅ Página ${currentPage} processada! ${boxesData.totalBoxes} boxes encontrados`);
                
                // Se não encontrou boxes, tentar uma abordagem mais genérica
                if (boxesData.totalBoxes === 0) {
                    console.log('⚠️ Nenhum box encontrado com seletores específicos, tentando abordagem genérica...');
                    
                    const genericBoxesData = await page.evaluate((localidade) => {
                        const boxes = [];
                        
                        // Procurar por qualquer elemento que contenha informações de box
                        const allElements = document.querySelectorAll('div, span, p, li, td');
                        
                        allElements.forEach((element, index) => {
                            const text = element.textContent?.trim();
                            if (text && text.length > 5 && text.length < 200) {
                                // Verificar se contém padrões de box
                                if (text.match(/box|BOX|#\d+|\d+\s*(disponível|ocupado|livre)/i)) {
                                    boxes.push({
                                        id: `generic_box_${index}`,
                                        numero: null,
                                        status: null,
                                        tipo: null,
                                        tamanho: null,
                                        preco: null,
                                        disponibilidade: null,
                                        localizacao: null,
                                        observacoes: text,
                                        localidade: localidade,
                                        extractedAt: new Date().toISOString()
                                    });
                                }
                            }
                        });
                        
                        return {
                            boxes: boxes.slice(0, 50), // Limitar para evitar dados excessivos
                            totalBoxes: Math.min(boxes.length, 50),
                            localidade: localidade,
                            page: arguments[1] || 1
                        };
                    }, localidade, currentPage);
                    
                    boxesData.boxes = genericBoxesData.boxes;
                    boxesData.totalBoxes = genericBoxesData.totalBoxes;
                    
                    console.log(`✅ Abordagem genérica: ${boxesData.totalBoxes} elementos encontrados`);
                }
                
                // Adicionar boxes da página atual ao total
                if (currentPage === 1) {
                    allBoxesData = boxesData;
                } else {
                    allBoxesData.boxes = allBoxesData.boxes.concat(boxesData.boxes);
                    allBoxesData.totalBoxes = allBoxesData.boxes.length;
                }
                
                console.log(`📊 Total acumulado: ${allBoxesData.totalBoxes} boxes`);
                
                // Verificar se há próxima página
                const nextPageExists = await page.evaluate(() => {
                    // Procurar por botões de próxima página
                    const nextButtons = document.querySelectorAll('a, button');
                    for (const button of nextButtons) {
                        const text = button.textContent?.toLowerCase().trim();
                        if (text && (text.includes('próxima') || text.includes('next') || text.includes('>') || text.includes('→'))) {
                            return !button.disabled && !button.classList.contains('disabled');
                        }
                    }
                    return false;
                });
                
                if (nextPageExists) {
                    console.log(`➡️ Próxima página detectada, navegando para página ${currentPage + 1}...`);
                    
                    // Clicar no botão de próxima página
                    await page.evaluate(() => {
                        const nextButtons = document.querySelectorAll('a, button');
                        for (const button of nextButtons) {
                            const text = button.textContent?.toLowerCase().trim();
                            if (text && (text.includes('próxima') || text.includes('next') || text.includes('>') || text.includes('→'))) {
                                button.click();
                                return;
                            }
                        }
                    });
                    
                    await page.waitForLoadState('networkidle');
                    await page.waitForTimeout(3000);
                    currentPage++;
                } else {
                    console.log('📄 Não há mais páginas para processar');
                    hasMorePages = false;
                }
                
            } catch (paginationError) {
                console.log(`⚠️ Erro na paginação para página ${currentPage}:`, paginationError.message);
                console.log(`📄 Finalizando extração na página ${currentPage - 1}`);
                hasMorePages = false;
            }
        }
        
        console.log(`🎯 EXTRAÇÃO COMPLETA DA UNIDADE ${unit.code}! Total: ${allBoxesData.totalBoxes} boxes de ${currentPage} página(s)`);
        
        // Adicionar informações da unidade aos boxes
        const unitBoxes = allBoxesData.boxes.map(box => ({
            ...box,
            unitCode: unit.code,
            unitCity: unit.city,
            unitInternalCode: unit.internalCode
        }));
        
        return unitBoxes;
        
    } catch (error) {
        console.error(`❌ Erro durante a extração da unidade ${unit.code}:`, error);
        return []; // Retorna array vazio em caso de erro
    }
}

/**
 * Função principal que executa todo o processo
 */
async function main() {
    try {
        console.log('🎯 Iniciando processo completo: Prisma Box → Supabase');
        console.log('=' .repeat(50));
        
        // 1. Limpar dados existentes no Supabase antes de começar
        console.log('🧹 Limpando dados existentes no Supabase...');
        const clearResult = await clearBoxes();
        
        if (!clearResult.success) {
            console.error('❌ Erro ao limpar dados existentes:', clearResult.error);
            // Continuar mesmo assim
        } else {
            console.log('✅ Dados existentes limpos com sucesso');
        }
        
        // 2. Extrair dados do Prisma Box (agora com insert por unidade)
        const extractedData = await extractBoxesData();
        
        if (!extractedData.boxes || extractedData.boxes.length === 0) {
            console.log('⚠️  Nenhum box encontrado para processar');
            return;
        }
        
        console.log(`\n🎉 Processo concluído com sucesso!`);
        console.log(`📊 Resumo Geral:`);
        console.log(`   • Unidades processadas: ${extractedData.unitsProcessed}`);
        console.log(`   • Unidades bem-sucedidas: ${extractedData.successfulUnits}`);
        console.log(`   • Unidades que falharam: ${extractedData.failedUnits.length}`);
        console.log(`   • Total de boxes extraídos: ${extractedData.totalBoxes}`);
        console.log(`   • Data/hora: ${extractedData.extractedAt}`);
        
        // Mostrar logs detalhados por unidade
        if (extractedData.unitDetails && extractedData.unitDetails.length > 0) {
            console.log('\n📋 Detalhamento por Unidade:');
            console.log('='.repeat(60));
            extractedData.unitDetails.forEach((unit, index) => {
                console.log(`${index + 1}. ${unit.code} - ${unit.city}`);
                console.log(`   📦 Boxes extraídos: ${unit.boxesCount}`);
                console.log(`   📄 Páginas processadas: ${unit.pagesProcessed}`);
                console.log(`   ⏱️  Tempo de processamento: ${unit.processingTime || 'N/A'}`);
                console.log(`   💾 Status Supabase: ${unit.supabaseStatus || 'Salvo com sucesso'}`);
                console.log('');
            });
            console.log('='.repeat(60));
        }
        
        // 3. Mostrar estatísticas finais
        console.log('\n📈 Obtendo estatísticas finais...');
        const statsResult = await getBoxesStats();
        
        if (statsResult.success) {
            console.log('\n📋 Estatísticas dos boxes no Supabase:');
            console.log(`   • Total: ${statsResult.stats.total}`);
            console.log(`   • Disponíveis: ${statsResult.stats.disponivel || 0}`);
            console.log(`   • Ocupados: ${statsResult.stats.ocupado || 0}`);
            console.log(`   • Outros status: ${statsResult.stats.total - (statsResult.stats.disponivel || 0) - (statsResult.stats.ocupado || 0)}`);
        } else {
            console.log('⚠️ Erro ao obter estatísticas:', statsResult.error);
        }
        
        // 4. Fechar navegador no final do processo
        console.log('\n🔒 Fechando navegador...');
        if (extractedData.browser) {
            await extractedData.browser.close();
            console.log('✅ Navegador fechado com sucesso!');
        }
        
    } catch (error) {
        console.error('❌ Erro no processo principal:', error);
        throw error;
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