/**
 * PANEL DE USUARIO - FUNCIONARIOS
 */

import { 
  supabase, 
  getCurrentUser, 
  getUserProfile, 
  getRelativeTime,
  formatDateShort,
  showToast,
  showLoading,
  hideLoading
} from './config.js';

import { logout, checkSession } from './auth.js';

let currentUser = null;
let currentProfile = null;

// INICIALIZACIÓN
async function init() {
  showLoading();
  
  const session = await checkSession();
  if (!session) {
    hideLoading();
    return;
  }

  currentUser = session.user;
  currentProfile = session.profile;

  await Promise.all([
    loadUserInfo(),
    loadCurrentService(),
    loadPosts()
  ]);

  setupEventListeners();
  setupRealtimeSubscriptions();

  hideLoading();
}

// CARGAR INFORMACIÓN DEL USUARIO
async function loadUserInfo() {
  const userName = document.getElementById('user-name');
  const userRank = document.getElementById('user-rank');
  const userAvatar = document.getElementById('user-avatar');
  
  if (userName) userName.textContent = currentProfile.full_name;
  if (userRank) userRank.textContent = currentProfile.rank || 'Funcionario';
  
  // Iniciales para avatar
  const initials = currentProfile.full_name
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();
  if (userAvatar) userAvatar.textContent = initials;
}

// CARGAR SERVICIO ACTUAL
async function loadCurrentService() {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('date', today)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    const serviceContainer = document.getElementById('current-service');
    
    if (data) {
      serviceContainer.innerHTML = `
        <div class="service-label">SERVICIO ACTUAL</div>
        <div class="service-title">${data.service_type}</div>
        <div class="service-time">${data.start_time} - ${data.end_time}</div>
        ${data.location ? `<p style="margin-top: 8px; color: var(--gris-600);">📍 ${data.location}</p>` : ''}
      `;
    } else {
      serviceContainer.innerHTML = `
        <div class="service-label">HOY</div>
        <div class="service-title">Sin servicio asignado</div>
        <div class="service-time">Día libre</div>
      `;
    }
  } catch (error) {
    console.error('Error cargando servicio actual:', error);
  }
}

