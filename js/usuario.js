/**
 * PANEL DE USUARIO - FUNCIONARIOS v2.0
 * Incluye: Calendario de servicios y registro de lectura
 */

import { 
  supabase, 
  getCurrentUser, 
  getUserProfile, 
  getRelativeTime,
  formatDateShort,
  showToast,
  showLoading,
  hideLoading,
  markPostAsRead,
  markServiceAsRead
} from './config.js';

import { logout, checkSession } from './auth.js';

let currentUser = null;
let currentProfile = null;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let servicesCache = {};

// ============================================
// INICIALIZACIÓN
// ============================================
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
    loadPosts(),
    loadServicesCalendar(currentYear, currentMonth)
  ]);

  setupEventListeners();
  setupCalendarListeners();
  setupRealtimeSubscriptions();

  hideLoading();
}

// ============================================
// CARGAR INFORMACIÓN DEL USUARIO
// ============================================
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

// ============================================
// CARGAR SERVICIO ACTUAL
// ============================================
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
      // Marcar como leído
      markServiceAsRead(data.id);
      
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

// ============================================
// CARGAR POSTS/NOTICIAS
// ============================================
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

// ============================================
// RENDERIZAR POST
// ============================================
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

// ============================================
// HELPERS
// ============================================

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

// ============================================
// MODAL DE POST
// ============================================
function openPostModal(post) {
  // Marcar como leído
  markPostAsRead(post.id);
  
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

// ============================================
// CALENDARIO DE SERVICIOS
// ============================================

// Cargar servicios del mes
async function loadServicesCalendar(year, month) {
  try {
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const firstDate = firstDay.toISOString().split('T')[0];
    const lastDate = lastDay.toISOString().split('T')[0];
    
    const { data, error } = await supabase
      .from('services')
      .select(`
        *,
        service_codes:service_code_id (code, name, color)
      `)
      .eq('user_id', currentUser.id)
      .gte('date', firstDate)
      .lte('date', lastDate)
      .order('date');
    
    if (error) throw error;
    
    // Cachear servicios
    servicesCache = {};
    if (data) {
      data.forEach(service => {
        servicesCache[service.date] = service;
      });
    }
    
    renderCalendar(year, month);
  } catch (error) {
    console.error('Error cargando calendario:', error);
  }
}

// Renderizar calendario
function renderCalendar(year, month) {
  const monthNames = [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
  ];
  
  // Actualizar label del mes
  const label = document.getElementById('current-month-label');
  if (label) label.textContent = `${monthNames[month]} ${year}`;
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startingDayOfWeek = firstDay.getDay();
  const totalDays = lastDay.getDate();
  
  const calendarDays = document.getElementById('calendar-days');
  if (!calendarDays) return;
  
  let html = '';
  
  // Días vacíos al inicio
  for (let i = 0; i < startingDayOfWeek; i++) {
    html += '<div class="calendar-day empty"></div>';
  }
  
  // Días del mes
  const today = new Date().toISOString().split('T')[0];
  
  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month, day);
    const dateStr = date.toISOString().split('T')[0];
    const service = servicesCache[dateStr];
    const isToday = dateStr === today;
    
    const serviceCode = service?.service_codes?.code || service?.service_type || '';
    const serviceColor = service?.service_codes?.color || '#9ca3af';
    
    html += `
      <div class="calendar-day ${isToday ? 'today' : ''}" ${service ? `onclick="showServiceDetail('${dateStr}')"` : ''}>
        <div class="day-number">${day}</div>
        ${service ? `
          <div class="service-badge" style="background: ${serviceColor};">
            ${serviceCode}
          </div>
        ` : ''}
      </div>
    `;
  }
  
  calendarDays.innerHTML = html;
}

// Navegar entre meses
function navigateMonth(direction) {
  currentMonth += direction;
  
  if (currentMonth > 11) {
    currentMonth = 0;
    currentYear++;
  } else if (currentMonth < 0) {
    currentMonth = 11;
    currentYear--;
  }
  
  loadServicesCalendar(currentYear, currentMonth);
}

// Mostrar detalle de servicio
window.showServiceDetail = function(dateStr) {
  const service = servicesCache[dateStr];
  if (!service) return;
  
  // Marcar como leído
  markServiceAsRead(service.id);
  
  const date = new Date(dateStr);
  const dateFormatted = date.toLocaleDateString('es-CL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
  
  const modal = document.getElementById('service-detail-modal');
  const dateEl = document.getElementById('service-detail-date');
  const contentEl = document.getElementById('service-detail-content');
  
  if (dateEl) dateEl.textContent = dateFormatted;
  
  const serviceName = service.service_codes?.name || service.service_type;
  const serviceColor = service.service_codes?.color || '#2d8b4d';
  
  if (contentEl) {
    contentEl.innerHTML = `
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; padding: 12px 24px; background: ${serviceColor}; color: white; border-radius: 12px; font-size: 24px; font-weight: 800;">
          ${service.service_codes?.code || service.service_type}
        </div>
        <div style="margin-top: 12px; font-size: 18px; font-weight: 600; color: var(--gris-700);">
          ${serviceName}
        </div>
      </div>
      
      <div style="background: var(--gris-50); padding: 16px; border-radius: 12px; margin-bottom: 16px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: var(--gris-600);">⏰ Horario:</span>
          <span style="font-weight: 600;">${service.start_time} - ${service.end_time}</span>
        </div>
        ${service.location ? `
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--gris-600);">📍 Ubicación:</span>
            <span style="font-weight: 600;">${service.location}</span>
          </div>
        ` : ''}
      </div>
      
      ${service.notes ? `
        <div style="background: var(--verde-claro); padding: 16px; border-radius: 12px; border-left: 4px solid var(--verde-medio);">
          <div style="font-weight: 600; margin-bottom: 8px; color: var(--verde-oscuro);">📝 Notas:</div>
          <div style="color: var(--gris-700);">${service.notes}</div>
        </div>
      ` : ''}
    `;
  }
  
  if (modal) modal.classList.remove('hidden');
};

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  // Cerrar modal de post
  document.querySelector('.close-post-modal')?.addEventListener('click', () => {
    document.getElementById('post-modal').classList.add('hidden');
  });

  // Cerrar modal al hacer click fuera
  document.getElementById('post-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'post-modal') {
      document.getElementById('post-modal').classList.add('hidden');
    }
  });

  // Cerrar modal de detalle de servicio
  document.querySelector('.close-service-detail')?.addEventListener('click', () => {
    document.getElementById('service-detail-modal').classList.add('hidden');
  });

  document.getElementById('service-detail-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'service-detail-modal') {
      document.getElementById('service-detail-modal').classList.add('hidden');
    }
  });
}

// Event listeners para calendario
function setupCalendarListeners() {
  document.getElementById('prev-month')?.addEventListener('click', () => navigateMonth(-1));
  document.getElementById('next-month')?.addEventListener('click', () => navigateMonth(1));
}

// ============================================
// REALTIME SUBSCRIPTIONS
// ============================================
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
      loadServicesCalendar(currentYear, currentMonth);
      showToast('Tu servicio ha sido actualizado', 'info');
    })
    .subscribe();
}

// ============================================
// INICIAR
// ============================================
window.addEventListener('DOMContentLoaded', init);
