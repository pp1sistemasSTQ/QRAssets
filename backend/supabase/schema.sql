-- 1. Habilitar extensión UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Tabla de Personas / Custodios de equipos
CREATE TABLE IF NOT EXISTS public.personas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    documento_identidad VARCHAR(20) UNIQUE NOT NULL,
    nombre_completo VARCHAR(150) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    cargo VARCHAR(100),
    lugar_expedicion VARCHAR(100),
    area_departamento VARCHAR(100),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS cargo VARCHAR(100);
ALTER TABLE public.personas ADD COLUMN IF NOT EXISTS lugar_expedicion VARCHAR(100);

-- 3. Tabla de Activos Tecnológicos (Laptops, cargadores, accesorios)
CREATE TABLE IF NOT EXISTS public.activos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codigo_qr VARCHAR(100) UNIQUE NOT NULL, -- Identificador único impreso en QR
    nombre VARCHAR(150) NOT NULL,
    categoria VARCHAR(50) NOT NULL DEFAULT 'Laptop', -- Laptop, Cargador, Accesorio[cite: 1]
    numero_serial VARCHAR(100) NOT NULL DEFAULT 'N/A',
    detalles_tecnicos JSONB DEFAULT '{}'::jsonb,
    estado VARCHAR(30) NOT NULL DEFAULT 'disponible', -- disponible, asignado, en_mantenimiento[cite: 1]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.activos
    ADD COLUMN IF NOT EXISTS numero_serial VARCHAR(100) NOT NULL DEFAULT 'N/A';

CREATE TABLE IF NOT EXISTS public.contadores_codigo_activo (
    tipo_codigo VARCHAR(10) PRIMARY KEY,
    ultimo_numero BIGINT NOT NULL DEFAULT 0 CHECK (ultimo_numero >= 0)
);
ALTER TABLE public.contadores_codigo_activo ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.generar_codigo_qr_activo()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    tipo TEXT;
    max_existente BIGINT;
    consecutivo BIGINT;
BEGIN
    IF NEW.codigo_qr IS NOT NULL AND btrim(NEW.codigo_qr) <> '' THEN
        RETURN NEW;
    END IF;

    tipo := CASE lower(btrim(NEW.categoria))
        WHEN 'laptop' THEN 'P'
        WHEN 'portátil' THEN 'P'
        WHEN 'portatil' THEN 'P'
        WHEN 'cargador' THEN 'C'
        WHEN 'base refrigerante' THEN 'B'
        WHEN 'mouse' THEN 'M'
        WHEN 'teclado' THEN 'T'
        WHEN 'micrófono' THEN 'MIC'
        WHEN 'microfono' THEN 'MIC'
        WHEN 'monitor' THEN 'MON'
        WHEN 'celular' THEN 'CEL'
        WHEN 'accesorio' THEN 'ACC'
        ELSE 'OTR'
    END;

    SELECT COALESCE(
        MAX((regexp_match(a.codigo_qr, '^STQ_' || tipo || '_([0-9]+)$'))[1]::BIGINT),
        0
    ) INTO max_existente
    FROM public.activos AS a;

    INSERT INTO public.contadores_codigo_activo (tipo_codigo, ultimo_numero)
    VALUES (tipo, max_existente + 1)
    ON CONFLICT (tipo_codigo) DO UPDATE
        SET ultimo_numero = GREATEST(
            public.contadores_codigo_activo.ultimo_numero,
            max_existente
        ) + 1
    RETURNING ultimo_numero INTO consecutivo;

    NEW.codigo_qr := 'STQ_' || tipo || '_' || lpad(consecutivo::TEXT, 3, '0');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generar_codigo_qr_activo ON public.activos;
CREATE TRIGGER trg_generar_codigo_qr_activo
BEFORE INSERT ON public.activos
FOR EACH ROW
EXECUTE FUNCTION public.generar_codigo_qr_activo();

-- 4. Tabla de Actas (Entrega y Devolución)[cite: 1]
CREATE TABLE IF NOT EXISTS public.actas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    tipo VARCHAR(20) NOT NULL, -- 'entrega' o 'devolucion'[cite: 1]
    persona_id UUID REFERENCES public.personas(id) ON DELETE RESTRICT,
    firma_url TEXT, -- Enlace a la firma digital escaneada/subida[cite: 1]
    acta_pdf_url TEXT, -- Enlace al documento PDF firmado[cite: 1]
    estado VARCHAR(20) NOT NULL DEFAULT 'abierta', -- 'abierta', 'cerrada'[cite: 1]
    observaciones TEXT,
    ciudad VARCHAR(100) NOT NULL DEFAULT 'MEDELLIN',
    fecha_proceso TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE public.actas ADD COLUMN IF NOT EXISTS ciudad VARCHAR(100) NOT NULL DEFAULT 'MEDELLIN';

