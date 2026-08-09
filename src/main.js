import Fuse from 'fuse.js';
import localforage from 'localforage';
import { defaultResources } from './seedData.js';

// Configure localforage instance for OmniSearch
const db = localforage.createInstance({
  name: 'OmniSearchDB',
  storeName: 'resources'
});

// App State
let resources = [];
let fuseInstance = null;
let currentFilter = 'all';
let searchResults = [];
let selectedIndex = 0;

// DOM Elements
const paletteDialog = document.getElementById('command-palette-dialog');
const paletteInput = document.getElementById('palette-input');
const paletteResults = document.getElementById('palette-results');
const paletteEmpty = document.getElementById('palette-empty');
const paletteClearBtn = document.getElementById('palette-clear-btn');
const resultsCountText = document.getElementById('results-count-text');

const triggerBtn = document.getElementById('trigger-command-palette');
const btnAddResource = document.getElementById('btn-add-resource');
const btnManageData = document.getElementById('btn-manage-data');

const addResourceDialog = document.getElementById('add-resource-dialog');
const addResourceForm = document.getElementById('add-resource-form');
const btnCancelAdd = document.getElementById('btn-cancel-add');
const closeAddDialog = document.getElementById('close-add-dialog');

const editResourceDialog = document.getElementById('edit-resource-dialog');
const editResourceForm = document.getElementById('edit-resource-form');
const editResId = document.getElementById('edit-res-id');
const editResTitle = document.getElementById('edit-res-title');
const editResCategory = document.getElementById('edit-res-category');
const editResTargetType = document.getElementById('edit-res-target-type');
const editResTarget = document.getElementById('edit-res-target');
const editResKeywords = document.getElementById('edit-res-keywords');
const editResDescription = document.getElementById('edit-res-description');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const closeEditDialog = document.getElementById('close-edit-dialog');
const btnDeleteResource = document.getElementById('btn-delete-resource');

const manageDataDialog = document.getElementById('manage-data-dialog');
const closeManageDialog = document.getElementById('close-manage-dialog');
const btnCloseManage = document.getElementById('btn-close-manage');
const btnExportJson = document.getElementById('btn-export-json');
const btnImportJson = document.getElementById('btn-import-json');
const importJsonFile = document.getElementById('import-json-file');
const btnResetDb = document.getElementById('btn-reset-db');

const toastContainer = document.getElementById('toast-container');

