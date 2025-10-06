-- Script SQL para criar a tabela de boxes no Supabase
-- Execute este script no SQL Editor do Supabase Dashboard

-- Criar tabela principal de boxes
CREATE TABLE IF NOT EXISTS boxes (
    id SERIAL PRIMARY KEY,
    
    -- Informações básicas
    box_number VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL,
    
    -- Localização
    location_full TEXT,
    location_access VARCHAR(100),
    location_floor VARCHAR(50),
    location_sector VARCHAR(50),
    location_corridor VARCHAR(50),
    
    -- Tipo e dimensões
    type_name VARCHAR(100),
    type_full TEXT,
    dimensions VARCHAR(50),
    
    -- Medidas
    area_m2 DECIMAL(10,2),
    volume_m3 DECIMAL(10,2),
    
    -- Preços
    price_monthly VARCHAR(20),
    price_per_m3 VARCHAR(20),
    price_daily VARCHAR(20),
    
    -- Controle de acesso
    access_control TEXT,
    
    -- Localidade/Base de origem
    localidade VARCHAR(100),
    
    -- Metadados
    extracted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_boxes_status ON boxes(status);
CREATE INDEX IF NOT EXISTS idx_boxes_box_number ON boxes(box_number);
CREATE INDEX IF NOT EXISTS idx_boxes_type_name ON boxes(type_name);
CREATE INDEX IF NOT EXISTS idx_boxes_location_access ON boxes(location_access);
CREATE INDEX IF NOT EXISTS idx_boxes_localidade ON boxes(localidade);
CREATE INDEX IF NOT EXISTS idx_boxes_extracted_at ON boxes(extracted_at);

-- Criar função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Criar trigger para atualizar updated_at
DROP TRIGGER IF EXISTS update_boxes_updated_at ON boxes;
CREATE TRIGGER update_boxes_updated_at
    BEFORE UPDATE ON boxes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Comentários na tabela
COMMENT ON TABLE boxes IS 'Tabela para armazenar informações dos boxes extraídos do Prisma Box';
COMMENT ON COLUMN boxes.box_number IS 'Número identificador do box';
COMMENT ON COLUMN boxes.status IS 'Status do box (DISPONÍVEL, LOCADO, BLOQUEADO, etc.)';
COMMENT ON COLUMN boxes.location_full IS 'Localização completa do box';
COMMENT ON COLUMN boxes.type_name IS 'Nome do tipo do box';
COMMENT ON COLUMN boxes.dimensions IS 'Dimensões do box (ex: 1 x 0.8 x 0.8)';
COMMENT ON COLUMN boxes.area_m2 IS 'Área em metros quadrados';
COMMENT ON COLUMN boxes.volume_m3 IS 'Volume em metros cúbicos';
COMMENT ON COLUMN boxes.extracted_at IS 'Data e hora da extração dos dados';