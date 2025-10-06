const { chromium } = require('playwright');

// Configurações do site
const CONFIG = {
    LOGIN_URL: 'https://app.prismabox.com.br/login',
    BOXES_URL: 'https://app.prismabox.com.br/box',
    CREDENTIALS: {
        email: 'leonardo.freire',
        password: 'Boxfacil145@'
    },
    // Seletores CSS - baseados na análise da estrutura real da página
    SELECTORS: {
        usernameInput: 'input[name="username"][required]',
        passwordInput: 'input[name="password"]',
        loginButton: 'button[type="submit"].btn.blue.btn-enter:not(.btn-block)',
        // Menu lateral
        boxesMenuLink: 'a[href*="/box"], a:has-text("Boxes")',
        // Seletores para a página de boxes - serão ajustados após análise
        boxesContainer: 'table, .table, [data-boxes-container]', // Container principal dos boxes
        boxItems: 'tr, .box-item, [data-box-item]', // Itens individuais dos boxes
        boxNumber: 'td:first-child, .box-number, [data-box-number]', // Número do box
        boxSize: 'td:nth-child(2), .box-size, [data-box-size]', // Tamanho do box
        boxStatus: 'td:nth-child(3), .box-status, [data-box-status]', // Status do box
        boxPrice: 'td:nth-child(4), .box-price, [data-box-price]', // Preço do box
        // Filtros
        statusFilter: 'select[name*="status"], select:has(option:has-text("DISPONÍVEL"))',
        availableOption: 'option:has-text("DISPONÍVEL"), option[value*="disponivel"]',
        filterButton: 'button:has-text("Filtrar"), button[type="submit"]',
        // Paginação
        paginationNext: 'a:has-text("Próximo"), a:has-text("Next"), .pagination .next',
        paginationContainer: '.pagination, [data-pagination]'
    }
};

/**
 * Função principal para buscar boxes disponíveis
 * @returns {Promise<Array>} Array com os boxes disponíveis
 */
