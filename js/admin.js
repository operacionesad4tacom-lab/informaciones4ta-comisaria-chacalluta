/**
 * PANEL DE ADMINISTRADOR - VERSIÓN COMPLETA v2.0
 * Incluye: Publicaciones privadas, destinatarios, estadísticas de lectura
 */

import { 
  supabase, 
  getCurrentUser, 
  getUserProfile, 
  showToast,
  showLoading,
  hideLoading,
  formatDateShort,
  uploadToCloudinary,
  getAllUsers,
  getPostReadStats
} from './config.js';

import { logout, checkSession } from './auth.js';

let currentUser = null;
let currentProfile = null;
let selectedFile = null;
let excelData = null;
let selectedColor = '#2d8b4d';
let selectedRecipients = [];

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

    postsContainer.innerHTML = data.map(post => {
      const isPrivate = post.is_private;
      const privacyBadge = isPrivate 
        ? `<span class="badge" style="background: var(--importante-bg); color: #92400e;">🔒 Privada</span>`
        : `<span class="badge" style="background: var(--normal-bg); color: var(--normal);">📢 Pública</span>`;
      
      return `
        <div class="admin-post-card">
          <div class="post-header">
            <div>
              <h4>${post.title}</h4>
              <span class="badge badge-${post.priority}">${post.priority}</span>
              <span class="badge badge-normal">${post.category}</span>
              ${privacyBadge}
            </div>
            <div class="post-actions">
              ${isPrivate ? `<button class="btn-sm btn-secondary" onclick="showPostReadStats('${post.id}')">📊 Ver stats</button>` : ''}
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
      `;
    }).join('');

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
// GESTIÓN DE PUBLICACIONES
// ============================================
async function createPost(postData) {
  try {
    showLoading();

    // Determinar si es publicación privada
    const postType = document.querySelector('input[name="post_type"]:checked').value;
    const isPrivate = postType === 'private';

    // Subir archivo si existe
    let attachmentUrl = null;
    let attachmentName = null;
    
    if (selectedFile) {
      const uploadResult = await uploadToCloudinary(selectedFile);
      
      if (uploadResult.error) {
        throw new Error('Error al subir el archivo');
      }
      
      attachmentUrl = uploadResult.url;
      attachmentName = selectedFile.name;
    }

    // Crear el post
    const { data: newPost, error: postError } = await supabase
      .from('posts')
      .insert({
        ...postData,
        created_by: currentUser.id,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        is_private: isPrivate
      })
      .select()
      .single();

    if (postError) throw postError;

    // Si es privado, crear las relaciones con destinatarios
    if (isPrivate) {
      const recipients = getSelectedRecipients();
      
      if (recipients.length === 0) {
        throw new Error('Debes seleccionar al menos un destinatario');
      }

      const recipientRecords = recipients.map(userId => ({
        post_id: newPost.id,
        user_id: userId
      }));

      const { error: recipientError } = await supabase
        .from('post_recipients')
        .insert(recipientRecords);

      if (recipientError) throw recipientError;
    }

    hideLoading();
    showToast('Publicación creada exitosamente', 'success');
    
    // Resetear formulario
    document.getElementById('post-form').reset();
    selectedFile = null;
    document.getElementById('file-preview').classList.remove('show');
    
    await loadAllPosts();
    await loadStats();
    closeModal('create-post-modal');

  } catch (error) {
    hideLoading();
    console.error('Error creando post:', error);
    showToast(error.message || 'Error al crear publicación', 'error');
  }
}

