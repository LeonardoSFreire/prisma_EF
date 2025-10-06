require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Configuração do cliente Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY; // Usando service key para operações de escrita

if (!supabaseUrl || !supabaseKey) {
    throw new Error('Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_KEY são obrigatórias');
}

// Criar cliente Supabase
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Inserir dados de boxes no Supabase
 * @param {Array} boxesData - Array com os dados dos boxes extraídos
 * @returns {Object} Resultado da operação
 */
async function insertBoxes(boxesData) {
    try {
        console.log(`Iniciando inserção de ${boxesData.length} boxes no Supabase...`);
        
        // Mapear os dados para o formato da tabela
        const mappedData = boxesData.map(box => {
            // Função para extrair números de strings de medidas
            const extractNumber = (str) => {
                if (!str) return 0;
                const match = str.match(/(\d+(?:,\d+)?)/);
                if (match) {
                    const num = parseFloat(match[1].replace(',', '.'));
                    // Limitar a 99999.99 para evitar overflow no DECIMAL(10,2)
                    return Math.min(num, 99999.99);
                }
                return 0;
            };

            return {
                box_number: box.boxNumber || '',
                status: box.status || '',
                location_full: box.location?.full || '',
                location_access: box.location?.access || '',
                type_name: box.type?.name || '',
                type_full: box.type?.full || '',
                dimensions: box.type?.dimensions || '',
                area_m2: extractNumber(box.measurements?.m2),
                volume_m3: extractNumber(box.measurements?.m3),
                price_monthly: box.pricing?.monthly || '',
                price_per_m3: box.pricing?.perM3 || '',
                price_daily: box.pricing?.daily || '',
                access_control: box.accessControl || '',
                localidade: box.localidade || '',
                extracted_at: new Date().toISOString()
            };
        });

        // Inserir dados no Supabase
        const { data, error } = await supabase
            .from('boxes')
            .insert(mappedData)
            .select();

        if (error) {
            throw error;
        }

        console.log(`✅ Sucesso! ${data.length} boxes inseridos no Supabase`);
        return {
            success: true,
            data: data,
            count: data.length
        };

    } catch (error) {
        console.error('❌ Erro ao inserir boxes no Supabase:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Limpar dados de uma base específica
 * @param {string} localidade - Localidade/base a ser limpa
 * @returns {Object} Resultado da operação
 */
async function clearBoxesByLocalidade(localidade) {
    try {
        console.log(`Limpando dados da base: ${localidade}...`);
        
        const { error } = await supabase
            .from('boxes')
            .delete()
            .eq('localidade', localidade);

        if (error) {
            throw error;
        }

        console.log(`✅ Dados da base ${localidade} limpos com sucesso`);
        return { success: true };

    } catch (error) {
        console.error(`❌ Erro ao limpar dados da base ${localidade}:`, error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Limpar todos os dados da tabela boxes
 * @returns {Object} Resultado da operação
 */
async function clearBoxes() {
    try {
        console.log('Limpando dados existentes da tabela boxes...');
        
        const { error } = await supabase
            .from('boxes')
            .delete()
            .neq('id', 0); // Deletar todos os registros

        if (error) {
            throw error;
        }

        console.log('✅ Tabela boxes limpa com sucesso');
        return { success: true };

    } catch (error) {
        console.error('❌ Erro ao limpar tabela boxes:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Buscar boxes por status
 * @param {string} status - Status dos boxes a buscar
 * @returns {Object} Resultado da consulta
 */
async function getBoxesByStatus(status = 'DISPONÍVEL') {
    try {
        const { data, error } = await supabase
            .from('boxes')
            .select('*')
            .eq('status', status)
            .order('box_number');

        if (error) {
            throw error;
        }

        return {
            success: true,
            data: data,
            count: data.length
        };

    } catch (error) {
        console.error('❌ Erro ao buscar boxes:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * Obter estatísticas dos boxes
 * @returns {Object} Estatísticas dos boxes
 */
async function getBoxesStats() {
    try {
        const { data, error } = await supabase
            .from('boxes')
            .select('status, type_name')
            .order('status');

        if (error) {
            throw error;
        }

        // Calcular estatísticas
        const stats = {
            total: data.length,
            byStatus: {},
            byType: {}
        };

        data.forEach(box => {
            // Por status
            stats.byStatus[box.status] = (stats.byStatus[box.status] || 0) + 1;
            
            // Por tipo
            if (box.type_name) {
                stats.byType[box.type_name] = (stats.byType[box.type_name] || 0) + 1;
            }
        });

        return {
            success: true,
            stats: stats
        };

    } catch (error) {
        console.error('❌ Erro ao obter estatísticas:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

module.exports = {
    supabase,
    insertBoxes,
    clearBoxes,
    clearBoxesByLocalidade,
    getBoxesByStatus,
    getBoxesStats
};