// SVG Icon Mapping for Categories
const icons = {
  documento: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  contacto: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 1 0-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>`,
  chat: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  carpeta: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  web: `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`
};

const iconClassMap = {
  documento: 'icon-blue',
  contacto: 'icon-purple',
  chat: 'icon-green',
  carpeta: 'icon-amber',
  web: 'icon-blue'
};

// Initialize Application & Data
async function initApp() {
  try {
    let stored = await db.getItem('omnisearch_resources');
    if (!stored || stored.length === 0) {
      stored = defaultResources;
      await db.setItem('omnisearch_resources', defaultResources);
    }
    resources = stored;
    setupFuseSearch();
    updateDashboardCounts();
    console.log(`[OmniSearch] Cargados ${resources.length} recursos en IndexedDB.`);
  } catch (err) {
    console.error('Error al inicializar la base de datos local:', err);
    resources = defaultResources;
    setupFuseSearch();
  }
}

// Setup Fuse.js Fuzzy Search Engine
function setupFuseSearch() {
  const options = {
    includeScore: true,
    threshold: 0.45,
    ignoreLocation: true,
    keys: [
      { name: 'keywords', weight: 0.4 },
      { name: 'title', weight: 0.35 },
      { name: 'description', weight: 0.15 },
      { name: 'target', weight: 0.1 }
    ]
  };
  fuseInstance = new Fuse(resources, options);
}

// Open Command Palette
function openCommandPalette(query = '', filter = 'all') {
  paletteDialog.showModal();
  setFilter(filter, false);
  paletteInput.value = query;
  paletteInput.focus();
  performSearch();
}

// Close Command Palette
function closeCommandPalette() {
  paletteDialog.close();
}

let displayItems = [];

// Perform Fuzzy Search
function performSearch() {
  const query = paletteInput.value.trim();
  paletteClearBtn.hidden = query.length === 0;

  let list = resources;

  // Filter by category if selected
  if (currentFilter !== 'all') {
    list = list.filter(r => r.category === currentFilter);
  }

  if (query.length > 0) {
    // Fuse search within the filtered set or global
    const results = fuseInstance.search(query);
    searchResults = results
      .filter(res => currentFilter === 'all' || res.item.category === currentFilter)
      .map(res => res.item);
  } else {
    // Sort by most recently accessed first, then by access count
    searchResults = [...list].sort((a, b) => {
      const timeA = a.lastAccessedAt || 0;
      const timeB = b.lastAccessedAt || 0;
      if (timeA !== timeB) return timeB - timeA;
      return (b.accessCount || 0) - (a.accessCount || 0);
    });
  }

  displayItems = [...searchResults];

  // If user typed something, append a quick "Create Entry" action at the bottom
  if (query.length > 0) {
    displayItems.push({
      isCreateAction: true,
      query: query
    });
  }

  selectedIndex = 0;
  renderResults();
}

// Render Results List
function renderResults() {
  paletteResults.innerHTML = '';
  
  if (displayItems.length === 0) {
    paletteEmpty.hidden = false;
    paletteResults.hidden = true;
    resultsCountText.textContent = '0 resultados';
    return;
  }

  paletteEmpty.hidden = true;
  paletteResults.hidden = false;
  resultsCountText.textContent = `${searchResults.length} resultado${searchResults.length === 1 ? '' : 's'}`;

  displayItems.forEach((item, index) => {
    const li = document.createElement('li');
    li.setAttribute('role', 'option');
    li.setAttribute('aria-selected', index === selectedIndex ? 'true' : 'false');
    li.dataset.index = index;

    if (item.isCreateAction) {
      // Special "Create New Entry" item
      li.className = `result-item create-item ${index === selectedIndex ? 'selected' : ''}`;
      li.innerHTML = `
        <div class="result-main">
          <div class="result-type-icon icon-create" title="Crear esta entrada">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </div>
          <div class="result-details">
            <div class="result-title-row">
              <span class="result-title">Crear recurso: "<strong>${escapeHtml(item.query)}</strong>"</span>
            </div>
            <span class="result-target">Guardar título y palabras clave en IndexedDB</span>
          </div>
        </div>
        <div class="result-action">
          <span class="action-badge">Crear ➕</span>
        </div>
      `;

      li.addEventListener('click', () => {
        openAddModalWithTitle(item.query);
      });
    } else {
      // Regular Search Result Item
      li.className = `result-item ${index === selectedIndex ? 'selected' : ''}`;

      const iconHtml = icons[item.category] || icons.web;
      const iconColorClass = iconClassMap[item.category] || 'icon-blue';
      const keywordsTags = item.keywords.slice(0, 3).map(k => `<span class="keyword-tag">${escapeHtml(k)}</span>`).join('');
      const recentTag = (item.lastAccessedAt && (Date.now() - item.lastAccessedAt < 86400000 * 7)) ? `<span class="recent-badge">Reciente 🕒</span>` : '';

      li.innerHTML = `
        <div class="result-main">
          <div class="result-type-icon ${iconColorClass}" title="Hacer clic para editar o borrar esta entrada">
            ${iconHtml}
          </div>
          <div class="result-details">
            <div class="result-title-row">
              <span class="result-title">${escapeHtml(item.title)}</span>
              ${recentTag}
            </div>
            <span class="result-target" title="${escapeHtml(item.target)}">${escapeHtml(item.target)}</span>
            <div class="result-keywords">${keywordsTags}</div>
          </div>
        </div>
        <div class="result-action">
          <span class="action-badge">${getActionText(item.targetType)}</span>
        </div>
      `;

      // Click icon to Edit / Delete resource
      const iconBtn = li.querySelector('.result-type-icon');
      iconBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditResourceModal(item);
      });

      li.addEventListener('click', () => {
        executeResourceAction(item);
      });
    }

    paletteResults.appendChild(li);
  });

  scrollSelectedIntoView();
}

// Scroll selected item into view smoothly
function scrollSelectedIntoView() {
  const selectedEl = paletteResults.children[selectedIndex];
  if (selectedEl) {
    selectedEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// Get action label based on target type
function getActionText(targetType) {
  switch (targetType) {
    case 'url': return 'Abrir Web ↗';
    case 'file': return 'Copiar / Abrir Ruta 📁';
    case 'deeplink': return 'Abrir App ⚡';
    case 'text': return 'Copiar Info 📋';
    default: return 'Ejecutar ↵';
  }
}

// Detect if running in Tauri Desktop environment
const isTauriDesktop = typeof window !== 'undefined' && (
  window.__TAURI_INTERNALS__ !== undefined || 
  window.__TAURI__ !== undefined || 
  window.__TAURI_IPC__ !== undefined
);

// Execute Action when selected (Enter or Click)
async function executeResourceAction(item) {
  const { target, targetType, title, id } = item;

  // Track access timestamp & count in IndexedDB
  const targetItem = resources.find(r => r.id === id);
  if (targetItem) {
    targetItem.lastAccessedAt = Date.now();
    targetItem.accessCount = (targetItem.accessCount || 0) + 1;
    await db.setItem('omnisearch_resources', resources);
  }

  // 1. If targetType is 'text' (Texto, Email, Info), ONLY copy to clipboard (Desktop & Web)
  if (targetType === 'text') {
    await navigator.clipboard.writeText(target);
    showToast(`Copiado al portapapeles: ${target}`, 'success');
    closeCommandPalette();
    return;
  }

  // 2. If running in Tauri Desktop, use native OS shell open (for URLs, local folders, files, and deep links)
  if (isTauriDesktop) {
    try {
      // Execute native Windows Shell via custom Rust command (0 regex limitations)
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('open_target', { target });
      showToast(`Abriendo nativamente en Windows: ${title}`, 'success');
      closeCommandPalette();
      return;
    } catch (err) {
      console.warn('Error al ejecutar open_target command:', err);
      const errMsg = (err && typeof err === 'object' && err.message) ? err.message : String(err);
      
      // Fallback: Browser or Clipboard
      if (targetType === 'url' || target.startsWith('http://') || target.startsWith('https://')) {
        window.open(target, '_blank');
        showToast(`Abriendo en navegador web: ${title}`, 'success');
      } else {
        await navigator.clipboard.writeText(target);
        showToast(`Error al abrir (${errMsg}). Ruta copiada al portapapeles.`, 'info');
      }
      closeCommandPalette();
      return;
    }
  }

  // Web Fallback (GitHub Pages)
  if (targetType === 'url') {
    window.open(target, '_blank');
    showToast(`Abriendo ${title}`, 'success');
  } else if (targetType === 'deeplink') {
    window.location.href = target;
    showToast(`Lanzando aplicación para: ${title}`, 'success');
  } else if (targetType === 'file') {
    // Copy path to clipboard
    navigator.clipboard.writeText(target);
    showToast(`Ruta copiada al portapapeles: ${target}`, 'success');
  } else {
    // Text / Contact
    navigator.clipboard.writeText(target);
    showToast(`Información copiada: ${target}`, 'success');
  }

  closeCommandPalette();
}

// Filter Chip Click
function setFilter(category, reSearch = true) {
  currentFilter = category;
  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.category === category);
  });
  if (reSearch) {
    performSearch();
  }
}

// Dashboard Counts
function updateDashboardCounts() {
  const counts = {
    documento: resources.filter(r => r.category === 'documento').length,
    contacto: resources.filter(r => r.category === 'contacto').length,
    chat: resources.filter(r => r.category === 'chat').length,
    carpeta: resources.filter(r => r.category === 'carpeta').length
  };

  document.getElementById('count-docs').textContent = `${counts.documento} registros`;
  document.getElementById('count-contacts').textContent = `${counts.contacto} contactos`;
  document.getElementById('count-chats').textContent = `${counts.chat} canales`;
  document.getElementById('count-folders').textContent = `${counts.carpeta} rutas local/red`;
}

// Toast Notifications
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div class="toast-icon">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
    </div>
    <span>${escapeHtml(message)}</span>
  `;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

// Escape HTML utility
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================

// Local Keyboard Shortcut inside web app window: Ctrl+K or Cmd+K
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (paletteDialog.open) {
      closeCommandPalette();
    } else {
      openCommandPalette();
    }
  }
});

