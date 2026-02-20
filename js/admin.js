/**
 * PANEL ADMINISTRADOR - Carabineros Intranet v3.0
 * Con buscador de destinatarios para 350+ funcionarios
 */

import {
  supabase, getCurrentUser, getUserProfile,
  showToast, showLoading, hideLoading,
  formatDateShort, uploadToCloudinary, getAllUsers, getPostReadStats
} from './config.js';
import { logout, checkSession } from './auth.js';

let currentUser = null;
let currentProfile = null;
let selectedFile = null;
let excelData = null;
let selectedColor = '#2d8b4d';
let allUsers = [];
let selectedRecipients = new Map(); // id → {full_name, badge_number}
let searchTimeout = null;

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
async function init() {
  showLoading();
  const session = await checkSession();
  if (!session) { hideLoading(); return; }
  if (session.profile.role !== 'admin') {
    showToast('Acceso denegado', 'error');
    window.location.href = 'usuario.html';
    return;
  }

  currentUser = session.user;
  currentProfile = session.profile;

  // Info del admin en sidebar
  const name = currentProfile.full_name || 'Admin';
  document.getElementById('admin-name').textContent = name.split(' ')[0];
  document.getElementById('admin-avatar').textContent = name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase();

  // Fecha en topbar
  document.getElementById('topbar-date').textContent = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  await Promise.all([loadStats(), loadPosts(), loadSiglas()]);
  allUsers = await getAllUsers();

  setupNav();
  setupModals();
  setupPostForm();
  setupSiglaForm();
  setupFileUpload();
  setupExcel();
  setupRecipientSearch();
  setupQuickActions();
  hideLoading();
}

// ════════════════════════════════════════════
// NAVEGACIÓN
// ════════════════════════════════════════════
const TAB_TITLES = {
  'tab-dashboard': ['Dashboard', 'Resumen del sistema'],
  'tab-posts': ['Publicaciones', 'Comunicados y noticias internas'],
  'tab-servicios': ['Gestión de Servicios', 'Carga y administración de turnos'],
  'tab-siglas': ['Siglas de Servicio', 'Códigos de turno configurados']
};

function setupNav() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.dataset.tab;
      document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      document.getElementById(tabId)?.classList.add('active');
      const [title, sub] = TAB_TITLES[tabId] || ['Panel', ''];
      document.getElementById('topbar-title').textContent = title;
      document.getElementById('topbar-subtitle').textContent = sub;
    });
  });
}

// ════════════════════════════════════════════
// ESTADÍSTICAS
// ════════════════════════════════════════════
async function loadStats() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [p, u, s, sg] = await Promise.all([
      supabase.from('posts').select('*', { count: 'exact', head: true }).eq('is_active', true),
      supabase.from('profiles').select('*', { count: 'exact', head: true }),
      supabase.from('services').select('*', { count: 'exact', head: true }).eq('date', today),
      supabase.from('service_codes').select('*', { count: 'exact', head: true }).eq('is_active', true)
    ]);
    document.getElementById('stat-posts').textContent = p.count || 0;
    document.getElementById('stat-users').textContent = u.count || 0;
    document.getElementById('stat-services').textContent = s.count || 0;
    document.getElementById('stat-siglas').textContent = sg.count || 0;
  } catch (e) { console.error('Stats:', e); }
}