-- 5. Tabla Relacional Acta <-> Activos (Detalle de entrega/devolución)[cite: 1]
CREATE TABLE IF NOT EXISTS public.acta_detalles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    acta_id UUID REFERENCES public.actas(id) ON DELETE CASCADE,
    activo_id UUID REFERENCES public.activos(id) ON DELETE RESTRICT,
    estado_item VARCHAR(30) NOT NULL -- 'entregado', 'devuelto'[cite: 1]
);

-- ====================================================================
-- AUTOMATIZACIÓN EN TIEMPO REAL (TRIGGERS)
-- ====================================================================

-- Función para cambiar el estado del activo al cerrar un acta[cite: 1]
CREATE OR REPLACE FUNCTION actualizar_estado_activo_transaccion()
RETURNS TRIGGER AS $$
BEGIN
    -- Si el acta se cierra y es de tipo 'entrega', pasa a 'asignado'[cite: 1]
    IF NEW.estado = 'cerrada' AND NEW.tipo = 'entrega' THEN
        UPDATE public.activos
        SET estado = 'asignado'
        WHERE id IN (SELECT activo_id FROM public.acta_detalles WHERE acta_id = NEW.id);
        
    -- Si el acta se cierra y es de tipo 'devolucion', vuelve a 'disponible' en tiempo real[cite: 1]
    ELSIF NEW.estado = 'cerrada' AND NEW.tipo = 'devolucion' THEN
        UPDATE public.activos
        SET estado = 'disponible'
        WHERE id IN (SELECT activo_id FROM public.acta_detalles WHERE acta_id = NEW.id);
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger sobre la tabla actas
CREATE OR REPLACE TRIGGER trg_actualizar_estado_activo
AFTER UPDATE OF estado ON public.actas
FOR EACH ROW
WHEN (OLD.estado IS DISTINCT FROM NEW.estado)
EXECUTE FUNCTION actualizar_estado_activo_transaccion();

-- RPCs para completar cada movimiento y activar el trigger dentro de una transacción.
CREATE OR REPLACE FUNCTION public.registrar_entrega(
    p_persona_id UUID,
    p_activo_ids UUID[],
    p_ciudad TEXT,
    p_observaciones TEXT
)
RETURNS UUID AS $$
DECLARE
    nuevo_acta_id UUID;
BEGIN
    IF p_activo_ids IS NULL OR cardinality(p_activo_ids) = 0 THEN
        RAISE EXCEPTION 'Selecciona al menos un activo';
    END IF;

    PERFORM id FROM public.activos
    WHERE id = ANY(p_activo_ids)
    ORDER BY id
    FOR UPDATE;

    IF (
        SELECT count(DISTINCT solicitado.activo_id)
        FROM unnest(p_activo_ids) AS solicitado(activo_id)
    ) <> cardinality(p_activo_ids) THEN
        RAISE EXCEPTION 'La lista contiene activos duplicados';
    END IF;

    IF (SELECT count(*) FROM public.activos WHERE id = ANY(p_activo_ids)) <> cardinality(p_activo_ids)
       OR EXISTS (
           SELECT 1 FROM public.activos
           WHERE id = ANY(p_activo_ids) AND estado <> 'disponible'
       ) THEN
        RAISE EXCEPTION 'Uno o más activos ya no están disponibles';
    END IF;

    INSERT INTO public.actas (tipo, persona_id, estado, ciudad, observaciones)
    VALUES ('entrega', p_persona_id, 'abierta', p_ciudad, p_observaciones)
    RETURNING id INTO nuevo_acta_id;

    INSERT INTO public.acta_detalles (acta_id, activo_id, estado_item)
    SELECT nuevo_acta_id, solicitado.activo_id, 'entregado'
    FROM unnest(p_activo_ids) AS solicitado(activo_id);

    UPDATE public.actas SET estado = 'cerrada' WHERE id = nuevo_acta_id;
    RETURN nuevo_acta_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.registrar_devolucion(
    p_persona_id UUID,
    p_activo_ids UUID[],
    p_ciudad TEXT,
    p_observaciones TEXT
)
RETURNS UUID AS $$
DECLARE
    nuevo_acta_id UUID;