async function deletePost(postId) {
  if (!confirm('¿Estás seguro de eliminar esta publicación?')) return;

  try {
    showLoading();

    // Primero eliminar los recipients si existen
    await supabase
      .from('post_recipients')
      .delete()
      .eq('post_id', postId);

    // Luego eliminar las lecturas
    await supabase
      .from('post_reads')
      .delete()
      .eq('post_id', postId);

    // Finalmente eliminar el post
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
    showToast('Error al eliminar publicación', 'error');
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

async function updateSigla(siglaId, siglaData) {
  try {
    showLoading();

    const { error } = await supabase
      .from('service_codes')
      .update(siglaData)
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
    document.getElementById('sigla-code').disabled = true; // No permitir cambiar código
    document.getElementById('sigla-name').value = data.name;
    
    // Marcar tipo de servicio
    const isRestRadio = document.querySelector(`input[name="is_rest"][value="${data.is_rest}"]`);
    if (isRestRadio) isRestRadio.checked = true;
    
    // Llenar horarios si no es descanso
    if (!data.is_rest && data.start_time && data.end_time) {
      document.getElementById('sigla-start').value = data.start_time;
      document.getElementById('sigla-end').value = data.end_time;
    }
    
    // Seleccionar color
    selectedColor = data.color || '#2d8b4d';
    document.getElementById('sigla-color').value = selectedColor;
    document.querySelectorAll('.color-option').forEach(opt => {
      opt.classList.toggle('selected', opt.dataset.color === selectedColor);
    });
    
    toggleHorarioFields();
    openModal('sigla-modal');

  } catch (error) {
    console.error('Error cargando sigla:', error);
    showToast('Error al cargar sigla', 'error');
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
    showToast('Sigla eliminada', 'success');
    
    await loadAllSiglas();
    await loadStats();

  } catch (error) {
    hideLoading();
    console.error('Error eliminando sigla:', error);
    showToast('Error al eliminar sigla', 'error');
  }
}

// ============================================
// CARGA MASIVA DESDE EXCEL
// ============================================
function setupExcelUpload() {
  const excelInput = document.getElementById('excel-input');
  
  if (!excelInput) return;

  excelInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      showLoading();
      
      const data = await readExcelFile(file);
      excelData = data;
      
      displayExcelPreview(data);
      hideLoading();

    } catch (error) {
      hideLoading();
      console.error('Error leyendo Excel:', error);
      showToast('Error al leer el archivo Excel', 'error');
    }
  });
}

