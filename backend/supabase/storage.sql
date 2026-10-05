-- Insertar Buckets de Storage
INSERT INTO storage.buckets (id, name, public) 
VALUES ('firmas', 'firmas', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public) 
VALUES ('actas_respaldos', 'actas_respaldos', true)
ON CONFLICT (id) DO NOTHING;

-- Políticas para subir y consultar firmas y actas en PDF
DROP POLICY IF EXISTS "Permitir subida de firmas" ON storage.objects;
CREATE POLICY "Permitir subida de firmas" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'firmas');

DROP POLICY IF EXISTS "Permitir lectura de firmas" ON storage.objects;
CREATE POLICY "Permitir lectura de firmas" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'firmas');

DROP POLICY IF EXISTS "Permitir subida de respaldos actas" ON storage.objects;
CREATE POLICY "Permitir subida de respaldos actas" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'actas_respaldos');

DROP POLICY IF EXISTS "Permitir lectura de respaldos actas" ON storage.objects;
CREATE POLICY "Permitir lectura de respaldos actas" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'actas_respaldos');