// ════════════════════════════════════════════
// PUBLICACIONES
// ════════════════════════════════════════════
async function loadPosts() {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select('*, profiles:created_by(full_name)')
      .order('created_at', { ascending: false });
    if (error) throw error;

    const container = document.getElementById('posts-list');
    if (!data?.length) {
      container.innerHTML = '<div style="text-align:center;padding:48px;color:var(--gris-400)">No hay publicaciones</div>';
      return;
    }

    container.innerHTML = data.map(post => {
      const priorityIcons = { urgente: '🚨', importante: '⚠️', normal: '📋' };
      return `
        <div class="admin-post-card ${post.priority}">
          <div class="post-card-header">
            <div class="post-card-left">
              <div class="post-card-title">${post.title}</div>
              <div class="post-card-badges">
                <span class="badge badge-${post.priority}">${priorityIcons[post.priority]} ${post.priority}</span>
                <span class="badge" style="background:var(--gris-100);color:var(--gris-600)">${post.category}</span>
                ${post.is_private ? `<span class="badge" style="background:var(--importante-bg);color:#92400e">🔒 Privada</span>` : `<span class="badge" style="background:var(--normal-bg);color:var(--normal)">📢 Pública</span>`}
              </div>
            </div>
            <div class="post-card-actions">
              ${post.is_private ? `<button class="btn btn-sm btn-secondary" onclick="showReadStats('${post.id}')">📊 Lecturas</button>` : ''}
              <button class="btn btn-sm btn-danger" onclick="deletePost('${post.id}')">🗑️</button>
            </div>
          </div>
          <div class="post-card-preview">${post.content.substring(0, 180)}${post.content.length > 180 ? '…' : ''}</div>
          ${post.attachment_url ? `<a href="${post.attachment_url}" target="_blank" class="btn btn-sm btn-secondary" style="margin-bottom:10px">📎 ${post.attachment_name || 'Ver adjunto'}</a>` : ''}
          <div class="post-card-meta">
            <span>👤 ${post.profiles?.full_name || 'Admin'}</span>
            <span>📅 ${formatDateShort(post.created_at)}</span>
          </div>
        </div>`;
    }).join('');
  } catch (e) { console.error('Posts:', e); }
}

async function createPost(formData) {
  try {
    showLoading();
    const postType = document.querySelector('input[name="post_type"]:checked').value;
    const isPrivate = postType === 'private';

    if (isPrivate && selectedRecipients.size === 0) {
      hideLoading();
      showToast('Debes seleccionar al menos un destinatario', 'error');
      return;
    }

    let attachmentUrl = null, attachmentName = null;
    if (selectedFile) {
      const result = await uploadToCloudinary(selectedFile);
      if (result.error) throw new Error(result.error);
      attachmentUrl = result.url;
      attachmentName = selectedFile.name;
    }

    const { data: newPost, error } = await supabase
      .from('posts')
      .insert({ ...formData, created_by: currentUser.id, attachment_url: attachmentUrl, attachment_name: attachmentName, is_private: isPrivate })
      .select().single();
    if (error) throw error;

    if (isPrivate && selectedRecipients.size > 0) {
      const rows = Array.from(selectedRecipients.keys()).map(uid => ({ post_id: newPost.id, user_id: uid }));
      const { error: rErr } = await supabase.from('post_recipients').insert(rows);
      if (rErr) throw rErr;
    }

    hideLoading();
    showToast('Publicación creada exitosamente', 'success');
    closeModal('create-post-modal');
    resetPostForm();
    await Promise.all([loadPosts(), loadStats()]);
  } catch (e) {
    hideLoading();
    showToast(e.message || 'Error al crear publicación', 'error');
  }
}

window.deletePost = async function(id) {
  if (!confirm('¿Eliminar esta publicación?')) return;
  try {
    showLoading();
    await supabase.from('post_recipients').delete().eq('post_id', id);
    await supabase.from('post_reads').delete().eq('post_id', id);
    const { error } = await supabase.from('posts').delete().eq('id', id);
    if (error) throw error;
    hideLoading();
    showToast('Publicación eliminada', 'success');
    await Promise.all([loadPosts(), loadStats()]);
  } catch (e) { hideLoading(); showToast('Error al eliminar', 'error'); }
};

