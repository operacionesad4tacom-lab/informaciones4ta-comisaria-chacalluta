/**
 * CONFIGURACIÓN SUPABASE Y CLOUDINARY
 */

// Importar desde CDN
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// ✅ CREDENCIALES DE SUPABASE (CONFIGURADAS)
const SUPABASE_URL = 'https://viltwtowftdnedxfjixu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZpbHR3dG93ZnRkbmVkeGZqaXh1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzExMjcwMTksImV4cCI6MjA4NjcwMzAxOX0.fGd2k5hDVUvlx1bhWJ_L2Ib5hqbbzl5iDhJRN03fap8';

// ✅ CREDENCIALES DE CLOUDINARY (CONFIGURADAS)
const CLOUDINARY_CLOUD_NAME = 'dw61kjdzf';
const CLOUDINARY_UPLOAD_PRESET = 'carabineros_uploads';

// Crear cliente de Supabase
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
});

// Función para subir archivo a Cloudinary
export async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('cloud_name', CLOUDINARY_CLOUD_NAME);

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
      {
        method: 'POST',
        body: formData
      }
    );

    if (!response.ok) throw new Error('Error al subir archivo');

    const data = await response.json();
    return {
      url: data.secure_url,
      publicId: data.public_id,
      format: data.format,
      resourceType: data.resource_type
    };
  } catch (error) {
    console.error('Error subiendo a Cloudinary:', error);
    return { error: error.message };
  }
}

// Helper: Obtener usuario actual
export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    console.error('Error getting user:', error);
    return null;
  }
  return user;
}

// Helper: Obtener perfil del usuario
export async function getUserProfile(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error) {
    console.error('Error getting profile:', error);
    return null;
  }
  return data;
}

// Helper: Verificar si es admin
export async function isAdmin() {
  const user = await getCurrentUser();
  if (!user) return false;
  
  const profile = await getUserProfile(user.id);
  return profile?.role === 'admin';
}

// Helper: Formatear fecha
export function formatDate(dateString) {
  const options = { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return new Date(dateString).toLocaleDateString('es-CL', options);
}

// Helper: Formatear fecha corta
export function formatDateShort(dateString) {
  const options = { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric'
  };
  return new Date(dateString).toLocaleDateString('es-CL', options);
}

// Helper: Tiempo relativo
export function getRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays === 1) return 'Ayer';
  if (diffDays < 7) return `Hace ${diffDays} días`;
  
  return formatDateShort(dateString);
}

// Helper: Mostrar loading
export function showLoading() {
  const existing = document.getElementById('loading-overlay');
  if (existing) return;

  const overlay = document.createElement('div');
  overlay.id = 'loading-overlay';
  overlay.className = 'loading-overlay';
  overlay.innerHTML = '<div class="spinner"></div>';
  document.body.appendChild(overlay);
}

// Helper: Ocultar loading
export function hideLoading() {
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.remove();
}

// Helper: Mostrar mensaje toast
export function showToast(message, type = 'info') {
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px',
    padding: '16px 24px',
    borderRadius: '12px',
    backgroundColor: type === 'error' ? '#fee2e2' : 
                     type === 'success' ? '#dcfce7' : '#dbeafe',
    color: type === 'error' ? '#991b1b' : 
           type === 'success' ? '#065f46' : '#1e3a8a',
    fontWeight: '600',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    zIndex: '10000',
    animation: 'slideUp 0.3s ease-out'
  });

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'fadeOut 0.3s ease-out';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

console.log('✅ Configuración cargada correctamente');
console.log('📡 Supabase URL:', SUPABASE_URL);
console.log('☁️ Cloudinary Cloud:', CLOUDINARY_CLOUD_NAME);
