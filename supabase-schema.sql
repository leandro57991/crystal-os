-- ================================================================
--  Crystal OS — Schema para Supabase
--  Pegar en: supabase.com > tu proyecto > SQL Editor > New Query
--  Luego hacer clic en "Run"
-- ================================================================

-- Tablas (todas con almacenamiento JSONB para compatibilidad total)
CREATE TABLE IF NOT EXISTS cotizaciones    (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS clientes        (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS visitas         (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS proyectos       (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS reportes        (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS trabajadores    (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS asistencia      (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS cobros          (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS pagos           (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS inventario      (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS movimientos_inv (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS notificaciones  (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS recordatorios   (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS usuarios        (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS biblioteca      (id TEXT PRIMARY KEY, data JSONB NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS config          (key TEXT PRIMARY KEY, value TEXT, updated_at TIMESTAMPTZ DEFAULT NOW());

-- Habilitar acceso con la clave anon (herramienta interna)
ALTER TABLE cotizaciones    ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE visitas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE proyectos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE reportes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE trabajadores    ENABLE ROW LEVEL SECURITY;
ALTER TABLE asistencia      ENABLE ROW LEVEL SECURITY;
ALTER TABLE cobros          ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventario      ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inv ENABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE recordatorios   ENABLE ROW LEVEL SECURITY;
ALTER TABLE usuarios        ENABLE ROW LEVEL SECURITY;
ALTER TABLE biblioteca      ENABLE ROW LEVEL SECURITY;
ALTER TABLE config          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON cotizaciones    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON clientes        FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON visitas         FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON proyectos       FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON reportes        FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON trabajadores    FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON asistencia      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON cobros          FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON pagos           FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON inventario      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON movimientos_inv FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON notificaciones  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON recordatorios   FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON usuarios        FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON biblioteca      FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON config          FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