window.showReadStats = async function(postId) {
  try {
    showLoading();
    const stats = await getPostReadStats(postId);
    const { data: reads } = await supabase
      .from('post_reads')
      .select('read_at, profiles:user_id(full_name,rank,badge_number)')
      .eq('post_id', postId)
      .order('read_at', { ascending: false });

    // Obtener destinatarios sin leer
    const { data: recipients } = await supabase
      .from('post_recipients')
      .select('profiles:user_id(full_name,badge_number)')
      .eq('post_id', postId);

    hideLoading();
    const readIds = new Set((reads || []).map(r => r.profiles?.badge_number));
    const unread = (recipients || []).filter(r => !readIds.has(r.profiles?.badge_number));

    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.zIndex = '1100';
    modal.innerHTML = `
      <div class="modal-content" style="max-width:560px">
        <div class="modal-header">
          <h2>📊 Estadísticas de Lectura</h2>
          <button class="close-modal-btn" onclick="this.closest('.modal').remove()">✕</button>
        </div>
        <h3 style="margin-bottom:16px;color:var(--gris-700)">${stats.title}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px">
          <div style="background:var(--exito-bg);border-radius:12px;padding:14px;text-align:center">
            <div style="font-size:28px;font-weight:900;color:var(--verde-oscuro)">${stats.total_reads}</div>
            <div style="font-size:12px;color:var(--gris-600)">Leído</div>
          </div>
          <div style="background:var(--urgente-bg);border-radius:12px;padding:14px;text-align:center">
            <div style="font-size:28px;font-weight:900;color:var(--urgente)">${unread.length}</div>
            <div style="font-size:12px;color:var(--gris-600)">Sin leer</div>
          </div>
          <div style="background:var(--normal-bg);border-radius:12px;padding:14px;text-align:center">
            <div style="font-size:28px;font-weight:900;color:var(--normal)">${stats.read_percentage}%</div>
            <div style="font-size:12px;color:var(--gris-600)">Porcentaje</div>
          </div>
        </div>
        ${reads?.length ? `
          <h4 style="margin-bottom:10px">✅ Han leído (${reads.length})</h4>
          <div style="max-height:180px;overflow-y:auto;border-radius:10px;border:1px solid var(--gris-200)">
            ${reads.map(r => `<div style="padding:10px 14px;border-bottom:1px solid var(--gris-100);font-size:14px">
              <strong>${r.profiles?.full_name || '—'}</strong>
              <span style="color:var(--gris-500);font-size:12px"> · N° ${r.profiles?.badge_number || ''} · ${formatDateShort(r.read_at)}</span>
            </div>`).join('')}
          </div>` : ''}
        ${unread.length ? `
          <h4 style="margin:16px 0 10px">❌ Sin leer (${unread.length})</h4>
          <div style="max-height:180px;overflow-y:auto;border-radius:10px;border:1px solid var(--urgente-bg)">
            ${unread.map(r => `<div style="padding:10px 14px;border-bottom:1px solid var(--gris-100);font-size:14px;color:var(--gris-700)">
              ${r.profiles?.full_name || '—'} · N° ${r.profiles?.badge_number || ''}
            </div>`).join('')}
          </div>` : ''}
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  } catch (e) { hideLoading(); showToast('Error al cargar estadísticas', 'error'); }
};

// ════════════════════════════════════════════
// BUSCADOR DE DESTINATARIOS
// ════════════════════════════════════════════
function setupRecipientSearch() {
  const input = document.getElementById('recipient-search');
  if (!input) return;

  input.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchRecipients(input.value), 200);
  });
}

function searchRecipients(query) {
  const results = document.getElementById('recipient-results');
  const q = query.trim().toLowerCase();

  if (!q) {
    results.innerHTML = '<div style="padding:16px;text-align:center;color:var(--gris-400);font-size:14px">Escribe para buscar funcionarios</div>';
    return;
  }

  const filtered = allUsers.filter(u =>
    u.full_name?.toLowerCase().includes(q) ||
    u.badge_number?.toLowerCase().includes(q) ||
    u.rank?.toLowerCase().includes(q)
  ).slice(0, 20); // máx 20 resultados visibles

  if (!filtered.length) {
    results.innerHTML = '<div style="padding:16px;text-align:center;color:var(--gris-400);font-size:14px">Sin resultados para "' + query + '"</div>';
    return;
  }

  results.innerHTML = filtered.map(u => {
    const isSelected = selectedRecipients.has(u.id);
    return `
      <div class="recipient-item" data-id="${u.id}" onclick="toggleRecipient('${u.id}')">
        <input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation();toggleRecipient('${u.id}')">
        <div>
          <div class="recipient-item-name">${u.full_name}</div>
          <div class="recipient-item-info">${u.rank || 'Funcionario'} · N° ${u.badge_number}</div>
        </div>
      </div>`;
  }).join('');
}

window.toggleRecipient = function(userId) {
  const user = allUsers.find(u => u.id === userId);
  if (!user) return;

  if (selectedRecipients.has(userId)) {
    selectedRecipients.delete(userId);
  } else {
    selectedRecipients.set(userId, user);
  }

  updateRecipientChips();
  // Re-render results para actualizar checkboxes
  const input = document.getElementById('recipient-search');
  if (input?.value.trim()) searchRecipients(input.value);
};

function updateRecipientChips() {
  const chipsContainer = document.getElementById('selected-chips');
  const countLabel = document.getElementById('recipients-count');

  countLabel.textContent = `${selectedRecipients.size} destinatario${selectedRecipients.size !== 1 ? 's' : ''} seleccionado${selectedRecipients.size !== 1 ? 's' : ''}`;

  chipsContainer.innerHTML = Array.from(selectedRecipients.entries()).map(([id, user]) => `
    <div class="chip">
      ${user.full_name.split(' ').slice(0,2).join(' ')}
      <button class="chip-remove" onclick="toggleRecipient('${id}')">×</button>
    </div>`).join('');
}

window.toggleRecipients = function() {
  const postType = document.querySelector('input[name="post_type"]:checked').value;
  document.getElementById('recipients-selector').style.display = postType === 'private' ? 'block' : 'none';
};

// ════════════════════════════════════════════
// SIGLAS
// ════════════════════════════════════════════
async function loadSiglas() {
  try {
    const { data, error } = await supabase
      .from('service_codes').select('*')
      .eq('is_active', true).order('display_order');
    if (error) throw error;

    const grid = document.getElementById('siglas-grid');
    if (!data?.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:32px;color:var(--gris-400)">No hay siglas configuradas</div>';
      return;
    }

    grid.innerHTML = data.map(s => `
      <div class="sigla-card" style="border-top-color:${s.color}">
        <div class="sigla-header">
          <div>
            <div class="sigla-code" style="color:${s.color}">${s.code}</div>
            <div class="sigla-name">${s.name}</div>
            <div class="sigla-time">${s.is_rest ? '🛌 Descanso/Franco' : `⏰ ${s.start_time?.substring(0,5) || '--'} - ${s.end_time?.substring(0,5) || '--'}`}</div>
          </div>
          <div class="sigla-actions">
            <button class="btn btn-sm btn-secondary" onclick="editSigla('${s.id}')">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="deleteSigla('${s.id}')">🗑️</button>
          </div>
        </div>
      </div>`).join('');
  } catch (e) { console.error('Siglas:', e); }
}

async function saveSigla(siglaId, data) {
  try {
    showLoading();
    if (siglaId) {
      const { error } = await supabase.from('service_codes').update(data).eq('id', siglaId);
      if (error) throw error;
      showToast('Sigla actualizada', 'success');
    } else {
      const { error } = await supabase.from('service_codes').insert(data);
      if (error) {
        if (error.code === '23505') throw new Error('Ya existe una sigla con ese código');
        throw error;
      }
      showToast('Sigla creada', 'success');
    }
    hideLoading();
    closeModal('sigla-modal');
    await Promise.all([loadSiglas(), loadStats()]);
  } catch (e) { hideLoading(); showToast(e.message || 'Error al guardar sigla', 'error'); }
}

window.editSigla = async function(id) {
  try {
    const { data, error } = await supabase.from('service_codes').select('*').eq('id', id).single();
    if (error) throw error;

    document.getElementById('sigla-modal-title').textContent = 'Editar Sigla';
    document.getElementById('sigla-id').value = data.id;
    document.getElementById('sigla-code').value = data.code;
    document.getElementById('sigla-code').disabled = true;
    document.getElementById('sigla-name').value = data.name;

    const restRadio = document.querySelector(`input[name="is_rest"][value="${data.is_rest}"]`);
    if (restRadio) restRadio.checked = true;

    if (!data.is_rest) {
      document.getElementById('sigla-start').value = data.start_time || '';
      document.getElementById('sigla-end').value = data.end_time || '';
    }

    selectedColor = data.color || '#2d8b4d';
    document.getElementById('sigla-color').value = selectedColor;
    document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('selected', d.dataset.color === selectedColor));
    toggleHorarios();
    openModal('sigla-modal');
  } catch (e) { showToast('Error al cargar sigla', 'error'); }
};

window.deleteSigla = async function(id) {
  if (!confirm('¿Eliminar esta sigla?')) return;
  try {
    showLoading();
    await supabase.from('service_codes').update({ is_active: false }).eq('id', id);
    hideLoading();
    showToast('Sigla eliminada', 'success');
    await Promise.all([loadSiglas(), loadStats()]);
  } catch (e) { hideLoading(); showToast('Error al eliminar', 'error'); }
};

window.toggleHorarios = function() {
  const isRest = document.querySelector('input[name="is_rest"]:checked')?.value === 'true';
  document.getElementById('horario-fields').style.display = isRest ? 'none' : 'block';
};

// ════════════════════════════════════════════
// EXCEL
// ════════════════════════════════════════════
function setupExcel() {
  const input = document.getElementById('excel-input');
  const zone = document.getElementById('excel-drop-zone');
  if (!input || !zone) return;

  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) processExcel(e.dataTransfer.files[0]); });

  input.addEventListener('change', e => { if (e.target.files[0]) processExcel(e.target.files[0]); });
  document.getElementById('confirm-upload-btn')?.addEventListener('click', confirmExcelUpload);
}

function excelSerialToDate(serial) {
  if (typeof serial === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(serial)) return serial;
  if (typeof serial === 'number') {
    const d = new Date(new Date(1899, 11, 30).getTime() + serial * 86400000);
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  if (serial instanceof Date) {
    return `${serial.getFullYear()}-${String(serial.getMonth()+1).padStart(2,'0')}-${String(serial.getDate()).padStart(2,'0')}`;
  }
  if (typeof serial === 'string') {
    const d = new Date(serial);
    if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }
  return null;
}

async function processExcel(file) {
  try {
    showLoading();
    const buffer = await file.arrayBuffer();
    const wb = XLSX.read(new Uint8Array(buffer), { type: 'array', cellDates: false, raw: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

    if (rows.length < 2) { hideLoading(); showToast('El archivo debe tener al menos 2 filas', 'error'); return; }

    const headers = rows[0];
    const services = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      const badge = String(row[0]).trim();
      for (let j = 1; j < row.length; j++) {
        if (!row[j] || !headers[j]) continue;
        const dateStr = excelSerialToDate(headers[j]);
        if (!dateStr) continue;
        services.push({ badge_number: badge, date: dateStr, sigla_code: String(row[j]).trim().toUpperCase() });
      }
    }

    excelData = services;
    hideLoading();
    showExcelPreview(services, file.name);
  } catch (e) {
    hideLoading();
    console.error('Error Excel:', e);
    showToast('Error al leer el archivo Excel', 'error');
  }
}

function showExcelPreview(data, filename) {
  const preview = document.getElementById('excel-preview');
  const uniqueUsers = [...new Set(data.map(s => s.badge_number))];
  const uniqueDates = [...new Set(data.map(s => s.date))];

  document.getElementById('excel-count-badge').textContent = `${data.length} servicios`;
  document.getElementById('excel-preview-title').textContent = filename;
  document.getElementById('excel-stats').innerHTML = `
    <div style="background:var(--verde-claro);padding:14px;border-radius:10px;text-align:center">
      <div style="font-size:24px;font-weight:900;color:var(--verde-oscuro)">${uniqueUsers.length}</div>
      <div style="font-size:12px;color:var(--gris-600)">Funcionarios</div>
    </div>
    <div style="background:var(--normal-bg);padding:14px;border-radius:10px;text-align:center">
      <div style="font-size:24px;font-weight:900;color:var(--normal)">${uniqueDates.length}</div>
      <div style="font-size:12px;color:var(--gris-600)">Días</div>
    </div>`;

  document.getElementById('preview-rows').innerHTML = data.slice(0, 15).map(s =>
    `<div class="preview-row">N° ${s.badge_number} &rarr; ${s.date} &rarr; <strong>${s.sigla_code}</strong></div>`
  ).join('') + (data.length > 15 ? `<div class="preview-row" style="color:var(--gris-400)">...y ${data.length - 15} más</div>` : '');

  preview.style.display = 'block';
}

async function confirmExcelUpload() {
  if (!excelData?.length) { showToast('No hay datos para cargar', 'error'); return; }
  try {
    showLoading();

    // Cargar siglas y usuarios registrados (usuarios son opcionales ahora)
    const { data: users } = await supabase.from('profiles').select('id,badge_number');
    const { data: siglas } = await supabase.from('service_codes').select('id,code,name,start_time,end_time,is_rest');

    const userMap = Object.fromEntries((users || []).map(u => [String(u.badge_number).trim(), u.id]));
    const siglaMap = Object.fromEntries((siglas || []).map(s => [String(s.code).trim().toUpperCase(), s]));

    const toInsert = [];
    const erroresSigla = [];
    const placasSinUsuario = new Set();

    for (const s of excelData) {
      const sigla = siglaMap[s.sigla_code];

      // Si la sigla no existe, eso sí es un error real — no podemos saber el horario
      if (!sigla) {
        erroresSigla.push(`Sigla desconocida: ${s.sigla_code} (placa ${s.badge_number})`);
        continue;
      }

      const userId = userMap[s.badge_number] || null;
      if (!userId) placasSinUsuario.add(s.badge_number);

      toInsert.push({
        user_id: userId,                    // null si la placa no tiene usuario registrado
        badge_number_raw: s.badge_number,   // siempre guardamos la placa del Excel
        service_code_id: sigla.id,
        date: s.date,
        service_type: sigla.name,
        start_time: sigla.is_rest ? '00:00:00' : (sigla.start_time || '00:00:00'),
        end_time:   sigla.is_rest ? '00:00:00' : (sigla.end_time   || '00:00:00')
      });
    }

    if (erroresSigla.length > 0) console.warn('Siglas no reconocidas:', erroresSigla);
    if (placasSinUsuario.size > 0) console.info('Placas sin usuario registrado (se cargan igual):', [...placasSinUsuario]);

    if (!toInsert.length) {
      hideLoading();
      showToast('No hay servicios válidos. Revisa las siglas del Excel.', 'error');
      return;
    }

    // ── PASO 1: Limpiar TODA la tabla antes de insertar ──────────────────
    // Esto libera espacio en Supabase y evita conflictos de claves únicas.
    const { error: deleteError } = await supabase
      .from('services')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // condición siempre verdadera para borrar todo

    if (deleteError) throw new Error('Error al limpiar tabla: ' + deleteError.message);

    // ── PASO 2: Insertar en lotes de 500 para evitar límites de payload ──
    const BATCH = 500;
    for (let i = 0; i < toInsert.length; i += BATCH) {
      const lote = toInsert.slice(i, i + BATCH);
      const { error: insertError } = await supabase.from('services').insert(lote);
      if (insertError) throw new Error(`Error insertando lote ${Math.floor(i/BATCH)+1}: ` + insertError.message);
    }

    hideLoading();

    const sinUsuario = placasSinUsuario.size > 0
      ? ` · ${placasSinUsuario.size} placa(s) sin usuario registrado`
      : '';
    const conErrores = erroresSigla.length > 0
      ? ` · ${erroresSigla.length} sigla(s) desconocida(s), ver consola`
      : '';

    showToast(`✅ ${toInsert.length} servicios cargados${sinUsuario}${conErrores}`, 'success');
    closeModal('excel-modal');
    document.getElementById('excel-preview').style.display = 'none';
    document.getElementById('excel-input').value = '';
    excelData = null;
    await loadStats();
  } catch (e) {
    hideLoading();
    console.error('Error carga Excel:', e);
    showToast('Error al cargar servicios: ' + (e.message || ''), 'error');
  }
}

// ════════════════════════════════════════════
// FILE UPLOAD
// ════════════════════════════════════════════
function setupFileUpload() {
  const input = document.getElementById('file-input');
  const zone = document.getElementById('file-drop-zone');
  const preview = document.getElementById('file-preview-box');
  const label = document.getElementById('file-name-label');
  const removeBtn = document.getElementById('remove-file-btn');
  if (!input || !zone) return;

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });
  input.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  removeBtn?.addEventListener('click', e => { e.stopPropagation(); selectedFile = null; input.value = ''; preview.classList.remove('show'); });

  function handleFile(file) {
    if (file.size > 10 * 1024 * 1024) { showToast('Archivo demasiado grande (máx. 10MB)', 'error'); return; }
    selectedFile = file;
    label.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(0)} KB)`;
    preview.classList.add('show');
  }
}