// Listen for native Rust system-wide Global Windows Hotkey (Ctrl+K)
if (isTauriDesktop) {
  import('@tauri-apps/api/event').then(({ listen }) => {
    listen('toggle-palette', () => {
      if (paletteDialog.open) {
        closeCommandPalette();
      } else {
        openCommandPalette();
      }
    });
  }).catch(err => {
    console.warn('Error al conectar evento de atajo global nativo:', err);
  });
}

// Open Add Resource Dialog pre-filled with search query
function openAddModalWithTitle(query) {
  closeCommandPalette();
  addResourceForm.reset();
  document.getElementById('res-title').value = query;
  document.getElementById('res-keywords').value = query;
  addResourceDialog.showModal();
  setTimeout(() => {
    document.getElementById('res-target').focus();
  }, 100);
}

// Palette Input Typing & Navigation
paletteInput.addEventListener('input', performSearch);

paletteInput.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (displayItems.length > 0) {
      selectedIndex = (selectedIndex + 1) % displayItems.length;
      renderResults();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (displayItems.length > 0) {
      selectedIndex = (selectedIndex - 1 + displayItems.length) % displayItems.length;
      renderResults();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const selectedItem = displayItems[selectedIndex];
    if (selectedItem) {
      if (selectedItem.isCreateAction) {
        openAddModalWithTitle(selectedItem.query);
      } else {
        executeResourceAction(selectedItem);
      }
    }
  } else if (e.ctrlKey && e.key.toLowerCase() === 'c') {
    // Ctrl+C to copy target
    const selectedItem = displayItems[selectedIndex];
    if (selectedItem && !selectedItem.isCreateAction) {
      e.preventDefault();
      navigator.clipboard.writeText(selectedItem.target);
      showToast(`Ruta copiada al portapapeles`, 'info');
    }
  }
});

