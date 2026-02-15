/**
 * SISTEMA DE AUTENTICACIÓN
 */

import { supabase, getCurrentUser, getUserProfile, showToast, showLoading, hideLoading } from './config.js';

// LOGIN
export async function login(email, password) {
  try {
    showLoading();
    
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    const profile = await getUserProfile(data.user.id);
    
    if (!profile) {
      throw new Error('Perfil no encontrado');
    }

    hideLoading();
    showToast('¡Bienvenido!', 'success');

    // Redirigir según rol
    setTimeout(() => {
      if (profile.role === 'admin') {
        window.location.href = 'admin.html';
      } else {
        window.location.href = 'usuario.html';
      }
    }, 500);

    return { user: data.user, profile };

  } catch (error) {
    hideLoading();
    console.error('Error en login:', error);
    return { error };
  }
}

// LOGOUT
export async function logout() {
  try {
    showLoading();
    
    const { error } = await supabase.auth.signOut();
    
    if (error) throw error;

    hideLoading();
    showToast('Sesión cerrada', 'success');
    
    setTimeout(() => {
      window.location.href = 'index.html';
    }, 500);

  } catch (error) {
    hideLoading();
    console.error('Error en logout:', error);
    showToast('Error al cerrar sesión', 'error');
  }
}

// VERIFICAR SESIÓN
export async function checkSession() {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      if (!window.location.pathname.endsWith('index.html') && 
          window.location.pathname !== '/') {
        window.location.href = 'index.html';
      }
      return null;
    }

    const profile = await getUserProfile(user.id);
    
    const currentPage = window.location.pathname;
    
    if (profile.role === 'admin' && currentPage.includes('usuario.html')) {
      window.location.href = 'admin.html';
    } else if (profile.role === 'funcionario' && currentPage.includes('admin.html')) {
      window.location.href = 'usuario.html';
    }

    return { user, profile };

  } catch (error) {
    console.error('Error verificando sesión:', error);
    return null;
  }
}

// REGISTRO (solo para admins)
export async function registerUser(userData) {
  try {
    showLoading();

    // Nota: Para crear usuarios, necesitas usar Supabase Dashboard
    // O implementar una función Edge Function
    showToast('Función de registro en desarrollo', 'info');
    
    hideLoading();
    return { success: false };

  } catch (error) {
    hideLoading();
    console.error('Error en registro:', error);
    showToast('Error al crear usuario', 'error');
    return { error };
  }
}

// INICIALIZAR AUTH LISTENER
export function initAuthListener() {
  supabase.auth.onAuthStateChange((event, session) => {
    console.log('Auth event:', event);
  });
}

initAuthListener();
