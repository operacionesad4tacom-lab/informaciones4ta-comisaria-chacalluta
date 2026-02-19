/**
 * PANEL DE USUARIO - Carabineros Intranet v3.0
 */

import {
  supabase, getCurrentUser, getUserProfile, getRelativeTime,
  formatDateShort, showToast, showLoading, hideLoading,
  markPostAsRead, markServiceAsRead
} from './config.js';
import { logout, checkSession } from './auth.js';

let currentUser = null;
let currentProfile = null;
let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let servicesCache = {};
let allPostsCache = [];
let readPostIds = new Set();

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS_ES = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];

async function init() {
  showLoading();
  const session = await checkSession();
  if (!session) { hideLoading(); return; }
  currentUser = session.user;
  currentProfile = session.profile;

  setTodayDate();
  await Promise.all([
    loadUserInfo(),
    loadTodayAndUpcoming(),
    loadPosts(),
    loadServicesCalendar(currentYear, currentMonth)
  ]);

  setupEventListeners();
  setupRealtime();
  hideLoading();
}

function setTodayDate() {
  const today = new Date();
  const label = today.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('today-date').textContent = label.charAt(0).toUpperCase() + label.slice(1);
}

function loadUserInfo() {
  const p = currentProfile;
  const name = p.full_name || 'Funcionario';
  const initials = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
  document.getElementById('user-avatar').textContent = initials;
  document.getElementById('user-name').textContent = name;
  document.getElementById('user-rank').textContent = p.rank ? `${p.rank} · N° ${p.badge_number}` : `N° ${p.badge_number}`;
}

// ── SERVICIO HOY + PRÓXIMOS DÍAS ──
async function loadTodayAndUpcoming() {
  try {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    // Cargar 7 días incluyendo hoy
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);
      dates.push(d.toISOString().split('T')[0]);
    }

    const { data, error } = await supabase
      .from('services')
      .select('*, service_codes:service_code_id(code,name,color,is_rest)')
      .eq('user_id', currentUser.id)
      .in('date', dates);

    if (error) throw error;

    const byDate = {};
    (data || []).forEach(s => { byDate[s.date] = s; });

    renderTodayService(byDate[todayStr] || null);
    renderUpcoming(dates.slice(1, 5), byDate);

  } catch (e) {
    console.error('Error cargando servicios:', e);
  }
}

function renderTodayService(service) {
  const badgeEl = document.getElementById('today-badge');
  const detailEl = document.getElementById('today-service-detail');

  if (service) {
    markServiceAsRead(service.id);
    const color = service.service_codes?.color || '#2d8b4d';
    const code = service.service_codes?.code || service.service_type;
    const name = service.service_codes?.name || service.service_type;
    const isRest = service.service_codes?.is_rest;

    badgeEl.innerHTML = `<div class="service-badge-big" style="background:${color}">${code}</div>`;
    detailEl.innerHTML = `
      <div class="service-detail">
        <div class="service-name">${name}</div>
        <div class="service-time">${isRest ? 'Día de descanso' : `${service.start_time?.substring(0,5) || '00:00'} — ${service.end_time?.substring(0,5) || '00:00'}`}</div>
        ${service.location ? `<p style="margin-top:8px;font-size:13px;color:var(--gris-500)">📍 ${service.location}</p>` : ''}
        ${service.notes ? `<p style="margin-top:6px;font-size:13px;color:var(--gris-600)">${service.notes}</p>` : ''}
      </div>`;
  } else {
    badgeEl.innerHTML = '';
    detailEl.innerHTML = `
      <div class="no-service">
        <div class="no-service-icon">📋</div>
        <h3>Sin servicio asignado</h3>
        <p>No tienes servicio registrado para hoy</p>
      </div>`;
  }
}