paletteClearBtn.addEventListener('click', () => {
  paletteInput.value = '';
  paletteInput.focus();
  performSearch();
});

// Filter Chips
document.querySelectorAll('.filter-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    setFilter(btn.dataset.category);
  });
});

// Dashboard Card Quick Filter Buttons
document.querySelectorAll('.card-btn-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    openCommandPalette('', btn.dataset.filter);
  });
});

// Trigger Bar Click
triggerBtn.addEventListener('click', () => openCommandPalette());

// Add Resource Modal
btnAddResource.addEventListener('click', () => addResourceDialog.showModal());
btnCancelAdd.addEventListener('click', () => addResourceDialog.close());
closeAddDialog.addEventListener('click', () => addResourceDialog.close());

addResourceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('res-title').value.trim();
  const category = document.getElementById('res-category').value;
  const targetType = document.getElementById('res-target-type').value;
  const target = document.getElementById('res-target').value.trim();
  const rawKeywords = document.getElementById('res-keywords').value;
  const description = document.getElementById('res-description').value.trim();

  const keywords = rawKeywords.split(',').map(k => k.trim()).filter(k => k.length > 0);

  const newRes = {
    id: `res-${Date.now()}`,
    title,
    category,
    targetType,
    target,
    keywords,
    description
  };

  resources.unshift(newRes);
  await db.setItem('omnisearch_resources', resources);
  setupFuseSearch();
  updateDashboardCounts();

  addResourceDialog.close();
  addResourceForm.reset();
  showToast(`Recurso "${title}" añadido con éxito`, 'success');
});