// ════════════════════════════════════════════
// FORMS
// ════════════════════════════════════════════
function setupPostForm() {
  document.getElementById('post-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    await createPost({ title: fd.get('title'), content: fd.get('content'), priority: fd.get('priority'), category: fd.get('category'), is_active: true });
  });
}

function setupSiglaForm() {
  document.getElementById('sigla-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('sigla-id').value;
    const isRest = document.querySelector('input[name="is_rest"]:checked').value === 'true';
    await saveSigla(id || null, {
      code: document.getElementById('sigla-code').value.toUpperCase().trim(),
      name: document.getElementById('sigla-name').value.trim(),
      is_rest: isRest,
      start_time: isRest ? null : document.getElementById('sigla-start').value,
      end_time: isRest ? null : document.getElementById('sigla-end').value,
      color: selectedColor
    });
  });

  document.querySelectorAll('.color-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      selectedColor = dot.dataset.color;
      document.getElementById('sigla-color').value = selectedColor;
      document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
  });
}

function resetPostForm() {
  document.getElementById('post-form')?.reset();
  selectedFile = null;
  selectedRecipients.clear();
  document.getElementById('file-preview-box')?.classList.remove('show');
  document.getElementById('recipients-selector').style.display = 'none';
  document.getElementById('selected-chips').innerHTML = '';
  document.getElementById('recipients-count').textContent = '0 destinatarios seleccionados';
  document.getElementById('recipient-search').value = '';
  document.getElementById('recipient-results').innerHTML = '<div style="padding:16px;text-align:center;color:var(--gris-400);font-size:14px">Escribe para buscar funcionarios</div>';
}