function renderUpcoming(dates, byDate) {
  const list = document.getElementById('upcoming-list');
  const html = dates.map(dateStr => {
    const d = new Date(dateStr + 'T12:00:00');
    const service = byDate[dateStr];
    const dayName = DAYS_ES[d.getDay()];
    const dayNum = d.getDate();
    const monthShort = MONTHS[d.getMonth()].substring(0, 3);
    const color = service?.service_codes?.color || '#9ca3af';
    const code = service?.service_codes?.code || service?.service_type || '—';
    return `
      <div class="upcoming-item ${service ? 'has-service' : ''}">
        <div>
          <div class="upcoming-date">${dayName} ${dayNum} ${monthShort}</div>
        </div>
        <div class="upcoming-badge" style="background:${color}">${code}</div>
      </div>`;
  }).join('');
  list.innerHTML = html;
}

// ── POSTS / NOTICIAS ──
async function loadPosts() {
  try {
    // Posts públicos
    const { data: publicPosts } = await supabase
      .from('posts')
      .select('*, profiles:created_by(full_name,rank)')
      .eq('is_active', true)
      .eq('is_private', false)
      .order('created_at', { ascending: false });

    // Posts privados para este usuario
    const { data: recipientRows } = await supabase
      .from('post_recipients')
      .select('post_id')
      .eq('user_id', currentUser.id);

    let privatePosts = [];
    if (recipientRows && recipientRows.length > 0) {
      const ids = recipientRows.map(r => r.post_id);
      const { data } = await supabase
        .from('posts')
        .select('*, profiles:created_by(full_name,rank)')
        .eq('is_active', true)
        .eq('is_private', true)
        .in('id', ids)
        .order('created_at', { ascending: false });
      privatePosts = data || [];
    }

    // Posts ya leídos
    const { data: reads } = await supabase
      .from('post_reads')
      .select('post_id')
      .eq('user_id', currentUser.id);
    readPostIds = new Set((reads || []).map(r => r.post_id));

    allPostsCache = [...(publicPosts || []), ...privatePosts]
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    renderPosts();
    updateUnreadBanner();
  } catch (e) {
    console.error('Error cargando posts:', e);
  }
}

function renderPosts() {
  const container = document.getElementById('feed-container');
  if (!allPostsCache.length) {
    container.innerHTML = `
      <div class="empty-feed">
        <div class="empty-feed-icon">📭</div>
        <h3>Sin novedades</h3>
        <p>No hay publicaciones disponibles</p>
      </div>`;
    return;
  }

  const byPriority = {
    urgente: allPostsCache.filter(p => p.priority === 'urgente'),
    importante: allPostsCache.filter(p => p.priority === 'importante'),
    normal: allPostsCache.filter(p => p.priority === 'normal')
  };

  const icons = { urgente: '🚨', importante: '⚠️', normal: '📋' };
  const labels = { urgente: 'Urgente', importante: 'Importante', normal: 'General' };
  let html = '';

  ['urgente', 'importante', 'normal'].forEach(priority => {
    const posts = byPriority[priority];
    if (!posts.length) return;
    html += `
      <div class="feed-section">
        <div class="priority-header">
          <div class="priority-bar ${priority}"></div>
          <span class="priority-label">${icons[priority]} ${labels[priority]}</span>
          <span class="priority-count">${posts.length}</span>
        </div>
        ${posts.map(post => renderPostCard(post)).join('')}
      </div>`;
  });

  container.innerHTML = html;

  // Event listeners
  container.querySelectorAll('.post-card').forEach(card => {
    card.addEventListener('click', () => {
      const post = allPostsCache.find(p => p.id === card.dataset.id);
      if (post) openPostModal(post);
    });
  });
}

function renderPostCard(post) {
  const isUnread = !readPostIds.has(post.id);
  const preview = post.content.length > 100 ? post.content.substring(0, 100) + '…' : post.content;
  return `
    <div class="post-card ${post.priority} ${isUnread ? 'unread' : ''}" data-id="${post.id}">
      ${post.is_private ? `<div class="post-private-badge">🔒 Notificación personal</div>` : ''}
      <div class="post-card-title">${post.title}</div>
      <div class="post-card-preview">${preview}</div>
      ${post.attachment_url ? `<a class="attachment-chip" href="${post.attachment_url}" target="_blank" onclick="event.stopPropagation()">📎 ${post.attachment_name || 'Adjunto'}</a>` : ''}
      <div class="post-card-meta">
        <span>${getRelativeTime(post.created_at)}</span>
        <span>${post.profiles?.full_name || 'Administración'}</span>
      </div>
    </div>`;
}

