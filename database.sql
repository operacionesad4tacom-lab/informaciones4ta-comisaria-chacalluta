-- ============================================
-- ESTRUCTURA DE BASE DE DATOS - SUPABASE
-- Carabineros Intranet
-- ============================================

-- TABLA: profiles
-- Información de usuarios del sistema
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    rank TEXT,
    badge_number TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'funcionario')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- TABLA: posts
-- Publicaciones y noticias
CREATE TABLE IF NOT EXISTS public.posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    priority TEXT NOT NULL CHECK (priority IN ('normal', 'importante', 'urgente')),
    category TEXT NOT NULL CHECK (category IN ('administrativo', 'transito', 'investigaciones', 'preventivo', 'formacion', 'operaciones', 'bienestar')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    attachment_url TEXT,
    attachment_name TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- TABLA: service_codes
-- Catálogo de siglas de servicio
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- TABLA: services
-- Asignación de servicios a funcionarios
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    UNIQUE(user_id, date)
);

-- ============================================
-- ÍNDICES PARA OPTIMIZACIÓN
-- ============================================

CREATE INDEX IF NOT EXISTS idx_posts_priority ON public.posts(priority);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_is_active ON public.posts(is_active);
CREATE INDEX IF NOT EXISTS idx_services_date ON public.services(date);
CREATE INDEX IF NOT EXISTS idx_services_user_id ON public.services(user_id);
CREATE INDEX IF NOT EXISTS idx_profiles_badge_number ON public.profiles(badge_number);

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Habilitar RLS en todas las tablas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS PARA profiles
-- Los usuarios pueden ver su propio perfil
CREATE POLICY "Los usuarios pueden ver su propio perfil"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

-- Los admins pueden ver todos los perfiles
CREATE POLICY "Los admins pueden ver todos los perfiles"
    ON public.profiles FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- POLÍTICAS PARA posts
-- Todos pueden ver posts activos
CREATE POLICY "Todos pueden ver posts activos"
    ON public.posts FOR SELECT
    USING (is_active = true);

-- Solo admins pueden crear posts
CREATE POLICY "Solo admins pueden crear posts"
    ON public.posts FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Solo admins pueden actualizar posts
CREATE POLICY "Solo admins pueden actualizar posts"
    ON public.posts FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Solo admins pueden eliminar posts
CREATE POLICY "Solo admins pueden eliminar posts"
    ON public.posts FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- POLÍTICAS PARA service_codes
-- Todos pueden ver códigos de servicio activos
CREATE POLICY "Todos pueden ver códigos de servicio activos"
    ON public.service_codes FOR SELECT
    USING (is_active = true);

-- Solo admins pueden gestionar códigos de servicio
CREATE POLICY "Solo admins pueden gestionar códigos de servicio"
    ON public.service_codes FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- POLÍTICAS PARA services
-- Los usuarios pueden ver sus propios servicios
CREATE POLICY "Los usuarios pueden ver sus propios servicios"
    ON public.services FOR SELECT
    USING (user_id = auth.uid());

-- Los admins pueden ver todos los servicios
CREATE POLICY "Los admins pueden ver todos los servicios"
    ON public.services FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- Solo admins pueden gestionar servicios
CREATE POLICY "Solo admins pueden gestionar servicios"
    ON public.services FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- ============================================
-- FUNCIONES Y TRIGGERS
-- ============================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para actualizar updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_posts_updated_at BEFORE UPDATE ON public.posts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_service_codes_updated_at BEFORE UPDATE ON public.service_codes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- DATOS DE EJEMPLO (OPCIONAL)
-- ============================================

-- Insertar siglas de servicio comunes
INSERT INTO public.service_codes (code, name, is_rest, start_time, end_time, color, display_order) VALUES
    ('D', 'Descanso', true, NULL, NULL, '#9ca3af', 1),
    ('F', 'Franco', true, NULL, NULL, '#9ca3af', 2),
    ('A', 'Servicio A', false, '08:00', '20:00', '#2d8b4d', 3),
    ('B', 'Servicio B', false, '20:00', '08:00', '#3b82f6', 4),
    ('C', 'Servicio C', false, '08:00', '14:00', '#8b5cf6', 5),
    ('PREV', 'Preventivo', false, '08:00', '20:00', '#f59e0b', 6),
    ('TRAN', 'Tránsito', false, '08:00', '20:00', '#ef4444', 7)
ON CONFLICT (code) DO NOTHING;

-- ============================================
-- NOTAS IMPORTANTES
-- ============================================

/*
1. Para crear usuarios administradores:
   - Crear usuario en Supabase Auth
   - Insertar perfil en profiles con role='admin'

2. Para habilitar Realtime:
   - En Supabase Dashboard → Database → Replication
   - Activar realtime para las tablas: posts, services

3. Para el upload de archivos:
   - Configurar Storage bucket en Supabase
   - O usar Cloudinary (ya configurado en el código)

4. Ejecutar este SQL en el SQL Editor de Supabase Dashboard
*/
