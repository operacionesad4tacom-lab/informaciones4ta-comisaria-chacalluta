# 🚨 CARABINEROS INTRANET - PROYECTO CORREGIDO

## ✅ CORRECCIONES REALIZADAS

### 1. **Codificación de caracteres UTF-8**
   - Todos los archivos ahora usan codificación UTF-8 correcta
   - Caracteres especiales corregidos (á, é, í, ó, ú, ñ, etc.)
   - Emojis correctamente implementados

### 2. **Archivos JavaScript completos**
   - `admin.js` - Completo con todas las funcionalidades
   - `usuario.js` - Corregido
   - `auth.js` - Sistema de autenticación completo
   - `config.js` - Configuración de Supabase y Cloudinary

### 3. **HTML corregidos**
   - `index.html` - Login page
   - `admin.html` - Panel de administración
   - `usuario.html` - Panel de usuario

### 4. **CSS organizados**
   - `colors.css` - Paleta de colores institucional
   - `styles.css` - Estilos globales

## 📁 ESTRUCTURA DEL PROYECTO

```
carabineros-intranet/
│
├── index.html              # Página de login
├── admin.html              # Panel de administración
├── usuario.html            # Panel de usuario
├── README.md               # Este archivo
│
├── css/
│   ├── colors.css         # Paleta de colores
│   └── styles.css         # Estilos globales
│
└── js/
    ├── config.js          # Configuración (Supabase + Cloudinary)
    ├── auth.js            # Sistema de autenticación
    ├── admin.js           # Lógica del panel admin
    └── usuario.js         # Lógica del panel usuario
```

## 🚀 INSTALACIÓN Y USO

### Opción 1: Servidor Local Simple

```bash
# Si tienes Python instalado:
python -m http.server 8000

# Si tienes Node.js y npx:
npx http-server

# Luego abre en el navegador:
http://localhost:8000
```

### Opción 2: Live Server (VS Code)

1. Instala la extensión "Live Server" en VS Code
2. Haz clic derecho en `index.html`
3. Selecciona "Open with Live Server"

### Opción 3: Hosting Web

Puedes subir directamente a:
- **Netlify** (drag & drop)
- **Vercel**
- **GitHub Pages**
- **Firebase Hosting**

## 🔑 CREDENCIALES DE SUPABASE

Las credenciales ya están configuradas en `js/config.js`:

```javascript
SUPABASE_URL: 'https://viltwtowftdnedxfjixu.supabase.co'
CLOUDINARY_CLOUD_NAME: 'dw61kjdzf'
```

## 🗄️ ESTRUCTURA DE BASE DE DATOS (SUPABASE)

### Tablas necesarias:

1. **profiles**
   - `id` (UUID, FK a auth.users)
   - `email` (text)
   - `full_name` (text)
   - `rank` (text)
   - `badge_number` (text, unique)
   - `role` (text: 'admin' | 'funcionario')
   - `created_at` (timestamp)

2. **posts**
   - `id` (UUID, PK)
   - `title` (text)
   - `content` (text)
   - `priority` (text: 'normal' | 'importante' | 'urgente')
   - `category` (text)
   - `created_by` (UUID, FK a profiles)
   - `attachment_url` (text, nullable)
   - `attachment_name` (text, nullable)
   - `is_active` (boolean)
   - `created_at` (timestamp)

3. **service_codes**
   - `id` (UUID, PK)
   - `code` (text, unique, máx 5 caracteres)
   - `name` (text)
   - `is_rest` (boolean)
   - `start_time` (time, nullable)
   - `end_time` (time, nullable)
   - `color` (text)
   - `display_order` (integer)
   - `is_active` (boolean)
   - `created_at` (timestamp)

4. **services**
   - `id` (UUID, PK)
   - `user_id` (UUID, FK a profiles)
   - `service_code_id` (UUID, FK a service_codes)
   - `date` (date)
   - `service_type` (text)
   - `start_time` (time)
   - `end_time` (time)
   - `location` (text, nullable)
   - `created_at` (timestamp)

## 🛠️ FUNCIONALIDADES IMPLEMENTADAS

### Panel de Administración
- ✅ Crear/editar/eliminar publicaciones
- ✅ Gestión de siglas de servicio
- ✅ Carga masiva desde Excel
- ✅ Adjuntar archivos (PDF, imágenes, Word)
- ✅ Estadísticas en tiempo real
- ✅ Sistema de prioridades (urgente, importante, normal)

### Panel de Usuario
- ✅ Ver publicaciones por prioridad
- ✅ Ver servicio asignado del día
- ✅ Timeline de noticias
- ✅ Modal de detalle de publicaciones
- ✅ Indicador visual de prioridad

### Sistema de Autenticación
- ✅ Login con email/password
- ✅ Redirección según rol (admin/funcionario)
- ✅ Protección de rutas
- ✅ Sesión persistente

## 🎨 CARACTERÍSTICAS TÉCNICAS

- **Frontend**: HTML5, CSS3, JavaScript ES6+
- **Backend**: Supabase (PostgreSQL + Auth)
- **Archivos**: Cloudinary
- **Excel**: SheetJS (xlsx)
- **Tiempo real**: Supabase Realtime
- **Diseño**: Responsive, mobile-first

## 🐛 ERRORES CORREGIDOS

1. ✅ Codificación UTF-8 en todos los archivos
2. ✅ Emojis mal renderizados
3. ✅ Archivo admin.js incompleto
4. ✅ Funciones faltantes en usuario.js
5. ✅ Sintaxis incorrecta en HTML
6. ✅ Importaciones de módulos
7. ✅ Event listeners duplicados
8. ✅ Validación de formularios

## 📝 NOTAS IMPORTANTES

1. **Usuarios por defecto**: Debes crear usuarios manualmente en Supabase Dashboard inicialmente
2. **Cloudinary**: Los archivos se suben automáticamente al preset configurado
3. **Excel Format**: Primera columna = badge_number, columnas siguientes = fechas con siglas
4. **Realtime**: Las actualizaciones se reflejan en tiempo real para todos los usuarios conectados

## 🔐 SEGURIDAD

- Row Level Security (RLS) debe estar habilitado en Supabase
- Los usuarios solo pueden ver sus propios servicios
- Solo admins pueden crear/editar/eliminar contenido
- Las sesiones expiran automáticamente

## 📧 SOPORTE

Para cualquier problema o duda:
1. Revisa la consola del navegador (F12)
2. Verifica que Supabase esté correctamente configurado
3. Confirma que las tablas existan con los campos correctos

## 🎯 PRÓXIMOS PASOS

1. Configurar RLS en Supabase
2. Crear usuarios de prueba
3. Crear algunas siglas de servicio
4. Probar la carga masiva con Excel
5. Publicar en un servidor web

---

**Desarrollado para Carabineros de Chile - 4ta. Comisaría Chacalluta (F)**

Versión: 2.0 (Corregida)
Fecha: Febrero 2025