function updateUnreadBanner() {
  const unread = allPostsCache.filter(p => !readPostIds.has(p.id));
  const banner = document.getElementById('unread-banner');
  const text = document.getElementById('unread-text');
  if (unread.length > 0) {
    const urgentCount = unread.filter(p => p.priority === 'urgente').length;
    text.textContent = urgentCount > 0
      ? `🚨 ${urgentCount} notificación${urgentCount > 1 ? 'es urgentes' : ' urgente'} sin leer`
      : `${unread.length} notificación${unread.length > 1 ? 'es' : ''} sin leer`;
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// ── MODAL DE POST ──
function openPostModal(post) {
  markPostAsRead(post.id).then(() => {
    readPostIds.add(post.id);
    // Actualizar card visual
    const card = document.querySelector(`.post-card[data-id="${post.id}"]`);
    if (card) card.classList.remove('unread');
    updateUnreadBanner();
  });

  const isUnread = !readPostIds.has(post.id);
  const priorityLabel = { urgente: '🚨 URGENTE', importante: '⚠️ IMPORTANTE', normal: '📋 GENERAL' };
  const creator = post.profiles?.full_name || 'Administración';

  document.getElementById('post-modal-inner').innerHTML = `
    <div class="post-modal-priority ${post.priority}">${priorityLabel[post.priority]}</div>
    ${post.is_private ? `<div class="post-private-badge" style="margin-bottom:12px">🔒 Notificación personal</div>` : ''}
    <div class="post-modal-title">${post.title}</div>
    <div class="post-modal-content">${post.content}</div>
    ${post.attachment_url ? `
      <a class="btn btn-primary" href="${post.attachment_url}" target="_blank" style="margin-top:4px;margin-bottom:8px">
        📎 Abrir adjunto
      </a>` : ''}
  `;

  document.getElementById('post-modal-footer').innerHTML = `
    <div>
      <div style="font-weight:600;color:var(--gris-700)">${creator}</div>
      <div>${formatDateShort(post.created_at)}</div>
    </div>
    <button class="btn-confirm confirmed">✅ Leído</button>
  `;

  document.getElementById('post-modal-overlay').classList.remove('hidden');
}

function closePostModal() {
  document.getElementById('post-modal-overlay').classList.add('hidden');
}

// ── CALENDARIO ──
async function loadServicesCalendar(year, month) {
  try {
    const firstDate = new Date(year, month, 1).toISOString().split('T')[0];
    const lastDate = new Date(year, month + 1, 0).toISOString().split('T')[0];

    const { data } = await supabase
      .from('services')
      .select('*, service_codes:service_code_id(code,name,color,is_rest)')
      .eq('user_id', currentUser.id)
      .gte('date', firstDate)
      .lte('date', lastDate);

    servicesCache = {};
    (data || []).forEach(s => { servicesCache[s.date] = s; });
    renderCalendar(year, month);
  } catch (e) { console.error('Error calendario:', e); }
}

function renderCalendar(year, month) {
  document.getElementById('cal-month-label').textContent = `${MONTHS[month]} ${year}`;

  const grid = document.getElementById('cal-grid');
  // Mantener headers
  const headers = Array.from(grid.children).slice(0, 7);
  grid.innerHTML = '';
  headers.forEach(h => grid.appendChild(h));

  const firstDay = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const todayStr = new Date().toISOString().split('T')[0];

  // Días vacíos
  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }

  for (let day = 1; day <= totalDays; day++) {
    const d = new Date(year, month, day);
    const dateStr = d.toISOString().split('T')[0];
    const service = servicesCache[dateStr];
    const isToday = dateStr === todayStr;

    const el = document.createElement('div');
    el.className = `cal-day${isToday ? ' today' : ''}${service ? ' has-service' : ''}`;
    el.textContent = day;

    if (service) {
      const dot = document.createElement('div');
      dot.className = 'service-dot';
      el.appendChild(dot);
      el.title = service.service_codes?.name || service.service_type;
      if (service.service_codes?.color && !isToday) {
        el.style.borderColor = service.service_codes.color;
      }
      el.addEventListener('click', () => openServiceModal(dateStr, service));
    }
    grid.appendChild(el);
  }
}

function openServiceModal(dateStr, service) {
  markServiceAsRead(service.id);
  const d = new Date(dateStr + 'T12:00:00');
  const dateLabel = d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const color = service.service_codes?.color || '#2d8b4d';
  const code = service.service_codes?.code || service.service_type;
  const name = service.service_codes?.name || service.service_type;
  const isRest = service.service_codes?.is_rest;

  document.getElementById('service-modal-box').innerHTML = `
    <div class="service-modal-header">
      <h3>Detalle del Servicio</h3>
      <button class="service-modal-close" onclick="document.getElementById('service-modal-overlay').classList.add('hidden')">✕</button>
    </div>
    <div class="service-modal-code-big" style="background:${color}">
      <div class="code">${code}</div>
      <div class="name">${name}</div>
    </div>
    <div class="service-info-row">
      <span class="service-info-label">📅 Fecha</span>
      <span class="service-info-value">${dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}</span>
    </div>
    <div class="service-info-row">
      <span class="service-info-label">⏰ Horario</span>
      <span class="service-info-value">${isRest ? 'Descanso' : `${service.start_time?.substring(0,5) || '--'} — ${service.end_time?.substring(0,5) || '--'}`}</span>
    </div>
    ${service.location ? `<div class="service-info-row"><span class="service-info-label">📍 Lugar</span><span class="service-info-value">${service.location}</span></div>` : ''}
    ${service.notes ? `<div style="margin-top:16px;padding:14px;background:var(--verde-claro);border-radius:12px;font-size:14px;color:var(--verde-oscuro)">${service.notes}</div>` : ''}
  `;
  document.getElementById('service-modal-overlay').classList.remove('hidden');
}

function navigateMonth(dir) {
  currentMonth += dir;
  if (currentMonth > 11) { currentMonth = 0; currentYear++; }
  else if (currentMonth < 0) { currentMonth = 11; currentYear--; }
  loadServicesCalendar(currentYear, currentMonth);
}

// ── EVENT LISTENERS ──
function setupEventListeners() {
  document.getElementById('logout-btn')?.addEventListener('click', logout);
  document.getElementById('prev-month')?.addEventListener('click', () => navigateMonth(-1));
  document.getElementById('next-month')?.addEventListener('click', () => navigateMonth(1));

  document.getElementById('unread-banner')?.addEventListener('click', () => {
    document.getElementById('feed-container').scrollIntoView({ behavior: 'smooth' });
  });

  // Cerrar modales al click fuera
  document.getElementById('post-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'post-modal-overlay') closePostModal();
  });
  document.getElementById('service-modal-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'service-modal-overlay')
      document.getElementById('service-modal-overlay').classList.add('hidden');
  });
}

// ── REALTIME ──
function setupRealtime() {
  supabase.channel('posts-changes')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, () => {
      loadPosts();
      showToast('Nueva publicación disponible', 'info');
    })
    .subscribe();

  supabase.channel('services-changes')
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'services',
      filter: `user_id=eq.${currentUser.id}`
    }, () => {
      loadTodayAndUpcoming();
      loadServicesCalendar(currentYear, currentMonth);
      showToast('🔄 Tu servicio fue actualizado', 'warning');
    })
    .subscribe();
}

window.addEventListener('DOMContentLoaded', init);
