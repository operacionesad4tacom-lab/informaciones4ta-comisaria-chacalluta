/**
 * PANEL DE ADMINISTRADOR - VERSIÓN COMPLETA
 */

import { 
  supabase, 
  getCurrentUser, 
  getUserProfile, 
  showToast,
  showLoading,
  hideLoading,
  formatDateShort,
  uploadToCloudinary
} from './config.js';

import { logout, checkSession } from './auth.js';

let currentUser = null;
let currentProfile = null;
let selectedFile = null;
let excelData = null;
let selectedColor = '#2d8b4d';

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

  if (session.profile.role !== 'admin') {
    showToast('Acceso denegado', 'error');
    window.location.href = 'usuario.html';
    return;
  }

  currentUser = session.user;
  currentProfile = session.profile;

  await Promise.all([
    loadStats(),
    loadAllPosts(),
    loadAllSiglas()
  ]);

  setupEventListeners();
  setupFileUpload();
  hideLoading();
}

// ============================================
// CARGAR ESTADÍSTICAS
// ============================================
async function loadStats() {
  try {
    const { count: postsCount } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    const { count: usersCount } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    const today = new Date().toISOString().split('T')[0];
    const { count: servicesToday } = await supabase
      .from('services')
      .select('*', { count: 'exact', head: true })
      .eq('date', today);

    const { count: siglasCount } = await supabase
      .from('service_codes')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true);

    document.getElementById('stat-posts').textContent = postsCount || 0;
    document.getElementById('stat-users').textContent = usersCount || 0;
    document.getElementById('stat-services').textContent = servicesToday || 0;
    document.getElementById('stat-siglas').textContent = siglasCount || 0;

  } catch (error) {
    console.error('Error cargando estadísticas:', error);
  }
}

// ============================================
// CARGAR POSTS
// ============================================
async function loadAllPosts() {
  try {
    const { data, error } = await supabase
      .from('posts')
      .select(`
        *,
        profiles:created_by (full_name)
      `)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const postsContainer = document.getElementById('posts-list');
    
    if (!data || data.length === 0) {
      postsContainer.innerHTML = '<p class="text-center">No hay publicaciones</p>';
      return;
    }

    postsContainer.innerHTML = data.map(post => `
      <div class="admin-post-card">
        <div class="post-header">
          <div>
            <h4>${post.title}</h4>
            <span class="badge badge-${post.priority}">${post.priority}</span>
            <span class="badge badge-normal">${post.category}</span>
          </div>
          <div class="post-actions">
            <button class="btn-sm btn-danger delete-post-btn" data-id="${post.id}">🗑️ Eliminar</button>
          </div>
        </div>
        <p>${post.content.substring(0, 200)}${post.content.length > 200 ? '...' : ''}</p>
        ${post.attachment_url ? `
          <a href="${post.attachment_url}" target="_blank" class="attachment-link">
            📎 ${post.attachment_name || 'Ver archivo adjunto'}
          </a>
        ` : ''}
        <div class="post-meta">
          <span>👤 ${post.profiles?.full_name || 'Admin'}</span>
          <span>📅 ${formatDateShort(post.created_at)}</span>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.delete-post-btn').forEach(btn => {
      btn.addEventListener('click', () => deletePost(btn.dataset.id));
    });

  } catch (error) {
    console.error('Error cargando posts:', error);
  }
}

// ============================================
// CARGAR SIGLAS
// ============================================
async function loadAllSiglas() {
  try {
    const { data, error } = await supabase
      .from('service_codes')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;

    const siglasGrid = document.getElementById('siglas-grid');
    
    if (!data || data.length === 0) {
      siglasGrid.innerHTML = '<p class="text-center">No hay siglas configuradas</p>';
      return;
    }

    siglasGrid.innerHTML = data.map(sigla => `
      <div class="sigla-card" style="border-color: ${sigla.color};">
        <div class="sigla-header">
          <div>
            <div class="sigla-code">${sigla.code}</div>
            <div class="sigla-name">${sigla.name}</div>
            ${!sigla.is_rest ? `
              <div class="sigla-time">⏰ ${sigla.start_time} - ${sigla.end_time}</div>
            ` : `
              <div class="sigla-time">🛌 Descanso/Franco</div>
            `}
          </div>
          <div class="post-actions">
            <button class="btn-sm btn-secondary edit-sigla-btn" data-id="${sigla.id}">✏️</button>
            <button class="btn-sm btn-danger delete-sigla-btn" data-id="${sigla.id}">🗑️</button>
          </div>
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.edit-sigla-btn').forEach(btn => {
      btn.addEventListener('click', () => editSigla(btn.dataset.id));
    });

    document.querySelectorAll('.delete-sigla-btn').forEach(btn => {
      btn.addEventListener('click', () => deleteSigla(btn.dataset.id));
    });

  } catch (error) {
    console.error('Error cargando siglas:', error);
  }
}

