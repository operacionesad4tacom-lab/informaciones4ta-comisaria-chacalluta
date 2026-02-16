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
      .select(`
        *,
        service_codes:service_code_id (code, name, color)
      `)
      .eq('user_id', currentUser.id)
      .eq('date', today)
      .single();

    if (error && error.code !== 'PGRST116') throw error;

    const serviceContainer = document.getElementById('current-service');
    
    if (data) {
      // Marcar como leído
      markServiceAsRead(data.id);
      
      const serviceName = data.service_codes?.name || data.service_type;
      const serviceCode = data.service_codes?.code || '';
      
      serviceContainer.innerHTML = `
        <div class="service-label">SERVICIO ACTUAL</div>
        <div class="service-title">${serviceCode ? `${serviceCode} - ` : ''}${serviceName}</div>
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
    // Primero obtener posts públicos
    const { data: publicPosts, error: publicError } = await supabase
      .from('posts')
      .select(`
        *,
        profiles:created_by (full_name, rank)
      `)
      .eq('is_active', true)
      .eq('is_private', false)
      .order('created_at', { ascending: false });

    if (publicError) throw publicError;

    // Luego obtener posts privados donde el usuario es destinatario
    const { data: privatePosts, error: privateError } = await supabase
      .from('posts')
      .select(`
        *,
        profiles:created_by (full_name, rank)
      `)
      .eq('is_active', true)
      .eq('is_private', true)
      .in('id', 
        // Subconsulta para obtener los IDs de posts donde el usuario es destinatario
        await supabase
          .from('post_recipients')
          .select('post_id')
          .eq('user_id', currentUser.id)
          .then(({ data }) => data?.map(r => r.post_id) || [])
      )
      .order('created_at', { ascending: false });

    if (privateError && privateError.code !== 'PGRST116') throw privateError;

    // Combinar ambos arrays
    const allPosts = [...(publicPosts || []), ...(privatePosts || [])];
    
    // Ordenar por fecha
    allPosts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    const feedContainer = document.getElementById('feed-posts');
    
    if (!allPosts || allPosts.length === 0) {
      feedContainer.innerHTML = '<p class="text-center" style="color: var(--gris-500); padding: 40px;">No hay publicaciones disponibles</p>';
      return;
    }

    let html = '';

    // Agrupar por prioridad
    const priorities = {
      urgente: allPosts.filter(p => p.priority === 'urgente'),
      importante: allPosts.filter(p => p.priority === 'importante'),
      normal: allPosts.filter(p => p.priority === 'normal')
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
        const post = allPosts.find(p => p.id === postId);
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

  if (!modal || !modalTitle || !modalContent) return;

  modalTitle.textContent = post.title;
  modalContent.innerHTML = `<p style="white-space: pre-line; line-height: 1.6;">${post.content}</p>`;

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
  const label = document.getElementById('current-month-year');
  if (label) label.textContent = `${monthNames[month]} ${year}`;
  
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startingDayOfWeek = firstDay.getDay();
  const totalDays = lastDay.getDate();
  
  // Obtener el grid del calendario (después de los headers)
  const calendarGrid = document.getElementById('calendar-grid');
  if (!calendarGrid) return;
  
  // Guardar los headers de días de la semana
  const dayHeaders = Array.from(calendarGrid.children).slice(0, 7);
  
  // Limpiar todo excepto los headers
  calendarGrid.innerHTML = '';
  dayHeaders.forEach(header => calendarGrid.appendChild(header));
  
  // Días vacíos al inicio
  for (let i = 0; i < startingDayOfWeek; i++) {
    const emptyDay = document.createElement('div');
    emptyDay.className = 'calendar-day other-month';
    calendarGrid.appendChild(emptyDay);
  }
  
  // Días del mes
  const today = new Date().toISOString().split('T')[0];
  
  for (let day = 1; day <= totalDays; day++) {
    const date = new Date(year, month, day);
    const dateStr = date.toISOString().split('T')[0];
    const service = servicesCache[dateStr];
    const isToday = dateStr === today;
    
    const dayElement = document.createElement('div');
    let className = 'calendar-day';
    
    if (isToday) className += ' today';
    if (service) className += ' has-service';
    
    dayElement.className = className;
    dayElement.textContent = day;
    
    if (service) {
      dayElement.style.borderColor = service.service_codes?.color || '#2d8b4d';
      dayElement.onclick = () => showServiceDetail(dateStr);
      dayElement.style.cursor = 'pointer';
    }
    
    calendarGrid.appendChild(dayElement);
  }
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
function showServiceDetail(dateStr) {
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
  
  const serviceName = service.service_codes?.name || service.service_type;
  const serviceColor = service.service_codes?.color || '#2d8b4d';
  const serviceCode = service.service_codes?.code || '';
  
  // Crear modal dinámico
  const existingModal = document.getElementById('service-detail-modal-dynamic');
  if (existingModal) existingModal.remove();
  
  const modal = document.createElement('div');
  modal.id = 'service-detail-modal-dynamic';
  modal.className = 'post-modal';
  modal.innerHTML = `
    <div class="post-modal-content">
      <div class="post-modal-header">
        <h2>📅 Detalle de Servicio</h2>
        <button class="close-post-modal" onclick="this.closest('.post-modal').remove()">✕</button>
      </div>
      
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 16px; color: var(--gris-600); margin-bottom: 12px;">
          ${dateFormatted}
        </div>
        <div style="display: inline-block; padding: 12px 24px; background: ${serviceColor}; color: white; border-radius: 12px; font-size: 24px; font-weight: 800;">
          ${serviceCode}
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
    </div>
  `;
  
  document.body.appendChild(modal);
  
  // Cerrar al hacer click fuera
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
}

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
