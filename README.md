# 🚔 CARABINEROS INTRANET v3.0
## 4ta. Comisaría Chacalluta (F)

---

## 📁 ESTRUCTURA

```
carabineros-intranet/
├── index.html              ← Login
├── admin.html              ← Panel Administrador
├── usuario.html            ← Panel Funcionario
├── database_completo.sql   ← ⚡ EJECUTAR EN SUPABASE
│
├── css/
│   ├── colors.css
│   └── styles.css
│
└── js/
    ├── config.js           ← Credenciales Supabase + Cloudinary
    ├── auth.js             ← Autenticación
    ├── admin.js            ← Lógica admin
    └── usuario.js          ← Lógica funcionario
```

---

## 🚀 INSTALACIÓN PASO A PASO

### 1. Supabase — Ejecutar SQL
1. Abre https://supabase.com → tu proyecto
2. Ve a **SQL Editor**
3. Pega el contenido de **`database_completo.sql`** y ejecuta
4. Ve a **Database → Replication** y activa Realtime para: `posts`, `services`

### 2. Cloudinary — Habilitar preset unsigned ⚡ (IMPORTANTE)
Este es el motivo por el que fallan los adjuntos:
1. Abre https://cloudinary.com → tu cuenta `dw61kjdzf`
2. Ve a **Settings → Upload → Upload Presets**
3. Busca **`carabineros_uploads`**
4. Cámbialo a **"Unsigned"** y guarda
5. Si no existe, créalo con ese nombre como **Unsigned** en folder **`carabineros`**

### 3. Servidor local
```bash
# Python
python -m http.server 8000

# Node.js
npx http-server

# VS Code
Instala "Live Server" → clic derecho en index.html → Open with Live Server
```

### 4. Usuarios
Crea usuarios en **Supabase Dashboard → Authentication → Users**
Luego inserta su perfil en la tabla `profiles`:
```sql
INSERT INTO profiles (id, email, full_name, badge_number, role)
VALUES ('UUID-DEL-AUTH', 'correo@carabineros.cl', 'Nombre Completo', '123456T', 'funcionario');
```

---

## ✅ CORRECCIONES EN ESTA VERSIÓN

| Problema | Estado |
|----------|--------|
| Caracteres UTF-8 corruptos | ✅ Corregido |
| Cloudinary sin soporte para PDF/Word | ✅ Corregido (resource_type dinámico) |
| RLS con recursión infinita en profiles | ✅ Corregido |
| `post_recipients` tabla faltante | ✅ Agregada |
| `is_private` faltante en schema | ✅ Agregada |
| `phone` y `whatsapp_enabled` faltantes | ✅ Agregados |
| Buscador de destinatarios para 350+ usuarios | ✅ Implementado |
| Doble importación de auth.js en index.html | ✅ Corregido |
| Panel admin sin sidebar profesional | ✅ Rediseñado |
| Panel usuario sin próximos días | ✅ Implementado |
| Mark as read sin verificar duplicados | ✅ Corregido |
| getPostReadStats usando RPC inexistente | ✅ Reemplazado con queries directos |

---

## 📱 FUNCIONALIDADES

### Funcionario
- Ver servicio del día con código y horario
- Ver próximos 4 días de servicios
- Calendario mensual navegable (toca para ver detalle)
- Feed de noticias por prioridad (Urgente → Importante → General)
- Notificaciones privadas (solo para él)
- Banner de alertas sin leer
- Marca automática como leído al abrir

### Administrador
- Dashboard con estadísticas en tiempo real
- Crear publicaciones (pública o privada)
- **Buscador de destinatarios** por nombre, grado o N° placa
- Ver estadísticas de lectura por post (quién leyó, quién no)
- Adjuntar archivos (PDF, Word, Excel, imágenes)
- Gestión de siglas de servicio (crear, editar, eliminar)
- Carga masiva de servicios desde Excel

---

## 🔐 CREDENCIALES CONFIGURADAS

- **Supabase URL**: `https://bpjepxcryqdwnmdedcse.supabase.co`
- **Cloudinary**: `dw61kjdzf` / folder `carabineros`

---

## ⚠️ PRÓXIMO PASO RECOMENDADO — WhatsApp

Para notificaciones WhatsApp al cambiar servicios o publicar urgentes:
1. Crea cuenta en **Twilio** (gratis para sandbox)
2. Crea una **Supabase Edge Function** `send-whatsapp`
3. Conecta con los triggers de la base de datos
(documentación disponible a pedido)