async function readExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { 
          type: 'array',
          cellDates: false, // Mantener números seriales de Excel
          raw: true // Preservar valores raw sin conversión
        });
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(firstSheet, { 
          header: 1,
          raw: true, // No convertir automáticamente
          defval: null // Valor por defecto para celdas vacías
        });
        
        resolve(parseExcelData(jsonData));
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// Función helper para convertir números seriales de Excel a fechas
function excelSerialToDate(serial) {
  // Si ya es una fecha válida en formato string, retornarla
  if (typeof serial === 'string' && serial.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return serial;
  }
  
  // Si es un número serial de Excel
  if (typeof serial === 'number') {
    // Excel usa 1900-01-01 como día 1 (pero tiene un bug: considera 1900 bisiesto)
    const excelEpoch = new Date(1899, 11, 30); // 30 de diciembre de 1899
    const date = new Date(excelEpoch.getTime() + serial * 86400000);
    
    // Formatear como YYYY-MM-DD
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return `${year}-${month}-${day}`;
  }
  
  // Si es un objeto Date de JavaScript
  if (serial instanceof Date) {
    const year = serial.getFullYear();
    const month = String(serial.getMonth() + 1).padStart(2, '0');
    const day = String(serial.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  // Intentar parsear como string de fecha
  if (typeof serial === 'string') {
    const date = new Date(serial);
    if (!isNaN(date.getTime())) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }
  
  return null;
}

function parseExcelData(jsonData) {
  if (jsonData.length < 2) {
    throw new Error('El archivo debe tener al menos 2 filas (encabezados + datos)');
  }

  const headers = jsonData[0];
  const services = [];
  
  // Procesar cada fila (saltando encabezados)
  for (let i = 1; i < jsonData.length; i++) {
    const row = jsonData[i];
    if (!row || row.length === 0) continue;
    
    const badgeNumber = row[0];
    if (!badgeNumber) continue;
    
    // Procesar cada columna de fecha (saltando la primera que es badge_number)
    for (let j = 1; j < row.length; j++) {
      const siglaCode = row[j];
      if (!siglaCode) continue;
      
      const rawDate = headers[j];
      if (!rawDate) continue;
      
      // Convertir fecha de Excel a formato YYYY-MM-DD
      const dateStr = excelSerialToDate(rawDate);
      
      if (!dateStr) {
        console.warn(`Fecha inválida en columna ${j}:`, rawDate);
        continue;
      }
      
      services.push({
        badge_number: badgeNumber,
        date: dateStr,
        sigla_code: siglaCode
      });
    }
  }
  
  return services;
}

function displayExcelPreview(data) {
  const preview = document.getElementById('excel-preview');
  const summary = document.getElementById('excel-summary');
  const changes = document.getElementById('excel-changes');
  
  if (!preview || !summary || !changes) return;
  
  preview.style.display = 'block';
  
  summary.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${data.length}</div>
      <div class="stat-label">Servicios a cargar</div>
    </div>
  `;
  
  const uniqueUsers = [...new Set(data.map(s => s.badge_number))];
  const uniqueDates = [...new Set(data.map(s => s.date))];
  
  changes.innerHTML = `
    <p><strong>👥 Usuarios afectados:</strong> ${uniqueUsers.length}</p>
    <p><strong>📅 Rango de fechas:</strong> ${uniqueDates.length} días</p>
    <div style="margin-top: 16px; max-height: 200px; overflow-y: auto; background: var(--gris-50); padding: 12px; border-radius: 8px;">
      ${data.slice(0, 10).map(s => `
        <div style="font-size: 13px; margin-bottom: 4px;">
          ${s.badge_number} → ${s.date} → ${s.sigla_code}
        </div>
      `).join('')}
      ${data.length > 10 ? `<p style="color: var(--gris-600); margin-top: 8px;">...y ${data.length - 10} más</p>` : ''}
    </div>
  `;
}

async function confirmExcelUpload() {
  if (!excelData || excelData.length === 0) {
    showToast('No hay datos para cargar', 'error');
    return;
  }

  try {
    showLoading();

    // Obtener todos los usuarios y siglas
    const { data: users } = await supabase
      .from('profiles')
      .select('id, badge_number');

    const { data: siglas } = await supabase
      .from('service_codes')
      .select('id, code, name, start_time, end_time');

    // Crear mapas para búsqueda rápida
    const userMap = {};
    users?.forEach(u => userMap[u.badge_number] = u.id);

    const siglaMap = {};
    siglas?.forEach(s => siglaMap[s.code] = s);

    // Procesar servicios
    const servicesToInsert = [];
    const errors = [];

    for (const service of excelData) {
      const userId = userMap[service.badge_number];
      const sigla = siglaMap[service.sigla_code];

      if (!userId) {
        errors.push(`Usuario no encontrado: ${service.badge_number}`);
        continue;
      }

      if (!sigla) {
        errors.push(`Sigla no encontrada: ${service.sigla_code}`);
        continue;
      }

      servicesToInsert.push({
        user_id: userId,
        service_code_id: sigla.id,
        date: service.date,
        service_type: sigla.name,
        start_time: sigla.start_time,
        end_time: sigla.end_time
      });
    }

    if (errors.length > 0) {
      console.warn('Errores encontrados:', errors);
    }

    if (servicesToInsert.length === 0) {
      throw new Error('No hay servicios válidos para insertar');
    }

    // Eliminar servicios existentes en las fechas afectadas
    const dates = [...new Set(servicesToInsert.map(s => s.date))];
    const userIds = [...new Set(servicesToInsert.map(s => s.user_id))];

    for (const userId of userIds) {
      await supabase
        .from('services')
        .delete()
        .eq('user_id', userId)
        .in('date', dates);
    }

    // Insertar nuevos servicios
    const { error } = await supabase
      .from('services')
      .insert(servicesToInsert);

    if (error) throw error;

    hideLoading();
    showToast(`✅ ${servicesToInsert.length} servicios cargados exitosamente`, 'success');
    
    closeModal('excel-modal');
    document.getElementById('excel-preview').style.display = 'none';
    document.getElementById('excel-input').value = '';
    excelData = null;
    
    await loadStats();

  } catch (error) {
    hideLoading();
    console.error('Error en carga masiva:', error);
    showToast('Error al cargar servicios: ' + error.message, 'error');
  }
}

// ============================================
// GESTIÓN DE ARCHIVOS
// ============================================
function setupFileUpload() {
  const fileInput = document.getElementById('file-input');
  const uploadArea = document.getElementById('file-upload-area');
  const filePreview = document.getElementById('file-preview');
  const fileName = document.getElementById('file-name');
  const removeBtn = document.getElementById('remove-file-btn');

  if (!fileInput || !uploadArea) return;

  // Click en área para abrir selector
  uploadArea.addEventListener('click', () => fileInput.click());

  // Drag & drop
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

  // Selección de archivo
  fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFileSelect(file);
  });

  // Remover archivo
  removeBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedFile = null;
    fileInput.value = '';
    filePreview.classList.remove('show');
  });

  function handleFileSelect(file) {
    const maxSize = 10 * 1024 * 1024; // 10MB
    
    if (file.size > maxSize) {
      showToast('El archivo es demasiado grande (máx. 10MB)', 'error');
      return;
    }

    selectedFile = file;
    fileName.textContent = `📎 ${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
    filePreview.classList.add('show');
  }
}

// ============================================
// CARGAR USUARIOS PARA SELECTOR
// ============================================
async function loadAllUsers() {
  try {
    const users = await getAllUsers();
    const container = document.getElementById('users-list-container');
    
    if (!container) return;
    
    if (users.length === 0) {
      container.innerHTML = '<p style="color: var(--gris-500); text-align: center;">No hay usuarios disponibles</p>';
      return;
    }

    container.innerHTML = users.map(user => `
      <label style="display: block; padding: 8px; cursor: pointer; border-radius: 8px; transition: background 0.2s;" 
             onmouseover="this.style.background='var(--gris-50)'" 
             onmouseout="this.style.background='transparent'">
        <input type="checkbox" class="recipient-checkbox" value="${user.id}" 
               style="width: auto; margin-right: 12px;">
        <strong>${user.full_name}</strong> - ${user.rank || 'Funcionario'} (${user.badge_number})
      </label>
    `).join('');

    // Event listener para contar seleccionados
    document.querySelectorAll('.recipient-checkbox').forEach(checkbox => {
      checkbox.addEventListener('change', updateRecipientsCount);
    });
  } catch (error) {
    console.error('Error cargando usuarios:', error);
  }
}

// Actualizar contador de destinatarios
function updateRecipientsCount() {
  const selected = document.querySelectorAll('.recipient-checkbox:checked').length;
  const label = document.querySelector('label[for="recipients"]');
  if (label) {
    label.textContent = `Destinatarios * (${selected} seleccionado${selected !== 1 ? 's' : ''})`;
  }
}

// Obtener destinatarios seleccionados
function getSelectedRecipients() {
  const checkboxes = document.querySelectorAll('.recipient-checkbox:checked');
  return Array.from(checkboxes).map(cb => cb.value);
}

// Toggle visibility de selector de destinatarios
window.toggleRecipients = function() {
  const postType = document.querySelector('input[name="post_type"]:checked').value;
  const recipientsSelector = document.getElementById('recipients-selector');
  
  if (postType === 'private') {
    recipientsSelector.style.display = 'block';
    loadAllUsers(); // Cargar usuarios cuando se activa
  } else {
    recipientsSelector.style.display = 'none';
  }
};

// Mostrar estadísticas de lectura
window.showPostReadStats = async function(postId) {
  try {
    showLoading();

    const stats = await getPostReadStats(postId);
    
    if (!stats) {
      showToast('No hay estadísticas disponibles', 'info');
      hideLoading();
      return;
    }

    // Obtener lista de usuarios que leyeron
    const { data: reads } = await supabase
      .from('post_reads')
      .select(`
        read_at,
        profiles:user_id (full_name, rank)
      `)
      .eq('post_id', postId)
      .order('read_at', { ascending: false });

    hideLoading();

    // Crear modal de stats
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.style.zIndex = '1001';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h2>📊 Estadísticas de Lectura</h2>
          <button class="close-modal-btn" onclick="this.closest('.modal').remove()">✕</button>
        </div>
        <div>
          <h3>${stats.title}</h3>
          <div style="margin: 20px 0;">
            <div class="stat-card" style="margin-bottom: 16px;">
              <div class="stat-value">${stats.total_reads} / ${stats.total_recipients}</div>
              <div class="stat-label">Lecturas completadas</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">${stats.read_percentage || 0}%</div>
              <div class="stat-label">Porcentaje de lectura</div>
            </div>
          </div>

          ${reads && reads.length > 0 ? `
            <h4>Han leído (${reads.length}):</h4>
            <div style="max-height: 300px; overflow-y: auto;">
              ${reads.map(r => `
                <div style="padding: 12px; border-bottom: 1px solid var(--gris-200);">
                  <div style="font-weight: 600;">${r.profiles?.full_name || 'Usuario'}</div>
                  <div style="font-size: 13px; color: var(--gris-600);">
                    ${r.profiles?.rank || ''} • ${formatDateShort(r.read_at)}
                  </div>
                </div>
              `).join('')}
            </div>
          ` : '<p style="color: var(--gris-500);">Nadie ha leído aún esta publicación</p>'}
        </div>
      </div>
    `;

    document.body.appendChild(modal);
  } catch (error) {
    hideLoading();
    console.error('Error mostrando stats:', error);
    showToast('Error al cargar estadísticas', 'error');
  }
};

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

  // Crear post - con carga de usuarios
  document.getElementById('create-post-btn')?.addEventListener('click', () => {
    loadAllUsers();
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
