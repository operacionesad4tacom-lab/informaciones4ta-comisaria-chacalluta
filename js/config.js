/**
 * CONFIGURACIÓN - CARABINEROS INTRANET v3.0
 * Supabase + Cloudinary configurados
 */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://bpjepxcryqdwnmdedcse.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJwamVweGNyeXFkd25tZGVkY3NlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExNTgxNjQsImV4cCI6MjA4NjczNDE2NH0.nF-vKdAqQdIWX2inyottEeN3hiSkaSOq9lqc5DG118s';
const CLOUDINARY_CLOUD_NAME = 'dw61kjdzf';
const CLOUDINARY_UPLOAD_PRESET = 'carabineros_uploads';
const CLOUDINARY_FOLDER = 'carabineros';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});

// ============================================
// CLOUDINARY UPLOAD - CORREGIDO
// Soporta: imágenes, PDF, Word, Excel
// ============================================
export async function uploadToCloudinary(file) {
  const MAX_SIZE_MB = 10;
  const ALLOWED_TYPES = [
    'image/jpeg','image/png','image/gif','image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ];

  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return { error: `El archivo supera el límite de ${MAX_SIZE_MB}MB` };
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { error: `Tipo de archivo no permitido. Use: imágenes, PDF o documentos Word/Excel` };
  }

  // Determinar resource_type según tipo de archivo
  let resourceType = 'image';
  if (file.type === 'application/pdf' ||
      file.type.includes('word') ||
      file.type.includes('excel') ||
      file.type.includes('spreadsheet') ||
      file.type.includes('officedocument')) {
    resourceType = 'raw';
  }

  try {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
    formData.append('folder', CLOUDINARY_FOLDER);
    // NO agregar api_key en upload unsigned

    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`,
      { method: 'POST', body: formData }
    );

    if (!response.ok) {
      const errData = await response.json();
      const msg = errData?.error?.message || 'Error al subir archivo';
      // Si el preset no existe como unsigned, mostrar instrucción clara
      if (msg.includes('preset') || msg.includes('unsigned')) {
        return { error: 'El preset de Cloudinary no está configurado como "Unsigned". Ve a Cloudinary → Settings → Upload → Upload presets y activa "carabineros_uploads" como Unsigned.' };
      }
      return { error: msg };
    }

    const data = await response.json();
    return {
      url: data.secure_url,
      publicId: data.public_id,
      format: data.format,
      resourceType: data.resource_type,
      originalName: file.name
    };
  } catch (error) {
    console.error('Error Cloudinary:', error);
    return { error: 'Error de conexión al subir el archivo' };
  }
}

// ============================================
// HELPERS DE USUARIO
// ============================================
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) return null;
  return user;
}

export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  if (error) { console.error('Error getting profile:', error); return null; }
  return data;
}

export async function isAdmin() {
  const user = await getCurrentUser();
  if (!user) return false;
  const profile = await getUserProfile(user.id);
  return profile?.role === 'admin';
}

export async function getAllUsers() {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, rank, badge_number, role, phone, whatsapp_enabled')
    .order('full_name');
  if (error) { console.error('Error obteniendo usuarios:', error); return []; }
  return data || [];
}

export async function getPostReadStats(postId) {
  // Obtener stats manualmente ya que no hay vista creada
  const { data: recipients } = await supabase
    .from('post_recipients')
    .select('user_id')
    .eq('post_id', postId);

  const { data: reads } = await supabase
    .from('post_reads')
    .select('user_id, read_at')
    .eq('post_id', postId);

  const { data: post } = await supabase
    .from('posts')
    .select('title')
    .eq('id', postId)
    .single();

  const total_recipients = recipients?.length || 0;
  const total_reads = reads?.length || 0;

  return {
    post_id: postId,
    title: post?.title || '',
    total_recipients,
    total_reads,
    read_percentage: total_recipients > 0 ? Math.round((total_reads / total_recipients) * 100) : 0
  };
}

// ============================================
// HELPERS DE FECHA
// ============================================
export function formatDate(dateString) {
  return new Date(dateString).toLocaleDateString('es-CL', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function formatDateShort(dateString) {
  return new Date(dateString).toLocaleDateString('es-CL', {
    year: 'numeric', month: 'short', day: 'numeric'
  });
}

export function getRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMins = Math.floor((now - date) / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  return formatDateShort(dateString);
}

// ============================================
// UI HELPERS
// ============================================
export function showLoading() {
  if (document.getElementById('loading-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'loading-overlay';
  overlay.className = 'loading-overlay';
  overlay.innerHTML = '<div class="spinner"></div>';
  document.body.appendChild(overlay);
}

export function hideLoading() {
  document.getElementById('loading-overlay')?.remove();
}

export function showToast(message, type = 'info') {
  document.querySelector('.toast-notification')?.remove();
  const icons = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  const colors = {
    error: { bg: '#fee2e2', color: '#991b1b' },
    success: { bg: '#dcfce7', color: '#065f46' },
    warning: { bg: '#fef3c7', color: '#92400e' },
    info: { bg: '#dbeafe', color: '#1e3a8a' }
  };
  const c = colors[type] || colors.info;
  const toast = document.createElement('div');
  toast.className = 'toast-notification';
  toast.innerHTML = `<span>${icons[type]}</span> ${message}`;
  Object.assign(toast.style, {
    position: 'fixed', bottom: '24px', right: '24px',
    padding: '14px 20px', borderRadius: '12px',
    backgroundColor: c.bg, color: c.color,
    fontWeight: '600', fontSize: '14px',
    boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    zIndex: '10000', display: 'flex', alignItems: 'center',
    gap: '8px', animation: 'slideUp 0.3s ease-out',
    maxWidth: '360px', lineHeight: '1.4'
  });
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ============================================
// MARK AS READ
// ============================================
export async function markPostAsRead(postId) {
  try {
    const user = await getCurrentUser();
    if (!user) return;
    // Verificar si ya existe
    const { data: existing } = await supabase
      .from('post_reads')
      .select('id')
      .eq('post_id', postId)
      .eq('user_id', user.id)
      .single();
    if (existing) return; // Ya leído
    await supabase.from('post_reads').insert({ post_id: postId, user_id: user.id });
  } catch (e) { /* silencioso */ }
}

export async function markServiceAsRead(serviceId) {
  try {
    const user = await getCurrentUser();
    if (!user) return;
    const { data: existing } = await supabase
      .from('service_reads')
      .select('id')
      .eq('service_id', serviceId)
      .eq('user_id', user.id)
      .single();
    if (existing) return;
    await supabase.from('service_reads').insert({ service_id: serviceId, user_id: user.id });
  } catch (e) { /* silencioso */ }
}