// ============================================
// GESTIÓN DE SIGLAS
// ============================================
async function createSigla(siglaData) {
  try {
    showLoading();

    const { error } = await supabase
      .from('service_codes')
      .insert(siglaData);

    if (error) throw error;

    hideLoading();
    showToast('Sigla creada exitosamente', 'success');
    
    await loadAllSiglas();
    await loadStats();
    closeModal('sigla-modal');

  } catch (error) {
    hideLoading();
    console.error('Error creando sigla:', error);
    if (error.code === '23505') {
      showToast('Esta sigla ya existe', 'error');
    } else {
      showToast('Error al crear sigla', 'error');
    }
  }
}

async function editSigla(siglaId) {
  try {
    const { data, error } = await supabase
      .from('service_codes')
      .select('*')
      .eq('id', siglaId)
      .single();

    if (error) throw error;

    // Llenar formulario
    document.getElementById('sigla-modal-title').textContent = 'Editar Sigla';
    document.getElementById('sigla-id').value = data.id;
    document.getElementById('sigla-code').value = data.code;
    document.getElementById('sigla-code').disabled = true;
    document.getElementById('sigla-name').value = data.name;
    document.querySelector(`input[name="is_rest"][value="${data.is_rest}"]`).checked = true;
    document.getElementById('sigla-start').value = data.start_time || '';
    document.getElementById('sigla-end').value = data.end_time || '';
    document.getElementById('sigla-color').value = data.color;
    
    selectedColor = data.color;
    document.querySelectorAll('.color-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.color === data.color);
    });

    toggleHorarioFields();
    openModal('sigla-modal');

  } catch (error) {
    console.error('Error cargando sigla:', error);
    showToast('Error al cargar sigla', 'error');
  }
}

async function updateSigla(siglaId, updates) {
  try {
    showLoading();

    const { error } = await supabase
      .from('service_codes')
      .update(updates)
      .eq('id', siglaId);

    if (error) throw error;

    hideLoading();
    showToast('Sigla actualizada exitosamente', 'success');
    
    await loadAllSiglas();
    closeModal('sigla-modal');

  } catch (error) {
    hideLoading();
    console.error('Error actualizando sigla:', error);
    showToast('Error al actualizar sigla', 'error');
  }
}

async function deleteSigla(siglaId) {
  if (!confirm('¿Estás seguro de eliminar esta sigla?')) return;

  try {
    showLoading();

    const { error } = await supabase
      .from('service_codes')
      .update({ is_active: false })
      .eq('id', siglaId);

    if (error) throw error;

    hideLoading();
    showToast('Sigla eliminada exitosamente', 'success');
    
    await loadAllSiglas();
    await loadStats();

  } catch (error) {
    hideLoading();
    console.error('Error eliminando sigla:', error);
    showToast('Error al eliminar sigla', 'error');
  }
}

// ============================================
// EXCEL UPLOAD
// ============================================
function setupExcelUpload() {
  const excelInput = document.getElementById('excel-input');
  
  if (!excelInput) return;

  excelInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      showLoading();

      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

      excelData = parseExcelData(jsonData);
      
      displayExcelPreview(excelData);
      
      hideLoading();

    } catch (error) {
      hideLoading();
      console.error('Error leyendo Excel:', error);
      showToast('Error al leer el archivo Excel', 'error');
    }
  });
}

function parseExcelData(rawData) {
  // Formato esperado: Primera fila = headers (badge_number, fechas)
  // Siguientes filas = badge_number, siglas por fecha
  
  const headers = rawData[0];
  const dates = headers.slice(1); // Fechas en columnas 2+
  
  const services = [];
  
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    const badgeNumber = row[0];
    
    if (!badgeNumber) continue;
    
    for (let j = 1; j < row.length; j++) {
      const sigla = row[j];
      const date = dates[j - 1];
      
      if (sigla && date) {
        services.push({
          badge_number: badgeNumber,
          date: formatExcelDate(date),
          sigla: sigla.toString().toUpperCase()
        });
      }
    }
  }
  
  return services;
}

function formatExcelDate(dateValue) {
  if (typeof dateValue === 'number') {
    const date = new Date((dateValue - 25569) * 86400 * 1000);
    return date.toISOString().split('T')[0];
  }
  return dateValue;
}