// ════════════════════════════════════════════
// MODALS
// ════════════════════════════════════════════
function setupModals() {
  // Botones que abren modales
  document.getElementById('create-post-btn')?.addEventListener('click', () => { resetPostForm(); openModal('create-post-modal'); });
  document.getElementById('create-sigla-btn')?.addEventListener('click', () => {
    document.getElementById('sigla-modal-title').textContent = 'Nueva Sigla';
    document.getElementById('sigla-form')?.reset();
    document.getElementById('sigla-id').value = '';
    document.getElementById('sigla-code').disabled = false;
    selectedColor = '#2d8b4d';
    document.querySelectorAll('.color-dot').forEach(d => d.classList.toggle('selected', d.dataset.color === '#2d8b4d'));
    toggleHorarios();
    openModal('sigla-modal');
  });
  document.getElementById('upload-excel-btn')?.addEventListener('click', () => { document.getElementById('excel-preview').style.display = 'none'; openModal('excel-modal'); });

  // Todos los botones de cierre
  document.querySelectorAll('[data-close]').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.close));
  });

  // Cerrar al click fuera
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden'); });
  });
}

function setupQuickActions() {
  document.getElementById('quick-post-btn')?.addEventListener('click', () => {
    activateTab('tab-posts');
    setTimeout(() => { resetPostForm(); openModal('create-post-modal'); }, 100);
  });
  document.getElementById('quick-excel-btn')?.addEventListener('click', () => {
    activateTab('tab-servicios');
    setTimeout(() => { document.getElementById('excel-preview').style.display='none'; openModal('excel-modal'); }, 100);
  });
  document.getElementById('quick-sigla-btn')?.addEventListener('click', () => {
    activateTab('tab-siglas');
    setTimeout(() => document.getElementById('create-sigla-btn')?.click(), 100);
  });
}

function activateTab(tabId) {
  document.querySelectorAll('.nav-item').forEach(b => { if (b.dataset.tab === tabId) b.click(); });
}

function openModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

document.getElementById('logout-btn')?.addEventListener('click', logout);

window.addEventListener('DOMContentLoaded', init);