// Edit Resource Modal Handler
function openEditResourceModal(item) {
  editResId.value = item.id;
  editResTitle.value = item.title;
  editResCategory.value = item.category;
  editResTargetType.value = item.targetType;
  editResTarget.value = item.target;
  editResKeywords.value = item.keywords ? item.keywords.join(', ') : '';
  editResDescription.value = item.description || '';

  editResourceDialog.showModal();
}

btnCancelEdit.addEventListener('click', () => editResourceDialog.close());
closeEditDialog.addEventListener('click', () => editResourceDialog.close());

// Save Changes (Submit Edit)
editResourceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = editResId.value;
  const title = editResTitle.value.trim();
  const category = editResCategory.value;
  const targetType = editResTargetType.value;
  const target = editResTarget.value.trim();
  const rawKeywords = editResKeywords.value;
  const description = editResDescription.value.trim();

  const keywords = rawKeywords.split(',').map(k => k.trim()).filter(k => k.length > 0);

  const index = resources.findIndex(r => r.id === id);
  if (index !== -1) {
    resources[index] = {
      id,
      title,
      category,
      targetType,
      target,
      keywords,
      description
    };

    await db.setItem('omnisearch_resources', resources);
    setupFuseSearch();
    updateDashboardCounts();
    performSearch();

    editResourceDialog.close();
    showToast(`Recurso "${title}" actualizado con éxito`, 'success');
  }
});

// Delete Resource Handler
btnDeleteResource.addEventListener('click', async () => {
  const id = editResId.value;
  const title = editResTitle.value;

  if (confirm(`¿Estás seguro de eliminar el recurso "${title}"?`)) {
    resources = resources.filter(r => r.id !== id);
    await db.setItem('omnisearch_resources', resources);
    setupFuseSearch();
    updateDashboardCounts();
    performSearch();

    editResourceDialog.close();
    showToast(`Recurso "${title}" eliminado`, 'info');
  }
});

// Manage Data Modal
btnManageData.addEventListener('click', () => manageDataDialog.showModal());
closeManageDialog.addEventListener('click', () => manageDataDialog.close());
btnCloseManage.addEventListener('click', () => manageDataDialog.close());

// Export JSON
btnExportJson.addEventListener('click', () => {
  const jsonStr = JSON.stringify(resources, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `omnisearch_data_${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Archivo JSON exportado correctamente.', 'success');
});

// Import JSON
btnImportJson.addEventListener('click', () => importJsonFile.click());

importJsonFile.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const importedData = JSON.parse(event.target.result);
      if (Array.isArray(importedData)) {
        resources = importedData;
        await db.setItem('omnisearch_resources', resources);
        setupFuseSearch();
        updateDashboardCounts();
        showToast(`Importados ${resources.length} recursos con éxito.`, 'success');
        manageDataDialog.close();
      } else {
        alert('El archivo JSON debe contener un array válido de recursos.');
      }
    } catch (err) {
      alert('Error al leer el archivo JSON: ' + err.message);
    }
  };
  reader.readAsText(file);
});

// Reset DB
btnResetDb.addEventListener('click', async () => {
  if (confirm('¿Estás seguro de restablecer los datos a la semilla por defecto?')) {
    resources = defaultResources;
    await db.setItem('omnisearch_resources', defaultResources);
    setupFuseSearch();
    updateDashboardCounts();
    manageDataDialog.close();
    showToast('Base de datos restablecida a los valores iniciales.', 'info');
  }
});

// Initialize on Load
initApp();