// CARGAR POSTS/NOTICIAS
async function loadPosts() {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profiles:created_by (full_name, rank)
      `)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    const feedContainer = document.getElementById('feed-posts');
    
    if (!data || data.length === 0) {
      feedContainer.innerHTML = '<p class="text-center" style="color: var(--gris-500); padding: 40px;">No hay publicaciones disponibles</p>';
      return;
    }

    let html = '';

    // Agrupar por prioridad
    const priorities = {
      urgente: data.filter(p => p.priority === 'urgente'),
      importante: data.filter(p => p.priority === 'importante'),
      normal: data.filter(p => p.priority === 'normal')
    };

    // Renderizar urgente
    if (priorities.urgente.length > 0) {
      html += `
        <div class="priority-section">
          <div class="priority-header">
            <div class="priority-line urgente"></div>
            <div class="priority-title">🚨 Urgente</div>
          </div>
          ${priorities.urgente.map(post => renderPost(post)).join('')}
        </div>
      `;
    }

    // Renderizar importante
    if (priorities.importante.length > 0) {
      html += `
        <div class="priority-section">
          <div class="priority-header">
            <div class="priority-line importante"></div>
            <div class="priority-title">⚠️ Importante</div>
          </div>
          ${priorities.importante.map(post => renderPost(post)).join('')}
        </div>
      `;
    }

    // Renderizar normal
    if (priorities.normal.length > 0) {
      html += `
        <div class="priority-section">
          <div class="priority-header">
            <div class="priority-line normal"></div>
            <div class="priority-title">📋 General</div>
          </div>
          ${priorities.normal.map(post => renderPost(post)).join('')}
        </div>
      `;
    }

    feedContainer.innerHTML = html;

    // Event listeners
    document.querySelectorAll('.post-card').forEach(card => {
      card.addEventListener('click', () => {
        const postId = card.dataset.postId;
        const post = data.find(p => p.id === postId);
        if (post) openPostModal(post);
      });
    });

  } catch (error) {
    console.error('Error cargando posts:', error);
  }
}

// Renderizar un post
function renderPost(post) {
  const priorityClass = post.priority === 'urgente' ? 'urgente' : 
                       post.priority === 'importante' ? 'importante' : 'normal';
  
  const creatorName = post.profiles?.full_name || 'Administrador';

  return `
    <div class="timeline-item">
      <div class="timeline-dot ${priorityClass}"></div>
      <div class="post-card" data-post-id="${post.id}">
        <div class="card-header">
          <div class="card-title">${post.title}</div>
          <div class="card-icon">${getCategoryIcon(post.category)}</div>
        </div>
        <div class="card-content">${truncateText(post.content, 120)}</div>
        ${post.attachment_url ? `
          <a href="${post.attachment_url}" target="_blank" class="attachment-link" onclick="event.stopPropagation()">
            📎 ${post.attachment_name || 'Ver archivo'}
          </a>
        ` : ''}
        <div class="card-meta">
          <div>⏰ ${getRelativeTime(post.created_at)}</div>
          <div>👤 ${creatorName}</div>
        </div>
      </div>
    </div>
  `;
}

// Truncar texto
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

// Icono por categoría
function getCategoryIcon(category) {
  const icons = {
    transito: '🚗',
    investigaciones: '🔍',
    preventivo: '🛡️',
    administrativo: '📋',
    formacion: '🎓',
    operaciones: '🎯',
    bienestar: '💚'
  };
  return icons[category] || '📰';
}

// ABRIR MODAL DE POST
function openPostModal(post) {
  const modal = document.getElementById('post-modal');
  const modalTitle = document.getElementById('modal-title');
  const modalContent = document.getElementById('modal-content');
  const modalAttachment = document.getElementById('modal-attachment');
  const modalMeta = document.getElementById('modal-meta');

  modalTitle.textContent = post.title;
  modalContent.innerHTML = `<p style="color: var(--gris-700); line-height: 1.6; white-space: pre-wrap;">${post.content}</p>`;
  
  if (post.attachment_url) {
    modalAttachment.innerHTML = `
      <a href="${post.attachment_url}" target="_blank" class="btn btn-primary" style="margin-top: 20px; display: inline-flex; align-items: center; gap: 8px;">
        📎 Abrir archivo adjunto
      </a>
    `;
  } else {
    modalAttachment.innerHTML = '';
  }

  modalMeta.innerHTML = `
    <div style="margin-top: 24px; padding-top: 24px; border-top: 1px solid var(--gris-200); color: var(--gris-600); font-size: 13px;">
      <p><strong>Categoría:</strong> ${post.category}</p>
      <p><strong>Prioridad:</strong> <span class="badge badge-${post.priority}">${post.priority}</span></p>
      <p><strong>Publicado por:</strong> ${post.profiles?.full_name || 'Administrador'}</p>
      <p><strong>Fecha:</strong> ${formatDateShort(post.created_at)}</p>
    </div>
  `;

  modal.classList.remove('hidden');
}

// EVENT LISTENERS
function setupEventListeners() {
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  // Cerrar modal
  document.querySelector('.close-post-modal')?.addEventListener('click', () => {
    document.getElementById('post-modal').classList.add('hidden');
  });

  // Cerrar modal al hacer click fuera
  document.getElementById('post-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'post-modal') {
      document.getElementById('post-modal').classList.add('hidden');
    }
  });
}

// REALTIME SUBSCRIPTIONS
function setupRealtimeSubscriptions() {
  // Nuevos posts
  supabase
    .channel('posts')
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'posts'
    }, () => {
      loadPosts();
      showToast('Nueva publicación disponible', 'info');
    })
    .subscribe();

  // Cambios en servicios
  supabase
    .channel('services')
    .on('postgres_changes', {
      event: '*',
      schema: 'public',
      table: 'services',
      filter: `user_id=eq.${currentUser.id}`
    }, () => {
      loadCurrentService();
      showToast('Tu servicio ha sido actualizado', 'info');
    })
    .subscribe();
}

// INICIAR
window.addEventListener('DOMContentLoaded', init);
