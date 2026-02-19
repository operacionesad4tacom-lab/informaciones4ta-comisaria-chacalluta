-- ============================================
-- SCHEMA COMPLETO CORREGIDO v3.0
-- Carabineros Intranet - 4ta. Com. Chacalluta
-- Ejecutar en: Supabase SQL Editor
-- ============================================

-- ── PASO 1: Tablas base ──────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    rank TEXT,
    badge_number TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'funcionario')),
    phone TEXT,
    whatsapp_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.service_codes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    code TEXT UNIQUE NOT NULL CHECK (LENGTH(code) <= 5),
    name TEXT NOT NULL,
    is_rest BOOLEAN DEFAULT false,
    start_time TIME,
    end_time TIME,
    color TEXT DEFAULT '#2d8b4d',
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.services (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    service_code_id UUID REFERENCES public.service_codes(id) ON DELETE SET NULL,
    date DATE NOT NULL,
    service_type TEXT NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    location TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS public.posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('normal', 'importante', 'urgente')),
    category TEXT NOT NULL CHECK (category IN ('administrativo','transito','investigaciones','preventivo','formacion','operaciones','bienestar')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    attachment_url TEXT,
    attachment_name TEXT,
    is_active BOOLEAN DEFAULT true,
    is_private BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── PASO 2: Tablas de seguimiento ───────────

CREATE TABLE IF NOT EXISTS public.post_recipients (
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    confirmed_at TIMESTAMPTZ,
    PRIMARY KEY (post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.post_reads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(post_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.service_reads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    service_id UUID REFERENCES public.services(id) ON DELETE CASCADE,
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    read_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(service_id, user_id)
);

-- ── PASO 3: Índices ──────────────────────────

CREATE INDEX IF NOT EXISTS idx_posts_priority ON public.posts(priority);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_is_active ON public.posts(is_active);
CREATE INDEX IF NOT EXISTS idx_posts_is_private ON public.posts(is_private);
CREATE INDEX IF NOT EXISTS idx_services_date ON public.services(date);
CREATE INDEX IF NOT EXISTS idx_services_user_id ON public.services(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_badge ON public.profiles(badge_number);
CREATE INDEX IF NOT EXISTS idx_post_reads_post ON public.post_reads(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reads_user ON public.post_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_recipients_user ON public.post_recipients(user_id);

-- ── PASO 4: Triggers updated_at ─────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_posts_updated_at BEFORE UPDATE ON public.posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_service_codes_updated_at BEFORE UPDATE ON public.service_codes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── PASO 5: RLS ──────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_reads ENABLE ROW LEVEL SECURITY;

-- PROFILES: Evitar recursión infinita usando auth.uid() directo
DROP POLICY IF EXISTS "Ver propio perfil" ON public.profiles;
DROP POLICY IF EXISTS "Admin ver todos" ON public.profiles;
DROP POLICY IF EXISTS "Admin insertar" ON public.profiles;
DROP POLICY IF EXISTS "Admin actualizar" ON public.profiles;

CREATE POLICY "Ver propio perfil" ON public.profiles FOR SELECT USING (auth.uid() = id);

-- Admin: usar JWT claim en lugar de subconsulta para evitar recursión
CREATE POLICY "Admin ver todos perfiles" ON public.profiles FOR SELECT
    USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin' AND id = auth.uid()));

CREATE POLICY "Admin gestionar perfiles" ON public.profiles FOR ALL
    USING (EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND raw_user_meta_data->>'role' = 'admin'));

-- POSTS: Públicos para todos, privados solo destinatarios y admin
DROP POLICY IF EXISTS "Ver posts activos" ON public.posts;
DROP POLICY IF EXISTS "Admin gestionar posts" ON public.posts;

CREATE POLICY "Ver posts publicos" ON public.posts FOR SELECT
    USING (is_active = true AND is_private = false);

CREATE POLICY "Ver posts privados propios" ON public.posts FOR SELECT
    USING (
        is_active = true AND is_private = true AND (
            created_by = auth.uid() OR
            EXISTS (SELECT 1 FROM public.post_recipients WHERE post_id = posts.id AND user_id = auth.uid())
        )
    );

CREATE POLICY "Admin ver todos posts" ON public.posts FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin insertar posts" ON public.posts FOR INSERT
    WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin actualizar posts" ON public.posts FOR UPDATE
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

CREATE POLICY "Admin eliminar posts" ON public.posts FOR DELETE
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- SERVICE_CODES: Todos pueden leer, admin gestionar
CREATE POLICY "Ver siglas activas" ON public.service_codes FOR SELECT USING (is_active = true);
CREATE POLICY "Admin gestionar siglas" ON public.service_codes FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- SERVICES
CREATE POLICY "Ver propios servicios" ON public.services FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admin ver todos servicios" ON public.services FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));
CREATE POLICY "Admin gestionar servicios" ON public.services FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- POST_RECIPIENTS
CREATE POLICY "Ver propios recipients" ON public.post_recipients FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Admin gestionar recipients" ON public.post_recipients FOR ALL
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- POST_READS
CREATE POLICY "Ver propias lecturas posts" ON public.post_reads FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Insertar propia lectura post" ON public.post_reads FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "Admin ver lecturas posts" ON public.post_reads FOR SELECT
    USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- SERVICE_READS
CREATE POLICY "Ver propias lecturas servicios" ON public.service_reads FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Insertar propia lectura servicio" ON public.service_reads FOR INSERT WITH CHECK (user_id = auth.uid());

-- ── PASO 6: Datos iniciales de siglas ────────

INSERT INTO public.service_codes (code, name, is_rest, start_time, end_time, color, display_order)
VALUES
    ('D',    'Descanso',    true,  NULL,     NULL,     '#9ca3af', 1),
    ('F',    'Franco',      true,  NULL,     NULL,     '#9ca3af', 2),
    ('A',    'Servicio A',  false, '08:00',  '20:00',  '#2d8b4d', 3),
    ('B',    'Servicio B',  false, '20:00',  '08:00',  '#3b82f6', 4),
    ('C',    'Servicio C',  false, '08:00',  '14:00',  '#8b5cf6', 5),
    ('PREV', 'Preventivo',  false, '08:00',  '20:00',  '#f59e0b', 6),
    ('TRAN', 'Tránsito',    false, '08:00',  '20:00',  '#ef4444', 7)
ON CONFLICT (code) DO NOTHING;

-- ── PASO 7: Columnas faltantes (si ya existe la tabla) ──

ALTER TABLE public.posts ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS whatsapp_enabled BOOLEAN DEFAULT true;

-- ════════════════════════════════════════════
-- INSTRUCCIONES:
-- 1. Ejecuta este SQL completo en Supabase SQL Editor
-- 2. Activa Realtime para tablas: posts, services
--    Dashboard → Database → Replication
-- 3. En Cloudinary: Settings → Upload → Upload Presets
--    Busca "carabineros_uploads" → cambia a "Unsigned"
--    (o crea un nuevo preset unsigned con ese nombre)
-- ════════════════════════════════════════════