BEGIN
    IF p_activo_ids IS NULL OR cardinality(p_activo_ids) = 0 THEN
        RAISE EXCEPTION 'Selecciona al menos un activo';
    END IF;

    PERFORM id FROM public.activos
    WHERE id = ANY(p_activo_ids)
    ORDER BY id
    FOR UPDATE;

    IF (
        SELECT count(DISTINCT solicitado.activo_id)
        FROM unnest(p_activo_ids) AS solicitado(activo_id)
    ) <> cardinality(p_activo_ids) THEN
        RAISE EXCEPTION 'La lista contiene activos duplicados';
    END IF;

    IF (SELECT count(*) FROM public.activos WHERE id = ANY(p_activo_ids) AND estado = 'asignado')
       <> cardinality(p_activo_ids) OR EXISTS (
           SELECT 1
           FROM unnest(p_activo_ids) AS solicitado(activo_id)
           WHERE NOT EXISTS (
               SELECT 1
               FROM public.actas entrega
               JOIN public.acta_detalles detalle ON detalle.acta_id = entrega.id
               WHERE entrega.tipo = 'entrega'
                 AND entrega.estado = 'cerrada'
                 AND entrega.persona_id = p_persona_id
                 AND detalle.activo_id = solicitado.activo_id
                 AND NOT EXISTS (
                     SELECT 1
                     FROM public.actas devolucion
                     JOIN public.acta_detalles detalle_devolucion
                       ON detalle_devolucion.acta_id = devolucion.id
                     WHERE devolucion.tipo = 'devolucion'
                       AND devolucion.estado = 'cerrada'
                       AND devolucion.persona_id = p_persona_id
                       AND detalle_devolucion.activo_id = solicitado.activo_id
                       AND devolucion.fecha_proceso >= entrega.fecha_proceso
                 )
           )
       ) THEN
        RAISE EXCEPTION 'Uno o más activos no están asignados a esta persona';
    END IF;

    INSERT INTO public.actas (tipo, persona_id, estado, ciudad, observaciones)
    VALUES ('devolucion', p_persona_id, 'abierta', p_ciudad, p_observaciones)
    RETURNING id INTO nuevo_acta_id;

    INSERT INTO public.acta_detalles (acta_id, activo_id, estado_item)
    SELECT nuevo_acta_id, solicitado.activo_id, 'devuelto'
    FROM unnest(p_activo_ids) AS solicitado(activo_id);

    UPDATE public.actas SET estado = 'cerrada' WHERE id = nuevo_acta_id;
    RETURN nuevo_acta_id;
END;
$$ LANGUAGE plpgsql;

-- ====================================================================
-- SEGURIDAD (Row Level Security - RLS)
-- ====================================================================
ALTER TABLE public.personas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.actas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acta_detalles ENABLE ROW LEVEL SECURITY;

-- Políticas de acceso para consumo desde la app en React
DROP POLICY IF EXISTS "Acceso público lectura personas" ON public.personas;
CREATE POLICY "Acceso público lectura personas" ON public.personas FOR SELECT USING (true);
DROP POLICY IF EXISTS "Acceso público escritura personas" ON public.personas;
CREATE POLICY "Acceso público escritura personas" ON public.personas FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Acceso público actualización personas" ON public.personas;
CREATE POLICY "Acceso público actualización personas" ON public.personas
    FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Acceso público lectura activos" ON public.activos;
CREATE POLICY "Acceso público lectura activos" ON public.activos FOR SELECT USING (true);
DROP POLICY IF EXISTS "Acceso público gestión activos" ON public.activos;
CREATE POLICY "Acceso público gestión activos" ON public.activos FOR ALL USING (true);

DROP POLICY IF EXISTS "Acceso público lectura actas" ON public.actas;
CREATE POLICY "Acceso público lectura actas" ON public.actas FOR SELECT USING (true);
DROP POLICY IF EXISTS "Acceso público gestión actas" ON public.actas;
CREATE POLICY "Acceso público gestión actas" ON public.actas FOR ALL USING (true);

DROP POLICY IF EXISTS "Acceso público detalles actas" ON public.acta_detalles;
CREATE POLICY "Acceso público detalles actas" ON public.acta_detalles FOR ALL USING (true);