function displayExcelPreview(data) {
  const preview = document.getElementById('excel-preview');
  const summary = document.getElementById('excel-summary');
  const changes = document.getElementById('excel-changes');
  
  const uniqueUsers = new Set(data.map(s => s.badge_number)).size;
  const uniqueDates = new Set(data.map(s => s.date)).size;
  
  summary.innerHTML = `
    <div class="alert alert-info">
      <p><strong>📊 Resumen:</strong></p>
      <p>• Total de servicios a cargar: ${data.length}</p>
      <p>• Usuarios afectados: ${uniqueUsers}</p>
      <p>• Días con servicios: ${uniqueDates}</p>
    </div>
  `;
  
  const sampleRows = data.slice(0, 10).map(s => `
    <tr>
      <td>${s.badge_number}</td>
      <td>${s.date}</td>
      <td><strong>${s.sigla}</strong></td>
    </tr>
  `).join('');
  
  changes.innerHTML = `
    <h4>Vista previa (primeros 10 registros):</h4>
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr style="background: var(--gris-100);">
          <th style="padding: 8px; text-align: left;">Badge</th>
          <th style="padding: 8px; text-align: left;">Fecha</th>
          <th style="padding: 8px; text-align: left;">Sigla</th>
        </tr>
      </thead>
      <tbody>
        ${sampleRows}
      </tbody>
    </table>
  `;
  
  preview.style.display = 'block';
}

async function confirmExcelUpload() {
  if (!excelData || excelData.length === 0) {
    showToast('No hay datos para cargar', 'error');
    return;
  }

  try {
    showLoading();

    // 1. Obtener todos los service_codes y profiles
    const { data: serviceCodes } = await supabase
      .from('service_codes')
      .select('id, code');
    
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, badge_number');

    const codeMap = Object.fromEntries(serviceCodes.map(s => [s.code, s.id]));
    const userMap = Object.fromEntries(profiles.map(p => [p.badge_number, p.id]));

    // 2. Preparar inserts con IDs correctos
    const servicesInsert = [];
    const errors = [];

    for (const item of excelData) {
      const serviceCodeId = codeMap[item.sigla];
      const userId = userMap[item.badge_number];

      if (!serviceCodeId) {
        errors.push(`Sigla no encontrada: ${item.sigla}`);
        continue;
      }

      if (!userId) {
        errors.push(`Usuario no encontrado: ${item.badge_number}`);
        continue;
      }

      // Buscar info de la sigla para completar datos
      const siglaInfo = serviceCodes.find(s => s.id === serviceCodeId);
      
      servicesInsert.push({
        user_id: userId,
        service_code_id: serviceCodeId,
        date: item.date,
        service_type: item.sigla,
        start_time: '08:00',
        end_time: '20:00'
      });
    }

    if (errors.length > 0) {
      console.warn('Errores durante la carga:', errors);
    }

    // 3. Eliminar servicios existentes en las fechas afectadas
    const uniqueDates = [...new Set(excelData.map(s => s.date))];
    
    await supabase
      .from('services')
      .delete()
      .in('date', uniqueDates);

    // 4. Insertar nuevos servicios
    const { error } = await supabase
      .from('services')
      .insert(servicesInsert);

    if (error) throw error;

    hideLoading();
    showToast(`✅ ${servicesInsert.length} servicios cargados exitosamente`, 'success');
    
    if (errors.length > 0) {
      showToast(`⚠️ ${errors.length} registros con errores`, 'error');
    }

    closeModal('excel-modal');
    await loadStats();

  } catch (error) {
    hideLoading();
    console.error('Error cargando servicios:', error);
    showToast('Error al cargar servicios', 'error');
  }
}

