-- ==============================================================================
-- COS PERSISTENT MEMORY & LEARNING ENGINE (SWARM & NEMOTRON)
-- Archivo: 03_agent_persistent_memory.sql
-- Fecha: 04 de Septiembre, 2026
-- Autoridad: Director Aldo Hilario / Aliun Travel SRL
-- Propósito: Base de datos de memoria persistente de 4 capas para aprendizaje
--            continuo, recuperación contextual y prevención de alucinaciones
--            en modelos Nvidia Nemotron y agentes del Swarm.
-- ==============================================================================

-- 1. Habilitar extensiones requeridas si están disponibles
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
DO $$ 
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector no disponible o permisos insuficientes, operando en modo búsqueda relacional/trigram';
END $$;

-- 2. Crear tabla principal: agent_persistent_memory
CREATE TABLE IF NOT EXISTS public.agent_persistent_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Identidad del agente y propiedad
  agente_id UUID REFERENCES public.personal_ia(id) ON DELETE SET NULL,
  nombre_agente VARCHAR(100) NOT NULL,
  
  -- Capa cognitiva de memoria
  -- 'episodic': Casos y conversaciones pasadas de leads/clientes
  -- 'semantic': Hechos verificados, reglas de negocio y políticas
  -- 'procedural': Cómo usar herramientas/RPCs y pasos de flujos
  -- 'reflection_learning': Lecciones aprendidas, correcciones de QA y anti-patrones
  layer VARCHAR(50) NOT NULL CHECK (layer IN ('episodic', 'semantic', 'procedural', 'reflection_learning')),
  
  -- Patrón disparador (Trigger Context): Qué situación detona este recuerdo
  trigger_pattern TEXT NOT NULL,
  
  -- Contenido principal de la memoria (Instrucción imperativa y directa)
  lesson_or_knowledge TEXT NOT NULL,
  
  -- Anti-patrón: Lo que el modelo NO DEBE HACER bajo ningún concepto
  anti_pattern TEXT,
  
  -- Contexto estructurado en JSONB para filtros precisos (hotel_id, currency, room_type, etc.)
  structured_context JSONB DEFAULT '{}'::jsonb,
  
  -- Puntuación de importancia (0.0 a 1.0) para ordenamiento en context window
  importance_score REAL DEFAULT 0.80 CHECK (importance_score >= 0.0 AND importance_score <= 1.0),
  
  -- Evidencia de origen (ID de incidente, commit, número de ticket, directiva)
  source_evidence VARCHAR(255),
  
  -- Ciclo de vida del recuerdo
  status VARCHAR(50) DEFAULT 'active' CHECK (status IN ('active', 'in_review', 'superseded', 'archived')),
  
  -- Autoridad que validó el recuerdo
  validated_by VARCHAR(100) DEFAULT 'DIRECTOR',
  
  -- Métricas de uso y frescura
  access_count INTEGER DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Índices de alta velocidad para recuperación en tiempo real