async function buscarBoxesDisponiveis() {
    let browser = null;
    
    try {
        console.log('🚀 Iniciando automação...');
        
        // Inicializar o navegador
        browser = await chromium.launch({ 
            headless: false, // Para facilitar depuração
            slowMo: 1000 // Adiciona delay entre ações para melhor visualização
        });
        
        const page = await browser.newPage();
        
        // Configurar timeout padrão
        page.setDefaultTimeout(30000);
        
        console.log('🌐 Navegando para página de login...');
        await page.goto(CONFIG.LOGIN_URL);
        
        // Aguardar carregamento da página
        await page.waitForLoadState('networkidle');
        
        console.log('🔐 Realizando login...');
        
        // Aguardar que os campos estejam visíveis
        await page.waitForSelector(CONFIG.SELECTORS.usernameInput, { state: 'visible' });
        await page.waitForSelector(CONFIG.SELECTORS.passwordInput, { state: 'visible' });
        
        // Preencher credenciais
        await page.locator(CONFIG.SELECTORS.usernameInput).fill(CONFIG.CREDENTIALS.email);
        await page.locator(CONFIG.SELECTORS.passwordInput).fill(CONFIG.CREDENTIALS.password);
        
        // Aguardar que o botão esteja visível e clicável
        await page.waitForSelector(CONFIG.SELECTORS.loginButton, { state: 'visible' });
        
        // Clicar no botão de login
        await page.locator(CONFIG.SELECTORS.loginButton).click();
        
        // Aguardar redirecionamento após login
        await page.waitForNavigation();
        
        console.log('✅ Login realizado com sucesso!');
        
        // Lidar com modal de notificações
        console.log('🔔 Verificando modal de notificações...');
        try {
            // Aguardar o modal aparecer e clicar em "Não"
            await page.waitForSelector('button:has-text("Não")', { timeout: 5000 });
            await page.click('button:has-text("Não")');
            console.log('✅ Modal de notificações fechado');
            
            // Aguardar um pouco para o modal desaparecer
            await page.waitForTimeout(1000);
        } catch (error) {
            console.log('ℹ️ Modal de notificações não encontrado ou já fechado');
        }
        
        // Navegar para página de boxes
        console.log('📦 Navegando para página de boxes...');
        
        // Navegar diretamente para a URL de boxes (mais confiável)
        await page.goto(CONFIG.BOXES_URL);
        await page.waitForLoadState('networkidle');
        console.log('✅ Página de boxes carregada');
        
        console.log(`🌐 URL atual: ${page.url()}`);
        
        console.log('🔍 Aplicando filtro para boxes disponíveis...');
        
        // Aguardar carregamento da tabela de boxes
        await page.waitForSelector(CONFIG.SELECTORS.boxesContainer, { state: 'visible' });
        
        // Tentar aplicar filtro de status se disponível
        try {
            const statusFilter = page.locator(CONFIG.SELECTORS.statusFilter);
            if (await statusFilter.isVisible()) {
                console.log('📋 Filtro de status encontrado, aplicando...');
                await statusFilter.click();
                
                // Selecionar opção "DISPONÍVEL"
                const availableOption = page.locator(CONFIG.SELECTORS.availableOption);
                if (await availableOption.isVisible()) {
                    await availableOption.click();
                    
                    // Clicar no botão de filtrar se existir
                    const filterButton = page.locator(CONFIG.SELECTORS.filterButton);
                    if (await filterButton.isVisible()) {
                        await filterButton.click();
                        await page.waitForLoadState('networkidle');
                    }
                }
            } else {
                console.log('⚠️ Filtro de status não encontrado, extraindo todos os boxes...');
            }
        } catch (error) {
            console.log('⚠️ Erro ao aplicar filtro, continuando com extração completa:', error.message);
        }
        
        console.log('📊 Extraindo dados dos boxes...');
        
        const boxesDisponiveis = [];
        
        // Implementar extração de dados dos boxes
        let hasNextPage = true;
        let currentPage = 1;
        
        while (hasNextPage) {
            console.log(`📄 Processando página ${currentPage}...`);
            
            try {
                // Aguardar carregamento dos itens da tabela
                await page.waitForSelector(CONFIG.SELECTORS.boxItems, { timeout: 10000 });
                
                const boxItems = await page.locator(CONFIG.SELECTORS.boxItems).all();
                console.log(`📦 Encontrados ${boxItems.length} itens na página ${currentPage}`);
                
                for (let i = 0; i < boxItems.length; i++) {
                    const item = boxItems[i];
                    
                    try {
                        // Extrair dados de cada box
                        const numero = await item.locator(CONFIG.SELECTORS.boxNumber).innerText().catch(() => 'N/A');
                        const tamanho = await item.locator(CONFIG.SELECTORS.boxSize).innerText().catch(() => 'N/A');
                        const status = await item.locator(CONFIG.SELECTORS.boxStatus).innerText().catch(() => 'N/A');
                        const preco = await item.locator(CONFIG.SELECTORS.boxPrice).innerText().catch(() => 'N/A');
                        
                        // Verificar se está disponível (ignorando maiúsculas/minúsculas)
                        if (status.toLowerCase().includes('disponível') || 
                            status.toLowerCase().includes('disponivel') ||
                            status.toLowerCase().includes('available')) {
                            
                            boxesDisponiveis.push({
                                numero: numero.trim(),
                                tamanho: tamanho.trim(),
                                status: status.trim(),
                                preco: preco.trim(),
                                pagina: currentPage
                            });
                            
                            console.log(`✅ Box ${numero} - ${status} adicionado`);
                        }
                    } catch (itemError) {
                        console.log(`⚠️ Erro ao processar item ${i + 1}:`, itemError.message);
                    }
                }
                
                // Verificar se há próxima página
                const nextButton = page.locator(CONFIG.SELECTORS.paginationNext);
                const isNextButtonVisible = await nextButton.isVisible().catch(() => false);
                const isNextButtonEnabled = await nextButton.isEnabled().catch(() => false);
                
                if (isNextButtonVisible && isNextButtonEnabled) {
                    console.log(`➡️ Navegando para página ${currentPage + 1}...`);
                    await nextButton.click();
                    await page.waitForLoadState('networkidle');
                    currentPage++;
                } else {
                    hasNextPage = false;
                    console.log('📄 Última página processada');
                }
                
            } catch (pageError) {
                console.log(`❌ Erro ao processar página ${currentPage}:`, pageError.message);
                hasNextPage = false;
            }
        }
        
        console.log(`📋 Encontrados ${boxesDisponiveis.length} boxes disponíveis`);
        
        return boxesDisponiveis;
        
    } catch (error) {
        console.error('❌ Erro durante a execução:', error.message);
        throw error;
    } finally {
        // Garantir que o navegador seja fechado
        if (browser) {
            console.log('🔒 Fechando navegador...');
            await browser.close();
        }
    }
}

// Executar função principal
buscarBoxesDisponiveis()
    .then(boxes => {
        console.log('\n🎯 RESULTADO FINAL:');
        console.log('=====================================');
        
        if (boxes.length === 0) {
            console.log('❌ Nenhum box disponível encontrado.');
        } else {
            console.log(`✅ Total de boxes disponíveis: ${boxes.length}`);
            console.log('\n📦 BOXES DISPONÍVEIS:');
            console.log('=====================================');
            
            boxes.forEach((box, index) => {
                console.log(`\n${index + 1}. Box ${box.numero}`);
                console.log(`   Tamanho: ${box.tamanho}`);
                console.log(`   Status: ${box.status}`);
                console.log(`   Preço: ${box.preco}`);
                console.log(`   Página: ${box.pagina}`);
            });
        }
        
        console.log('\n=====================================');
        console.log('🏁 Processo finalizado com sucesso!');
    })
    .catch(error => {
        console.error('\n❌ ERRO DURANTE EXECUÇÃO:');
        console.error('=====================================');
        console.error(error.message);
        console.error('=====================================');
        process.exit(1);
    });

// Executar apenas se este arquivo for chamado diretamente
if (require.main === module) {
    // Código já executado acima
}

module.exports = {
    buscarBoxesDisponiveis,
    CONFIG
};