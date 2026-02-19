/**
 * SISTEMA DE AUTENTICACIÓN - Carabineros Intranet v3.0
 */

import { supabase, getCurrentUser, getUserProfile, showToast, showLoading, hideLoading } from './config.js';

export async function login(email, password) {
  try {
    showLoading();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const profile = await getUserProfile(data.user.id);
    if (!profile) throw new Error('Perfil no encontrado. Contacta al administrador.');

    hideLoading();
    showToast(`Bienvenido, ${profile.full_name.split(' ')[0]}`, 'success');

    setTimeout(() => {
      window.location.href = profile.role === 'admin' ? 'admin.html' : 'usuario.html';
    }, 600);

    return { user: data.user, profile };
  } catch (error) {
    hideLoading();
    return { error };
  }
}

export async function logout() {
  try {
    showLoading();
    await supabase.auth.signOut();
    hideLoading();
    showToast('Sesión cerrada correctamente', 'success');
    setTimeout(() => { window.location.href = 'index.html'; }, 500);
  } catch (error) {
    hideLoading();
    showToast('Error al cerrar sesión', 'error');
  }
}

export async function checkSession() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      const path = window.location.pathname;
      if (!path.endsWith('index.html') && path !== '/') {
        window.location.href = 'index.html';
      }
      return null;
    }

    const profile = await getUserProfile(user.id);
    if (!profile) {
      await supabase.auth.signOut();
      window.location.href = 'index.html';
      return null;
    }

    const path = window.location.pathname;
    if (profile.role === 'admin' && path.includes('usuario.html')) {
      window.location.href = 'admin.html';
    } else if (profile.role !== 'admin' && path.includes('admin.html')) {
      window.location.href = 'usuario.html';
    }

    return { user, profile };
  } catch (error) {
    console.error('Error verificando sesión:', error);
    return null;
  }
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') {
    const path = window.location.pathname;
    if (!path.endsWith('index.html') && path !== '/') {
      window.location.href = 'index.html';
    }
  }
});