CREATE INDEX IF NOT EXISTS idx_apm_nombre_agente ON public.agent_persistent_memory(nombre_agente);
CREATE INDEX IF NOT EXISTS idx_apm_layer ON public.agent_persistent_memory(layer);
CREATE INDEX IF NOT EXISTS idx_apm_status ON public.agent_persistent_memory(status);
CREATE INDEX IF NOT EXISTS idx_apm_importance ON public.agent_persistent_memory(importance_score DESC);
CREATE INDEX IF NOT EXISTS idx_apm_trigger_trgm ON public.agent_persistent_memory USING gin(trigger_pattern gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_apm_context_gin ON public.agent_persistent_memory USING gin(structured_context);

-- 4. Función RPC: get_agent_context_memories (Inyección directa al Prompt del LLM)
-- Permite al runtime de Nemotron o al middleware de OpenRouter obtener un bloque
-- formateado en Markdown listo para inyectar en <PERSISTENT_MEMORY_INJECTION>
CREATE OR REPLACE FUNCTION public.get_agent_context_memories(
  p_nombre_agente VARCHAR,
  p_query_context TEXT,
  p_limit INTEGER DEFAULT 5
)
RETURNS TABLE (
  id UUID,
  layer VARCHAR,
  trigger_pattern TEXT,
  lesson_or_knowledge TEXT,
  anti_pattern TEXT,
  importance_score REAL,
  prompt_markdown TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Actualizar estadísticas de acceso para las memorias recuperadas
  UPDATE public.agent_persistent_memory apm
  SET 
    access_count = apm.access_count + 1,
    last_accessed_at = now()
  WHERE apm.status = 'active'
    AND (apm.nombre_agente = p_nombre_agente OR apm.nombre_agente = 'ALL')
    AND (p_query_context ILIKE '%' || apm.trigger_pattern || '%' OR apm.trigger_pattern ILIKE '%' || p_query_context || '%');

  RETURN QUERY
  SELECT 
    apm.id,
    apm.layer,
    apm.trigger_pattern,
    apm.lesson_or_knowledge,
    apm.anti_pattern,
    apm.importance_score,
    format(
      E'[%s | Score: %s | Validado: %s]\n- REGLA/CONOCIMIENTO: %s\n%s',
      upper(apm.layer),
      round(apm.importance_score::numeric, 2)::text,
      apm.validated_by,
      apm.lesson_or_knowledge,
      CASE 
        WHEN apm.anti_pattern IS NOT NULL AND apm.anti_pattern <> '' 
        THEN format(E'- ANTI-PATRÓN (PROHIBIDO): %s\n', apm.anti_pattern)
        ELSE ''
      END
    ) AS prompt_markdown
  FROM public.agent_persistent_memory apm
  WHERE apm.status = 'active'
    AND (apm.nombre_agente = p_nombre_agente OR apm.nombre_agente = 'ALL')
  ORDER BY apm.importance_score DESC, apm.created_at DESC
  LIMIT p_limit;
END;
$$;

-- 5. Función RPC: record_agent_learning (Inserción rápida desde QA/Director/Agente)
CREATE OR REPLACE FUNCTION public.record_agent_learning(
  p_nombre_agente VARCHAR,
  p_layer VARCHAR,
  p_trigger_pattern TEXT,
  p_lesson_or_knowledge TEXT,
  p_anti_pattern TEXT DEFAULT NULL,
  p_structured_context JSONB DEFAULT '{}'::jsonb,
  p_importance_score REAL DEFAULT 0.85,
  p_source_evidence VARCHAR DEFAULT 'DIRECTOR_DIRECTIVE',
  p_validated_by VARCHAR DEFAULT 'DIRECTOR'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_id UUID;
  v_agente_id UUID;
BEGIN
  -- Buscar UUID del agente si existe en personal_ia
  SELECT id INTO v_agente_id 
  FROM public.personal_ia 
  WHERE nombre_agente = p_nombre_agente 
  LIMIT 1;

  INSERT INTO public.agent_persistent_memory (
    agente_id,
    nombre_agente,
    layer,
    trigger_pattern,
    lesson_or_knowledge,
    anti_pattern,
    structured_context,
    importance_score,
    source_evidence,
    status,
    validated_by,
    created_at,
    updated_at
  ) VALUES (
    v_agente_id,
    p_nombre_agente,
    p_layer,
    p_trigger_pattern,
    p_lesson_or_knowledge,
    p_anti_pattern,
    p_structured_context,
    p_importance_score,
    p_source_evidence,
    'active',
    p_validated_by,
    now(),
    now()
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

-- 6. Semilla Inicial: Reglas Canónicas Invariantes (Financial & Operational)
INSERT INTO public.agent_persistent_memory (
  nombre_agente,
  layer,
  trigger_pattern,
  lesson_or_knowledge,
  anti_pattern,
  structured_context,
  importance_score,
  source_evidence,
  status,
  validated_by
) VALUES
(
  'ALL',
  'reflection_learning',
  'cotizacion_moneda_precio',
  'Toda cotización debe explicitar claramente la divisa. Si se cotiza en DOP, incluir equivalencia informativa en USD y tipo de cambio.',
  'PROHIBIDO mezclar tarifas en DOP con simbología USD ($ sin prefijo DOP). Nunca asumir paridad 1:1.',
  '{"domain": "financial", "rule": "FIN-ID-001"}'::jsonb,
  1.00,
  'INC-FIN-001 / Directiva Director 04-Sep-2026',
  'active',
  'DIRECTOR'
),
(
  'cotizador',
  'semantic',
  'ocupacion_habitacion_ninos',
  'Verificar la ocupación máxima por categoría de habitación antes de emitir precio. Explicar suplementos por edades de niños.',
  'NO cotizar habitaciones estándar para grupos que excedan el aforo permitido por el hotel.',
  '{"domain": "product", "target": "rooms"}'::jsonb,
  0.95,
  'KNOWLEDGE-CANON-001',
  'active',
  'DIRECTOR'
),
(
  'vendedor',
  'procedural',
  'etapas_pipeline_ventas',
  'Avanzar el lead en el CRM (Kommo/Chatwoot) al enviar cotización formal y registrar actividad de seguimiento T+2h.',
  'NO dejar leads en estado inicial tras haber emitido propuesta formal.',
  '{"domain": "sales", "pipeline": "kommo"}'::jsonb,
  0.90,
  'MATRIZ-MODELOS-SWARM-v1',
  'active',
  'DIRECTOR'
);

-- 7. Configuración de Seguridad (RLS)
ALTER TABLE public.agent_persistent_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service_role full access on agent_persistent_memory"
  ON public.agent_persistent_memory
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public/anon read on agent_persistent_memory"
  ON public.agent_persistent_memory
  FOR SELECT
  TO anon, authenticated
  USING (status = 'active');