// ============================================
// CONFIGURAR CARGA DE ARCHIVOS
// ============================================
function setupFileUpload() {
  const uploadArea = document.getElementById('file-upload-area');
  const fileInput = document.getElementById('file-input');
  const filePreview = document.getElementById('file-preview');
  const fileName = document.getElementById('file-name');
  const removeBtn = document.getElementById('remove-file-btn');

  if (!uploadArea || !fileInput) return;

  uploadArea.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFileSelect(file);
  });

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  });

  if (removeBtn) {
    removeBtn.addEventListener('click', () => {
      selectedFile = null;
      fileInput.value = '';
      filePreview.classList.remove('show');
    });
  }

  function handleFileSelect(file) {
    if (file.size > 10 * 1024 * 1024) {
      showToast('El archivo es muy grande. Máximo 10MB', 'error');
      return;
    }

    selectedFile = file;
    fileName.textContent = `📄 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    filePreview.classList.add('show');
  }
}

// ============================================
// CREAR POST
// ============================================
async function createPost(postData) {
  try {
    showLoading();

    let attachmentUrl = null;
    let attachmentName = null;

    if (selectedFile) {
      const uploadResult = await uploadToCloudinary(selectedFile);
      
      if (uploadResult.error) {
        throw new Error('Error al subir archivo');
      }

      attachmentUrl = uploadResult.url;
      attachmentName = selectedFile.name;
    }

    const { error } = await supabase
      .from('posts')
      .insert({
        ...postData,
        created_by: currentUser.id,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName
      });

    if (error) throw error;

    hideLoading();
    showToast('Publicación creada exitosamente', 'success');
    
    await loadAllPosts();
    await loadStats();
    
    document.getElementById('post-form').reset();
    document.getElementById('file-preview').classList.remove('show');
    selectedFile = null;
    closeModal('create-post-modal');

  } catch (error) {
    hideLoading();
    console.error('Error creando post:', error);
    showToast('Error al crear publicación', 'error');
  }
}

// ============================================
// ELIMINAR POST
// ============================================
async function deletePost(postId) {
  if (!confirm('¿Estás seguro de eliminar esta publicación?')) return;

  try {
    showLoading();

    const { error } = await supabase
      .from('posts')
      .delete()
      .eq('id', postId);

    if (error) throw error;

    hideLoading();
    showToast('Publicación eliminada', 'success');
    
    await loadAllPosts();
    await loadStats();

  } catch (error) {
    hideLoading();
    console.error('Error eliminando post:', error);
    showToast('Error al eliminar', 'error');
  }
}

// ============================================
// MODALS
// ============================================
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.remove('hidden');
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
}

function toggleHorarioFields() {
  const isRest = document.querySelector('input[name="is_rest"]:checked').value === 'true';
  const horarioFields = document.getElementById('horario-fields');
  if (horarioFields) {
    horarioFields.style.display = isRest ? 'none' : 'block';
  }
  
  if (isRest) {
    document.getElementById('sigla-start').value = '';
    document.getElementById('sigla-end').value = '';
  }
}

// ============================================
// EVENT LISTENERS
// ============================================
function setupEventListeners() {
  // Logout
  document.getElementById('logout-btn')?.addEventListener('click', logout);

  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tabId = btn.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(content => {
        content.classList.add('hidden');
      });
      document.getElementById(tabId).classList.remove('hidden');
    });
  });

  // Crear post
  document.getElementById('create-post-btn')?.addEventListener('click', () => {
    openModal('create-post-modal');
  });

  // Formulario post
  document.getElementById('post-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData(e.target);
    const postData = {
      title: formData.get('title'),
      content: formData.get('content'),
      priority: formData.get('priority'),
      category: formData.get('category'),
      is_active: true
    };

    await createPost(postData);
  });

  // Crear sigla
  document.getElementById('create-sigla-btn')?.addEventListener('click', () => {
    document.getElementById('sigla-modal-title').textContent = 'Nueva Sigla';
    document.getElementById('sigla-form').reset();
    document.getElementById('sigla-id').value = '';
    document.getElementById('sigla-code').disabled = false;
    selectedColor = '#2d8b4d';
    document.querySelectorAll('.color-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.color === selectedColor);
    });
    toggleHorarioFields();
    openModal('sigla-modal');
  });

  // Formulario sigla
  document.getElementById('sigla-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const siglaId = document.getElementById('sigla-id').value;
    const isRest = document.querySelector('input[name="is_rest"]:checked').value === 'true';
    
    const siglaData = {
      code: document.getElementById('sigla-code').value.toUpperCase(),
      name: document.getElementById('sigla-name').value,
      is_rest: isRest,
      start_time: isRest ? null : document.getElementById('sigla-start').value,
      end_time: isRest ? null : document.getElementById('sigla-end').value,
      color: selectedColor
    };

    if (siglaId) {
      await updateSigla(siglaId, siglaData);
    } else {
      await createSigla(siglaData);
    }
  });

  // Color picker
  document.querySelectorAll('.color-option').forEach(opt => {
    opt.addEventListener('click', () => {
      selectedColor = opt.dataset.color;
      document.getElementById('sigla-color').value = selectedColor;
      document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
    });
  });

  // Radio buttons horario
  document.querySelectorAll('input[name="is_rest"]').forEach(radio => {
    radio.addEventListener('change', toggleHorarioFields);
  });

  // Upload Excel
  document.getElementById('upload-excel-btn')?.addEventListener('click', () => {
    openModal('excel-modal');
  });

  document.getElementById('confirm-upload-btn')?.addEventListener('click', confirmExcelUpload);

  // Cerrar modales
  document.querySelectorAll('.close-modal-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = btn.closest('.modal');
      if (modal) modal.classList.add('hidden');
    });
  });

  setupExcelUpload();
}

// ============================================
// INICIAR
// ============================================
window.addEventListener('DOMContentLoaded', init);
